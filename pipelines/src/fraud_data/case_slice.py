"""Build a strict-replay, case-scoped local graph slice from the organizer CSVs.

The slice is anchored only on IDs the case pack supplies (case, card, customer,
flagged transaction). It never assigns K-suffix card IDs to raw transactions:
transactions attach to the customer, and only the seed transaction and
closed-case transactions attach to a canonical card ID, because those are the
only card links the organizer sources state. Nothing dated after the case
opened is included (no future leakage).
"""
from __future__ import annotations
import csv, hashlib, json
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

TXN_FIELDS = ["TransactionID","TransactionAmt","ProductCD","card1","card2","card3","card4","card5","card6","addr1","addr2","dist1","P_emaildomain","R_emaildomain","customer_id","ts","channel","risk_score"]
DEVICE_FIELDS = ["DeviceType","DeviceInfo","id_30","id_31","id_33"]
TS_FMT = "%Y-%m-%d %H:%M:%S"


def to_cents(raw: str) -> int:
    return int((Decimal(raw) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def region_code(raw: str) -> str | None:
    if raw == "":
        return None
    return str(int(Decimal(raw)))


def device_profile_id(row: dict) -> str | None:
    parts = [row.get(k, "") for k in ("DeviceInfo","id_30","id_31","id_33")]
    if all(p == "" for p in parts):
        return None  # refuse an all-null device vertex
    return "|".join(p if p else "?" for p in parts)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _txn(row: dict) -> dict:
    return {
        "id": row["TransactionID"], "amount_cents": to_cents(row["TransactionAmt"]), "product_cd": row["ProductCD"] or None,
        "card_fields": {k: (row[k] or None) for k in ("card1","card2","card3","card4","card5","card6")},
        "region": region_code(row["addr1"]), "country": region_code(row["addr2"]), "dist1": row["dist1"] or None,
        "purchaser_email_domain": row["P_emaildomain"] or None, "recipient_email_domain": row["R_emaildomain"] or None,
        "customer_id": row["customer_id"], "ts": row["ts"], "channel": row["channel"],
        "risk_score": float(row["risk_score"]) if row["risk_score"] else None,
    }


def build_case_slice(source_dir: Path | str, case_id: str, neighborhood_hours: int = 48, hash_sources: bool = True) -> dict:
    src = Path(source_dir)
    with (src / "case_pack.csv").open(newline="", encoding="utf-8") as f:
        case = next((r for r in csv.DictReader(f) if r["case_id"] == case_id), None)
    if case is None:
        raise KeyError(f"{case_id} not in case_pack.csv")
    opened = case["opened_at"]
    window_start = (datetime.strptime(opened, TS_FMT) - timedelta(hours=neighborhood_hours)).strftime(TS_FMT)
    customer, seed_id = case["customer_id"], case["flagged_txn_id"]

    customer_txns: list[dict] = []
    seed: dict | None = None
    window_rows: list[dict] = []
    quarantined = 0
    with (src / "transactions.csv").open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        idx = {k: header.index(k) for k in TXN_FIELDS}
        for raw in reader:
            try:
                row = {k: raw[i] for k, i in idx.items()}
            except IndexError:
                quarantined += 1
                continue
            if row["ts"] > opened:
                continue
            if row["TransactionID"] == seed_id:
                seed = row
            if row["customer_id"] == customer:
                customer_txns.append(_txn(row))
            elif row["ts"] >= window_start:
                window_rows.append(row)
    if seed is None:
        raise ValueError(f"Seed transaction {seed_id} not visible at {opened}")
    if seed["customer_id"] != customer:
        raise ValueError("Seed transaction customer disagrees with case pack")

    # Cross-customer neighborhood: other customers' transactions in the window that share
    # the seed's billing region AND purchaser email domain (a shared-origin candidate set).
    seed_region, seed_email = region_code(seed["addr1"]), seed["P_emaildomain"] or None
    region_window_count = sum(1 for r in window_rows if region_code(r["addr1"]) == seed_region)
    region_window_customers = len({r["customer_id"] for r in window_rows if region_code(r["addr1"]) == seed_region})
    neighbors = [_txn(r) for r in window_rows if seed_email and region_code(r["addr1"]) == seed_region and r["P_emaildomain"] == seed_email]

    wanted = {t["id"] for t in customer_txns} | {t["id"] for t in neighbors}
    identity: dict[str, dict] = {}
    with (src / "identity.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["TransactionID"] in wanted:
                identity[row["TransactionID"]] = {"device_type": row["DeviceType"] or None, "device_profile": device_profile_id(row)}

    customer_txn_ids = {t["id"] for t in customer_txns}
    closed: list[dict] = []
    hidden_future = 0
    history_stats = {"visible_closed_cases": 0, "cardholder_reported": {"confirmed_fraud": 0, "cleared": 0}, "model_scored": {"confirmed_fraud": 0, "cleared": 0}}
    with (src / "closed_cases_history.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["closed_at"] <= opened:
                history_stats["visible_closed_cases"] += 1
                notes = row["analyst_notes"]
                bucket = "cardholder_reported" if "reported unrecognized activity" in notes else ("model_scored" if "model scored" in notes else None)
                if bucket and row["outcome"] in history_stats[bucket]:
                    history_stats[bucket][row["outcome"]] += 1
            txn_ids = [x for x in row["txn_ids"].split("|") if x]
            connected = [x for x in row["connected_card_ids"].split("|") if x]
            related = row["customer_id"] == customer or case["card_id"] in connected or bool(customer_txn_ids.intersection(txn_ids))
            if not related:
                continue
            if row["closed_at"] > opened:
                hidden_future += 1  # not yet closed when this case opened
                continue
            closed.append({
                "id": row["case_id"], "customer_id": row["customer_id"], "card_id": row["card_id"], "opened_at": row["opened_at"],
                "closed_at": row["closed_at"], "outcome": row["outcome"], "pattern": row["pattern"],
                "first_fraud_txn_id": row["first_fraud_txn_id"] or None, "txn_ids": txn_ids,
                "exposure_cents": to_cents(row["exposure_usd"]), "connected_card_ids": connected,
                "actions_taken": [x for x in row["actions_taken"].split("|") if x], "report_filed": row["report_filed"] == "Yes",
                "analyst_notes": row["analyst_notes"],
            })

    sources = {}
    for name in ("transactions.csv","identity.csv","closed_cases_history.csv","case_pack.csv"):
        p = src / name
        sources[name] = {"bytes": p.stat().st_size, "sha256": sha256(p) if hash_sources else None}

    customer_txns.sort(key=lambda t: (t["ts"], t["id"]))
    return {
        "schema": "graphsentinel.case-slice/v1",
        "case": {"id": case["case_id"], "opened_at": opened, "trigger_type": case["trigger_type"], "trigger_text": case["trigger_text"],
                 "flagged_txn_id": seed_id, "card_id": case["card_id"], "customer_id": customer,
                 "risk_score": float(case["risk_score"]) if case["risk_score"] else None},
        "scope": {"mode": "strict_replay", "effective_as_of": opened, "neighborhood_start": window_start, "neighborhood_hours": neighborhood_hours,
                  "time_semantics": "dataset-local timestamps without timezone (D03)"},
        "customer_transactions": customer_txns,
        "neighbor_transactions": neighbors,
        "region_window": {"region": seed_region, "transactions": region_window_count, "other_customers": region_window_customers},
        "identity": identity,
        "closed_cases": closed,
        "history_stats": history_stats,
        "manifest": {"sources": sources, "quarantined_rows": quarantined, "closed_cases_hidden_as_future": hidden_future,
                     "card_link_rule": "Only the seed transaction (case_pack) and closed-case transactions carry canonical card IDs; no K-suffix inference (D01 unresolved)."},
    }


if __name__ == "__main__":
    import sys
    out = build_case_slice(sys.argv[1], sys.argv[2])
    Path(sys.argv[3]).write_text(json.dumps(out, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"case": out["case"]["id"], "customer_txns": len(out["customer_transactions"]), "neighbors": len(out["neighbor_transactions"]),
                      "identity": len(out["identity"]), "closed_cases": len(out["closed_cases"]), "manifest": out["manifest"]}, indent=1))

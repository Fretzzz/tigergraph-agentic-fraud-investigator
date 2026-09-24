import csv
from pathlib import Path
import pytest
from fraud_data.case_slice import build_case_slice, device_profile_id, to_cents

TX_HEAD = ["TransactionID","TransactionDT","TransactionAmt","ProductCD","card1","card2","card3","card4","card5","card6","addr1","addr2","dist1","P_emaildomain","R_emaildomain","V1","customer_id","ts","channel","risk_score"]

def _write(path: Path, header, rows):
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)

def tx(i, amt, cust, ts, addr="330.0", email="me.com"):
    return [i, "0", amt, "W", "111", "", "", "visa", "", "credit", addr, "87.0", "", email, "", "1", cust, ts, "in_person", "0.4"]

@pytest.fixture()
def sources(tmp_path):
    _write(tmp_path/"transactions.csv", TX_HEAD, [
        tx("T1","10.5","TEST-C1","2016-12-01 00:00:00"),
        tx("T2","49.0","TEST-C1","2016-12-10 13:00:00"),
        tx("T3","20.0","TEST-C2","2016-12-10 12:00:00"),
        tx("T4","99.99","TEST-C1","2016-12-11 00:00:00"),
        tx("T5","5.0","TEST-C3","2016-12-10 11:00:00", addr="100.0"),
    ])
    _write(tmp_path/"identity.csv", ["TransactionID","DeviceType","DeviceInfo","id_30","id_31","id_33"], [["T1","mobile","iOS Device","","",""],["T2","","","","",""]])
    _write(tmp_path/"closed_cases_history.csv", ["case_id","customer_id","card_id","opened_at","closed_at","outcome","pattern","first_fraud_txn_id","txn_ids","n_txns","exposure_usd","connected_card_ids","actions_taken","report_filed","analyst_notes"], [
        ["TEST-CC1","TEST-C1","TEST-C1-K1","2016-11-01 00:00:00","2016-11-02 00:00:00","confirmed_fraud","out_of_region_use","T0","T0","1","12.30","","CREATE_CASE|BLOCK_CARD","No","n"],
        ["TEST-CC2","TEST-C1","TEST-C1-K1","2016-12-09 00:00:00","2016-12-12 00:00:00","cleared","none","","T1","1","0.00","","CLOSE_NO_FRAUD","No","n"],
    ])
    _write(tmp_path/"case_pack.csv", ["case_id","opened_at","trigger_type","trigger_text","flagged_txn_id","card_id","customer_id","risk_score"], [["TEST-CASE","2016-12-10 15:00:00","customer_report","x","T2","TEST-C1-K1","TEST-C1",""]])
    return tmp_path

def test_strict_replay_slice(sources):
    s = build_case_slice(sources, "TEST-CASE", hash_sources=False)
    assert [t["id"] for t in s["customer_transactions"]] == ["T1","T2"]  # T4 is after open
    assert s["customer_transactions"][1]["amount_cents"] == 4900
    assert [t["id"] for t in s["neighbor_transactions"]] == ["T3"]  # same region + email, other customer
    assert s["region_window"] == {"region": "330", "transactions": 1, "other_customers": 1}
    assert [c["id"] for c in s["closed_cases"]] == ["TEST-CC1"]  # CC2 closed after open
    assert s["manifest"]["closed_cases_hidden_as_future"] == 1
    assert s["history_stats"]["visible_closed_cases"] == 1
    assert s["identity"]["T1"]["device_profile"] == "iOS Device|?|?|?"
    assert s["identity"]["T2"]["device_profile"] is None  # all-null device refused

def test_rejects_seed_mismatch(sources):
    rows = list(csv.reader((sources/"case_pack.csv").open()))
    rows[1][6] = "TEST-C2"
    _write(sources/"case_pack.csv", rows[0], rows[1:])
    with pytest.raises(ValueError):
        build_case_slice(sources, "TEST-CASE", hash_sources=False)

def test_helpers():
    assert to_cents("49.0") == 4900 and to_cents("1749.88") == 174988
    assert device_profile_id({}) is None

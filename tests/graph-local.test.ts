import { describe, expect, it } from "vitest";
import { buildGraph } from "../packages/graph-local/src/graph.js";
import { GraphQueries } from "../packages/graph-local/src/queries.js";
import type { CaseSlice, SliceTransaction } from "../packages/graph-local/src/slice.js";

const tx = (id: string, cents: number, ts: string, over: Partial<SliceTransaction> = {}): SliceTransaction => ({
  id, amount_cents: cents, product_cd: "W", card_fields: {}, region: "330", country: "87", dist1: null,
  purchaser_email_domain: "gmail.com", recipient_email_domain: null, customer_id: "TEST-C1", ts, channel: "in_person", risk_score: 0.1, ...over,
});

export function syntheticSlice(over: Partial<CaseSlice> = {}): CaseSlice {
  return {
    schema: "graphsentinel.case-slice/v1",
    case: { id: "TEST-CASE-01", opened_at: "2016-12-10 15:00:00", trigger_type: "customer_report", trigger_text: "TEST", flagged_txn_id: "TEST-T9", card_id: "TEST-C1-K1", customer_id: "TEST-C1", risk_score: null },
    scope: { mode: "strict_replay", effective_as_of: "2016-12-10 15:00:00", neighborhood_start: "2016-12-08 15:00:00", neighborhood_hours: 48, time_semantics: "dataset-local" },
    customer_transactions: [
      ...Array.from({ length: 12 }, (_, i) => tx(`TEST-T${String(i).padStart(2, "0")}`, 4900 + i, `2016-11-${String(i + 10).padStart(2, "0")} 10:00:00`)),
      tx("TEST-T8", 11693, "2016-12-10 12:00:00", { purchaser_email_domain: "me.com", risk_score: 0.88 }),
      tx("TEST-T9", 4900, "2016-12-10 13:00:00", { purchaser_email_domain: "me.com", risk_score: 0.4 }),
    ],
    neighbor_transactions: [],
    region_window: { region: "330", transactions: 5, other_customers: 3 },
    identity: {},
    closed_cases: [{ id: "TEST-CC1", customer_id: "TEST-C1", card_id: "TEST-C1-K1", opened_at: "2016-11-10 11:00:00", closed_at: "2016-11-12 00:00:00", outcome: "confirmed_fraud", pattern: "out_of_region_use", first_fraud_txn_id: "TEST-T00", txn_ids: ["TEST-T00"], exposure_cents: 4900, connected_card_ids: [], actions_taken: ["CREATE_CASE"], report_filed: false, analyst_notes: "TEST" }],
    history_stats: { visible_closed_cases: 10, cardholder_reported: { confirmed_fraud: 9, cleared: 0 }, model_scored: { confirmed_fraud: 0, cleared: 1 } },
    manifest: { sources: {}, quarantined_rows: 0, closed_cases_hidden_as_future: 0, card_link_rule: "TEST" },
    ...over,
  };
}

describe("local graph", () => {
  it("links only case-pack and closed-case transactions to canonical cards", () => {
    const g = buildGraph(syntheticSlice());
    expect(g.outgoing("Transaction:TEST-T9", "ON_CARD").map(e => e.to)).toEqual(["Card:TEST-C1-K1"]);
    expect(g.outgoing("Transaction:TEST-T00", "ON_CARD").map(e => e.to)).toEqual(["Card:TEST-C1-K1"]);
    expect(g.outgoing("Transaction:TEST-T05", "ON_CARD")).toEqual([]);
    expect(g.outgoing("Transaction:TEST-T05", "MADE_BY").map(e => e.to)).toEqual(["Customer:TEST-C1"]);
  });
  it("rejects dangling edges and refuses a missing seed", () => {
    const g = buildGraph(syntheticSlice());
    expect(() => g.link("NEXT", "Transaction:nope", "Transaction:TEST-T9", "x")).toThrow(/Dangling/);
    const s = syntheticSlice(); s.case.flagged_txn_id = "TEST-MISSING";
    expect(() => buildGraph(s)).toThrow(/Seed/);
  });
  it("records a receipt per query and hides activity after the as-of time", () => {
    const s = syntheticSlice(); s.customer_transactions.push(tx("TEST-FUTURE", 100, "2016-12-11 00:00:00"));
    const q = new GraphQueries(buildGraph(s), s.case.opened_at);
    const r = q.regionHistory("TEST-C1", "330", "2016-12-10 13:00:00");
    expect(r.result.inRegion).toBe(13);
    expect(q.customerTimeline("TEST-C1", "2016-12-01 00:00:00", "2099-01-01 00:00:00").result.map(t => t.id)).not.toContain("TEST-FUTURE");
    expect(q.receipts.map(x => x.receiptId)).toEqual(["Q01-region_history", "Q02-customer_timeline"]);
    expect(q.receipts.every(x => x.backend === "local-graph")).toBe(true);
  });
  it("finds first-seen email domain use on the same day", () => {
    const s = syntheticSlice();
    const q = new GraphQueries(buildGraph(s), s.case.opened_at);
    const r = q.emailDomainHistory("TEST-C1", "me.com", s.case.opened_at, "2016-12-10 00:00:00");
    expect(r.result.priorUses).toBe(0);
    expect(r.result.sameDay.map(t => t.id)).toEqual(["TEST-T8", "TEST-T9"]);
  });
});

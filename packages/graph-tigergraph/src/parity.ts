import { buildGraph } from "../../graph-local/src/graph.js";
import { GraphQueries, type QueryReceipt } from "../../graph-local/src/queries.js";
import type { CaseSlice } from "../../graph-local/src/slice.js";

// Canonical form for comparison: sorted object keys, sorted id lists, and fields TigerGraph does not store removed.
const DROP = new Set(["card_fields", "dist1", "first_fraud_txn_id", "connected_card_ids"]);
function norm(v: unknown): unknown {
  if (Array.isArray(v)) { const a = v.map(norm); return a.every(x => typeof x === "string") ? [...a].sort() : a; }
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).filter(k => !DROP.has(k)).sort().map(k => [k, norm((v as Record<string, unknown>)[k])]));
  return v;
}

// Re-runs each TigerGraph receipt's query on the local graph with the same parameters and compares results.
export function compareToLocal(slice: CaseSlice, receipts: QueryReceipt[]) {
  const q = new GraphQueries(buildGraph(slice), slice.case.opened_at) as unknown as Record<string, (...a: unknown[]) => QueryReceipt>;
  const method: Record<string, string> = { seed_context: "seedContext", customer_timeline: "customerTimeline", region_history: "regionHistory", email_domain_history: "emailDomainHistory", amount_profile: "amountProfile", device_context: "deviceContext", historical_cases: "historicalCases", shared_origin: "sharedOrigin" };
  return receipts.map(r => {
    const local = q[method[r.query]!]!.apply(q, Object.values(r.params));
    const a = JSON.stringify(norm(r.result)), b = JSON.stringify(norm(local.result));
    return { query: r.query, receiptId: r.receiptId, match: a === b, ...(a === b ? {} : { tigergraph: a.slice(0, 600), local: b.slice(0, 600) }) };
  });
}

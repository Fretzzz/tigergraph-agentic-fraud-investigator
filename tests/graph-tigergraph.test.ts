import { describe, expect, it } from "vitest";
import { investigate } from "../packages/investigator/src/investigate.js";
import { TigerGraphQueries } from "../packages/graph-tigergraph/src/tigergraph.js";
import { compareToLocal } from "../packages/graph-tigergraph/src/parity.js";
import { syntheticSlice } from "./graph-local.test.js";

const METHOD: Record<string, string> = { seed_context: "seedContext", customer_timeline: "customerTimeline", region_history: "regionHistory", email_domain_history: "emailDomainHistory", amount_profile: "amountProfile", device_context: "deviceContext", historical_cases: "historicalCases", shared_origin: "sharedOrigin" };

// Offline stand-in for prefetchEvidence: uses the local run's receipts as if TigerGraph had returned them.
function plannedFromLocal() {
  const local = investigate(syntheticSlice(), { runId: "t", startedAtMs: 0, nowMs: () => 0 });
  return { local, planned: local.receipts.map(r => ({ method: METHOD[r.query]!, query: r.query, params: r.params as Record<string, unknown>, endpoint: `/restpp/query/GraphSentinel/gs_${r.query}`, result: structuredClone(r.result), returned: r.coverage.returned })) };
}

describe("TigerGraph replay path (offline)", () => {
  it("gives the same answer as the local graph and labels the backend", () => {
    const { local, planned } = plannedFromLocal();
    const run = investigate(syntheticSlice(), { runId: "t", startedAtMs: 0, nowMs: () => 0, queries: new TigerGraphQueries(planned, "GraphSentinel") });
    expect(run.graphBackend).toBe("tigergraph");
    expect(local.graphBackend).toBe("local-graph");
    expect(run.answer.case.verdict).toBe(local.answer.case.verdict);
    expect(run.answer.case.fraud_probability).toBe(local.answer.case.fraud_probability);
    expect(run.receipts.every(r => (r as { backend?: string }).backend === "tigergraph")).toBe(true);
    expect(compareToLocal(syntheticSlice(), run.receipts).every(p => p.match)).toBe(true);
  });

  it("fails loudly when the investigator asks with different parameters than were fetched", () => {
    const { planned } = plannedFromLocal();
    const q = new TigerGraphQueries(planned, "GraphSentinel");
    expect(() => q.seedContext("NOT-THE-SEED")).toThrow(/fetched with/);
  });

  it("parity flags a TigerGraph result that differs from the local graph", () => {
    const { planned } = plannedFromLocal();
    const q = new TigerGraphQueries(planned.map(p => p.query === "historical_cases" ? { ...p, result: [] } : p), "GraphSentinel");
    const run = investigate(syntheticSlice(), { runId: "t", startedAtMs: 0, nowMs: () => 0, queries: q });
    const parity = compareToLocal(syntheticSlice(), run.receipts);
    expect(parity.find(p => p.query === "historical_cases")?.match).toBe(false);
  });
});

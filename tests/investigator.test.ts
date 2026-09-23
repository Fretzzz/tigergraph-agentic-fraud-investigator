import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { investigate } from "../packages/investigator/src/investigate.js";
import type { CaseSlice } from "../packages/graph-local/src/slice.js";
import { syntheticSlice } from "./graph-local.test.js";

const fixedClock = () => 0;

describe("investigator on synthetic data", () => {
  it("keeps a conflicted customer dispute uncertain, blocks only via L1 and escalates", () => {
    const run = investigate(syntheticSlice(), { runId: "t", startedAtMs: 0, nowMs: fixedClock });
    expect(run.validation.valid).toBe(true);
    expect(run.answer.case.verdict).toBe("uncertain");
    expect(run.answer.next_best_actions.initial.find(a => a.action === "BLOCK_CARD")?.route).toBe("L1");
    expect(run.answer.next_best_actions.final.map(a => a.action)).toContain("ESCALATE_TO_ANALYST");
    expect(run.answer.next_best_actions.final.map(a => a.action)).not.toContain("BLOCK_ALL_CARDS");
    expect(run.answer.sar.file).toBe(false);
    expect(run.answer.tokens).toBe(0);
    expect(run.answer.tool_calls).toBe(run.receipts.length);
  });
  it("stores the initial recommendation before the simulated reply and discloses the fixed default", () => {
    const run = investigate(syntheticSlice(), { runId: "t", startedAtMs: 0, nowMs: fixedClock });
    expect(run.facts.initial.noReplyAfter24Hours.fact).toBe("false");
    expect(run.facts.final.noReplyAfter24Hours.requestIds).toEqual(["REQ-1"]);
    expect(run.answer.evidence_requests[0]?.assumed_response).toMatch(/Fixed simulator default/);
    expect(run.answer.next_best_actions.final.map(a => a.action)).toContain("MONITOR_CARD");
  });
  it("never claims a TigerGraph write", () => {
    const run = investigate(syntheticSlice(), { runId: "t", startedAtMs: 0, nowMs: fixedClock });
    expect(run.answer.case.written_to_graph).toBe(false);
    expect(run.answer.case.graph_case_id).toBe("");
    expect(run.localCaseWrite).toMatchObject({ readbackVerified: true, backend: "local-graph" });
  });
  it("flags a new-region card-present purchase as out-of-region evidence", () => {
    const s = syntheticSlice();
    const seed = s.customer_transactions.find(t => t.id === "TEST-T9")!;
    seed.region = "999";
    const run = investigate(s, { runId: "t", startedAtMs: 0, nowMs: fixedClock });
    expect(run.factors.map(f => f.id)).toContain("new_region_card_present");
    expect(run.answer.case.pattern).toBe("out_of_region_use");
  });
});

describe("HHG-003 organizer-source slice (local graph, not live TigerGraph)", () => {
  const slice = JSON.parse(readFileSync("data/slices/HHG-003.json", "utf8")) as CaseSlice;
  const run = investigate(slice, { runId: "t", startedAtMs: 0, nowMs: fixedClock });
  it("is anchored on the case-pack IDs and validates", () => {
    expect(slice.case).toMatchObject({ id: "HHG-003", flagged_txn_id: "3530164", card_id: "C08623-K2", customer_id: "C08623" });
    expect(run.validation.errors).toEqual([]);
  });
  it("reports source facts found in the organizer CSVs", () => {
    const byQuery = Object.fromEntries(run.receipts.map(r => [r.query, r.result as Record<string, unknown>]));
    expect(byQuery["region_history"]).toMatchObject({ inRegion: 42, firstSeen: "2016-07-09 23:53:35" });
    expect(byQuery["email_domain_history"]).toMatchObject({ priorUses: 0 });
    expect(run.answer.case.similar_prior_cases).toEqual(["CC-1589", "CC-2817", "CC-2935", "CC-3327", "CC-3682", "CC-4957"]);
    expect(run.answer.case.exposure_usd).toBe(49);
  });
  it("uses no data dated after the case opened", () => {
    expect(slice.customer_transactions.every(t => t.ts <= slice.case.opened_at)).toBe(true);
    expect(slice.closed_cases.every(c => c.closed_at <= slice.case.opened_at)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AnswerSchema, validateAnswerShape } from "../packages/contracts/src/answer.js";
import { validAnswer } from "../packages/contracts/src/fixtures.js";

describe("canonical answer contract", () => {
  it("rejects an unknown verdict and negative metrics", () => {
    const invalid = { case_id: "TEST-CASE-01", case: { verdict: "maybe" } };
    expect(AnswerSchema.safeParse(invalid).success).toBe(false);
    expect(AnswerSchema.safeParse({ ...validAnswer(), tokens: -1 }).success).toBe(false);
  });

  it.each([
    ["missing field", (v: Record<string, unknown>) => { delete v.stop_reason; }],
    ["null prescribed value", (v: Record<string, unknown>) => { (v.case as Record<string, unknown>).graph_case_id = null; }],
    ["unknown action", (v: Record<string, unknown>) => { (v.next_best_actions as any).initial[0].action = "FREEZE_ACCOUNT"; }],
    ["unknown route", (v: Record<string, unknown>) => { (v.next_best_actions as any).initial[0].route = "admin"; }],
    ["invalid date", (v: Record<string, unknown>) => { (v.sar as any).activity_dates = ["2016-99-40", "2016-12-01"]; }],
    ["negative tool calls", (v: Record<string, unknown>) => { v.tool_calls = -1; }],
    ["extra canonical field", (v: Record<string, unknown>) => { v.execution_state = "done"; }],
  ])("rejects %s", (_name, mutate) => {
    const value = structuredClone(validAnswer()) as unknown as Record<string, unknown>;
    mutate(value);
    expect(AnswerSchema.safeParse(value).success).toBe(false);
  });

  it("rejects nonfinite probability and metrics", () => {
    const probability = structuredClone(validAnswer());
    probability.case.fraud_probability = Number.NaN;
    expect(AnswerSchema.safeParse(probability).success).toBe(false);
    const latency = structuredClone(validAnswer());
    latency.latency_s = Number.POSITIVE_INFINITY;
    expect(AnswerSchema.safeParse(latency).success).toBe(false);
  });

  it("accepts a complete synthetic answer and returns typed errors", () => {
    expect(AnswerSchema.safeParse(validAnswer()).success).toBe(true);
    const errors = validateAnswerShape({ case_id: "TEST-CASE-01" });
    expect(errors.valid).toBe(false);
    expect(errors.errors.length).toBeGreaterThan(0);
    expect(errors.errors[0]?.path).toBeTruthy();
  });

  it("keeps the committed JSON Schema synchronized", () => {
    const committed = JSON.parse(readFileSync("packages/contracts/schema/answer.schema.json", "utf8"));
    expect(committed.$id).toBe("https://graphsentinel.local/schema/answer.schema.json");
    expect(committed.required).toEqual(expect.arrayContaining(["case_id", "case", "sar", "tokens"]));
    expect(committed.additionalProperties).toBe(false);
  });
});

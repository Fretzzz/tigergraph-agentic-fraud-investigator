import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseUsdCents, sumAbsoluteCents } from "../packages/domain/src/money.js";
import { normalizeTransactionId } from "../packages/domain/src/ids.js";
import { compareDatasetTime, parseDatasetTime } from "../packages/domain/src/time.js";

describe("exact primitives", () => {
  it("parses and sums money exactly", () => {
    expect(sumAbsoluteCents([parseUsdCents("-10.25"), parseUsdCents("0.10")])).toBe(1035);
    expect(() => parseUsdCents("0.001")).toThrow();
  });
  it.each(["", "NaN", "Infinity", "$10.00", " 10.00 ", "1,000.00"])("rejects unsupported money %j", (value) => {
    expect(() => parseUsdCents(value)).toThrow();
  });
  it("rejects unsafe totals", () => {
    expect(() => sumAbsoluteCents([Number.MAX_SAFE_INTEGER, 1])).toThrow(/safe integer/);
  });
  it("preserves numeric-looking IDs", () => {
    expect(normalizeTransactionId("000123")).toBe("000123");
    expect(() => normalizeTransactionId(" 000123 ")).toThrow();
    expect(() => normalizeTransactionId(123 as unknown as string)).toThrow();
  });
  it("compares strict dataset-local times without browser timezone conversion", () => {
    expect(compareDatasetTime("2016-12-01 00:00:00", "2016-11-30 23:59:59")).toBe(1);
    expect(parseDatasetTime("2016-12-01 00:00:00").raw).toBe("2016-12-01 00:00:00");
    expect(() => parseDatasetTime("2016-12-01T00:00:00Z")).toThrow();
    expect(() => parseDatasetTime("2016-02-30 00:00:00")).toThrow();
  });
  it("matches the committed cross-language fixtures", () => {
    const fixture = JSON.parse(readFileSync("pipelines/tests/fixtures/primitives.json", "utf8"));
    for (const row of fixture.money) expect(parseUsdCents(row.input)).toBe(row.cents);
    for (const row of fixture.ids) expect(normalizeTransactionId(row.input)).toBe(row.output);
    for (const row of fixture.timeComparisons) expect(compareDatasetTime(row.a, row.b)).toBe(row.result);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildContext, validate } from "../scripts/narrate.js";

const d = JSON.parse(readFileSync("apps/web/data/HHG-003.json", "utf8"));
const ctx = buildContext(d);
const good = { summary: "C08623 denies 3530164 [trigger:case_pack]. Region 330 fits history [Q02-region_history]. Verdict uncertain at 0.55 [R8].", why_these_actions: ["BLOCK_CARD waits for L1 [R2]"], evidence_for: ["new email domain [Q03-email_domain_history]"], evidence_against: ["amount fits [Q04-amount_profile]"], uncertainty: "customer answer unknown [section 5]", memory: "prior cleared case [CC-1589]" };

describe("narrate (GraphRAG-lite context + validation)", () => {
  it("retrieves receipts, similar closed cases and the cited policy rules", () => {
    expect(ctx.receipts.length).toBe(8);
    expect(ctx.similar.map((s: any) => s.id)).toContain("CC-1589");
    expect(ctx.policySections.map(p => p.id)).toEqual(expect.arrayContaining(["R2", "R8", "3a", "5"]));
    expect(ctx.decided.verdict).toBe("uncertain");
  });
  it("accepts a narrative whose citations all exist", () => {
    const ids = ctx.receipts.map((r: any) => r.id);
    const g = JSON.parse(JSON.stringify(good).replace(/Q0\d-[a-z_]+/g, m => ids.find((i: string) => i.startsWith(m.slice(0, 3))) ?? m));
    expect(validate(ctx, g)).toEqual([]);
  });
  it("rejects invented citations, a changed probability and a changed verdict", () => {
    expect(validate(ctx, { ...good, memory: "see [CC-0000]" }).join()).toContain("unknown citation [CC-0000]");
    expect(validate(ctx, { ...good, summary: "Verdict uncertain at 0.9 [R8]." }).join()).toContain("probability");
    expect(validate(ctx, { ...good, summary: "The verdict is confirmed fraud at 0.55 [R8]." }).join()).toContain("verdict");
  });
});

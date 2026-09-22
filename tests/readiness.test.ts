import { describe, expect, it } from "vitest";
import { checkReadiness } from "../packages/readiness/src/index.js";

describe("checkReadiness", () => {
  it("keeps readiness blocked when a required capability is blocked", () => {
    const result = checkReadiness({ required: ["nim", "mcp", "vectors"] }, {
      nim: { status: "passed" }, mcp: { status: "passed" },
      vectors: { status: "blocked", reason: "No live vector receipt" }
    });
    expect(result.ready).toBe(false);
    expect(result.checks.vectors?.status).toBe("blocked");
  });

  it("requires evidence for every required capability", () => {
    const result = checkReadiness({ required: ["nim", "mcp"] }, {
      nim: { status: "passed", evidencePath: "reports/capabilities/nim.json" }
    });
    expect(result.ready).toBe(false);
    expect(result.checks.mcp).toEqual({ status: "blocked", reason: "No check result was supplied" });
  });

  it("is ready only when every required capability passed", () => {
    const result = checkReadiness({ required: ["nim", "mcp"] }, {
      nim: { status: "passed" }, mcp: { status: "passed" }
    });
    expect(result.ready).toBe(true);
  });

  it("rejects unknown statuses instead of treating them as passed", () => {
    expect(() => checkReadiness({ required: ["nim"] }, {
      nim: { status: "skipped" as "passed" }
    })).toThrow(/Unsupported readiness status/);
  });
});

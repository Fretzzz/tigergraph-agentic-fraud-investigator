import { describe, expect, it } from "vitest";
import { createHarness } from "../packages/testkit/src/harness.js";
import { assessment, facts, sourceFixtures } from "../packages/testkit/src/fixtures.js";

describe("controlled test harness", () => {
  it("separates virtual evidence time from wall time", async () => {
    const h=await createHarness({evidenceClass:"fixture"}); await h.advanceVirtualTime({hours:24});
    expect(h.clock.virtualElapsedSeconds()).toBe(86400); expect(h.clock.wallElapsedSeconds()).toBe(0);
    expect(h.report().evidenceClass).toBe("fixture");
  });
  it("labels every supported evidence class", async () => {
    for(const evidenceClass of ["fixture","local-runtime","live-provider","deployed-end-to-end"] as const){
      const h=await createHarness({evidenceClass}); expect(h.report().evidenceClass).toBe(evidenceClass);
    }
  });
  it("records commands, evidence, restarts and faults deterministically", async () => {
    const h=await createHarness({evidenceClass:"fixture"}); await h.command("start",{caseId:"TEST-CASE-FRAUD"});
    await h.deliverEvidence({requestId:"TEST-REQ-01",value:"denied"}); h.injectFault("graph",new Error("synthetic outage"));
    await h.restart(); await h.flush(); expect(h.events().map(e=>e.type)).toEqual(["command","evidence","fault","restart","flush"]);
    expect(h.recordedCalls()).toHaveLength(2); expect(h.snapshot().revision).toBe(5);
  });
  it("redacts common secret shapes from recorded calls", async () => {
    const h=await createHarness({evidenceClass:"fixture"}); await h.command("configure",{NVIDIA_API_KEY:"nvapi-secret",authorization:"Bearer abc",safe:"ok"});
    expect(JSON.stringify(h.recordedCalls())).not.toContain("nvapi-secret"); expect(h.recordedCalls()[0]?.payload).toMatchObject({NVIDIA_API_KEY:"[REDACTED]",authorization:"[REDACTED]",safe:"ok"});
  });
  it("provides distinct source-shaped fixtures and unknown policy facts", () => {
    expect(sourceFixtures.fraud.transactions[0]?.id).toMatch(/^TEST-/); expect(sourceFixtures.benign.transactions[0]?.id).toMatch(/^TEST-/);
    expect(sourceFixtures.fraud.transactions[0]?.amount).not.toBe(sourceFixtures.benign.transactions[0]?.amount);
    expect(facts().pendingAuthorization.fact).toBe("unknown"); expect(assessment().verdict).toBe("uncertain");
  });
});

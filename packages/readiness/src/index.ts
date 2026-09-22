export type ReadinessStatus = "passed" | "failed" | "blocked";

export interface ReadinessCheck {
  status: ReadinessStatus;
  reason?: string;
  evidencePath?: string;
}

export interface ReadinessConfig {
  required: readonly string[];
}

export interface ReadinessReport {
  ready: boolean;
  checks: Record<string, ReadinessCheck>;
}

const STATUSES = new Set<ReadinessStatus>(["passed", "failed", "blocked"]);

export function checkReadiness(
  config: ReadinessConfig,
  probes: Readonly<Record<string, ReadinessCheck>>,
): ReadinessReport {
  const checks: Record<string, ReadinessCheck> = {};
  for (const name of config.required) {
    const probe = probes[name];
    if (!probe) {
      checks[name] = { status: "blocked", reason: "No check result was supplied" };
      continue;
    }
    if (!STATUSES.has(probe.status)) {
      throw new Error(`Unsupported readiness status for ${name}: ${String(probe.status)}`);
    }
    checks[name] = { ...probe };
  }
  return {
    ready: config.required.length > 0 && config.required.every((name) => checks[name]?.status === "passed"),
    checks,
  };
}

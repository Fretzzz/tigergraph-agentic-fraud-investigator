import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { checkReadiness, type ReadinessCheck } from "../packages/readiness/src/index.js";

const requiredEnvironment = {
  nim: ["NVIDIA_API_KEY", "NIM_BASE_URL", "NIM_MODEL"],
  mcp: ["MCP_SERVICE_TOKEN", "TG_MCP_URL"],
  vectors: ["TIGERGRAPH_HOST", "TIGERGRAPH_GRAPH"],
} as const;

const checks: Record<string, ReadinessCheck> = {};
for (const [capability, names] of Object.entries(requiredEnvironment)) {
  const missing = names.filter((name) => !process.env[name]);
  checks[capability] = missing.length === 0
    ? { status: "blocked", reason: "Configuration is present; a live capability receipt is still required" }
    : { status: "blocked", reason: `Missing configuration names: ${missing.join(", ")}` };
}

const sourceFiles = [
  "docs/sources/hackathon-brief.md",
  "docs/sources/dataset-readme.md",
] as const;
const sourceHashes: Record<string, string> = {};
for (const path of sourceFiles) {
  sourceHashes[path] = createHash("sha256").update(await readFile(path)).digest("hex");
}

const report = {
  generatedAt: new Date().toISOString(),
  ...checkReadiness({ required: Object.keys(requiredEnvironment) }, checks),
  sourceHashes,
  note: "This command reports configuration names only. It never prints secret values and does not perform cloud writes.",
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ready ? 0 : 2;

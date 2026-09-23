// Run the deterministic investigation for one case slice and write the canonical answer plus run metadata.
// Usage: tsx scripts/run-case.ts HHG-003
// GRAPH_BACKEND=tigergraph runs the eight graph queries live on TigerGraph (needs TG_HOST and TG_SECRET or TG_TOKEN)
// and checks every result against the local graph before accepting the run. Default: local in-memory graph.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { investigate } from "../packages/investigator/src/investigate.js";
import type { CaseSlice } from "../packages/graph-local/src/slice.js";
import { connectTigerGraph, prefetchEvidence, TigerGraphQueries, FIELDS_NOT_IN_TIGERGRAPH } from "../packages/graph-tigergraph/src/tigergraph.js";
import { compareToLocal } from "../packages/graph-tigergraph/src/parity.js";

const caseId = process.argv[2] ?? "HHG-003";
const slice = JSON.parse(readFileSync(`data/slices/${caseId}.json`, "utf8")) as CaseSlice;
const runId = process.env.RUN_ID ?? new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const backend = process.env.GRAPH_BACKEND ?? "local";
if (backend !== "local" && backend !== "tigergraph") { console.error(`Unknown GRAPH_BACKEND ${backend}`); process.exit(1); }

let queries: TigerGraphQueries | undefined;
let tigergraph: Record<string, unknown> | undefined;
if (backend === "tigergraph") {
  const cfg = await connectTigerGraph();
  const t0 = Date.now();
  const planned = await prefetchEvidence(cfg, slice);
  queries = new TigerGraphQueries(planned, cfg.graph);
  tigergraph = { host: new URL(cfg.host).host, graph: cfg.graph, queries: planned.map(p => p.endpoint.split("?")[0]), fetchedAt: new Date().toISOString(), fetchMs: Date.now() - t0, fieldsNotInTigerGraph: FIELDS_NOT_IN_TIGERGRAPH };
}
const run = investigate(slice, queries ? { runId, queries } : { runId });
if (!run.validation.valid) { console.error(JSON.stringify(run.validation.errors, null, 1)); process.exit(1); }
if (queries) {
  const parity = compareToLocal(slice, run.receipts);
  tigergraph = { ...tigergraph, parity };
  if (!parity.every(p => p.match)) { console.error("TigerGraph results differ from the local graph:", JSON.stringify(parity.filter(p => !p.match), null, 1)); process.exit(1); }
}
mkdirSync("cases", { recursive: true });
writeFileSync(`cases/${caseId}.json`, JSON.stringify(run.answer, null, 2) + "\n");
const dir = `reports/runs/${runId}`;
mkdirSync(dir, { recursive: true });
const { answer: _a, ...meta } = run;
writeFileSync(`${dir}/${caseId}.run.json`, JSON.stringify({ ...meta, tigergraph, manifest: slice.manifest, scope: slice.scope }, null, 1) + "\n");
mkdirSync("apps/web/data", { recursive: true });
writeFileSync(`apps/web/data/${caseId}.json`, JSON.stringify({ case: slice.case, scope: slice.scope, ...run, tigergraph }, null, 1) + "\n");
console.log(JSON.stringify({ caseId, runId, backend: run.graphBackend, verdict: run.answer.case.verdict, p: run.answer.case.fraud_probability, initial: run.answer.next_best_actions.initial.map(a => `${a.action}/${a.route}`), final: run.answer.next_best_actions.final.map(a => `${a.action}/${a.route}`), toolCalls: run.answer.tool_calls, valid: run.validation.valid, localWrite: run.localCaseWrite, parity: (tigergraph?.parity as { query: string; match: boolean }[] | undefined)?.map(p => `${p.query}:${p.match ? "ok" : "DIFF"}`) }, null, 1));

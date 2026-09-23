// Run the deterministic local-graph investigation for one case slice and write
// the canonical answer plus run metadata. Usage: tsx scripts/run-case.ts HHG-003
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { investigate } from "../packages/investigator/src/investigate.js";
import type { CaseSlice } from "../packages/graph-local/src/slice.js";

const caseId = process.argv[2] ?? "HHG-003";
const slice = JSON.parse(readFileSync(`data/slices/${caseId}.json`, "utf8")) as CaseSlice;
const runId = process.env.RUN_ID ?? new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const run = investigate(slice, { runId });
if (!run.validation.valid) { console.error(JSON.stringify(run.validation.errors, null, 1)); process.exit(1); }
mkdirSync("cases", { recursive: true });
writeFileSync(`cases/${caseId}.json`, JSON.stringify(run.answer, null, 2) + "\n");
const dir = `reports/runs/${runId}`;
mkdirSync(dir, { recursive: true });
const { answer: _a, ...meta } = run;
writeFileSync(`${dir}/${caseId}.run.json`, JSON.stringify({ ...meta, manifest: slice.manifest, scope: slice.scope }, null, 1) + "\n");
mkdirSync("apps/web/data", { recursive: true });
writeFileSync(`apps/web/data/${caseId}.json`, JSON.stringify({ case: slice.case, scope: slice.scope, ...run }, null, 1) + "\n");
console.log(JSON.stringify({ caseId, runId, verdict: run.answer.case.verdict, p: run.answer.case.fraud_probability, initial: run.answer.next_best_actions.initial.map(a => `${a.action}/${a.route}`), final: run.answer.next_best_actions.final.map(a => `${a.action}/${a.route}`), toolCalls: run.answer.tool_calls, valid: run.validation.valid, localWrite: run.localCaseWrite }, null, 1));

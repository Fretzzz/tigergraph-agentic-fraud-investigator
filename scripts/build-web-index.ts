// Build apps/web/data/index.json: one row per saved case run, for the case picker in the analyst view.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const dir = "apps/web/data";
const rows = readdirSync(dir).filter(f => /^HHG-\d+\.json$/.test(f)).sort().map(f => {
  const d = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  const c = d.answer.case;
  return { id: d.case.id, trigger: d.case.trigger_type, verdict: c.verdict, p: c.fraud_probability, status: c.status, backend: d.graphBackend, final: d.answer.next_best_actions.final.map((a: { action: string }) => a.action) };
});
writeFileSync(`${dir}/index.json`, JSON.stringify(rows, null, 1) + "\n");
console.log(`${rows.length} cases indexed`);

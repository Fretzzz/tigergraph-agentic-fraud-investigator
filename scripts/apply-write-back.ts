// Apply verified TigerGraph write-back records (reports/writeback/*.json) to the answer files and web data.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
let n = 0;
for (const f of readdirSync("reports/writeback").filter(f => /^HHG-\d{3}\.json$/.test(f))) {
  const id = f.replace(".json", ""); const w = JSON.parse(readFileSync(`reports/writeback/${f}`, "utf8"));
  if (!w.readbackVerified) continue;
  const a = JSON.parse(readFileSync(`cases/${id}.json`, "utf8"));
  a.case.graph_case_id = `${w.vertexType}:${w.vertexId}`; a.case.written_to_graph = true;
  writeFileSync(`cases/${id}.json`, JSON.stringify(a, null, 2) + "\n");
  const wp = `apps/web/data/${id}.json`;
  if (existsSync(wp)) { const d = JSON.parse(readFileSync(wp, "utf8")); d.answer = a; d.tigergraphCaseWrite = w; if (w.readbackVerified && Array.isArray(d.limitations)) d.limitations = d.limitations.map((l: string) => l.startsWith("written_to_graph is false") ? `The case record was written to TigerGraph Savanna (${w.vertexType}:${w.vertexId}) and read back, so written_to_graph=true.` : l.replace(", and the case record is written to the local graph only.", ". The case record is written back to TigerGraph Savanna.")); writeFileSync(wp, JSON.stringify(d, null, 1) + "\n"); }
  n++;
}
console.log(`Applied ${n} TigerGraph write-back records.`);

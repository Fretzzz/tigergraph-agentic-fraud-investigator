// Write every case record to TigerGraph (vertex GS_InvestigationCase) and read it back.
// Usage: TG_HOST=... TG_SECRET=... pnpm case:write-back [HHG-003 ...]
// Edges to the flagged txn / card / customer are only created when those vertices already exist in
// TigerGraph (vertex_must_exist=true), so no stub vertices are made for cases whose slice is not loaded.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { connectTigerGraph } from "../packages/graph-tigergraph/src/tigergraph.js";

const ids = process.argv.slice(2);
const caseIds = ids.length ? ids : readdirSync("cases").filter(f => /^HHG-\d{3}\.json$/.test(f)).map(f => f.replace(".json", "")).sort();
const cfg = await connectTigerGraph();
const H = { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" };
const tgTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const results: any[] = [];
for (const id of caseIds) {
  const a = JSON.parse(readFileSync(`cases/${id}.json`, "utf8"));
  const web = JSON.parse(readFileSync(`apps/web/data/${id}.json`, "utf8"));
  const c = a.case; const trig = web.case;
  const vid = `${id}`;
  const attrs: Record<string, { value: unknown }> = {
    run_id: { value: web.runId }, verdict: { value: c.verdict }, fraud_probability: { value: c.fraud_probability }, pattern: { value: c.pattern },
    status: { value: c.status }, exposure_usd: { value: c.exposure_usd }, sar_filed: { value: !!a.sar?.file }, stop_reason: { value: a.stop_reason },
    summary: { value: c.summary }, initial_actions: { value: a.next_best_actions.initial.map((x: any) => `${x.action}/${x.route}`).join(",") },
    final_actions: { value: a.next_best_actions.final.map((x: any) => `${x.action}/${x.route}`).join(",") },
    evidence_json: { value: JSON.stringify(c.evidence).slice(0, 60000) }, written_at: { value: tgTime(new Date()) },
  };
  const edge = (type: string, to: string, toId: string) => ({ [type]: { [to]: { [toId]: {} } } });
  const body = {
    vertices: { GS_InvestigationCase: { [vid]: attrs } },
    edges: { GS_InvestigationCase: { [vid]: { ...edge("GS_CASE_ON_TXN", "GS_Txn", String(trig.flagged_txn_id)), ...edge("GS_CASE_ON_CARD", "GS_Card", String(trig.card_id)), ...edge("GS_CASE_ON_CUSTOMER", "GS_Customer", String(trig.customer_id)) } } },
  };
  const up = await fetch(`${cfg.host}/restpp/graph/${cfg.graph}?vertex_must_exist=true`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const upBody: any = await up.json();
  if (!up.ok || upBody.error) throw new Error(`${id}: upsert failed: ${JSON.stringify(upBody).slice(0, 300)}`);
  const rb: any = await (await fetch(`${cfg.host}/restpp/graph/${cfg.graph}/vertices/GS_InvestigationCase/${encodeURIComponent(vid)}`, { headers: H })).json();
  const got = rb.results?.[0]?.attributes;
  const ok = !!got && got.verdict === c.verdict && Math.abs(got.fraud_probability - c.fraud_probability) < 1e-9 && got.final_actions === attrs.final_actions!.value;
  const eg: any = await (await fetch(`${cfg.host}/restpp/graph/${cfg.graph}/edges/GS_InvestigationCase/${encodeURIComponent(vid)}`, { headers: H })).json();
  const edges = (eg.results ?? []).map((e: any) => `${e.e_type}->${e.to_id}`);
  if (!ok) throw new Error(`${id}: readback mismatch`);
  const write = { backend: "tigergraph", graph: cfg.graph, vertexType: "GS_InvestigationCase", vertexId: vid, writtenAt: attrs.written_at!.value, readbackVerified: true, edges };
  mkdirSync("reports/writeback", { recursive: true });
  writeFileSync(`reports/writeback/${id}.json`, JSON.stringify(write, null, 1) + "\n");
  results.push({ id, edges: edges.length }); console.log(`${id}: written + read back (${edges.length} edges: ${edges.join(", ") || "none - slice not loaded in TigerGraph"})`);
}
console.log(`\n${results.length} cases written to TigerGraph graph ${cfg.graph}. Now run: pnpm case:apply-write-back`);

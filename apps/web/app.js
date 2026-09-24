const params = new URLSearchParams(location.search);
const caseId = params.get("case") || "HHG-003";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const usd = n => `$${Number(n).toFixed(2)}`;
const COLORS = { Transaction: "#4aa3ff", Customer: "#3ecf8e", Card: "#f0b429", BillingRegion: "#b38cff", EmailDomain: "#ff8fab", DeviceProfile: "#5ce1e6", ClosedCase: "#ff6b6b", InvestigationCase: "#ffffff" };

function graphSvg(graph, seedKey) {
  const W = 640, H = 420, cx = W / 2, cy = H / 2;
  const pos = new Map();
  pos.set(seedKey, [cx, cy]);
  const rings = { Card: 1, Customer: 1, BillingRegion: 1, EmailDomain: 1, DeviceProfile: 1, InvestigationCase: 1, Transaction: 2, ClosedCase: 2 };
  const groups = {};
  for (const n of graph.nodes) if (n.id !== seedKey) (groups[rings[n.type] || 2] ||= []).push(n);
  for (const [ring, nodes] of Object.entries(groups)) {
    const r = ring === "1" ? 120 : 190;
    nodes.forEach((n, i) => { const a = (i / nodes.length) * 2 * Math.PI - Math.PI / 2 + (ring === "2" ? 0.2 : 0); pos.set(n.id, [cx + r * 1.45 * Math.cos(a), cy + r * Math.sin(a)]); });
  }
  const edges = graph.edges.map(e => { const [x1, y1] = pos.get(e.from) || [0, 0], [x2, y2] = pos.get(e.to) || [0, 0]; return `<line class="edge" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><text class="elabel" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 2}" text-anchor="middle">${esc(e.type)}</text>`; }).join("");
  const nodes = graph.nodes.map(n => { const [x, y] = pos.get(n.id); const seed = n.id === seedKey; const label = n.type === "DeviceProfile" ? n.label.split("|")[0] : n.label; return `<g><circle cx="${x}" cy="${y}" r="${seed ? 11 : 7}" fill="${COLORS[n.type] || "#999"}" stroke="${seed ? "#fff" : "none"}" stroke-width="2"><title>${esc(n.type)}: ${esc(n.label)}</title></circle><text x="${x}" y="${y + (seed ? 24 : 19)}" text-anchor="middle">${esc(label.length > 22 ? label.slice(0, 21) + "…" : label)}</text></g>`; }).join("");
  const legend = Object.entries(COLORS).filter(([t]) => graph.nodes.some(n => n.type === t)).map(([t, c]) => `<span><i style="background:${c}"></i>${t}</span>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Case subgraph">${edges}${nodes}</svg><div class="legend">${legend}</div>`;
}

function actionRows(list, prior) {
  const before = new Set(prior.map(a => a.action));
  return list.map(a => `<tr><td>${esc(a.action)}${prior.length && !before.has(a.action) ? '<span class="new">NEW</span>' : ""}</td><td class="route ${a.route}">${a.route}</td><td class="status">${a.route === "auto" ? "Agent may execute (simulated)" : `Waiting for ${a.route} approval`}</td><td>${esc(a.reason)}</td></tr>`).join("");
}

async function main() {
  const res = await fetch(`data/${encodeURIComponent(caseId)}.json`);
  if (!res.ok) { document.getElementById("app").innerHTML = `<p>Case ${esc(caseId)} not found.</p>`; return; }
  const d = await res.json();
  const a = d.answer, c = a.case, k = d.case;
  const seedKey = `Transaction:${k.flagged_txn_id}`;
  document.title = `${k.id} - GraphSentinel`;
  const tg = d.graphBackend === "tigergraph" && d.tigergraph;
  const bb = document.getElementById("backend-badge");
  if (bb) { bb.textContent = tg ? "TigerGraph (live run)" : "Local graph (not TigerGraph)"; bb.className = tg ? "badge live" : "badge warn"; bb.title = tg ? `Queries ran on TigerGraph Savanna at ${d.tigergraph.fetchedAt}. This page shows that saved run; the browser does not call TigerGraph.` : "Queries ran on the in-memory local graph."; }
  document.getElementById("app").innerHTML = `
  <section class="panel full"><div class="casehead">
    <div><div class="id">${esc(k.id)}</div><div class="muted">${esc(k.trigger_type.replace("_", " "))} · opened ${esc(k.opened_at)} (dataset-local time)</div></div>
    <dl class="kv"><dt>Customer</dt><dd>${esc(k.customer_id)}</dd><dt>Card</dt><dd>${esc(k.card_id)}</dd><dt>Flagged txn</dt><dd>${esc(k.flagged_txn_id)}</dd><dt>Run</dt><dd>${esc(d.runId)} · ${a.tool_calls} graph queries · ${a.tokens} LLM tokens</dd></dl>
    <div class="trigger">"${esc(k.trigger_text)}"</div></div></section>

  <section class="panel full"><h2>Assessment</h2><div class="verdict">
    <span class="pill ${c.verdict}">${esc(c.verdict)}</span>
    <div><div class="meter"><div style="width:${c.fraud_probability * 100}%"></div></div><div class="muted">fraud probability ${c.fraud_probability}</div></div>
    <div>Status <b>${esc(c.status)}</b> · exposure <b>${usd(c.exposure_usd)}</b> · pattern <b>${esc(c.pattern)}</b> · SAR <b>${a.sar.file ? "file" : "not filed"}</b></div></div>
    <p>${esc(c.summary)}</p></section>

  <section class="panel"><h2>Investigation steps</h2><ol class="steps">${d.steps.map(s => `<li><div class="q">${esc(s.question)}</div><div>${esc(s.finding)}</div><span class="ref">${esc(s.receiptId)}</span></li>`).join("")}</ol></section>

  <section class="panel"><h2>Case graph <span class="muted">(drawn from the local slice)</span></h2>${graphSvg(d.graph, seedKey)}
    <h2 style="margin-top:14px">Evidence weighed</h2>${d.factors.map(f => `<div class="factor"><span class="dir ${f.direction}">${f.direction === "supports_fraud" ? "FRAUD +" : "LEGIT −"}${f.weight}</span><div>${esc(f.claim)} <span class="ref">${esc(f.receiptId)}</span></div></div>`).join("")}</section>

  <section class="panel full"><h2>Next best actions</h2><div class="cols">
    <div><b>Initial</b> <span class="muted">(stored before any simulated reply)</span><table><tr><th>Action</th><th>Route</th><th>State</th><th>Reason</th></tr>${actionRows(a.next_best_actions.initial, [])}</table></div>
    <div><b>Final</b><table><tr><th>Action</th><th>Route</th><th>State</th><th>Reason</th></tr>${actionRows(a.next_best_actions.final, a.next_best_actions.initial)}</table></div></div>
    <p><b>Evidence request:</b> ${a.evidence_requests.map(r => esc(r.assumed_response)).join("<br>") || "none"}</p>
    <p><b>What changed:</b> ${esc(a.next_best_actions.what_changed)}</p>
    <p><b>SAR:</b> ${esc(a.sar.reason)}</p><p><b>Stop reason:</b> ${esc(a.stop_reason)}</p></section>

  <section class="panel"><h2>Similar prior cases (memory)</h2><table><tr><th>Case</th><th>Outcome</th><th>Pattern</th></tr>${(d.receipts.find(r => r.query === "historical_cases")?.result || []).map(h => `<tr><td>${esc(h.id)}</td><td>${esc(h.outcome)}</td><td>${esc(h.pattern)}</td></tr>`).join("")}</table></section>

  ${tg ? `<section class="panel full"><h2>TigerGraph run</h2>
    <p>The 8 graph queries ran as installed GSQL queries on TigerGraph Savanna (graph <b>${esc(d.tigergraph.graph)}</b>) at ${esc(d.tigergraph.fetchedAt)} (${d.tigergraph.fetchMs} ms). This page replays that saved run; your browser does not call TigerGraph. Each result was checked against the local graph: <b>${d.tigergraph.parity.filter(p => p.match).length}/${d.tigergraph.parity.length} match</b>.</p>
    <table><tr><th>Receipt</th><th>Installed query</th><th>Matches local</th></tr>${d.tigergraph.parity.map((p, i) => `<tr><td>${esc(p.receiptId)}</td><td><code>${esc((d.tigergraph.queries[i] || "").split("/").pop())}</code></td><td>${p.match ? "yes" : "NO"}</td></tr>`).join("")}</table>
    <p class="muted">Not in TigerGraph (kept local): ${d.tigergraph.fieldsNotInTigerGraph.map(esc).join(", ")}. Case record write-back stays local.</p></section>` : ""}
  <section class="panel"><h2>Limitations of this run</h2><ul class="lim">${d.limitations.map(l => `<li>${esc(l)}</li>`).join("")}</ul>
    <p class="muted">Local case write ${esc(d.localCaseWrite.vertexId)}: readback ${d.localCaseWrite.readbackVerified ? "verified" : "FAILED"} (local graph only; written_to_graph=false).</p></section>`;
}
async function nav() {
  const el = document.getElementById("cases"); if (!el) return;
  try {
    const rows = await (await fetch("data/index.json")).json();
    el.innerHTML = `<span class="muted">Cases (${rows.length} of 20):</span> ` + rows.map(r => `<a href="?case=${encodeURIComponent(r.id)}" class="${r.id === caseId ? "on" : ""}" title="${esc(r.trigger.replace("_", " "))} · ${esc(r.verdict)} ${r.p} · ${r.backend === "tigergraph" ? "TigerGraph live run" : "local graph run"}">${esc(r.id.slice(4))}${r.backend === "tigergraph" ? "<sup>TG</sup>" : ""}</a>`).join("");
  } catch { el.remove(); }
}
nav();
main();

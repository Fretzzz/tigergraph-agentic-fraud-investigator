// LLM case narrative with graph-grounded context ("GraphRAG-lite").
// Usage: NIM_API_KEY=... pnpm narrate            (all 20 cases)
//        NIM_API_KEY=... pnpm narrate HHG-003    (one case)
//        pnpm narrate --dry-run HHG-003          (build the context and prompt only; no key, no call)
//
// What it does, per case:
//   1. Retrieve context: the saved graph query receipts for the case, the similar closed cases the graph
//      returned (case memory), the policy sections behind the rule-based decisions, and the fraud-pattern text.
//   2. Send only that context (not raw tables) to an NVIDIA NIM chat model.
//   3. The model writes the case summary, explanation and remaining uncertainty, citing receipt IDs,
//      policy rules and closed-case IDs. It does NOT decide anything: verdict, probability and actions stay rule-based.
//   4. Validate: every citation must exist in the retrieved context, and the text must not state a different
//      verdict or probability. One retry on failure; a narrative that still fails is not saved.
//   5. Save narratives/HHG-XXX.json (model, token usage, time, context list) and merge it into the web data.
// The key is read from the environment only and is never written anywhere.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ids = args.filter(a => !a.startsWith("--"));
const caseIds = ids.length ? ids : readdirSync("cases").filter(f => /^HHG-\d{3}\.json$/.test(f)).map(f => f.replace(".json", "")).sort();
const endpoint = process.env.NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
// The public model list includes retired models, so try candidates in order and use the first that answers.
const MODEL_CANDIDATES = (process.env.NIM_MODEL ? [process.env.NIM_MODEL] : []).concat([
  "nvidia/nemotron-3-super-120b-a12b", "mistralai/mistral-large-2-instruct", "openai/gpt-oss-20b",
  "deepseek-ai/deepseek-v4.1-flash", "nvidia/nemotron-nano-3-30b-a3b", "nvidia/llama-3.1-nemotron-ultra-253b-v1", "nvidia/llama-3.1-nemotron-70b-instruct",
]);
let model = MODEL_CANDIDATES[0]!;
const key = process.env.NIM_API_KEY ?? "";

const readme = readFileSync("docs/sources/dataset-readme.md", "utf8");
const policyStart = readme.indexOf("# Fraud Policy");
const policy = readme.slice(policyStart, readme.indexOf("# Answer Format", policyStart));
const ruleText = (id: string) => policy.match(new RegExp(`\\*\\*${id}\\.[^\\n]*`))?.[0] ?? "";
const sectionText = (h: string) => { const i = policy.indexOf(`### ${h}`); if (i < 0) return ""; const j = policy.indexOf("\n### ", i + 4); return policy.slice(i, j < 0 ? undefined : j).trim(); };
const patterns = readme.slice(readme.indexOf("## The five known fraud patterns"), readme.indexOf("## Regulatory references"));
const patternText = (p: string) => { if (!p || p === "none" || p === "undocumented") return ""; const lines = patterns.split("\n").filter(l => l.toLowerCase().includes(p.replace(/_/g, " ")) || l.includes(p)); return lines.join("\n").slice(0, 1200); };

export function buildContext(d: any) {
  const a = d.answer; const c = a.case;
  const receipts = d.receipts.map((r: any) => ({ id: r.receiptId, query: r.query, result: JSON.stringify(r.result).slice(0, 900) }));
  const hist = d.receipts.find((r: any) => r.query === "historical_cases")?.result ?? [];
  const similar = (c.similar_prior_cases ?? []).map((id: string) => hist.find((h: any) => h.id === id)).filter(Boolean)
    .map((h: any) => ({ id: h.id, outcome: h.outcome, pattern: h.pattern, actions: h.actions_taken, notes: (h.analyst_notes ?? "").slice(0, 300) }));
  const actions = [...a.next_best_actions.initial, ...a.next_best_actions.final];
  const rules = [...new Set([...actions.map((x: any) => x.reason ?? ""), a.sar?.reason ?? "", a.stop_reason ?? ""].flatMap((t: string) => t.match(/R\d+/g) ?? []))].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)));
  const policySections = [
    ...rules.map(r => ({ id: r, text: ruleText(r as string) })),
    { id: "3a", text: sectionText("3a.") }, { id: "5", text: sectionText("5.") }, { id: "6", text: sectionText("6.") },
  ].filter(p => p.text);
  const decided = {
    verdict: c.verdict, fraud_probability: c.fraud_probability, pattern: c.pattern, exposure_usd: c.exposure_usd,
    sar_filed: a.sar?.file ?? null, sar_reason: a.sar?.reason ?? "", stop_reason: a.stop_reason,
    initial_actions: a.next_best_actions.initial.map((x: any) => `${x.action}${x.route ? ` [route ${x.route}]` : ""}: ${x.reason ?? ""}`),
    final_actions: a.next_best_actions.final.map((x: any) => `${x.action}${x.route ? ` [route ${x.route}]` : ""}: ${x.reason ?? ""}`),
    evidence_requests: a.evidence_requests ?? [],
  };
  const factors = (d.factors ?? []).map((f: any) => ({ id: f.id, direction: f.direction, receipt: f.receiptId, claim: f.claim }));
  const allowed = new Set<string>([...receipts.map((r: any) => r.id), ...similar.map((s: any) => s.id), ...policySections.map(p => p.id.startsWith("R") ? p.id : `section ${p.id}`), "trigger:case_pack"]);
  return { caseId: a.case_id, trigger: d.case, decided, factors, receipts, similar, policySections, pattern: patternText(c.pattern), allowed: [...allowed] };
}

function prompt(ctx: ReturnType<typeof buildContext>) {
  const system = `You are the explanation layer of a fraud investigation agent. The investigation, the verdict, the probability and the actions were already decided by graph queries and written policy rules. Your job is to explain them to a bank fraud analyst. Rules: use ONLY the context given. Never change or second-guess the verdict, probability, pattern or actions. Cite sources inline in square brackets using the exact IDs from the context: receipt IDs like [Q04-amount_profile], rules like [R2], policy sections like [section 5], closed cases like [CC-1234], or [trigger:case_pack]. Do not invent IDs. Be concrete and short. Output JSON only.`;
  const user = `CONTEXT (retrieved from the graph and the policy):\n${JSON.stringify({ trigger: ctx.trigger, decided: ctx.decided, evidence_factors: ctx.factors, graph_receipts: ctx.receipts, similar_closed_cases: ctx.similar, policy: ctx.policySections, pattern_description: ctx.pattern }, null, 1)}\n\nWrite JSON with exactly these keys:\n{"summary": "3-5 sentences for the case file: what happened, what the graph showed, the verdict with its probability, and the next step", "why_these_actions": ["one line per final action, citing the rule"], "evidence_for": ["..."], "evidence_against": ["..."], "uncertainty": "what is still unknown and what evidence would settle it", "memory": "what the similar closed cases suggest, or say none were relevant"}\nState the verdict as "${ctx.decided.verdict}" and the probability as ${ctx.decided.fraud_probability}.\nALLOWED CITATION IDS - put only these inside square brackets, copied exactly, one ID per bracket: ${ctx.allowed.map(x => `[${x}]`).join(" ")}. Do not put anything else in square brackets (no field names, no numbers).`;
  return { system, user };
}

export function validate(ctx: ReturnType<typeof buildContext>, out: any): string[] {
  const errs: string[] = [];
  for (const k of ["summary", "why_these_actions", "evidence_for", "evidence_against", "uncertainty", "memory"]) if (!(k in out)) errs.push(`missing ${k}`);
  const text = JSON.stringify(out);
  const cites = [...text.matchAll(/\[([^\[\]]{1,60})\]/g)].map(m => m[1]!.trim());
  const allowed = new Set(ctx.allowed);
  for (const c of cites) for (const part of c.split(/[,;]\s*/)) if (part && !allowed.has(part)) errs.push(`unknown citation [${part}]`);
  if (!cites.length) errs.push("no citations");
  const probs = [...String(out.summary ?? "").matchAll(/\b0\.\d{1,3}\b/g)].map(m => Number(m[0]));
  if (probs.length && !probs.includes(ctx.decided.fraud_probability)) errs.push(`summary states probability ${probs.join(",")} but decided ${ctx.decided.fraud_probability}`);
  if (!String(out.summary ?? "").toLowerCase().includes(String(ctx.decided.verdict).replace(/_/g, " ").toLowerCase()) && !String(out.summary ?? "").includes(String(ctx.decided.verdict))) errs.push(`summary does not state verdict ${ctx.decided.verdict}`);
  for (const v of ["confirmed_fraud", "not_fraud", "uncertain", "likely_fraud", "likely_legitimate"]) if (v !== ctx.decided.verdict && new RegExp(`verdict[^.]{0,20}${v.replace("_", "[ _]")}`, "i").test(String(out.summary ?? ""))) errs.push(`summary claims verdict ${v}`);
  return errs;
}

async function callNim(system: string, user: string) {
  const t0 = Date.now();
  let res: Response | null = null;
  for (let i = 0; i < 4; i++) {
    res = await fetch(`${endpoint}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 3000, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (res.status !== 429 && res.status < 500) break;
    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
  }
  res = res!;
  if (!res.ok) throw new Error(`NIM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body: any = await res.json();
  const content: string = String(body.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const json = content.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`NIM returned no JSON: ${content.slice(0, 200)}`);
  return { out: JSON.parse(json), usage: body.usage ?? null, ms: Date.now() - t0, servedModel: body.model ?? model };
}

async function main() {
  if (!dryRun && !key) { console.error("Set NIM_API_KEY in your shell (never commit it)."); process.exit(1); }
  mkdirSync("narratives", { recursive: true });
  if (!dryRun) {
    let picked = "";
    for (const m of MODEL_CANDIDATES) {
      let r = await fetch(`${endpoint}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: m, max_tokens: 5, messages: [{ role: "user", content: "Reply OK" }] }) });
      for (let i = 0; i < 2 && (r.status === 429 || r.status >= 500); i++) { await new Promise(res => setTimeout(res, 8000)); r = await fetch(`${endpoint}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: m, max_tokens: 5, messages: [{ role: "user", content: "Reply OK" }] }) }); }
      console.log(`probe ${m}: ${r.status}`);
      if (r.status === 401 || r.status === 403) { console.error("NIM rejected the key (" + r.status + ")"); process.exit(1); }
      if (r.ok) { picked = m; break; }
    }
    if (!picked) { console.error("No candidate NIM model answered; set NIM_MODEL to a model your key can use."); process.exit(1); }
    model = picked;
  }
  let ok = 0, failed = 0, tokens = 0;
  const one = async (id: string) => {
    const webPath = `apps/web/data/${id}.json`;
    if (!existsSync(webPath)) { console.error(`${id}: no run data at ${webPath}`); failed++; return; }
    const d = JSON.parse(readFileSync(webPath, "utf8"));
    const ctx = buildContext(d); const p = prompt(ctx);
    if (dryRun) { console.log(`${id}: context ${p.user.length} chars; ${ctx.receipts.length} receipts, ${ctx.similar.length} similar cases, policy ${ctx.policySections.map(s => s.id).join(",")}`); if (ids.length === 1) console.log(p.system + "\n\n" + p.user); return; }
    let result: any = null; let errs: string[] = []; const attempts: any[] = [];
    for (let attempt = 1; attempt <= 3 && !result; attempt++) {
      try {
        const r = await callNim(p.system, attempt === 1 ? p.user : `${p.user}\n\nYour previous answer was rejected: ${errs.join("; ")}. Fix it. Use only the allowed citation IDs listed above.`);
        attempts.push({ attempt, usage: r.usage, ms: r.ms });
        errs = validate(ctx, r.out);
        if (!errs.length) result = r;
      } catch (e) { errs = [String((e as Error).message)]; attempts.push({ attempt, error: errs[0] }); }
    }
    if (!result) { console.error(`${id}: FAILED (${errs.join("; ")})`); failed++; return; }
    const used = attempts.reduce((s, x) => s + (x.usage?.total_tokens ?? 0), 0); tokens += used;
    const narrative = {
      caseId: id, label: "LLM-written narrative. Verdict, probability and actions are rule-based; the model only explains them.",
      provider: "NVIDIA NIM", model: result.servedModel, generatedAt: new Date().toISOString(), tokens: used, attempts,
      retrieval: { method: "GraphRAG-lite: graph query receipts + similar closed cases from the graph + cited policy sections (no vector index)", receipts: ctx.receipts.map((r: any) => r.id), similarCases: ctx.similar.map((s: any) => s.id), policy: ctx.policySections.map(s => s.id) },
      promptSha256: createHash("sha256").update(p.system + p.user).digest("hex"),
      validation: "passed: all citations exist in the retrieved context; verdict and probability unchanged",
      output: result.out,
    };
    writeFileSync(`narratives/${id}.json`, JSON.stringify(narrative, null, 1) + "\n");
    d.narrative = narrative; if (d.answer) d.answer.tokens = used; writeFileSync(webPath, JSON.stringify(d, null, 1) + "\n");
    const casePath = `cases/${id}.json`; const ans = JSON.parse(readFileSync(casePath, "utf8")); ans.tokens = used; writeFileSync(casePath, JSON.stringify(ans, null, 2) + "\n");
    console.log(`${id}: ok (${used} tokens)`); ok++;
    };
  const queue = [...caseIds]; const workers = dryRun ? 1 : Number(process.env.NARRATE_CONCURRENCY ?? 3);
  await Promise.all(Array.from({ length: workers }, async () => { while (queue.length) await one(queue.shift()!); }));
  if (!dryRun) console.log(`\nDone: ${ok} ok, ${failed} failed, ${tokens} tokens total, model ${model}.${failed ? " Re-run the failed IDs: pnpm narrate HHG-0xx" : ""}`);
  if (failed) process.exitCode = 1;
}
if (process.argv[1]?.includes("narrate")) main();

import type { Answer } from "../../contracts/src/answer.js";
import type { Assessment, DecisionAction, FactRef, PolicyFacts, TruthValue } from "../../contracts/src/domain.js";
import { evaluatePolicy } from "../../policy/src/evaluate.js";
import { compileAnswer } from "../../exporter/src/compile.js";
import { validateAnswer, type ValidationReport } from "../../exporter/src/validate.js";
import { buildGraph, type LocalGraph } from "../../graph-local/src/graph.js";
import { GraphQueries, type InvestigationQueries, type QueryReceipt } from "../../graph-local/src/queries.js";
import type { CaseSlice } from "../../graph-local/src/slice.js";

// Deterministic, source-grounded investigation over a local case graph.
// No LLM is called here (tokens = 0). Conclusions come from query results and
// the dataset policy; nothing is keyed on a case ID.

export interface Factor { id: string; direction: "supports_fraud" | "supports_legitimate"; weight: number; claim: string; receiptId: string }
export interface Step { n: number; question: string; receiptId: string; finding: string }
export interface SimulatedReply { requestId: string; type: "customer_validation"; question: string; assumedResponse: string; rule: string }
export interface InvestigationRun {
  runId: string; caseId: string; steps: Step[]; factors: Factor[]; receipts: QueryReceipt[];
  facts: { initial: PolicyFacts; final: PolicyFacts }; assessment: Assessment;
  decisions: { initial: DecisionAction[]; final: DecisionAction[]; initialConflicts: string[]; missingPremises: string[] };
  simulated: SimulatedReply[]; localCaseWrite: { vertexId: string; readbackVerified: boolean; backend: "local-graph" };
  graphBackend: "local-graph" | "tigergraph";
  answer: Answer; validation: ValidationReport;
  limitations: string[];
  graph: { nodes: { id: string; type: string; label: string }[]; edges: { from: string; to: string; type: string }[] };
}

const SIMULATOR_DEFAULT = "No reply within 24 hours. Fixed simulator default applied to every customer request in this build; it is not chosen per case and carries no hidden label.";
const ACTION_ORDER = ["CREATE_CASE", "VERIFY_WITH_CUSTOMER", "DECLINE_TRANSACTION", "STEP_UP_AUTH", "MONITOR_CARD", "BLOCK_CARD", "MONITOR_CONNECTED_CARDS", "ESCALATE_TO_ANALYST", "FILE_REPORT", "WARN_CUSTOMER", "CLOSE_NO_FRAUD"];
const fact = (value: TruthValue, receipts: string[] = [], requests: string[] = []): FactRef => ({ fact: value, evidenceReceiptIds: receipts, requestIds: requests });
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (ts: string) => ts.slice(0, 10);

function hoursBefore(ts: string, h: number): string {
  const d = new Date(ts.replace(" ", "T") + "Z");
  return new Date(d.getTime() - h * 3600_000).toISOString().replace("T", " ").slice(0, 19);
}
function orderActions(a: DecisionAction[]): DecisionAction[] {
  return [...a].sort((x, y) => ACTION_ORDER.indexOf(x.action) - ACTION_ORDER.indexOf(y.action));
}

export function investigate(slice: CaseSlice, opts: { runId: string; startedAtMs?: number; nowMs?: () => number; queries?: InvestigationQueries }): InvestigationRun {
  const now = opts.nowMs ?? (() => Date.now());
  const started = opts.startedAtMs ?? now();
  const c = slice.case;
  const g: LocalGraph = buildGraph(slice);
  const q: InvestigationQueries = opts.queries ?? new GraphQueries(g, c.opened_at);
  const live = q.receipts !== undefined && !(q instanceof GraphQueries);
  const steps: Step[] = [];
  const factors: Factor[] = [];
  const step = (question: string, r: QueryReceipt, finding: string) => steps.push({ n: steps.length + 1, question, receiptId: r.receiptId, finding });

  // 1. What exactly was flagged?
  const seedR = q.seedContext(c.flagged_txn_id);
  const seed = seedR.result.txn;
  step("What is the flagged transaction?", seedR, `${seed.id}: ${usd(seed.amount_cents)} ${seed.channel} in billing region ${seed.region ?? "unknown"} at ${seed.ts}, purchaser email domain ${seed.purchaser_email_domain ?? "none"}, bank risk score ${seed.risk_score ?? "n/a"} (input, not a verdict). Device record: ${seedR.result.device ?? "none"}.`);

  // 2. What does the organizer history say about this trigger type?
  const hist = slice.history_stats;
  if (c.trigger_type === "customer_report") {
    const rep = hist.cardholder_reported;
    factors.push({ id: "customer_denial", direction: "supports_fraud", weight: 0.15, receiptId: "trigger:case_pack", claim: `Customer ${c.customer_id} denies ${seed.id}. In organizer history, ${rep.confirmed_fraud} of ${rep.confirmed_fraud + rep.cleared} cardholder-reported closed cases were confirmed fraud (history only contains closed outcomes, so this is a prior, not proof).` });
  }

  if (c.trigger_type === "risk_score" && c.risk_score !== null) {
    const ms = hist.model_scored; const tot = ms.confirmed_fraud + ms.cleared;
    if (tot > 0) {
      const rate = ms.confirmed_fraud / tot;
      factors.push({ id: "model_score_prior", direction: rate >= 0.5 ? "supports_fraud" : "supports_legitimate", weight: 0.05, receiptId: "trigger:case_pack", claim: `Model alerts like this one (score ${c.risk_score}) are ${rate >= 0.5 ? "usually confirmed" : "usually cleared"}: ${ms.confirmed_fraud} of ${tot} model-scored closed cases in organizer history were confirmed fraud. This is a prior, not proof.` });
    }
  }

  // 3. Is the billing region part of the customer's own history?
  if (seed.region) {
    const rr = q.regionHistory(c.customer_id, seed.region, seed.ts);
    const r = rr.result;
    step(`Has ${c.customer_id} used billing region ${seed.region} before?`, rr, `${r.inRegion} of ${r.priorTransactions} prior transactions were in region ${seed.region} (rank ${r.regionRank ?? "-"} of ${r.distinctRegions} regions), first ${r.firstSeen ?? "never"}, last ${r.lastSeen ?? "never"}.`);
    if (r.inRegion >= 10) factors.push({ id: "established_region", direction: "supports_legitimate", weight: 0.10, receiptId: rr.receiptId, claim: `Region ${seed.region} is established for ${c.customer_id}: ${r.inRegion} prior transactions since ${r.firstSeen}. This is not out-of-region use.` });
    else if (r.inRegion === 0 && seed.channel === "in_person") factors.push({ id: "new_region_card_present", direction: "supports_fraud", weight: 0.15, receiptId: rr.receiptId, claim: `Card-present purchase in region ${seed.region}, where ${c.customer_id} has no prior history.` });
  }

  // 4. Is the purchaser email domain new, and did it appear on other transactions that day?
  let sameDayOthers: { id: string; ts: string; amount_cents: number; risk_score: number | null }[] = [];
  if (seed.purchaser_email_domain) {
    const er = q.emailDomainHistory(c.customer_id, seed.purchaser_email_domain, c.opened_at, `${day(seed.ts)} 00:00:00`);
    sameDayOthers = er.result.sameDay.filter(t => t.id !== seed.id);
    step(`Is purchaser email domain ${seed.purchaser_email_domain} new for this customer?`, er, `${er.result.priorUses} uses before ${day(seed.ts)}; same-day uses: ${er.result.sameDay.map(t => `${t.id} (${usd(t.amount_cents)}, ${t.ts.slice(11)}, score ${t.risk_score})`).join(", ")}.`);
    if (er.result.priorUses === 0 && sameDayOthers.length > 0) factors.push({ id: "new_email_domain_pair", direction: "supports_fraud", weight: 0.05, receiptId: er.receiptId, claim: `Purchaser email domain ${seed.purchaser_email_domain} was never used by ${c.customer_id} before ${day(seed.ts)}, then appears on ${[seed.id, ...sameDayOthers.map(t => t.id)].join(" and ")} the same day. Email domain is not merchant or purchaser identity (D04), so this is a weak signal.` });
  }

  // 5. Does the amount fit the customer's spending?
  const ar = q.amountProfile(c.customer_id, seed.amount_cents, seed.ts, 100);
  step(`Is ${usd(seed.amount_cents)} typical for ${c.customer_id}?`, ar, `${ar.result.withinTolerance} of ${ar.result.priorTransactions} prior transactions were within $1.00 of ${usd(seed.amount_cents)} (${ar.result.inPersonWithinTolerance} in person); median prior amount ${ar.result.medianCents === null ? "n/a" : usd(ar.result.medianCents)}.`);
  if (ar.result.inPersonWithinTolerance >= 10 && seed.channel === "in_person") factors.push({ id: "typical_amount", direction: "supports_legitimate", weight: 0.05, receiptId: ar.receiptId, claim: `${usd(seed.amount_cents)} in person is routine for ${c.customer_id}: ${ar.result.inPersonWithinTolerance} prior in-person purchases within $1.00. Merchant identity is absent from the data (D04), so a same-merchant recurring match cannot be confirmed.` });

  // 6. Short-window timeline and card-testing check.
  const windowStart = hoursBefore(seed.ts, 48);
  const tr = q.customerTimeline(c.customer_id, windowStart, c.opened_at);
  const hourStart = hoursBefore(seed.ts, 1);
  const tinyOnline = tr.result.filter(t => t.ts >= hourStart && t.ts < seed.ts && t.channel === "online" && t.amount_cents < 500);
  step("What happened on this customer in the 48 hours before the case opened?", tr, `${tr.result.length} transactions (${tr.result.filter(t => t.channel === "online").length} online); ${tinyOnline.length} online authorizations under $5 in the hour before the flagged transaction.`);

  // 7. Device context.
  const dr = q.deviceContext(c.customer_id, c.opened_at);
  step("Do this customer's device profiles connect to other customers in scope?", dr, `${dr.result.distinctProfiles} device profiles on ${dr.result.onlineWithIdentity} identity-linked transactions; shared with other in-scope customers: ${dr.result.sharedWithOtherCustomersInSlice.length}. The flagged transaction ${seedR.result.device ? "has" : "has no"} device record.`);

  // 8. Historical case memory on this card/customer (only cases closed before the case opened).
  const hr = q.historicalCases(c.card_id, c.customer_id);
  const confirmedPatterns = [...new Set(hr.result.filter(h => h.outcome === "confirmed_fraud").map(h => h.pattern))];
  const priorFraudRegions = new Set(hr.result.filter(h => h.outcome === "confirmed_fraud").flatMap(h => h.txn_ids).map(id => g.get("Transaction", id)?.props["region"] as string | undefined).filter((r): r is string => !!r));
  step(`What prior cases exist on ${c.card_id}?`, hr, hr.result.length ? hr.result.map(h => `${h.id} ${h.outcome} ${h.pattern} (${usd(h.exposure_cents)})`).join("; ") : "none");

  // 9. Shared origin: other customers sharing region and email domain in the window, or other customers' fraud.
  const sr = q.sharedOrigin(seed.id);
  // Only a small, specific overlap counts as a shared origin. Large groups on a common region or a mass email
  // provider (or a missing region) are background noise, not a link between customers.
  const COMMON_EMAIL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "anonymous.com", "outlook.com", "aol.com", "live.com", "icloud.com", "comcast.net", "msn.com"]);
  const regionEmailLink = !!seed.region && !!seed.purchaser_email_domain && !COMMON_EMAIL.has(seed.purchaser_email_domain)
    && sr.result.otherCustomerTxnsSharingRegionAndEmail.length > 0 && sr.result.otherCustomerTxnsSharingRegionAndEmail.length <= 5;
  // A device link counts only if the flagged transaction's own device is shared, and the profile is specific
  // (generic OS/browser strings such as "Windows" or "iOS Device" are shared by many unrelated people).
  const GENERIC_DEVICE = /^(\?|Windows|iOS Device|MacOS|Trident\/7\.0|rv:[\d.]+|Linux|)$/;
  const linkedDevices = dr.result.sharedWithOtherCustomersInSlice.filter(d => d.device === seedR.result.device && d.otherCustomers.length <= 3 && !GENERIC_DEVICE.test(d.device.split("|")[0] ?? ""));
  const deviceLink = linkedDevices.length > 0;
  const shared = regionEmailLink || sr.result.otherCustomerFraudCases.length > 0 || deviceLink;
  step("Does this connect to other customers or cards?", sr, `${sr.result.otherCustomerTxnsSharingRegionAndEmail.length} other-customer transactions share region ${seed.region} and email domain ${seed.purchaser_email_domain} in the ${slice.scope.neighborhood_hours}h window (${slice.region_window.transactions} region transactions from ${slice.region_window.other_customers} other customers overall); other-customer closed fraud cases linked: ${sr.result.otherCustomerFraudCases.length}.`);
  if (shared) factors.push({ id: "shared_origin", direction: "supports_fraud", weight: 0.15, receiptId: sr.receiptId, claim: sr.result.otherCustomerFraudCases.length ? `Activity links to other customers' confirmed fraud cases: ${sr.result.otherCustomerFraudCases.join(", ")}.` : regionEmailLink ? `${sr.result.otherCustomerTxnsSharingRegionAndEmail.length} other-customer transaction(s) share region ${seed.region} and the uncommon email domain ${seed.purchaser_email_domain} in the ${slice.scope.neighborhood_hours}h window: ${sr.result.otherCustomerTxnsSharingRegionAndEmail.join(", ")}.` : `The flagged transaction's specific device profile is shared with other in-scope customers: ${linkedDevices.map(d => `${d.device.split("|")[0]} (${d.otherCustomers.join(", ")})`).join("; ")}.` });

  // Assessment.
  const raw = 0.5 + factors.reduce((s, f) => s + (f.direction === "supports_fraud" ? f.weight : -f.weight), 0);
  const p = Math.round(Math.min(0.98, Math.max(0.02, raw)) * 100) / 100;
  const supporting = factors.filter(f => f.direction === "supports_fraud");
  const against = factors.filter(f => f.direction === "supports_legitimate");
  const verdict = p >= 0.85 && supporting.length >= 2 ? "fraud" : p <= 0.15 && against.length >= 2 ? "legitimate" : "uncertain";
  const pattern = factors.some(f => f.id === "new_region_card_present") ? "out_of_region_use" : "none";
  const affected = verdict === "legitimate" ? [] : [seed.id];
  const exposureCents = affected.length ? seed.amount_cents : 0;
  const conflict = supporting.length > 0 && against.length > 0;

  const assessment: Assessment = {
    verdict, fraudProbability: p, pattern, patternDescription: "",
    affectedTransactionCandidates: affected, evidenceReceiptIds: supporting.map(f => f.receiptId), counterevidenceReceiptIds: against.map(f => f.receiptId),
    unresolvedQuestions: [
      ...(sameDayOthers.length ? [`Did the customer make same-day transaction(s) ${sameDayOthers.map(t => t.id).join(", ")}?`] : []),
      "Merchant identity is absent (D04), so a same-merchant recurring charge cannot be confirmed or ruled out.",
      "Settlement/authorization status is absent (D05).",
    ],
    suspicionBasis: supporting.map(f => f.id).join(", "),
    nextInvestigativeQuestion: sameDayOthers.length ? "Ask the customer about the other same-day transaction on the new email domain." : "Ask the customer to confirm possession of the card.",
    suggestedStopReason: "",
  };

  const ids = (rs: QueryReceipt[]) => rs.map(r => r.receiptId);
  const baseFacts: PolicyFacts = {
    singleSignal: fact(c.trigger_type === "risk_score" && supporting.length === 0 ? "true" : "false", ids([seedR])),
    customerDenied: fact(c.trigger_type === "customer_report" ? "true" : "unknown", ["trigger:case_pack"]),
    customerConfirmed: fact(c.trigger_type === "customer_report" ? "false" : "unknown"),
    noReplyAfter24Hours: fact("false"),
    pendingAuthorization: fact("unknown"),
    testingSequence: fact(tinyOnline.length >= 3 ? "true" : "false", ids([tr])),
    purchaseOver100Cleared: fact("unknown"),
    sharedOrigin: fact(shared ? "true" : "false", ids([sr, dr])),
    recurringPatternMatch: fact("unknown", ids([ar])),
    coordinatedUndocumentedAbuse: fact(shared ? "unknown" : "false", ids([sr])),
    multipleCardsConfirmedFraud: fact(new Set(hr.result.filter(h => h.outcome === "confirmed_fraud").map(h => h.card_id)).size >= 2 ? "true" : "false", ids([hr])),
    credentialsConfirmedCompromised: fact("unknown", ids([hr])),
    exposureCents,
    evidenceConflict: fact(conflict ? "true" : "false", factors.map(f => f.receiptId)),
  };

  // Initial recommendation, stored before any simulated evidence is consumed.
  const initialPolicy = evaluatePolicy(baseFacts, assessment);
  const simulated: SimulatedReply[] = [];
  const initialActions: DecisionAction[] = [...initialPolicy.actions];
  if (verdict === "uncertain") {
    const question = sameDayOthers.length
      ? `Did you make ${sameDayOthers.map(t => `${t.id} (${usd(t.amount_cents)} at ${t.ts.slice(11, 16)})`).join(", ")} on ${day(seed.ts)}, and do you still have the card?`
      : "Do you still have the card, and do you recognise the other recent purchases?";
    simulated.push({ requestId: "REQ-1", type: "customer_validation", question, assumedResponse: SIMULATOR_DEFAULT, rule: "Policy section 5" });
    if (!initialActions.some(a => a.action === "VERIFY_WITH_CUSTOMER")) initialActions.push({ action: "VERIFY_WITH_CUSTOMER", route: "auto", reason: `Policy section 5 and R8: evidence conflicts; ask the customer: ${question}`, ruleIds: ["S5"] });
  }
  const initial = orderActions(initialActions);

  // Final recommendation after the fixed simulated reply.
  const finalFacts: PolicyFacts = simulated.length ? { ...baseFacts, noReplyAfter24Hours: fact("true", [], simulated.map(s => s.requestId)) } : baseFacts;
  const finalPolicy = evaluatePolicy(finalFacts, assessment);
  const final = simulated.length ? orderActions(finalPolicy.actions) : initial;

  // Write the investigation case to the LOCAL graph and read it back.
  const vertexId = `LOCAL-${c.id}-${opts.runId}`;
  const ck = g.upsert("InvestigationCase", vertexId, { case_id: c.id, verdict, fraud_probability: p, run_id: opts.runId, trust: "agent_assessment" });
  g.link("INVESTIGATES", ck, `Transaction:${seed.id}`, "graphsentinel");
  const readbackVerified = g.get("InvestigationCase", vertexId)?.props["verdict"] === verdict && g.outgoing(ck, "INVESTIGATES").length === 1;

  const reasons = (a: DecisionAction[]) => a.map(x => ({ action: x.action, route: x.route, reason: reasonText(x, exposureCents, c.trigger_type) }));
  const status = final.some(a => a.action === "ESCALATE_TO_ANALYST") ? "escalated" : final.some(a => a.action === "CLOSE_NO_FRAUD") ? "closed_legitimate" : "open";
  const files = final.some(a => a.action === "FILE_REPORT");
  const whatChanged = simulated.length
    ? `The customer was asked (${simulated[0]!.requestId}); the fixed simulator assumed no reply within 24 hours, so R4 adds MONITOR_CARD. No DECLINE_TRANSACTION because pending-authorization status is not in the data (D05); exposure ${usd(exposureCents)} is ${exposureCents < 50000 ? "under" : "at or over"} the R4 $500 escalation threshold.`
    : "nothing";

  const evidence: Answer["case"]["evidence"] = [
    { claim: `Flagged ${seed.id}: ${usd(seed.amount_cents)} ${seed.channel}, region ${seed.region ?? "none"}, ${seed.ts}, ${seedR.result.device ? `device ${seedR.result.device}` : "no device record"}; bank risk score ${seed.risk_score} used only as an input.`, source: "graph" as const, ref: seedR.receiptId, entity_ids: [seed.id, c.card_id] },
    ...factors.map(f => ({ claim: f.claim, source: (f.receiptId.startsWith("trigger") ? "customer" : "graph") as "customer" | "graph", ref: f.receiptId, entity_ids: entityIdsFor(f, seed.id, c.customer_id, sameDayOthers.map(t => t.id)) })),
    ...(hr.result.length ? [{ claim: `${hr.result.length} prior closed cases on ${c.card_id}; confirmed patterns: ${confirmedPatterns.join(", ") || "none"}. ${priorFraudRegions.has(seed.region ?? "") ? `A prior confirmed fraud transaction was billed in region ${seed.region}.` : `No prior confirmed fraud transaction was billed in region ${seed.region} (prior fraud regions: ${[...priorFraudRegions].join(", ") || "none"}).`}`, source: "graph" as const, ref: hr.receiptId, entity_ids: hr.result.map(h => h.id) }] : []),
    { claim: `No other customer shares region ${seed.region} and email domain ${seed.purchaser_email_domain} in the ${slice.scope.neighborhood_hours}h window, and no other customer's fraud case links to this card.`, source: "graph" as const, ref: sr.receiptId, entity_ids: [seed.id] },
  ].filter(e => shared ? !e.claim.startsWith("No other customer") : true);

  function summaryText(): string {
    const fits: string[] = [];
    if (factors.some(f => f.id === "established_region")) fits.push("region");
    if (factors.some(f => f.id === "typical_amount")) fits.push("amount");
    const newEmail = factors.some(f => f.id === "new_email_domain_pair");
    const opener = c.trigger_type === "customer_report"
      ? `${c.customer_id} disputes ${seed.id}, a ${usd(seed.amount_cents)} ${seed.channel === "in_person" ? "card-present" : seed.channel} purchase${seed.region ? ` in billing region ${seed.region}` : ""}.`
      : c.trigger_type === "risk_score"
        ? `The bank model scored ${seed.id} (${usd(seed.amount_cents)} ${seed.channel === "in_person" ? "card-present" : seed.channel}${seed.region ? `, billing region ${seed.region}` : ""}) at ${c.risk_score} for ${c.customer_id}.`
        : `Analyst review of ${seed.id} (${usd(seed.amount_cents)} ${seed.channel}) on ${c.card_id}.`;
    let middle = "";
    if (fits.length && newEmail) middle = ` The ${fits.join(" and ")} fit the customer's own history, but the purchaser email domain ${seed.purchaser_email_domain} is new that day and also sits on ${sameDayOthers.map(t => t.id).join(", ") || "no other transaction"}.`;
    else {
      const first = (x: string) => x.split(". ")[0]!.replace(/[.:]$/, ""); const sup = supporting.map(f => first(f.claim)); const ag = against.map(f => first(f.claim));
      if (sup.length) middle += ` For fraud: ${sup.join("; ")}.`;
      if (ag.length) middle += ` Against: ${ag.join("; ")}.`;
      if (!sup.length && !ag.length) middle = " The graph checks found no strong signal either way.";
    }
    const verdictLine = verdict === "uncertain" ? (conflict ? ` Evidence conflicts, so the verdict is uncertain at ${p}.` : supporting.length === 0 && against.length ? ` The evidence leans legitimate but is not strong enough to clear the alert, so the verdict is uncertain at ${p}.` : supporting.length && !against.length ? ` The evidence leans toward fraud but is not strong enough to confirm it, so the verdict is uncertain at ${p}.` : ` Evidence is thin, so the verdict is uncertain at ${p}.`) : ` Verdict ${verdict} at ${p}.`;
    const acts: string[] = [];
    const blk = final.find(a => a.action === "BLOCK_CARD");
    if (blk) acts.push(blk.route === "auto" ? "the card block is recommended" : `the card block is recommended${c.trigger_type === "customer_report" ? " under R2" : ""} and waits for ${blk.route} approval`);
    if (final.some(a => a.action === "ESCALATE_TO_ANALYST")) acts.push("the case is escalated under R8");
    if (!blk && final.some(a => a.action === "VERIFY_WITH_CUSTOMER")) acts.push("the customer is asked to confirm");
    if (final.some(a => a.action === "MONITOR_CARD") && !acts.length) acts.push("the card is monitored");
    const actLine = acts.length ? ` ${acts.join("; ").replace(/^./, x => x.toUpperCase())}.` : "";
    return `${opener}${middle}${verdictLine}${actLine}`;
  }

  const snapshot: Answer = {
    case_id: c.id,
    case: {
      status, verdict, fraud_probability: p, pattern, pattern_description: "",
      affected_txn_ids: affected, first_suspicious_txn_id: affected[0] ?? "", connected_card_ids: [], connected_device_profiles: [],
      exposure_usd: exposureCents / 100, evidence,
      similar_prior_cases: hr.result.map(h => h.id),
      summary: summaryText(),
      written_to_graph: false, graph_case_id: "",
    },
    evidence_requests: simulated.map((s, i) => ({ type: s.type, asked_after_step: steps.length + i, assumed_response: `${s.question} Assumed: ${s.assumedResponse}` })),
    next_best_actions: { initial: reasons(initial), final: reasons(final), what_changed: whatChanged },
    sar: files
      ? { file: true, reason: "R2/R6", narrative: "", subjects: [c.customer_id, c.card_id], total_amount_usd: exposureCents / 100, activity_dates: [day(seed.ts), day(seed.ts)] }
      : { file: false, reason: exposureCents > 100000 ? `No FILE_REPORT: exposure ${usd(exposureCents)} exceeds $1,000, but a report also needs fraud to be confirmed or strongly suspected, and it is not; no shared device, region cluster or other customer's fraud was found (R2, section 3a).` : `No FILE_REPORT: exposure ${usd(exposureCents)} is under $1,000, no shared device, region cluster or other customer's fraud was found, and fraud is not confirmed or strongly suspected (R2, section 3a).`, narrative: "", subjects: [], total_amount_usd: 0, activity_dates: [] },
    stop_reason: `Further graph steps are unlikely to change the decision: ${[seed.region ? "region" : "", "amount", seed.purchaser_email_domain ? "email-domain" : "", "device", "history", "shared-origin"].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")} checks are done and the remaining questions (customer's answer, merchant identity) are not in the data. Escalated to an analyst with the conflict visible (R8).`,
    tool_calls: 0, tokens: 0, latency_s: 0,
  };
  if (status !== "escalated") snapshot.stop_reason = "Further graph steps are unlikely to change the decision.";

  const sourceIndex = {
    caseIds: new Set([c.id]),
    transactionIds: new Set([...slice.customer_transactions, ...slice.neighbor_transactions].map(t => t.id)),
    historicalCaseIds: new Set(slice.closed_cases.map(h => h.id)),
    graphCaseIds: new Set<string>(),
  };
  const answer = compileAnswer(snapshot, sourceIndex, { toolCalls: q.receipts.length, tokens: 0, latencySeconds: Math.round((now() - started)) / 1000 });
  const validation = validateAnswer(answer, sourceIndex, { graphWriteVerified: false, retrievedHistoricalCaseIds: new Set(hr.result.map(h => h.id)) });

  return {
    runId: opts.runId, caseId: c.id, steps, factors, receipts: q.receipts,
    facts: { initial: baseFacts, final: finalFacts }, assessment,
    decisions: { initial, final, initialConflicts: initialPolicy.conflicts, missingPremises: finalPolicy.missingPremises },
    simulated, localCaseWrite: { vertexId, readbackVerified, backend: "local-graph" },
    graphBackend: live ? "tigergraph" : "local-graph",
    answer, validation,
    limitations: [
      live
        ? "Graph queries ran live on TigerGraph Savanna (graph GraphSentinel, 8 installed GSQL queries). The case subgraph drawing and prior-fraud regions still come from the local slice, and the case record is written to the local graph only."
        : "Graph backend is a local in-memory graph built from the organizer CSVs, not TigerGraph (no TigerGraph instance connected).",
      "No LLM is used in this path; reasoning is deterministic code over graph query results (tokens = 0).",
      "Card links: only the flagged transaction (case_pack) and closed-case transactions carry canonical card IDs. The K1/K2/K3 suffix rule is not documented by the organizers (D01), so other transactions attach to the customer only.",
      "Merchant identity (D04) and settlement/authorization status (D05) are not in the data and stay unknown.",
      "Customer replies are simulated with one fixed default (no reply within 24h).",
      "Probability weights are a transparent heuristic, not a trained model.",
      "written_to_graph is false because the case was written to the local graph, not TigerGraph.",
    ],
    graph: subgraphForView(g, seed.id, c.customer_id, c.card_id, [...sameDayOthers.map(t => t.id)], hr.result.map(h => h.id), vertexId),
  };
}

function entityIdsFor(f: Factor, seedId: string, customerId: string, sameDay: string[]): string[] {
  if (f.id === "new_email_domain_pair") return [seedId, ...sameDay];
  if (f.id === "customer_denial") return [seedId, customerId];
  return [seedId];
}

function reasonText(a: DecisionAction, exposureCents: number, trigger = "customer_report"): string {
  if (trigger !== "customer_report" && (a.action === "BLOCK_CARD" || a.action === "CREATE_CASE")) return a.reason;
  if (a.action === "BLOCK_CARD") return `R2: customer denied the transaction; exposure ${usd(exposureCents)} is at most $2,500, so L1 approval`;
  if (a.action === "CREATE_CASE") return "R2 and section 3a: customer disputes a charge";
  if (a.action === "ESCALATE_TO_ANALYST") return "R8: verdict uncertain and the evidence conflicts";
  if (a.action === "MONITOR_CARD") return "R4: no customer reply within 24 hours (simulated)";
  return a.reason;
}

function subgraphForView(g: LocalGraph, seedId: string, customerId: string, cardId: string, sameDay: string[], cases: string[], localCase: string) {
  const want = new Set<string>([`Transaction:${seedId}`, `Customer:${customerId}`, `Card:${cardId}`, `InvestigationCase:${localCase}`, ...sameDay.map(i => `Transaction:${i}`), ...cases.map(i => `ClosedCase:${i}`)]);
  for (const k of [...want]) for (const e of g.outgoing(k)) if (["BILLED_IN", "PURCHASER_EMAIL", "FROM_DEVICE", "ON_CARD", "CASE_ON_CARD"].includes(e.type)) want.add(e.to);
  const nodes = [...want].filter(k => g.vertices.has(k)).map(k => { const v = g.vertex(k); return { id: k, type: v.type, label: v.type === "BillingRegion" ? `region ${v.id}` : v.id }; });
  const edges = g.edges.filter(e => want.has(e.from) && want.has(e.to) && e.type !== "NEXT").map(e => ({ from: e.from, to: e.to, type: e.type }));
  return { nodes, edges };
}

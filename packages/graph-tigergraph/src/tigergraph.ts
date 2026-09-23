import type { SliceClosedCase, SliceTransaction, CaseSlice } from "../../graph-local/src/slice.js";
import type { QueryReceipt } from "../../graph-local/src/queries.js";

// Live TigerGraph backend for the eight investigation queries.
// The queries are installed GSQL queries on graph GraphSentinel (graph/queries/investigation_queries.gsql).
// Credentials come from the environment only (TG_HOST, TG_SECRET); they are never written to disk.

export interface TigerGraphConfig { host: string; graph: string; token: string }

export async function connectTigerGraph(env: NodeJS.ProcessEnv = process.env): Promise<TigerGraphConfig> {
  const host = (env.TG_HOST ?? "").replace(/\/+$/, "");
  const graph = env.TG_GRAPH ?? "GraphSentinel";
  if (!host) throw new Error("TG_HOST is not set (e.g. https://tg-xxxx.tg-yyyy.i.tgcloud.io)");
  if (env.TG_TOKEN) return { host, graph, token: env.TG_TOKEN };
  const secret = env.TG_SECRET;
  if (!secret) throw new Error("Set TG_SECRET (a Savanna Database Secret) or TG_TOKEN");
  const res = await fetch(`${host}/gsql/v1/tokens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret, graph, lifetime: "7200" }) });
  const body = await res.json().catch(() => ({})) as { token?: string; message?: string; results?: { token?: string } };
  const token = body.token ?? body.results?.token;
  if (!res.ok || !token) throw new Error(`TigerGraph token request failed (${res.status}): ${body.message ?? "no token returned"}`);
  return { host, graph, token };
}

async function runQuery(cfg: TigerGraphConfig, name: string, params: Record<string, string | number>): Promise<{ endpoint: string; results: any[] }> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const endpoint = `/restpp/query/${cfg.graph}/${name}${qs ? `?${qs}` : ""}`;
  const res = await fetch(`${cfg.host}${endpoint}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
  const body = await res.json().catch(() => ({})) as { error?: boolean; message?: string; results?: any[] };
  if (!res.ok || body.error) throw new Error(`TigerGraph query ${name} failed (${res.status}): ${body.message ?? ""}`);
  return { endpoint, results: body.results ?? [] };
}

const nz = (s: unknown) => (s === "" || s === undefined || s === null ? null : String(s));
const one = (a: unknown): string | null => (Array.isArray(a) && a.length ? String([...a].sort()[0]) : null);
const cents = (usd: number) => Math.round(usd * 100);
const day = (ts: string) => ts.slice(0, 10);
function hoursBefore(ts: string, h: number): string {
  const d = new Date(ts.replace(" ", "T") + "Z");
  return new Date(d.getTime() - h * 3600_000).toISOString().replace("T", " ").slice(0, 19);
}
const byTs = <T extends { ts: string; id: string }>(a: T, b: T) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id);

// Fields the TigerGraph schema does not carry; they are null/empty in TigerGraph-backed results.
export const FIELDS_NOT_IN_TIGERGRAPH = ["transaction.card_fields", "transaction.dist1", "closed_case.first_fraud_txn_id", "closed_case.connected_card_ids"];

function txnFrom(v: any, customerId: string): SliceTransaction {
  const a = v.attributes;
  return {
    id: a.txn_id, amount_cents: cents(a.amount_usd), product_cd: nz(a.product_cd), card_fields: {},
    region: one(a["@region"]), country: nz(a.country), dist1: null,
    purchaser_email_domain: one(a["@email"]), recipient_email_domain: one(a["@remail"]),
    customer_id: customerId, ts: a.ts, channel: a.channel, risk_score: a.risk_score,
  };
}

interface Planned { method: string; query: string; params: Record<string, unknown>; endpoint: string; result: unknown; returned: number }

// Runs the eight installed GSQL queries with the same parameters the investigator will ask for.
export async function prefetchEvidence(cfg: TigerGraphConfig, slice: CaseSlice): Promise<Planned[]> {
  const c = slice.case;
  const asOf = c.opened_at;
  const out: Planned[] = [];

  const s = await runQuery(cfg, "gs_seed_context", { txn: c.flagged_txn_id });
  const r0 = s.results;
  const seedV = r0.find(x => x.Seed)?.Seed?.[0];
  if (!seedV) throw new Error(`Seed transaction ${c.flagged_txn_id} not found in TigerGraph`);
  const get = (k: string) => r0.find(x => k in x)?.[k] as string[];
  const customerId = one(get("customer")) ?? c.customer_id;
  const seedTxn: SliceTransaction = { ...txnFrom({ attributes: { ...seedV.attributes, "@region": get("region"), "@email": get("purchaser_email"), "@remail": get("recipient_email") } }, customerId) };
  out.push({ method: "seedContext", query: "seed_context", params: { txnId: c.flagged_txn_id }, endpoint: s.endpoint,
    result: { txn: seedTxn, cards: [...get("cards")].sort(), device: one(get("device")) }, returned: 1 });

  if (seedTxn.region) {
    const q = await runQuery(cfg, "gs_region_history", { customer: c.customer_id, region: seedTxn.region, before_ts: seedTxn.ts });
    const r = Object.assign({}, ...q.results);
    const byRegion: Record<string, number> = r.by_region ?? {};
    const first: Record<string, string> = r.region_first_seen ?? {};
    const inRegion = Object.keys(r.in_region ?? {}).sort().map(k => ({ ts: k.split("|")[0]!, id: k.split("|")[1]! }));
    const ranked = Object.keys(byRegion).sort((a, b) => byRegion[b]! - byRegion[a]! || (first[a] ?? "").localeCompare(first[b] ?? ""));
    const rank = ranked.indexOf(seedTxn.region) + 1;
    out.push({ method: "regionHistory", query: "region_history", params: { customerId: c.customer_id, region: seedTxn.region, before: seedTxn.ts }, endpoint: q.endpoint, returned: inRegion.length,
      result: { priorTransactions: r.prior_transactions, inRegion: inRegion.length, distinctRegions: ranked.length, regionRank: rank || null,
        firstSeen: inRegion[0]?.ts ?? null, lastSeen: inRegion.at(-1)?.ts ?? null, sampleIds: inRegion.slice(-5).map(t => t.id) } });
  }

  if (seedTxn.purchaser_email_domain) {
    const sameDayFrom = `${day(seedTxn.ts)} 00:00:00`;
    const q = await runQuery(cfg, "gs_email_domain_history", { customer: c.customer_id, domain: seedTxn.purchaser_email_domain, before_ts: asOf, same_day_from: sameDayFrom });
    const r = Object.assign({}, ...q.results);
    const sameDay = (r.SameDay ?? []).map((v: any) => ({ id: v.attributes.txn_id, ts: v.attributes.ts, amount_cents: cents(v.attributes.amount_usd), region: one(v.attributes["@region"]), risk_score: v.attributes.risk_score, channel: v.attributes.channel })).sort(byTs);
    out.push({ method: "emailDomainHistory", query: "email_domain_history", params: { customerId: c.customer_id, domain: seedTxn.purchaser_email_domain, before: asOf, sameDayFrom }, endpoint: q.endpoint,
      result: { priorUses: r.prior_uses, sameDay }, returned: r.prior_uses + sameDay.length });
  }

  {
    const q = await runQuery(cfg, "gs_amount_profile", { customer: c.customer_id, amount_usd: seedTxn.amount_cents / 100, before_ts: seedTxn.ts, tolerance_usd: 1 });
    const r = Object.assign({}, ...q.results);
    const sorted = (r.amounts as number[]).map(cents).sort((a, b) => a - b);
    const near = (r.Near ?? []).map((v: any) => ({ id: v.attributes.txn_id, amount_cents: cents(v.attributes.amount_usd), region: one(v.attributes["@region"]), ts: v.attributes.ts })).sort(byTs);
    const channels: Record<string, number> = {};
    for (const k of Object.keys(r.channels ?? {}).sort()) channels[k] = r.channels[k];
    out.push({ method: "amountProfile", query: "amount_profile", params: { customerId: c.customer_id, cents: seedTxn.amount_cents, before: seedTxn.ts, toleranceCents: 100 }, endpoint: q.endpoint, returned: r.within_tolerance,
      result: { priorTransactions: r.prior_transactions, withinTolerance: r.within_tolerance, inPersonWithinTolerance: r.in_person_within_tolerance,
        medianCents: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null, channels, sameRegionExamples: near.slice(-4) } });
  }

  {
    const from = hoursBefore(seedTxn.ts, 48);
    const q = await runQuery(cfg, "gs_customer_timeline", { customer: c.customer_id, from_ts: from, to_ts: asOf });
    const rows = (Object.assign({}, ...q.results).T ?? []).map((v: any) => txnFrom(v, c.customer_id)).sort(byTs);
    out.push({ method: "customerTimeline", query: "customer_timeline", params: { customerId: c.customer_id, from, to: asOf }, endpoint: q.endpoint, result: rows, returned: rows.length });
  }

  {
    const q = await runQuery(cfg, "gs_device_context", { customer: c.customer_id, before_ts: asOf });
    const r = Object.assign({}, ...q.results);
    const dev = r.Dev ?? [];
    const shared = dev.filter((v: any) => (v.attributes["@other_customers"] ?? []).length).map((v: any) => ({ device: v.attributes.profile, otherCustomers: [...v.attributes["@other_customers"]].sort() }));
    out.push({ method: "deviceContext", query: "device_context", params: { customerId: c.customer_id, before: asOf }, endpoint: q.endpoint, returned: dev.length,
      result: { onlineWithIdentity: r.identity_linked, distinctProfiles: dev.length, sharedWithOtherCustomersInSlice: shared } });
  }

  {
    const q = await runQuery(cfg, "gs_historical_cases", { card: c.card_id, customer: c.customer_id });
    const rows: SliceClosedCase[] = (Object.assign({}, ...q.results).Cases ?? []).map((v: any) => {
      const a = v.attributes;
      return { id: a.case_id, customer_id: one(a["@customer_id"]) ?? "", card_id: one(a["@card_id"]) ?? "", opened_at: a.opened_at, closed_at: a.closed_at, outcome: a.outcome, pattern: a.pattern,
        first_fraud_txn_id: null, txn_ids: [...(a["@txn_ids"] ?? [])].sort(), exposure_cents: cents(a.exposure_usd), connected_card_ids: [], actions_taken: a.actions_taken ? String(a.actions_taken).split("|") : [],
        report_filed: a.report_filed, analyst_notes: a.notes } as SliceClosedCase;
    }).filter((h: SliceClosedCase) => h.closed_at && h.closed_at <= asOf).sort((a: SliceClosedCase, b: SliceClosedCase) => a.opened_at.localeCompare(b.opened_at));
    out.push({ method: "historicalCases", query: "historical_cases", params: { cardId: c.card_id, customerId: c.customer_id }, endpoint: q.endpoint, result: rows, returned: rows.length });
  }

  {
    const q = await runQuery(cfg, "gs_shared_origin", { txn: c.flagged_txn_id });
    const r = Object.assign({}, ...q.results);
    out.push({ method: "sharedOrigin", query: "shared_origin", params: { txnId: c.flagged_txn_id }, endpoint: q.endpoint, returned: (r.other_customer_txns_sharing_region_and_email ?? []).length,
      result: { otherCustomerTxnsSharingRegionAndEmail: [...(r.other_customer_txns_sharing_region_and_email ?? [])].sort(), otherCustomerFraudCases: [...(r.other_customer_fraud_cases ?? [])].sort() } });
  }
  return out;
}

// Replays prefetched TigerGraph results through the same interface as the local GraphQueries.
// A call whose parameters differ from what was fetched fails loudly instead of guessing.
export class TigerGraphQueries {
  readonly receipts: QueryReceipt[] = [];
  constructor(private readonly planned: Planned[], private readonly graph: string) {}
  private take(method: string, params: Record<string, unknown>): QueryReceipt<any> {
    const p = this.planned.find(x => x.method === method);
    if (!p) throw new Error(`No TigerGraph result prefetched for ${method}`);
    if (JSON.stringify(p.params) !== JSON.stringify(params)) throw new Error(`TigerGraph ${method} was fetched with ${JSON.stringify(p.params)} but investigator asked ${JSON.stringify(params)}`);
    const r: QueryReceipt<any> = { receiptId: `Q${String(this.receipts.length + 1).padStart(2, "0")}-${p.query}`, query: p.query, params, result: p.result,
      coverage: { complete: true, returned: p.returned }, backend: "tigergraph", endpoint: p.endpoint, graph: this.graph } as QueryReceipt<any>;
    this.receipts.push(r);
    return r;
  }
  seedContext(txnId: string) { return this.take("seedContext", { txnId }); }
  customerTimeline(customerId: string, from: string, to: string) { return this.take("customerTimeline", { customerId, from, to }); }
  regionHistory(customerId: string, region: string, before: string) { return this.take("regionHistory", { customerId, region, before }); }
  emailDomainHistory(customerId: string, domain: string, before: string, sameDayFrom: string) { return this.take("emailDomainHistory", { customerId, domain, before, sameDayFrom }); }
  amountProfile(customerId: string, cents: number, before: string, toleranceCents: number) { return this.take("amountProfile", { customerId, cents, before, toleranceCents }); }
  deviceContext(customerId: string, before: string) { return this.take("deviceContext", { customerId, before }); }
  historicalCases(cardId: string, customerId: string) { return this.take("historicalCases", { cardId, customerId }); }
  sharedOrigin(txnId: string) { return this.take("sharedOrigin", { txnId }); }
}

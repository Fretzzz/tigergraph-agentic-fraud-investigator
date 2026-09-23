import type { LocalGraph } from "./graph.js";
import type { SliceClosedCase, SliceTransaction } from "./slice.js";

export interface QueryReceipt<T = unknown> {
  receiptId: string; query: string; params: Record<string, unknown>; result: T;
  coverage: { complete: boolean; returned: number };
  backend: "local-graph" | "tigergraph"; // local in-memory graph, or installed GSQL query on TigerGraph
  endpoint?: string; graph?: string; // set only for TigerGraph-backed receipts
}

// The eight investigation queries, served by the local graph (GraphQueries) or TigerGraph (TigerGraphQueries).
export interface InvestigationQueries {
  readonly receipts: QueryReceipt[];
  seedContext(txnId: string): QueryReceipt<{ txn: SliceTransaction; cards: string[]; device: string | null }>;
  customerTimeline(customerId: string, from: string, to: string): QueryReceipt<SliceTransaction[]>;
  regionHistory(customerId: string, region: string, before: string): QueryReceipt<{ priorTransactions: number; inRegion: number; distinctRegions: number; regionRank: number | null; firstSeen: string | null; lastSeen: string | null; sampleIds: string[] }>;
  emailDomainHistory(customerId: string, domain: string, before: string, sameDayFrom: string): QueryReceipt<{ priorUses: number; sameDay: { id: string; ts: string; amount_cents: number; region: string | null; risk_score: number | null; channel: string }[] }>;
  amountProfile(customerId: string, cents: number, before: string, toleranceCents: number): QueryReceipt<{ priorTransactions: number; withinTolerance: number; inPersonWithinTolerance: number; medianCents: number | null; channels: Record<string, number>; sameRegionExamples: { id: string; amount_cents: number; region: string | null; ts: string }[] }>;
  deviceContext(customerId: string, before: string): QueryReceipt<{ onlineWithIdentity: number; distinctProfiles: number; sharedWithOtherCustomersInSlice: { device: string; otherCustomers: string[] }[] }>;
  historicalCases(cardId: string, customerId: string): QueryReceipt<SliceClosedCase[]>;
  sharedOrigin(txnId: string): QueryReceipt<{ otherCustomerTxnsSharingRegionAndEmail: string[]; otherCustomerFraudCases: string[] }>;
}

// Every call is logged so tool_calls in the answer is a real count, not an estimate.
export class GraphQueries implements InvestigationQueries {
  readonly receipts: QueryReceipt[] = [];
  constructor(private readonly g: LocalGraph, private readonly asOf: string) {}

  private record<T>(query: string, params: Record<string, unknown>, result: T, returned: number): QueryReceipt<T> {
    const r: QueryReceipt<T> = { receiptId: `Q${String(this.receipts.length + 1).padStart(2, "0")}-${query}`, query, params, result, coverage: { complete: true, returned }, backend: "local-graph" };
    this.receipts.push(r as QueryReceipt);
    return r;
  }
  private txnsOf(customerId: string): SliceTransaction[] {
    return this.g.incoming(`Customer:${customerId}`, "MADE_BY")
      .map(e => this.g.vertex(e.from).props as unknown as SliceTransaction)
      .filter(t => t.ts <= this.asOf)
      .sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id));
  }

  seedContext(txnId: string) {
    const k = `Transaction:${txnId}`;
    const t = this.g.vertex(k).props as unknown as SliceTransaction;
    const cards = this.g.outgoing(k, "ON_CARD").map(e => this.g.vertex(e.to).id);
    const device = this.g.outgoing(k, "FROM_DEVICE").map(e => this.g.vertex(e.to).id)[0] ?? null;
    return this.record("seed_context", { txnId }, { txn: t, cards, device }, 1);
  }

  customerTimeline(customerId: string, from: string, to: string) {
    const rows = this.txnsOf(customerId).filter(t => t.ts >= from && t.ts <= to);
    return this.record("customer_timeline", { customerId, from, to }, rows, rows.length);
  }

  regionHistory(customerId: string, region: string, before: string) {
    const prior = this.txnsOf(customerId).filter(t => t.ts < before);
    const inRegion = prior.filter(t => t.region === region);
    const regions = new Map<string, number>();
    for (const t of prior) if (t.region) regions.set(t.region, (regions.get(t.region) ?? 0) + 1);
    const rank = [...regions.entries()].sort((a, b) => b[1] - a[1]).findIndex(([r]) => r === region) + 1;
    return this.record("region_history", { customerId, region, before }, {
      priorTransactions: prior.length, inRegion: inRegion.length, distinctRegions: regions.size, regionRank: rank || null,
      firstSeen: inRegion[0]?.ts ?? null, lastSeen: inRegion.at(-1)?.ts ?? null, sampleIds: inRegion.slice(-5).map(t => t.id),
    }, inRegion.length);
  }

  emailDomainHistory(customerId: string, domain: string, before: string, sameDayFrom: string) {
    const all = this.txnsOf(customerId);
    const prior = all.filter(t => t.ts < sameDayFrom && t.purchaser_email_domain === domain);
    const sameDay = all.filter(t => t.ts >= sameDayFrom && t.ts <= before && t.purchaser_email_domain === domain);
    return this.record("email_domain_history", { customerId, domain, before, sameDayFrom }, {
      priorUses: prior.length, sameDay: sameDay.map(t => ({ id: t.id, ts: t.ts, amount_cents: t.amount_cents, region: t.region, risk_score: t.risk_score, channel: t.channel })),
    }, prior.length + sameDay.length);
  }

  amountProfile(customerId: string, cents: number, before: string, toleranceCents: number) {
    const prior = this.txnsOf(customerId).filter(t => t.ts < before);
    const near = prior.filter(t => Math.abs(t.amount_cents - cents) <= toleranceCents);
    const sorted = prior.map(t => t.amount_cents).sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null;
    const channels: Record<string, number> = {};
    for (const t of prior) channels[t.channel] = (channels[t.channel] ?? 0) + 1;
    return this.record("amount_profile", { customerId, cents, before, toleranceCents }, {
      priorTransactions: prior.length, withinTolerance: near.length, inPersonWithinTolerance: near.filter(t => t.channel === "in_person").length,
      medianCents: median, channels, sameRegionExamples: near.slice(-4).map(t => ({ id: t.id, amount_cents: t.amount_cents, region: t.region, ts: t.ts })),
    }, near.length);
  }

  deviceContext(customerId: string, before: string) {
    const prior = this.txnsOf(customerId).filter(t => t.ts < before);
    const profiles = new Map<string, number>();
    for (const t of prior) for (const e of this.g.outgoing(`Transaction:${t.id}`, "FROM_DEVICE")) profiles.set(e.to, (profiles.get(e.to) ?? 0) + 1);
    const shared: { device: string; otherCustomers: string[] }[] = [];
    for (const d of profiles.keys()) {
      const others = new Set(this.g.incoming(d, "FROM_DEVICE").map(e => this.g.vertex(e.from).props["customer_id"] as string).filter(c => c !== customerId));
      if (others.size) shared.push({ device: this.g.vertex(d).id, otherCustomers: [...others] });
    }
    return this.record("device_context", { customerId, before }, { onlineWithIdentity: [...profiles.values()].reduce((a, b) => a + b, 0), distinctProfiles: profiles.size, sharedWithOtherCustomersInSlice: shared }, profiles.size);
  }

  historicalCases(cardId: string, customerId: string) {
    const card = this.g.incoming(`Card:${cardId}`, "CASE_ON_CARD").map(e => this.g.vertex(e.from).props as unknown as SliceClosedCase);
    const cust = [...this.g.vertices.values()].filter(v => v.type === "ClosedCase" && v.props["customer_id"] === customerId).map(v => v.props as unknown as SliceClosedCase);
    const byId = new Map([...card, ...cust].filter(c => c.closed_at <= this.asOf).map(c => [c.id, c]));
    const rows = [...byId.values()].sort((a, b) => a.opened_at.localeCompare(b.opened_at));
    return this.record("historical_cases", { cardId, customerId }, rows, rows.length);
  }

  sharedOrigin(txnId: string) {
    const seed = `Transaction:${txnId}`;
    const t = this.g.vertex(seed).props as unknown as SliceTransaction;
    const viaEmailAndRegion: string[] = [];
    for (const e of this.g.outgoing(seed, "PURCHASER_EMAIL")) {
      for (const back of this.g.incoming(e.to, "PURCHASER_EMAIL")) {
        const other = this.g.vertex(back.from).props as unknown as SliceTransaction;
        if (other.customer_id !== t.customer_id && other.region === t.region) viaEmailAndRegion.push(other.id);
      }
    }
    const otherCustomerFraudCases = [...this.g.vertices.values()].filter(v => v.type === "ClosedCase" && v.props["customer_id"] !== t.customer_id).map(v => v.id);
    return this.record("shared_origin", { txnId }, { otherCustomerTxnsSharingRegionAndEmail: viaEmailAndRegion, otherCustomerFraudCases }, viaEmailAndRegion.length);
  }
}

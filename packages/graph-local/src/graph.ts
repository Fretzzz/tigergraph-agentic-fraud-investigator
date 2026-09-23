import type { CaseSlice, SliceClosedCase, SliceTransaction } from "./slice.js";

// A small in-memory property graph following the organizer's suggested schema.
// It is a LOCAL stand-in for TigerGraph: no TigerGraph instance is connected.
export type VertexType = "Customer" | "Card" | "Transaction" | "BillingRegion" | "EmailDomain" | "DeviceProfile" | "ClosedCase" | "InvestigationCase";
export type EdgeType = "OWNS" | "MADE_BY" | "ON_CARD" | "BILLED_IN" | "PURCHASER_EMAIL" | "FROM_DEVICE" | "NEXT" | "INVOLVES" | "CASE_ON_CARD" | "CONNECTED_TO" | "INVESTIGATES";
export interface Vertex { type: VertexType; id: string; props: Record<string, unknown> }
export interface Edge { type: EdgeType; from: string; to: string; source: string }

const key = (type: VertexType, id: string) => `${type}:${id}`;

export class LocalGraph {
  readonly vertices = new Map<string, Vertex>();
  readonly edges: Edge[] = [];
  private readonly out = new Map<string, Edge[]>();
  private readonly inn = new Map<string, Edge[]>();

  upsert(type: VertexType, id: string, props: Record<string, unknown> = {}): string {
    const k = key(type, id);
    const existing = this.vertices.get(k);
    if (existing) Object.assign(existing.props, props); else this.vertices.set(k, { type, id, props });
    return k;
  }
  link(type: EdgeType, from: string, to: string, source: string): void {
    if (!this.vertices.has(from) || !this.vertices.has(to)) throw new Error(`Dangling edge ${type} ${from} -> ${to}`);
    if ((this.out.get(from) ?? []).some(e => e.type === type && e.to === to)) return;
    const e: Edge = { type, from, to, source };
    this.edges.push(e);
    (this.out.get(from) ?? this.out.set(from, []).get(from)!).push(e);
    (this.inn.get(to) ?? this.inn.set(to, []).get(to)!).push(e);
  }
  get(type: VertexType, id: string): Vertex | undefined { return this.vertices.get(key(type, id)); }
  outgoing(k: string, type?: EdgeType): Edge[] { return (this.out.get(k) ?? []).filter(e => !type || e.type === type); }
  incoming(k: string, type?: EdgeType): Edge[] { return (this.inn.get(k) ?? []).filter(e => !type || e.type === type); }
  vertex(k: string): Vertex { const v = this.vertices.get(k); if (!v) throw new Error(`Missing vertex ${k}`); return v; }
}

function addTransaction(g: LocalGraph, t: SliceTransaction, slice: CaseSlice, source: string): string {
  const tk = g.upsert("Transaction", t.id, { ...t });
  const ck = g.upsert("Customer", t.customer_id);
  g.link("MADE_BY", tk, ck, source);
  if (t.region !== null) g.link("BILLED_IN", tk, g.upsert("BillingRegion", t.region), source);
  if (t.purchaser_email_domain !== null) g.link("PURCHASER_EMAIL", tk, g.upsert("EmailDomain", t.purchaser_email_domain), source);
  const device = slice.identity[t.id]?.device_profile;
  if (device) g.link("FROM_DEVICE", tk, g.upsert("DeviceProfile", device), "identity.csv");
  return tk;
}

function addClosedCase(g: LocalGraph, c: SliceClosedCase): void {
  const k = g.upsert("ClosedCase", c.id, { ...c });
  const card = g.upsert("Card", c.card_id);
  g.link("OWNS", g.upsert("Customer", c.customer_id), card, "closed_cases_history.csv");
  g.link("CASE_ON_CARD", k, card, "closed_cases_history.csv");
  for (const id of c.connected_card_ids) g.link("CONNECTED_TO", k, g.upsert("Card", id), "closed_cases_history.csv");
  for (const id of c.txn_ids) {
    const tv = g.get("Transaction", id);
    if (!tv) continue; // closed-case transaction outside this slice's scope
    const tk = key("Transaction", id);
    g.link("INVOLVES", k, tk, "closed_cases_history.csv");
    g.link("ON_CARD", tk, card, "closed_cases_history.csv");
  }
}

export function buildGraph(slice: CaseSlice): LocalGraph {
  const g = new LocalGraph();
  let prev: string | undefined;
  for (const t of slice.customer_transactions) {
    const tk = addTransaction(g, t, slice, "transactions.csv");
    if (prev) g.link("NEXT", prev, tk, "transactions.csv (customer ts order)");
    prev = tk;
  }
  for (const t of slice.neighbor_transactions) addTransaction(g, t, slice, "transactions.csv");
  const seed = g.get("Transaction", slice.case.flagged_txn_id);
  if (!seed) throw new Error("Seed transaction missing from slice");
  const card = g.upsert("Card", slice.case.card_id);
  g.link("OWNS", g.upsert("Customer", slice.case.customer_id), card, "case_pack.csv");
  g.link("ON_CARD", key("Transaction", seed.id), card, "case_pack.csv");
  for (const c of slice.closed_cases) addClosedCase(g, c);
  return g;
}

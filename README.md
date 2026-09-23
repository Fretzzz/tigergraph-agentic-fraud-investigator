# GraphSentinel

**A fraud investigator that reads a transaction graph, shows its evidence, and hands the hard call to a human.**

GraphSentinel takes one fraud case, asks the graph eight specific questions, weighs what comes back, and produces a case file: a verdict with a probability, the evidence for and against, the next actions (and who must approve each one), and the reason it stopped. It is built for the TigerGraph x Hacker House Goa fraud-investigation challenge.

- **Live demo (analyst view):** https://graphsentinel-five.vercel.app
- **Case shown:** HHG-003, from the organizer dataset

![GraphSentinel analyst view for case HHG-003](docs/demo/hhg-003-analyst-view.png)

## The HHG-003 story

Customer C08623 writes in: *"I never made this $49.00 purchase. Please check my card."*

GraphSentinel does not guess. It runs eight graph queries and finds:

| Question | What the graph says |
|---|---|
| Is region 330 new for this customer? | No. 42 of 985 prior transactions were there, since July 2016. |
| Is $49 unusual? | No. 68 prior transactions were within $1 of $49. |
| Is the purchaser email domain new? | **Yes.** `me.com` was never used before that day, and it also sits on a $116.93 purchase earlier that day with a bank risk score of 0.88. |
| Any devices shared with other customers? | No. |
| Prior cases on this card? | 6 closed cases, 5 of them confirmed fraud. |
| Does it connect to other customers? | No shared-origin links in the 48-hour window. |

The evidence conflicts: the place and amount fit the customer, the email domain does not. So the verdict is **uncertain, fraud probability 0.55**. The agent recommends a card block that **waits for L1 analyst approval**, and **escalates to an analyst** with the conflict visible. No SAR is filed, and the page says why.

The point: the agent is honest about what it cannot know, and it never takes a money-moving action on its own.

## Architecture at a glance

```
organizer CSVs ──> case slice (HHG-003) ──> graph
                                             │  8 investigation queries
                                             v
                         investigator (deterministic code, no LLM)
                                             │  evidence + receipts
                                             v
                  policy rules ──> verdict, probability, next actions, approval routes
                                             │
                                             v
                     case file (cases/HHG-003.json) ──> analyst view (apps/web)
```

The graph can be either:

- **TigerGraph Savanna** (graph `GraphSentinel`): the HHG-003 slice is loaded there, and the 8 queries are installed GSQL queries called over REST. Use `GRAPH_BACKEND=tigergraph`.
- **Local in-memory graph**: the same queries in TypeScript over the same slice. This is the default and the fallback.

Every query result is saved as a receipt, and every claim in the case file points to a receipt ID.

## The 8 investigation queries

Installed on Savanna from [`graph/queries/investigation_queries.gsql`](graph/queries/investigation_queries.gsql):

| # | Query | Question it answers |
|---|---|---|
| 1 | `gs_seed_context` | What is the flagged transaction (amount, region, email domain, device, risk score)? |
| 2 | `gs_region_history` | Has this customer used this billing region before, and since when? |
| 3 | `gs_email_domain_history` | Is this purchaser email domain new, and where else does it appear that day? |
| 4 | `gs_amount_profile` | Is this amount typical for the customer? |
| 5 | `gs_customer_timeline` | What happened on the account in the 48 hours before the case? |
| 6 | `gs_device_context` | Do the customer's devices link to other customers? |
| 7 | `gs_historical_cases` | What prior cases exist on this card and customer? |
| 8 | `gs_shared_origin` | Does this transaction connect to other customers or cards? |

## TigerGraph status (exact)

What is true today:

- **Live on TigerGraph Savanna:** the HHG-003 case data is loaded into graph `GraphSentinel`, and all 8 queries above are installed and valid there.
- **`GRAPH_BACKEND=tigergraph`:** `pnpm case:run` runs all 8 queries on Savanna over REST, then re-runs each one on the local graph and compares. The run fails if any result differs. The committed run matches 8/8.
- **The public demo page** shows that saved TigerGraph run. Your browser does not call TigerGraph; the badge at the top of the page says which backend produced the run.
- **Still local, even in TigerGraph mode:** the case subgraph drawing, prior-fraud regions, and the case write-back (`written_to_graph` is `false`). A few fields are not stored in TigerGraph: card fields, `dist1`, and two closed-case fields.
- **Default:** without `GRAPH_BACKEND=tigergraph`, everything runs on the local graph.

What is **not** in this build: no LLM (the run uses 0 tokens; the page shows a "No LLM in this run" badge), no MCP server, no GraphRAG or vector search, no NVIDIA NIM, no Cloudflare runtime. Those are in the design docs below but are not implemented.

## Run it locally

```bash
pnpm install

# Investigate on the local graph (uses the committed slice data/slices/HHG-003.json)
RUN_ID=demo pnpm case:run HHG-003

# Or investigate on TigerGraph Savanna (needs your own Savanna host and database secret)
TG_HOST=https://<your-savanna-host> TG_SECRET=<database-secret> \
  GRAPH_BACKEND=tigergraph RUN_ID=demo pnpm case:run HHG-003

# Open the analyst view at http://localhost:8765/
pnpm web
```

To rebuild the slice from the organizer CSVs (about 700 MB, from the organizer Drive folder):

```bash
pnpm case:slice /path/to/organizer-csvs HHG-003 data/slices/HHG-003.json
```

## Tests

```bash
pnpm test:unit   # 11 test files, 75 tests passing
pnpm typecheck
```

The tests cover the local graph, the investigator, policy boundaries and conflicts, the answer contract, the exporter, and the TigerGraph replay path (same answer as local, loud failure on mismatched parameters, parity catching a changed result). The TigerGraph tests run offline.

## Limits

- 1 of 20 cases is implemented end to end (HHG-003).
- The K1/K2/K3 card-suffix rule is not documented by the organizers, so only the flagged transaction and closed-case transactions are tied to a card.
- Merchant identity and settlement status are not in the data and stay unknown.
- Customer replies are simulated with one fixed default (no reply within 24 hours).
- The probability weights are a visible rule, not a trained model.

## Design docs

The original build plan is kept for reference. It describes a larger system than what is built here.

| File | Use |
|---|---|
| [Build plan and design](docs/superpowers/specs/2026-09-22-fraud-investigation-design.md) | Full target architecture, policy and output contract. |
| [Phased task list](docs/superpowers/plans/2026-09-22-fraud-investigation-implementation-plan.md) | The planned phases and tasks. |
| [Coding-agent handoff](HANDOFF.md) | Execution prompt and milestone checkpoints. |
| [Source register](docs/references/SOURCES.md) | Organizer sources and technology references. |
| [Original brief](docs/sources/hackathon-brief.md) | The challenge document, unmodified. |
| [Dataset README](docs/sources/dataset-readme.md) | Organizer dataset README, policy and answer format. |

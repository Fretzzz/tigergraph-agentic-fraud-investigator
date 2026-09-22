# TigerGraph Fraud Investigation Agent — Build Plan and Design

**Version:** 1.0 · **Prepared:** 22 September 2026  
**Audience:** The implementing coding agent, its reviewer, and the hackathon team.  
**Status:** Implementation specification, not a claim that any application code, infrastructure, dataset ingestion, model training, or benchmark run has been completed. No application repository was inspected. Paths below are a proposed layout for a new repository; preserve equivalent existing modules when integrating into an existing project.

## 1. Outcome and scope

Build a web-based analyst assistant that takes a supplied case, investigates it using TigerGraph and relevant documents, assesses uncertainty, requests explicitly simulated evidence when necessary, produces policy-correct recommendations, records the evolving investigation, and exports the exact benchmark answer format.

**First working milestone:** One actual case travels through trigger → graph investigation → initial recommendation → controlled evidence request → reassessment → final recommendation → verified TigerGraph persistence → valid JSON export. Browser refresh or interruption must not lose the investigation or repeat an action.

**Submission milestone:** The same deployed agent, not a separate answer-writing script, handles all 20 supplied cases and produces the repository, 20 JSON files, conditional SARs, approval routes, 3–5 minute demo video, technical blog, and social-post draft required by the brief. Publication and cloud changes require the team's authorization. [S1: Submissions; S2: The task, Answer Format]

### 1.1 What is required, selected, and optional

| Classification | Decision |
|---|---|
| Hackathon requirement | TigerGraph graph and vector storage/retrieval; GSQL and graph algorithms; TigerGraph MCP; GraphRAG; a usable interface; case memory; controlled actions; 20 outputs. |
| User-selected stack | Cloudflare Workers and Durable Objects; NVIDIA NIM as the LLM provider; web chat. |
| Proposed implementation | TypeScript; Cloudflare Agents SDK `Agent` on a SQLite-backed DO; a custom bounded investigation loop; React/Vite; a protected Python TigerGraph MCP service; offline Python ingestion; deterministic policy and export modules. |
| Not required for the MVP | A new fraud classifier, LLM fine-tuning, a GPU deployment, multiple cooperating agents, generic autonomous SQL generation, or live bank integrations. |
| Optional after core acceptance | Case-level probability estimator; proactive alert monitoring; additional graph-analysis visualizations. |

The bank's `risk_score` is already supplied. It is an input, never a verdict. Build the investigation system first. [S2: Glossary, Fraud Policy §0]

### 1.2 Sources and authority

`docs/sources/hackathon-brief.md` [S1] and `docs/sources/dataset-readme.md` [S2] travel with this plan. `docs/references/SOURCES.md` identifies their origin, snapshot hashes, and official technology references [S3–S13].

The brief establishes required components and submissions. The dataset README establishes policy and the output contract. Vendor documentation establishes capabilities, not hackathon rules. All thresholds or algorithms introduced by this plan beyond the README are **engineering defaults**, not organizer requirements. Where the source is incomplete or internally inconsistent, retain the uncertainty in a decision record; do not silently invent a field or rewrite a rule.

## 2. Architecture and responsibility boundaries

```text
Browser: analyst case workspace + conversational assistant
  │ authenticated HTTP commands; authorized live event connection
  ▼
Cloudflare Worker: static assets, authentication, authorization, routing
  │ derive identity from server-side principal, never from model/user claims
  ▼
CaseAgent: one durable investigation identity per workspace + run + case
  ├─ local SQLite: state, evidence receipts, decisions, approvals, outbox
  ├─ bounded investigation loop → NVIDIA-hosted NIM endpoint
  ├─ domain tool adapter → protected TigerGraph MCP server
  │                           └─ TigerGraph graph + document vectors
  ├─ deterministic policy evaluator and output compiler
  ├─ simulated evidence/action adapters
  └─ SDK scheduling: resume, retry, evidence deadlines, projection sync

Offline preparation: provided files → Python validation/normalization
  → TigerGraph loading jobs + document embeddings + dataset manifest

Optional R2: source snapshots, large raw receipts, archived exports
```

Cloudflare documents durable identity, SQL state, scheduling and external model calls; its MCP client supports remote HTTP transports and authentication headers. This plan uses those capabilities but requires version-specific integration tests. [S3, S4, S5]

### 2.1 One owner for each kind of truth

| Component | Owns | Must not own |
|---|---|---|
| CaseAgent SQL | Operational case/run state; ordered events; evidence receipts; immutable assessment revisions; pending actions and approvals. | All 590k transactions; shared historical truth. |
| TigerGraph | Dataset entities/relationships; historical cases; indexed documents; versioned projected investigation records. | Browser session authority; automatic approval decisions. |
| Policy module | Required/permitted/prohibited recommendations, routing, unresolved rule conflicts, stopping checks. | Fraud facts invented from scores; authenticating a human. |
| LLM adapter | Tool proposals, structured assessment proposals, evidence-grounded prose. | Direct graph writes; arbitrary tool execution; grants of permission. |
| Worker/auth module | Principal, workspace access, role capabilities, request validation. | Trusting an `L2` claim in chat or JSON. |
| Export compiler | Exact source format, arithmetic and consistency checks, trustworthy metrics. | Inventing missing identifiers or declaring a failed graph write successful. |

A graph outage does not delete DO state. A graph projection is retryable; it is not a second mutable authority. The UI displays projection lag. There is no distributed transaction across DO, TigerGraph, and the model provider; use durable intent records, idempotency keys, fencing, and reconciliation.

### 2.2 Hosting decisions

Use a Cloudflare Worker for the UI/API and SQLite-backed DOs for investigations. Use a small CPU container or server for the official TigerGraph MCP service, with TLS and service authentication. Use NVIDIA's hosted API Catalog endpoint initially; do not deploy a GPU container for the MVP. NVIDIA documents hosted NIM inference and tool calling, but actual model features must be verified on the selected endpoint. [S10, S11]

Use a TigerGraph instance on which graph queries **and vector search** are proven to work. The MCP project recommends 4.2+ for TigerVector; do not treat a nominal version number or a successful database login as proof of feature access. [S9]

The source snapshots of the MCP repository surfaced differing transport descriptions. Phase 0 must verify the exact installed package's `--help`, HTTP initialization, tool listing, and tool execution. Prefer native Streamable HTTP. If that release only exposes stdio, use a small authenticated HTTP-to-stdio bridge around the **official server**, with a pinned MCP SDK and managed subprocess lifecycle. Record that deviation; do not replace TigerGraph MCP with plain REST while claiming the requirement is met.

## 3. Preflight decisions and unresolved dataset semantics

The CSVs have not been inspected for this plan. The following checks are implementation gates, not guesses to hard-code.

| ID | Issue | Default / required resolution | Blocks |
|---|---|---|---|
| D01 | Exact card mapping from transactions to `Cxxxxx-Kn` | Inspect headers and organizer mapping. Use explicit mapping if supplied. Otherwise derive only under a documented rule validated against every case-pack and closed-case transaction link. If ambiguous, request organizer clarification; never guess suffix ordering or use `card1` as a unique card. | Authoritative card graph and benchmark outputs. |
| D02 | Evidence cutoff | Default `strict_replay`: initial visibility at `opened_at`; explicit virtual-time advancement for later evidence. Source does not explicitly settle retrospective access. A separately named `retrospective` mode may use a declared cutoff, never silently. Obtain organizer interpretation when possible. | Claims about benchmark comparability; not fixture development. |
| D03 | Timestamp timezone | Source timestamps lack an explicit zone. Store raw timestamp plus sortable dataset-local representation. Do not convert them using browser timezone. Record a synthetic UTC normalization only as a technical convention, preserving original strings. | Trustworthy cross-runtime timelines. |
| D04 | Merchant identity / recipient identity | README documents product codes and email **domains**, not a usable merchant identifier or full recipient address. Inspect actual fields. Product code ≠ merchant; domain ≠ recipient identity. Unsupported predicates are `unknown`. | Definitive same-merchant R7 or exact-recipient R6 claims. |
| D05 | Pending / settled authorization status | Inspect actual schema. Absence means `unknown`, not `cleared`. Record explicit simulated analyst evidence when exercising R4/R5 status-dependent branches. | Decline/block actions whose premise needs that status. |
| D06 | Small authorization and temporal windows | README says often under $5 and three within an hour; it does not fully specify every detector cutoff or the larger-purchase horizon. Use `< $5` and a 24h follow-on search as configurable candidate-detection defaults, not policy definitions. Return exact sequence facts for assessment. | Detector configuration approval and repeatability. |
| D07 | Rule precedence / “strongly suspected” | Source gives no full precedence table or numeric definition of “strongly suspected.” Use the explicit conflict behavior in §9; log it as implementation interpretation. Never equate this phrase automatically with the stopping threshold. | Policy-review acceptance. |
| D08 | Created IDs vs dataset IDs | Dataset entity IDs must resolve; created case/evidence IDs need write receipts and a separate operational namespace. `graph_case_id` explicitly permits a created case vertex. Distinguish these categories in the validator. | Export provenance. |
| D09 | Illustrative answer inconsistencies | README's example `HHG-017` differs from the actual case-table entry. Treat the example as a shape illustration, not a factual solution or policy test oracle. | Fixture construction. |
| D10 | Actual deployment entitlements | Verify TigerGraph vector support, NIM quota/model capabilities, Worker/DO plan limits, public TLS MCP endpoint, and credentials. | Live integration and deployment gates. |

When blocked: produce the failing check and supporting rows/field names, complete independent fixture work, and label the dependent phase blocked. Never substitute fabricated source data and call the real integration complete.

## 4. Repository layout

```text
apps/
  agent/
    src/index.ts                     # authenticated Worker entry point
    src/auth/                        # principals, roles, origin/CSRF checks
    src/case-agent/                  # DO shell, event store, work scheduler
    src/providers/nim.ts             # NIM HTTP adapter
    src/tools/                       # domain adapter, MCP connection, registry
    src/projections/                 # TigerGraph outbox and readback
    src/simulation/                  # evidence and mock action adapters
    wrangler.jsonc
  web/
    src/cases/                       # case list/workspace/live events
    src/chat/                        # server-owned chat commands and messages
    src/evidence/                    # timeline, graph view, evidence drawer
    src/approvals/                   # role-aware approval UI
    src/reports/                     # SAR and export preview
packages/
  contracts/src/                     # exact output contract + domain types
  domain/src/                        # assessment, evidence, stop logic
  policy/src/                        # pure rules, conflict resolution, routing
  exporter/src/                      # compiler, source/provenance validation
  testkit/src/                       # synthetic fixtures and controlled ports
services/
  tigergraph-mcp/                    # pinned official server, auth proxy, tests
pipelines/
  src/fraud_data/                    # inspect, normalize, map, load, embed
  tests/
graph/
  schema/                           # graph/vertex/edge/document declarations
  loading/                          # batch loading jobs and reconciliation
  queries/                          # versioned installed GSQL queries
  algorithms/                       # bounded connected-component analysis
  tests/                            # synthetic graph + expected results
scripts/
  doctor.ts                         # capability/configuration report
  batch.ts                          # calls the deployed agent, exports 20 cases
  evaluate.ts                       # conformance and held-out metrics
  verify-release.ts                  # release gate
config/
  investigation.json                # budgets, windows, source/trust settings
  simulation-profiles/              # fixed test/demo evidence branches
  dataset-manifest.json             # hashes, schema, counts, mapping version
  model-capabilities.json           # tested endpoint behavior, not secrets
cases/                              # exactly 20 canonical answer JSONs
reports/                            # validation, replay, metrics, review receipts
artifacts/                          # local outputs; large/raw files ignored
submission/                         # demo script, blog, social draft, checklist
docs/sources/                       # original source snapshots
docs/references/                    # source register and implementation ADRs
docs/superpowers/                   # this design and its phased task plan
```

Do not commit provider keys, CSVs by default, virtual environments, node_modules, or sensitive tool logs. Commit manifests, tiny synthetic fixtures, loading scripts, and required answer files. Inspect redistribution terms before committing any source dataset; source availability is not automatically permission to redistribute it.

## 5. Data ingestion and graph model

### 5.1 Input handling

Expected source-reported files: `transactions.csv` (590,742 rows), `identity.csv` (144,432 rows), `closed_cases_history.csv` (5,565 rows), and `case_pack.csv` (20 rows). These are reconciliation expectations, not already verified counts. [S2: Files in this folder]

Use Python 3.12, streaming/chunked ingestion, and a disk-backed intermediate format. Preserve all original columns in a raw or normalized sidecar; promote investigation-relevant fields into graph properties. Do not place the CSV inside the Worker bundle or scan it per case. Workers' documented per-isolate memory limit is 128 MB. [S8]

Ingestion must:

1. Record SHA-256, byte size, header order, row counts, null rates, timestamp range, and duplicate-ID checks.
2. Parse identifiers as strings without losing leading zeros. Join on normalized `TransactionID` with a documented exact conversion. Keep an original-to-normalized mapping when conversion changes representation.
3. Left-join identity onto transactions; transactions without identity remain present. A missing identity row is not itself fraud.
4. Parse monetary strings with decimal arithmetic. Use integer cents if every input is exactly cent-representable. Otherwise preserve a higher-precision decimal and fail any undocumented rounding rule.
5. Validate customer/card mappings and every referenced transaction and connected card. Conflicting mappings are fatal for authoritative graph construction, not warnings silently ignored.
6. Parse `txn_ids` and `connected_card_ids` according to observed serialization. Trim whitespace, drop empty tokens, reject invalid IDs, and deduplicate intentionally.
7. Build a source manifest and a quarantined-error report. Do not silently drop malformed rows and still report source counts as loaded.
8. Load in restartable batches, upserting only intended types/edges. A second load must not create duplicates.
9. Reconcile graph counts, sample fields and relationships, and all 20 flagged transaction lookups against the files.

### 5.2 Core graph

Use the supplied schema as the starting point. [S2: Suggested graph schema]

| Vertex | Primary identity and key properties |
|---|---|
| Customer | Supplied `customer_id`; namespace/dataset version. |
| Card | Validated source-compatible `card_id`; normalized card details. |
| Transaction | Supplied transaction ID; raw timestamp, sortable time, exact amount, channel, risk score, product code, region, readable identity signals, optional raw-feature reference. |
| DeviceProfile | Deterministic canonical tuple of DeviceInfo + OS + browser + screen, plus a stable hash for storage and original readable tuple for export. |
| EmailDomain | Exact normalized domain and role information; not a person or a full email address. |
| BillingRegion | Dataset region code and country code; not a verified physical transaction location. |
| ClosedCase | Supplied CC ID, times, outcome, pattern, notes, exposure, provenance `organizer_history`. |
| InvestigationCase | New run-scoped case projection, logical source `case_id`, revision, status, model/policy/source versions, trust class and simulation markers. |
| DocumentChunk | Stable document/version/chunk ID, section/page, text, source hash, embedding, model and dimension. |

Edges: Customer→OWNS→Card; Card→MADE→Transaction; Transaction→FROM_DEVICE→DeviceProfile; Transaction→PURCHASER_EMAIL→EmailDomain; Transaction→RECIPIENT_EMAIL→EmailDomain when available; Transaction→BILLED_IN→BillingRegion; Transaction→NEXT→Transaction within a card; historical/new cases→INVOLVES→Transaction, ON_CARD→Card, CONNECTED_TO→Card.

Optional evidence vertices should be added only if needed for querying provenance; otherwise persist evidence JSON plus indexed entity links on the case. Do not build an unnecessarily large event graph just to mirror every DO event.

### 5.3 Avoid artificial relationships

Do not create one shared device from all-null tuples. Canonicalize missing components explicitly; record completeness. A partially known profile is a weaker link. Common domains or common device configurations must not, on their own, establish fraud or a shared actor.

Do not treat region codes as GPS locations, `ProductCD` as a merchant, `R_emaildomain` as an exact recipient, or encoded V/C/D/id fields as interpretable named features. Preserve the source's terminology and uncertainty. No “impossible travel” conclusion from region codes alone.

### 5.4 Query visibility and pagination

Every query takes a trusted `QueryScope`: dataset version, effective time, optional time range, pagination, and policy-approved expansion limits. The runtime supplies the scope, not the LLM. Use the same scope in graph and vector retrieval, including historical case closure times.

All queries return a completeness envelope with returned count, available count when measurable, truncation flag, next cursor, query version, and applied cutoff. Never silently cap a fraud episode and report the partial sum as total exposure. Collect affected IDs across pages deterministically, or export an explicitly unresolved case and explain incomplete scope.

## 6. Domain contracts and tool interfaces

### 6.1 Shared types

Define these centrally in `packages/contracts`. Use generated JSON Schema at runtime, not TypeScript alone.

```ts
type CaseKey = { workspaceId: string; runId: string; caseId: string };
type EntityRef = { type: string; id: string; datasetVersion: string };
type TruthValue = "true" | "false" | "unknown";
type TrustClass = "organizer_history" | "source_observation"
  | "human_reviewed" | "agent_assessment" | "simulated";
type QueryScope = {
  datasetVersion: string;
  effectiveAsOf: string;        // normalized dataset time; original retained
  mode: "strict_replay" | "retrospective";
  memorySnapshotId: string;
};
type PageSpec = { limit: number; cursor?: string };
type Coverage = { complete: boolean; returned: number;
  available?: number; nextCursor?: string; omittedReason?: string };
type ToolReceipt<T> = {
  receiptId: string; operationId: string; toolName: string;
  queryVersion: string; scope: QueryScope; data: T;
  entityRefs: EntityRef[]; coverage: Coverage; sourceHash: string;
  startedAt: string; completedAt: string; elapsedMs: number;
};
```

All named tool output types below are JSON-serializable schemas defined by the same task that creates the tool. They must include exact source IDs and return observations, not a model-written verdict.

### 6.2 Application tools (not vendor API names)

| Domain interface | Required response content |
|---|---|
| `getCaseContext(caseId, scope): ToolReceipt<CaseContext>` | Case trigger, flagged transaction, card/customer identity, missing-field flags. |
| `getCardTimeline(cardId, from, to, page, scope): ToolReceipt<CardTimeline>` | Ordered transactions, baseline aggregates, gaps and completeness. |
| `detectPatterns(cardId, windows, scope): ToolReceipt<PatternFindings>` | Candidate sequences and counterexamples, transaction IDs, exact amounts/times, detector version, missing premises. |
| `traceSharedOrigins(seedTxnIds, window, page, scope): ToolReceipt<SharedOrigins>` | Candidate related cards, paths, origin type, profile frequency/completeness, associated transaction IDs, time bounds. |
| `analyzeComponent(seedTxnIds, window, limits, scope): ToolReceipt<ComponentAnalysis>` | Bounded graph-algorithm result on the filtered graph: nodes, paths, component membership, boundary truncation. |
| `getEpisodeFacts(txnIds, scope): ToolReceipt<EpisodeFacts>` | Authoritative exact amounts, earliest/latest dates, card/customer IDs, invalid/inaccessible IDs, coverage. |
| `retrieveSimilarCases(query, entityIds, scope): ToolReceipt<PriorCases>` | Ranked eligible historical cases with supporting passages and outcome; exclude current evaluation target and ineligible future cases. |
| `retrievePolicyContext(ruleIds, query, scope): ToolReceipt<PolicyContext>` | Exact policy sections plus retrieved pattern/document passages, hashes and locators. |

Runtime-only operations, not free-form model tools:

- `requestEvidence(request, decisionRevision): EvidenceRequestReceipt` validates scope and records the request before simulation response delivery.
- `commitAssessment(proposal, receiptIndex): AssessmentRevision` validates the proposal and cited evidence.
- `evaluatePolicy(facts, assessment): PolicyDecision` is pure code, with explicit unknown/conflict output.
- `persistCaseProjection(snapshot, operationId): ProjectionReceipt` writes only the allowed case namespace and verifies revision/hash readback.
- `executeApprovedAction(actionId, principal, expectedRevision): ActionReceipt` applies server-side approval and idempotency controls.
- `compileAnswer(snapshot, sourceIndex, metrics): Answer` builds the source format without asking the model to invent the full object.

### 6.3 Tool errors and budgets

Use typed errors: `INVALID_ARGUMENT`, `UNAUTHORIZED`, `NOT_FOUND`, `AMBIGUOUS_MAPPING`, `INCOMPLETE_DATA`, `TIMEOUT`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, `SCHEMA_MISMATCH`, `STALE_REVISION`, `POLICY_CONFLICT`.

Default engineering limits: 12 LLM turns per autonomous pass; 30 graph/retrieval invocations per case pass; 200 records per page; 2 expansion hops initially, expandable to 3 with an explicit reason; 500 nodes/1,500 edges per displayed subgraph; 20-second graph call timeout; 90-second model call timeout; two automatic transport retries with jitter for retryable errors. Adjust only from measured traces and record config versions.

These are resource safeguards, not fraud decision thresholds. Hitting a cap must not imply a legitimate verdict. Recover a cached receipt when its full scope matches; count real provider invocations separately from cache hits.

## 7. GraphRAG, graph algorithms, and case memory

### 7.1 Retrieval pipeline

Index the README's pattern and policy sections and historical case notes first. These are sufficient to establish the graph-plus-document retrieval path. Add a small selection of organizer-linked regulatory narrative/typology documents only after extraction and citation checks. This plan has not independently analyzed those regulatory PDFs, and does not replace the supplied policy with external law.

Chunk by rule, heading, or coherent case narrative. Keep source document, version, section/page, content hash, trust class, and availability time. Use a pretrained embedding model. Store vectors in TigerGraph, not in a second vector database. Confirm dimension, query/document input modes, normalization and similarity semantics against the selected endpoint and installed TigerGraph version. [S9, S12]

For each investigation: retrieve policy by exact rule identifiers as well as semantic search; retrieve structurally related and semantically similar cases; expand graph evidence; build a compact evidence packet. Include legitimate/cleared precedents when relevant. Never pad retrieval with irrelevant cleared cases merely to balance counts.

### 7.2 Mandatory graph-algorithm proof

Implement at least one real bounded traversal/component algorithm in TigerGraph/GSQL, with a tiny synthetic graph whose expected component membership is known. Build the analytical subgraph from a defined time window and meaningful origin relationships; down-rank or filter common low-information origins according to a documented detector configuration. Report all filters and truncation.

The algorithm identifies investigative candidates, not guilt. Record paths and transaction evidence before classifying connected cards as compromised. `MONITOR_CONNECTED_CARDS` targets can be broader than `connected_card_ids` classified as caught in the compromise; maintain separate internal sets so monitoring does not falsely label every neighbor fraudulent.

### 7.3 Memory hygiene

Keep source historical truth separate from generated conclusions. New cases carry model, run, policy, dataset, revision, human-review and simulation provenance. Simulation taint survives summaries, retrieval and projections.

`similar_prior_cases` in the exported contract contains only IDs from `closed_cases_history.csv`. Newly generated cases may be cited as graph evidence with their trust class disclosed, but must not be inserted into this historical-only field. [S2: Answer Format, Part 1]

Benchmark default: each run sees a fixed snapshot of organizer history; generated cases are stored and retrievable in a separate namespace, but their verdicts do not become corroborating truth for other scored cases. Demonstrate new-case memory in a separately labeled chronological memory-enabled run. This is a mandatory memory integration test: close/project case A, investigate a later related case B, retrieve A, and preserve A's agent/simulation provenance without treating its verdict as confirmed history. A release can enable prior generated-case retrieval only with explicit provenance and no recursive self-confirmation.

For historical evaluation, exclude the target case, its final notes and embeddings, outcome edges, exact duplicated narratives and label-revealing artifacts. Retrieval eligibility must be enforced before or during ranking, not merely after feeding text to the model. If post-filtering top-k, paginate/retrieve more or report incomplete eligible recall.

## 8. Assessment and investigation behavior

### 8.1 Structured assessment

The model proposes: verdict; probability; candidate pattern or `undocumented`; affected transaction candidates; evidence and counterevidence receipt IDs; unresolved questions; suspicion basis; next investigative question; suggested stop reason.

Code then checks every ID, receipt, scope, derived figure and schema. The model cannot set `written_to_graph`, approval status, executed action status, authoritative exposure, tool counts, token totals or latency. Compute these fields from source and runtime records.

`fraud_probability` is explicitly an **uncalibrated assessment estimate** until a documented held-out evaluation supports calibration. Never call a numeric LLM answer calibrated simply because it is precise. Keep the supplied `risk_score` visibly separate.

### 8.2 Evidence ledger

Each evidence item stores a claim, source category, source locator/receipt, entity references, availability time, whether observed/derived/assumed, trust class, underlying fact IDs and an evidence-family tag. Candidate families: transaction sequence, behavioral baseline, device identity, customer validation, cross-card evidence, historical precedent, bank-model signal.

Two sentences about the same transaction, two vector matches to the same case, or the bank score plus a closely related opaque model feature are not automatically independent evidence. Evidence-family separation is a practical review aid, not proof of statistical independence. Record the rationale for treating evidence as independent.

Source text, retrieved notes and tool results are untrusted data. They cannot change instructions, authorize network calls, select new MCP endpoints, or create approval claims. Present analyst-facing evidence and decision explanations, not hidden internal chain-of-thought.

### 8.3 Loop

1. Admit an authenticated start/resume command and take a revision-fenced work lease.
2. Fetch case context and baseline facts; retrieve applicable policy and relevant history.
3. Ask the LLM for the next bounded tool call or assessment proposal.
4. Validate proposed calls, execute allowed queries, persist receipts, check uncertainty/counterevidence and resource budget.
5. Validate the assessment, compute episode facts in code, evaluate policy.
6. Persist the initial assessment and recommendation **before consuming any requested response**.
7. When evidence is needed, create the internal fraud case as required, record request, deliver an explicit simulation event through the normal response path, then reassess.
8. Freeze the final recommendation for that revision; route approvals; project the case to TigerGraph.
9. Generate grounded summary/SAR prose, compile the answer, verify projection and export.
10. Stop only under the source's stopping conditions, or pause/escalate with a truthful operational reason.

An existing customer-report trigger already counts as source evidence; do not pretend the customer has not disputed the transaction. A clarifying follow-up must identify the unresolved question rather than ask the same generic question again.

### 8.4 Stopping and status

Source stopping criteria: probability ≥0.85 or ≤0.15 supported by at least two independent pieces of evidence; a verification response settles the question; or further steps are unlikely to change the decision and the reason is recorded. [S2: Fraud Policy §6]

A budget exhaustion, timeout or graph outage is not evidence that the question is settled. Keep status `open` when evidence remains pending, or `escalated` when policy requires analyst intervention. Store a separate internal execution state `blocked`/`retrying` rather than invent an extra exported status.

Approval state is separate from investigative status. A case can be `closed_fraud` with a substantiated recommendation while `BLOCK_CARD` and `FILE_REPORT` remain pending human approval. Neither summary nor SAR may claim they were executed without action receipts.

## 9. Deterministic policy specification

Implement the source rules literally as predicates with `true`/`false`/`unknown` facts; unknown is never coerced to false or to an invented confirmation. Rules yield obligations, prohibitions, approvals, missing premises and explicit conflicts. Policy reasoning cites the source rule or numbered section, not an invented rule identifier.

### 9.1 Actions and approval routes

| Route | Actions |
|---|---|
| `auto` | `ALLOW_TRANSACTION`, `MONITOR_CARD`, `MONITOR_CONNECTED_CARDS`, `WARN_CUSTOMER`, `VERIFY_WITH_CUSTOMER`, `STEP_UP_AUTH`, `GENERATE_REPORT`, `CREATE_CASE`, `ESCALATE_TO_ANALYST`, `CLOSE_NO_FRAUD` |
| `L1` | `DECLINE_TRANSACTION`; `BLOCK_CARD` when exposure ≤ $2,500 |
| `L2` | `BLOCK_CARD` when exposure > $2,500; `BLOCK_ALL_CARDS`; `FILE_REPORT` |

Only `auto` may execute autonomously. A model proposal or authenticated analyst chat message is not an L1/L2 approval. [S2: Fraud Policy §§1–2]

### 9.2 Rule table

| Source rule | Predicate / required behavior |
|---|---|
| R1 | Single weak signal and probability <0.70: verify or step up before blocking. A high probability alone does not create new blocking authority. |
| R2 | Customer denies: recommend `BLOCK_CARD` and `CREATE_CASE`; add `FILE_REPORT` when exposure >$1,000 or the documented linking condition holds. Evaluate R7 conflict separately. |
| R3 | Customer confirms the scoped transaction: recommend `CLOSE_NO_FRAUD`; retain confirmation evidence. Do not clear unrelated transactions merely because one is confirmed. |
| R4 | No response after 24h: monitor; decline pending authorizations; escalate when exposure >$500. Unknown pending status cannot be asserted. |
| R5 | Three or more small online authorizations within one hour followed by larger purchase: decline and step up. A purchase >$100 already cleared additionally supports block. Unknown settlement cannot satisfy the cleared predicate. |
| R6 | Several cards show fraud from a documented shared origin in one window: name origin, create case, file report, monitor every card sharing it within the supported scope. Mere shared profile is not several cards showing fraud. |
| R7 | Disputed charge matches the customer's own recurring pattern, including same merchant, amount and monthly frequency: create case, verify, warn; do not block. Missing merchant evidence leaves this predicate unresolved. |
| R8 | Verdict uncertain with exposure >$500, OR conflicting evidence: escalate. Conflicting evidence does not require the exposure threshold. |
| R9 | Evidence of coordinated/repeated abuse across customers outside known patterns: create case, file report, escalate, describe `undocumented` pattern. Novelty alone is not fraud. |
| R10 | Prohibit block-all unless ≥2 of that customer's cards have confirmed fraud or credentials are confirmed compromised. Permission is not an obligation to block all. |
| §3a case | Create a case when probability ≥0.30, evidence is requested, or a charge is disputed. All benchmark investigations still have an internal result record and graph projection; do not equate this with a regulatory filing. |
| §3a SAR | Confirmed/strongly suspected fraud AND (exposure >$1,000 OR qualifying shared link OR coordinated/undocumented pattern) supports report; a report always has a case. |
| §4 | Exposure = sum of absolute amounts of unique supported affected transactions. Legitimate verdict: empty affected IDs and zero exposure. |
| §6 | Enforce stopping criteria from §8.4. |

### 9.3 Source gaps and conflict resolution

These are proposed implementation interpretations, not organizer-confirmed rules:

- **R2 versus R7:** When all R7 premises are established, treat it as the narrower disputed-but-legitimate exception: case + verification + warning, no block. If denial and recurrence evidence genuinely conflict or merchant identity is unsupported, record the conflict and route through R8 rather than fabricating a resolved premise. Obtain reviewer/organizer signoff on this interpretation.
- **R3 versus other fraud evidence:** Scope confirmation to the named transactions. If confirmation conflicts with strong contrary evidence on that same scope, keep a visible conflict and escalate; do not silently delete either branch.
- **Strongly suspected:** Keep an evidence-supported structured assessment plus policy-review status; no new hard-coded probability threshold is authorized by the source. The 0.85 stopping number is not automatically the SAR threshold.
- **Insufficient fields for a predicate:** Request controlled analyst information or return an unresolved predicate. A simulator response may supply the assumed fact only when recorded as simulated evidence.

Tests must exercise these interpretations explicitly. A final release report lists unresolved policy interpretations and their effect on answers. Never hide contradictory `ALLOW_TRANSACTION` and `DECLINE_TRANSACTION`, or `CLOSE_NO_FRAUD` and `BLOCK_CARD` for the same scope, inside an unordered action list.

### 9.4 Mandatory boundaries

Test probability 0.2999/0.30 and 0.6999/0.70; stopping 0.1499/0.15/0.1501 and 0.8499/0.85; exposure $500/$500.01, $1,000/$1,000.01, $2,500/$2,500.01; cleared purchase $100/$100.01; 2 versus 3 small authorizations; 59m59s/60m/60m01s windows; 23h59m59s/24h without response; 1 versus 2 confirmed cards.

Encode monetary comparisons in cents after validated parsing. Boundary tests must assert both actions and absence of unauthorized actions.

## 10. Durable state, scheduling, and approvals

### 10.1 Identity and local schema

Use `workspaceId:runId:caseId` as the logical identity. A new browser connection does not create a new case. A fresh benchmark run has a new run ID; retries within a run reuse the identity.

Minimum app-owned SQL tables:

- `case_state`: logical key, source hash, revision, workflow state, active lease/fence, current assessment, effective time, configuration versions.
- `events`: ordered sequence, event ID, type, payload, parent decision/request ID, timestamps.
- `evidence_receipts`: immutable receipt, input hash, query/scope version, raw/result references.
- `assessments`: immutable revision, evidence set hash, estimate, verdict, pattern, missing premises.
- `decisions`: immutable initial/final/intermediate action sets and policy version.
- `evidence_requests`: scope, question, status, decision revision, assumed response, simulation provenance, deadline.
- `actions`: action ID, scope, route, revision/hash, state, approval, operation ID, mock result.
- `commands`: client idempotency key and resulting operation/revision.
- `outbox`: projection/action intent, stable operation ID, retry state and readback receipt.
- `usage_events`: actual provider/tool invocations and usage availability.

Keep app migrations separate from SDK-managed tables. Do not store all these private records in `setState()`: Cloudflare documents that it broadcasts state to connected clients. Publish only an authorized presentation projection. [S7]

### 10.2 Execution fences

Persist lease ID, revision and lease deadline before network I/O. Recheck the fence after every awaited external call before committing results. A second start request joins the existing run; a stale response cannot overwrite a newer assessment. A watchdog can recover an expired lease, increasing the fence.

Cloudflare DOs can interleave events across external awaits. Do not rely on “single threaded” as a guarantee that an entire multi-call investigation is atomic. Keep local transactions short; never hold `blockConcurrencyWhile` across NIM, MCP or R2 calls. [S6]

### 10.3 Recovery and idempotency

Persist an operation intent before an external write. Use stable IDs and revision-specific graph projections. On timeout after a write, read back by operation ID/hash before retrying. Duplicate events or scheduled callbacks must be harmless. Do not claim exactly-once network delivery; demonstrate effectively-once visible effects through reconciliation.

Use the Agents SDK scheduler as the single scheduling owner. Do not add raw DO alarms alongside it. Scheduled callbacks are designed to tolerate duplicate delivery and reconstruct work from SQL. Underlying DO alarms have at-least-once execution semantics; the SDK's exact behavior is verified in the pinned integration. [S13]

Browser disconnection is not cancellation. A bounded pass records its continuation before returning. Cancellation stops future work, fences out stale responses, preserves evidence, and never erases already executed action receipts.

### 10.4 Approval envelope

An approval binds workspace, case/run, action ID, action type, targets, exposure, policy version, decision revision and payload hash. Authenticate role on the server; check that the approval remains current at execution time. A changed target/exposure or newer assessment invalidates the previous approval. L1 cannot approve L2; L2 approval of L1 is allowed only if the team's explicit capability configuration grants it.

Record recommended → awaiting_approval → approved/rejected → executing → executed/failed/unknown. Failed or unknown mock delivery needs reconciliation. All actions remain mock integrations in this build, but authorization is real within the demo application.

## 11. Controlled evidence simulation

Use a deterministic simulation adapter outside the LLM. Test/demo profiles select `confirms`, `denies`, `no_response`, `step_up_passed`, `step_up_failed`, or a bounded analyst statement. Responses name the request and transaction scope. An initial trigger from the source is not marked simulated; a newly invented reply always is.

Default benchmark behavior, absent a team-approved simulation profile: produce an explicit `no_response` assumption when a response is requested, advance a virtual clock by 24h where needed, and let policy express unresolved risk. This is a reproducible neutral workflow branch, not a prediction of the hidden case verdict. Alternative branches are separate run profiles, never selected after inspecting which answer looks preferable.

Never use hidden labels or case-specific hard-coded verdicts to select simulator replies. Benchmark branch choice and simulated conclusions must be disclosed in output prose and sidecar run metadata. Preserve every intermediate assessment internally; export the first pre-response recommendation and the last recommendation with all intervening requests listed.

The simulator should call the same authenticated response-processing function as a human demo control. Do not bypass the evidence-request ledger, revision checks, or policy reevaluation. A duplicate response changes nothing; a response for a stale/cancelled request is rejected or retained as an unconsumed audit event.

Dataset time and wall-clock time are separate. Use a virtual clock for 2016 evidence deadlines and a real clock for service latency; never schedule an actual 2016 deadline against today's wall clock.

## 12. NVIDIA provider integration

Use a dedicated HTTP adapter configured by server-side `NIM_BASE_URL`, `NIM_MODEL`, and secret `NVIDIA_API_KEY`. Restrict the URL to an approved origin. Use the hosted endpoint's documented request/response schema; do not assume every self-hosted NIM parameter works on the hosted catalog endpoint. [S10, S11]

Capability report before full integration: plain response; one tool call; two sequential tool/result rounds; schema-constrained output where supported; unsupported option behavior; streaming if enabled; usage fields; maximum practical input/output; timeout and 429 handling. Record exact model ID, options, date, package versions and observed results.

Core workflow may use non-streaming model responses with real-time progress events. Token streaming is optional until correctly parsed. If enabled, assemble tool argument fragments by tool-call ID/index, do not execute partial JSON, and finalize only on complete validated arguments. Record usage from the actual provider response; interrupted/unbilled/unknown usage must not be represented as observed zero.

Use temperature 0 where supported for repeatability; this is not a determinism guarantee. One schema-repair attempt may fix formatting; it must not introduce unsupported facts. If still invalid, preserve the last valid assessment and surface an operational failure. Do not silently switch to another LLM provider: a model change requires a new capability receipt and run manifest.

Prompt sections: task and policy role; tool constraints; current source-grounded case state; evidence/counterevidence; missing premises; decision schema. Source text is delimited as data. Do not place secrets or hidden labels in the prompt.

## 13. Exact answer contract and export compiler

Do not ask the LLM to emit the entire final answer without code validation. Generate constrained prose and assessment proposals; compile authoritative fields in code.

### 13.1 Complete field inventory

| Object | Required fields and source types |
|---|---|
| Top level | `case_id: string`; `case: object`; `evidence_requests: list`; `next_best_actions: object`; `sar: object`; `stop_reason: string`; `tool_calls: int`; `tokens: int`; `latency_s: number`. |
| `case` | `status`; `verdict`; `fraud_probability`; `pattern`; `pattern_description`; `affected_txn_ids`; `first_suspicious_txn_id`; `connected_card_ids`; `connected_device_profiles`; `exposure_usd`; `evidence`; `similar_prior_cases`; `summary`; `written_to_graph`; `graph_case_id`. |
| `case.evidence[]` | `claim: string`; `source: graph/document/customer/external`; `ref: string`; `entity_ids: string[]`. |
| `evidence_requests[]` | `type: customer_validation/step_up_auth/analyst_info`; `asked_after_step: int`; `assumed_response: string`. |
| `next_best_actions` | `initial: Action[]`; `final: Action[]`; `what_changed: string`. Each action: `action: exact enum`; `route: auto/L1/L2`; `reason: string citing source policy`. |
| `sar` | `file: boolean`; `reason: string`; `narrative: string`; `subjects: string[]`; `total_amount_usd: number`; `activity_dates: string[]`. |

Exact status enum: `open`, `closed_fraud`, `closed_legitimate`, `escalated`. Verdict: `fraud`, `legitimate`, `uncertain`. Pattern: `card_testing`, `card_not_present_fraud`, `card_not_present_new_device`, `out_of_region_use`, `account_takeover`, `undocumented`, `none`. [S2: Answer Format]

No additional operational fields in the canonical submission object; place extended metadata in `reports/runs/<runId>/`. Allow empty arrays/strings where the source explicitly permits them; do not replace them with null.

### 13.2 Compiler and semantic validation

1. Load validated source case and the frozen initial/final decision revisions.
2. Resolve every source entity and receipt. Distinguish dataset IDs, canonical derived profiles and created operational case IDs.
3. Fetch all unique affected transactions; compute absolute exposure and date bounds using exact arithmetic. Confirm scope is complete before calling it total exposure.
4. For legitimate verdict, enforce empty affected IDs, first suspicious ID `""`, zero exposure, and `sar.file=false`; flag contradictory compromise fields for review rather than silently keeping them.
5. For nonempty affected IDs, first suspicious ID must be the earliest member by time with deterministic ID tie-break. The source requires inclusion of the flagged transaction in the episode; if evidence suggests a separate episode excluding the seed, do not fake inclusion—surface the scope conflict for review.
6. Historical `similar_prior_cases` must be eligible CC IDs actually retrieved and used. A made-up plausible CC string is invalid.
7. `sar.file` equals existence of `FILE_REPORT` in final actions. `sar.file=true` means recommendation to file, not actual filing.
8. When `sar.file=false`: empty narrative and subjects, amount 0, dates empty. When true: supported subjects, episode amount/dates, 6–12 sentence narrative that stands alone and states assumptions and pending approvals honestly.
9. Summary: 2–6 sentences. `undocumented` description: 2–3 sentences; other descriptions empty. Sentence checks need abbreviation-safe handling plus human review, not naive period counts alone.
10. When no evidence was requested, `initial` and `final` must be identical and `what_changed` must be `"nothing"`. Otherwise show the actual change or honestly state none occurred.
11. All reasons cite applicable policy identifiers/sections; all factual prose must be supported by receipts or labeled assumptions. No fictional merchant names, geography or completed blocks.
12. `written_to_graph=true` only after write receipt and readback of the corresponding business-data revision/hash. Set the actual observed graph ID. Do not require a hash containing its own receipt/metrics; hash a defined business payload and store persistence metadata separately.
13. Validate measured metrics and write one UTF-8 JSON file named `<case_id>.json` under `cases/`.

The input example's illustrative amounts/IDs are not test truths. A mathematically or policy-inconsistent example must never override the source's explicit field/rule definitions.

## 14. Web interface and chat behavior

Deliver a case workspace rather than a chat-only black box.

**Case list:** all 20 source cases, trigger, state, last update, projection state, unresolved approval count, run identifier. A skeleton/empty/error state must distinguish no cases from unavailable data.

**Workspace:** header with bank score versus assessed probability; source/assumption badges; timeline of evidence and decision revisions; bounded graph with an accessible list/table alternative; current questions; initial/final action comparison; pending approval controls; SAR and JSON preview; tool/token/latency panel.

**Chat:** supports investigating the selected case, asking why an action is recommended, identifying missing evidence, requesting a bounded further investigation, and explaining a connection. A chat question does not automatically rerun the case or mutate a recommendation. Mutating commands require explicit intent and server authorization.

**Live updates:** monotonically sequenced events with snapshot + cursor recovery. Reconnect from the last seen event, deduplicate events, fetch a fresh snapshot when the cursor is outside retention. Never append a second action merely because a WebSocket replays a message.

**Approvals:** visible for the authorized role, disabled with explanation for others; scope and exposure shown before submission; confirmation binds revision/hash. Stale approval shows a clear reload/review message.

**Accessibility and security:** keyboard-operable controls, readable focus states, graph alternative, sanitized Markdown, escaped source text, responsive layout, no secrets in source maps or client bundles. Do not allow the client to push arbitrary SDK state into privileged case state.

## 15. Evaluation, observability, and benchmark discipline

### 15.1 Four evidence levels

Label tests/results `fixture`, `local-runtime`, `live-provider`, or `deployed-end-to-end`. A mock-passing test is not evidence that TigerGraph or NIM worked. Offline checks must not silently skip missing secrets and still print an all-green integration report.

### 15.2 Test layers

Unit: policy boundaries, exact money, ID conversion, scope, claim references, event reducer, approval gate, export semantics.

Component: real local Worker/DO runtime, migrations, restart/resume, duplicate callbacks, outbox retries, malformed NIM tool calls, MCP transport errors and authentication.

Graph: tiny synthetic graph with expected results, cross-card component positive/negative controls, high-degree origin control, cutoffs/pagination, real source sample reconciliation.

End-to-end: source case through deployed NIM + TigerGraph MCP + actual graph write/readback + UI + export; second client and disconnect; approval permissions; no-response virtual clock.

Adversarial: source note saying “ignore policy”; fake L2 chat instruction; arbitrary query name; malicious tool URL; cross-workspace ID; fabricated entity; contradictory simulated replies; future/duplicate historical memory.

### 15.3 Metrics

Persist physical graph/retrieval call count, logical domain calls, cache hits, retries, LLM input/output tokens, provider-reported total where available, and real wall-clock timing. Export `tool_calls` as actual graph/retrieval invocations, including graph writes/readbacks if invoked for the case; exclude unrelated setup calls. Document the counting rule in the run manifest.

For token usage, prefer observed provider totals. If the endpoint does not supply complete usage, record `usage_source=estimated` with the tokenizer/method in a sidecar and display the estimate honestly; if no defensible estimate exists, mark the run's metric completeness failed rather than insert a fabricated zero. Keep embedding usage separate from LLM tokens.

Freeze metrics at export after required graph readback; export serialization itself is excluded. `latency_s` is real elapsed wall-clock time from accepted start to exportable result, including actual waits; virtual 24h advancement is not 86,400 seconds of service latency. Also retain active compute/provider wait/human wait separately.

### 15.4 Benchmark run

Read IDs from `case_pack.csv`; do not hard-code the expected answers. Default batch concurrency 2, adjustable only under observed provider limits. The batch CLI calls the same deployed start/status/export APIs and resumes existing run IDs.

Validate exactly the source set of 20 filenames, all required fields, graph persistence, arithmetic, source membership, routes, SAR consistency, and telemetry. Report completion/conformance separately from investigation accuracy. The hidden answer key is not available; do not claim an accuracy percentage on the 20 cases.

### 15.5 Historical evaluation and optional calibration

Use July–October cases only for development labels. A proposed chronological split is July–September training/development and October validation, subject to actual dates and support counts. Report any split adjustment. Mask the evaluated case and label-revealing artifacts from retrieval and graph features.

The history does not provide the same trigger schema as the case pack. Any reconstructed alert or case-level observation window is a **proxy evaluation task** and must be labeled as such. Do not claim it recreates the original investigation exactly. Use card/time available at case opening; do not use final affected-transaction membership as a feature selector.

Measure Brier score, log loss, precision/recall, class support and reliability bins with uncertainty; report chronological and entity-overlap limitations. Historical selection is fraud-heavy, unlike the half-legitimate case pack noted by the README. Do not “calibrate” by forcing exactly ten benchmark fraud verdicts. [S2: Files, Things to know]

## 16. Security and deployment

Environment contracts:

| Location | Required configuration |
|---|---|
| Worker secrets | `NVIDIA_API_KEY`; `MCP_SERVICE_TOKEN`; session/auth signing or Access validation configuration; batch service credential. |
| Worker nonsecrets | `NIM_BASE_URL`, `NIM_MODEL`, `TG_MCP_URL`, dataset/policy versions, role configuration reference, simulation mode, budget config. |
| Worker bindings | SQLite-backed `CASE_AGENTS`; static asset binding; optional artifact R2 bucket. |
| MCP service secrets | TigerGraph host, graph name, runtime credentials; separate deploy/ingestion credentials never sent to the agent. |
| Ingestion process | Source directory, TigerGraph loader credentials, embedding model configuration/key, output manifest directory. |
| Browser | Only public app configuration. No provider keys, MCP tokens, TigerGraph credentials, or approval role secrets. |

Use server-side authenticated role/capability checks on every HTTP, live-connection, export, simulator and action endpoint. Protect MCP with TLS + service authentication and block direct origin bypass. Check Origin/CSRF for cookie-authenticated mutations; cap request size and rate. Logs redact tokens and unrelated data.

Runtime model tools only map to an allowlist of installed queries. Runtime credentials cannot alter schema or issue arbitrary GSQL. If TigerGraph permissions cannot provide exactly the desired granularity, enforce it in a server-side proxy as well; hiding tool names in a prompt is not an authorization boundary.

Before deploying, verify account/project identities and existing resources. Never delete or reset a shared graph, expose a public MCP admin server, merge to main, publish a post, purchase infrastructure or file a real report without explicit authorization. Use isolated dev/test resources and a documented teardown manifest.

CI: frozen dependency install; typecheck/lint; unit tests; Python tests; graph fixture checks; local Worker/DO integration; build; secret scan; artifact schema checks. Live integration jobs need approved secrets/environment and a distinct report. Run database migrations intentionally, test forward migration and rollback/recovery, and retain the last known good Worker/service versions.

## 17. Phase map and acceptance gates

| Phase | Deliverable | Gate |
|---|---|---|
| P0 — Readiness | Source/config manifest; dataset semantics decision log; real NIM/MCP/vector/DO capability probes. | Known blockers explicit; no fabricated mappings or claimed integrations. |
| P1 — Contracts | Workspace, exact output/domain schemas, fixture harness, validation CLI. | Invalid IDs/types/enum and money cases are rejected. |
| P2 — Data and graph | Restartable normalized ingestion, validated card graph, source reconciliation. | All 20 seeds resolve; graph load is repeatable without duplicate edges. |
| P3 — Investigation queries | Timeline, pattern/counterevidence, shared-origin, real graph algorithm, episode facts. | Known synthetic results, time bounds and completeness tests pass. |
| P4 — MCP and GraphRAG | Protected official MCP path and eligible graph/document retrieval. | Real authenticated query + vector result; unauthorized query blocked. |
| P5 — Policy and output | Rules, conflict handling, stop checks, approval routing, answer compiler. | Boundary matrix and cross-field/provenance tests pass. |
| P6 — Durable execution | CaseAgent state, revisions, scheduler, evidence simulation, action/graph outboxes. | Duplicate/restart/stale-response tests preserve one consistent history. |
| P7 — Integrated agent | NIM adapter + bounded tool loop + first live source case export. | First working milestone passes on real services. |
| P8 — Analyst product | Chat/workspace, evidence/graph, approvals, reconnect and export. | Keyboard/browser + role + replay tests pass; graph alternative works. |
| P9 — Evaluation | All-20 batch, conformance report, historical proxy evaluation and failure review. | 20 real outputs; truthful completeness; zero route/ID/SAR consistency violations. |
| P10 — Release hardening | Protected deployment, failure injection, resource and recovery runbooks. | Deployed flow survives tested disruptions without unauthorized side effects. |
| P11 — Submission | Frozen case outputs, repository docs, demo/blog/social deliverables. | Every source submission item accounted for; publication state honest. |
| P12 — Optional extensions | Custom case estimator or monitoring in a separate namespace. | Only after P11; no regression or substitution for core requirements. |

Detailed task IDs, file ownership, test cases and commands are in the companion implementation plan. Phases are quality gates, not calendar promises. Independent work can run in parallel only after shared contracts are stable; one agent owns contracts and integration.

## 18. Scope cuts, non-goals, and optional ML

When resources are tight, cut proactive monitoring, custom ML, live token streaming, elaborate animations, extra document sources, and advanced graph visuals first. Do not cut TigerGraph MCP, actual graph algorithms, vector-grounded retrieval, initial/final decisions, permission checks, graph persistence, or the 20 exports.

A later optional `estimateCaseRisk(features)` tool may use a simple case-level classifier. Train outside Workers from eligible historical labels; never label unlabeled transactions as legitimate. Compare against the existing score and uncalibrated assessment on a predeclared held-out split. Calibrate only from held-out predictions and report uncertainty.

Serve a small linear model inside a Worker only with a versioned identical preprocessing contract and missing-value behavior. A Python-dependent model can use a separate authenticated CPU endpoint. This is not NIM LLM training, not required by the hackathon, and never an action-authorizing component.

## 19. Global definition of done

The build is complete only when a reviewer can reproduce the deployed case loop, distinguish observed facts from simulations, inspect every recommendation's policy and evidence basis, verify that gated actions cannot execute without current authorization, recover an interrupted investigation, read its stored graph record, and validate all 20 canonical answer files.

A polished chat screenshot, passing mock tests, a plausible SAR, or 20 model-written JSON blobs is not sufficient evidence. The final engineering report must state what was actually executed, which integrations were live, what remains ambiguous, and which performance or accuracy claims are not supported.

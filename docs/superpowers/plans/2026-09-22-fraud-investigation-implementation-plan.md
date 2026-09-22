# TigerGraph Fraud Investigation Agent Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for sequential execution, or `superpowers:subagent-driven-development` when available and explicitly selected. Implement task-by-task with tests and review receipts. This document authorizes no remote write, spending, publishing, destructive migration or merge by itself.

**Goal:** Deliver the complete source-grounded fraud-investigation loop and all required hackathon submission artifacts.

**Architecture:** One SQLite-backed Cloudflare CaseAgent per workspace/run/case; an authenticated Worker and web interface; NVIDIA NIM for model inference; official TigerGraph MCP for graph tools; TigerGraph for graph/vector evidence and projected case memory. Policy, approvals, exact arithmetic and exports are enforced in code.

**Tech Stack:** TypeScript, Cloudflare Workers/Durable Objects/Agents SDK, React/Vite, Python 3.12, TigerGraph/GSQL/TigerGraph MCP, hosted NVIDIA NIM, runtime schemas, Vitest/Worker tests, pytest and Playwright. Pin the verified toolchain in P0; do not mix unverified package generations.

**Spec:** `docs/superpowers/specs/2026-09-22-fraud-investigation-design.md` (read with both files in `docs/sources/`).

**Plan status:** All tasks unchecked. These are planned tests and commands, not tests run on an application repository. The build pack contains planning/reference documents only.

## Global Constraints

- Only `auto` may execute autonomously.
- A new browser connection does not create a new case.
- The bank's `risk_score` is already supplied. It is an input, never a verdict.
- Never use hidden labels or case-specific hard-coded verdicts to select simulator replies.
- No additional operational fields in the canonical submission object; place extended metadata in `reports/runs/<runId>/`.
- Do not claim exactly-once network delivery; demonstrate effectively-once visible effects through reconciliation.
- Never download original public IEEE-CIS/Kaggle files to recover benchmark labels.
- Case mapping, unknown merchant/status fields, time semantics and source-rule conflicts follow the design decision log; no silent assumptions.

## Review Focus

1. **Source-semantic gaps:** unknown merchant, card mapping or settlement must not become invented facts. Owners P0.2, P2.1, P3.2, P5.1.
2. **Interleaved/replayed execution:** restart, duplicate callback and late response must not create a second action or overwrite newer evidence. Owners P6.1–P6.6, P8.3, P10.2.
3. **Evidence pollution/leakage:** future history, held-out case notes and simulated conclusions must not become independent ground truth. Owners P4.3, P6.3, P9.3.
4. **Authority spoofing and staleness:** forged role, client state sync, changed exposure and stale approval must never authorize a gated action. Owners P6.5–P6.6, P8.3, P10.2.
5. **Partial results and misleading outputs:** query truncation, graph-write ambiguity, missing usage and draft-vs-filed SAR must be explicit. Owners P3.1, P5.3, P6.4, P9.1, P10.3.

## Execution protocol

Work in dependency order. A phase is complete only after all its mandatory tasks and its design gate pass. Keep a task's tested deliverable and proof in a focused commit. Do not replace the existing implementation without first inspecting it.

Each task follows red → confirm failure → minimal implementation → green → review/commit. The code block under a task is a focused acceptance assertion to place inside the named test, with normal imports/wrappers. It is not a complete implementation or permission to omit the other listed checks. Synthetic helpers and fixture variables are built by P1.1/P1.3 or the owning Python test module, with source-shaped TEST data. Do not add fake production branches just to satisfy fixtures.

Add command scripts before using them as a gate; their absence is a failure, not a skipped gate. Repository-wide commands to establish: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:worker`, `pnpm test:e2e`, `pnpm test:live`, `pnpm build`, `pnpm verify:release`; Python tests use the committed `uv` lockfile. Live commands must reject an unapproved/missing target. Start from existing equivalent scripts when integrating into a repository.

After each task, append a completion receipt to `reports/progress.md`: task ID; commit; files; exact commands; pass/fail/blocked counts; evidence class; changed source/architecture decisions; next unblocked task. Never mark unchecked work complete from a previous agent's prose alone.

## Critical path and permitted parallel lanes

```text
P0 readiness → P1 contracts → P2 source graph → P3 query/algorithm tools
                                            → P4 MCP + GraphRAG
P1 contracts ───────────────────────────────→ P5 policy/output
P4 + P5 → P6 durable/authorized runtime → P7 complete live case
         → P8 analyst interface → P9 all-20 evaluation
         → P10 release hardening → P11 submission
P12 is optional and may not delay or replace required gates.
```

After P1, a graph/data worker can own P2–P4 while a policy worker owns P5. A UI worker may develop fixture views after the presentation contract is frozen, but cannot claim the live UI gate. One integration owner controls `packages/contracts`, Worker routing, migrations and dependency locks. Avoid parallel edits to the same schema or decision file. Review branch integrations before progressing the critical path.

## Task index

- [ ] **P0: Readiness and live capability proof** — P0.1, P0.2, P0.3
- [ ] **P1: Contracts and test foundations** — P1.1, P1.2, P1.3
- [ ] **P2: Data and source graph** — P2.1, P2.2, P2.3
- [ ] **P3: Investigation queries and graph algorithm** — P3.1, P3.2, P3.3
- [ ] **P4: Protected MCP and GraphRAG** — P4.1, P4.2, P4.3
- [ ] **P5: Deterministic policy and canonical outputs** — P5.1, P5.2, P5.3
- [ ] **P6: Durable execution, evidence and authorization** — P6.1, P6.2, P6.3, P6.4, P6.5, P6.6
- [ ] **P7: NVIDIA integration and first live outcome** — P7.1, P7.2, P7.3
- [ ] **P8: Analyst web product** — P8.1, P8.2, P8.3
- [ ] **P9: Benchmark and evaluation** — P9.1, P9.2, P9.3
- [ ] **P10: Deployed reliability and security** — P10.1, P10.2, P10.3
- [ ] **P11: Release and submissions** — P11.1, P11.2
- [ ] **P12: Optional extensions** — P12.1, P12.2

---

## P0 — Readiness and live capability proof

### P0.1 — Bootstrap the repository and source-aware readiness report

**Depends on:** None.  
**Files to create or extend:** package.json; pnpm-workspace.yaml; apps/agent/wrangler.jsonc; scripts/doctor.ts; docs/references/decisions.md; tests/readiness.test.ts.  
**Interface contract:** `checkReadiness(config, probes): ReadinessReport` returns each required check as passed/failed/blocked with a reason and evidence path; `ready` is true only when all required checks passed.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const result = checkReadiness({ required: ["nim", "mcp", "vectors"] }, {
  nim: { status: "passed" }, mcp: { status: "passed" },
  vectors: { status: "blocked", reason: "No live vector receipt" }
});
expect(result.ready).toBe(false);
expect(result.checks.vectors.status).toBe("blocked");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/readiness.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Inspect the working tree before changes; preserve user edits. Create an isolated feature branch/worktree when working in an existing repository. Add only the workspace/tooling needed to run readiness tests, pin package manager/runtime versions after a compatibility check, and preserve all bundled source documents. Doctor validates configuration names without printing secret values. Record D01–D10 from the design with evidence, selected default and blocker scope. Do not expose an unauthenticated diagnostic endpoint.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/readiness.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Missing credentials produce blocked live checks, not green skipped checks. Source hashes are recorded. No existing app is overwritten, and no cloud write occurs without authorization.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p0.1): bootstrap-the-repository-and-source-aware-readiness-report`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P0.2 — Inspect the actual CSVs and resolve source semantics

**Depends on:** P0.1.  
**Files to create or extend:** pipelines/pyproject.toml; pipelines/src/fraud_data/inspect.py; pipelines/tests/test_inspect.py; reports/data-profile.json; docs/references/dataset-decisions.md.  
**Interface contract:** `inspect_sources(directory) -> DataProfile` reports headers, rows, nulls, duplicate IDs, dates, decimal scale and mapping evidence. `audit_semantics(profile) -> DecisionChecks` returns D01–D09 readiness.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```python
profile = inspect_sources(synthetic_source_dir)
assert profile["transactions"]["rows"] == 6
assert profile["identity"]["rows"] == 2
assert "merchant_id" not in profile["transactions"]["columns"]
assert audit_semantics(profile)["merchant_identity"] == "unknown"
```

- [ ] **Confirm red.** Run `uv run --project pipelines pytest pipelines/tests/test_inspect.py -q`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Use the organizer files only. Start with small fixtures, then stream all actual rows to profile them. Establish the exact card-ID mapping and record whether timestamps/merchant/status fields resolve the open questions. A sorted card tuple is not automatically the source suffix mapping. Extract representative contradictory rows into a local review report without inventing missing fields. Do not download the public Kaggle data to recover labels.
- [ ] **Confirm green and review.** Run `uv run --project pipelines pytest pipelines/tests/test_inspect.py -q` again, then relevant neighboring tests and type/build checks. **Acceptance:** Actual counts and column names replace assumptions in the manifest. Ambiguous card mapping blocks real card graph construction but not independent contract or policy fixture work.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p0.2): inspect-the-actual-csvs-and-resolve-source-semantics`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P0.3 — Prove the selected runtime, NIM, MCP and vector capabilities

**Depends on:** P0.1; P0.2 for source sample.  
**Files to create or extend:** scripts/probe-providers.ts; services/tigergraph-mcp/requirements.lock; reports/capabilities/; config/model-capabilities.json; tests/capabilities.test.ts.  
**Interface contract:** `validateCapabilities(observations): CapabilityReport` checks observed booleans; `runCapabilityProbes(config): CapabilityReport` records exact versions, endpoint/model, transport initialization, query/vector results and supported NIM options. Live mode is explicit.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const report = validateCapabilities({
  nimToolRoundTrip: true, nimUsage: true, mcpInitialize: true,
  mcpAllowedQuery: true, tigergraphVectorResult: false, doSqlRestart: true
});
expect(report.ready).toBe(false);
expect(report.failed).toContain("tigergraphVectorResult");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/capabilities.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** First test report logic. Then, on approved resources, prove a local SQLite DO survives re-instantiation, run an NIM tool/result/tool round trip, initialize the exact official MCP release and execute an installed harmless query, and run a real TigerGraph vector insertion/search on isolated test data. Check native HTTP flags; use the documented bridge fallback only when necessary. Confirm secrets, TLS, quotas and package interoperability; capture sanitized receipts. Pin the working combination, not a guessed newest version.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/capabilities.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Run `pnpm probe:providers --live` once that script exists. Missing account permissions remain blockers. Native HTTP support, structured output and usage are observed capabilities rather than unchecked assumptions.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p0.3): prove-the-selected-runtime-nim-mcp-and-vector-capabilities`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P1 — Contracts and test foundations

### P1.1 — Define the exact benchmark and domain contracts

**Depends on:** P0.1.  
**Files to create or extend:** packages/contracts/src/answer.ts; packages/contracts/src/domain.ts; packages/contracts/src/tools.ts; packages/contracts/schema/answer.schema.json; tests/contracts.test.ts.  
**Interface contract:** `AnswerSchema` matches every S2 field/enum. Define `CaseKey`, `QueryScope`, `ToolReceipt`, `Coverage`, `PolicyFacts`, `Assessment`, `Decision`, `CaseSnapshot`, and the named tool result types in the design. `validateAnswerShape(value)` returns typed errors.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const invalid = { case_id: "TEST-CASE-01", case: { verdict: "maybe" } };
const result = AnswerSchema.safeParse(invalid);
expect(result.success).toBe(false);
expect(AnswerSchema.safeParse({ ...validAnswer(), tokens: -1 }).success).toBe(false);
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/contracts.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Transcribe the source field inventory, including empty-string/array semantics, exact action/status/pattern enums and required metrics. Derive the runtime schema and TypeScript types from one definition. Define policy facts with explicit unknown values and evidence/request references; do not use booleans that turn missing premises into false. Define internal metadata separately from the canonical answer. Include valid synthetic fixture generation in this task; do not copy the illustrative HHG-017 answer.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/contracts.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Schema rejects unknown enum values, missing fields, null in place of prescribed empty values, nonfinite probability, invalid date shape and negative metrics. JSON Schema and TypeScript remain synchronized.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p1.1): define-the-exact-benchmark-and-domain-contracts`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P1.2 — Implement exact money, ID and temporal primitives

**Depends on:** P1.1.  
**Files to create or extend:** packages/domain/src/money.ts; packages/domain/src/ids.ts; packages/domain/src/time.ts; tests/primitives.test.ts; pipelines/tests/fixtures/primitives.json.  
**Interface contract:** `parseUsdCents(text): number`; `sumAbsoluteCents(amounts): number`; `normalizeTransactionId(text): string`; `compareDatasetTime(a,b): number`; shared cross-language fixtures preserve original IDs and timestamps.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
expect(sumAbsoluteCents([parseUsdCents("-10.25"), parseUsdCents("0.10")])).toBe(1035);
expect(() => parseUsdCents("0.001")).toThrow();
expect(normalizeTransactionId("000123")).toBe("000123");
expect(compareDatasetTime("2016-12-01 00:00:00", "2016-11-30 23:59:59")).toBe(1);
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/primitives.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Parse decimal strings without binary floating-point accumulation. Reject unsupported precision until the source audit establishes a documented alternative decimal policy. Define empty/NaN handling. Normalize numeric-looking IDs only with explicit source evidence and maintain mappings. Treat dataset-local timestamps consistently across Python, Worker and browser; separate virtual evidence time from elapsed execution time.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/primitives.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Boundary cent totals are exact. Repeated IDs do not double-count exposure at the episode layer. Running the same fixtures in Python and TypeScript produces identical normalized values.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p1.2): implement-exact-money-id-and-temporal-primitives`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P1.3 — Create controlled test ports and enforce test evidence classes

**Depends on:** P1.1; P1.2.  
**Files to create or extend:** packages/testkit/src/fixtures.ts; packages/testkit/src/ports.ts; packages/testkit/src/harness.ts; vitest.config.ts; vitest.workers.config.ts; .github/workflows/ci.yml; tests/testkit.test.ts.  
**Interface contract:** Helpers: `validAnswer()`, `facts(overrides)`, `assessment(overrides)`, `createHarness(options)`. Harness exposes `command`, `deliverEvidence`, `restart`, `advanceVirtualTime`, `injectFault`, `snapshot`, `events`, `recordedCalls`, `flush`. Ports replace clock, model, graph, projection and actions only in fixture mode.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const h = await createHarness({ evidenceClass: "fixture" });
await h.advanceVirtualTime({ hours: 24 });
expect(h.clock.virtualElapsedSeconds()).toBe(86400);
expect(h.clock.wallElapsedSeconds()).toBe(0);
expect(h.report().evidenceClass).toBe("fixture");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/testkit.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Provide tiny source-shaped fixtures with distinct fraud-like and benign patterns and explicit TEST identifiers. The harness is implemented against real domain ports and the local Worker/DO runtime as those components become available, not a separate fake policy engine. Add separate offline and live scripts; required live tests cannot succeed merely because credentials were absent. Establish no-secrets-in-logs assertions and reusable failure injection points.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/testkit.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** CI can run offline tests reproducibly. Fixture, local-runtime, live-provider and deployed-end-to-end results are labeled, and a missing integration environment is visible as blocked.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p1.3): create-controlled-test-ports-and-enforce-test-evidence-class`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P2 — Data and source graph

### P2.1 — Normalize source rows and construct a validated card map

**Depends on:** P0.2; P1.2.  
**Files to create or extend:** pipelines/src/fraud_data/normalize.py; pipelines/src/fraud_data/card_map.py; pipelines/src/fraud_data/manifest.py; pipelines/tests/test_normalize.py.  
**Interface contract:** `normalize_dataset(sources, mapping, output_dir) -> DatasetManifest`; `validate_card_map(mapping, case_rows, closed_cases, transactions) -> MappingReport`.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```python
result = normalize_dataset(synthetic_sources, explicit_card_map, tmp_path)
assert result["transaction_count"] == 6
assert result["transactions_without_identity"] == 4
assert result["duplicate_transaction_ids"] == 0
assert validate_card_map(conflicting_card_map, case_rows, closed_cases, txns)["valid"] is False
```

- [ ] **Confirm red.** Run `uv run --project pipelines pytest pipelines/tests/test_normalize.py -q`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Stream inputs; left-join identity; preserve raw sidecars and source hashes; enforce D01 mapping; canonicalize device tuple and missingness; parse pipe-separated transaction/card lists. Refuse an all-null device vertex and preserve identity-less transactions. Quarantine malformed rows and fail reconciliation rather than silently dropping them. Document any deliberate schema conversions.
- [ ] **Confirm green and review.** Run `uv run --project pipelines pytest pipelines/tests/test_normalize.py -q` again, then relevant neighboring tests and type/build checks. **Acceptance:** All source case/closed-case IDs reconcile. Missing identity remains represented. Raw originals are reproducible and not committed automatically. Running normalization twice gives identical manifest hashes.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p2.1): normalize-source-rows-and-construct-a-validated-card-map`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P2.2 — Install the source graph and restartable loading jobs

**Depends on:** P2.1; P0.3.  
**Files to create or extend:** graph/schema/fraud_graph.gsql; graph/loading/load_source.gsql; pipelines/src/fraud_data/load.py; graph/tests/test_loading.py.  
**Interface contract:** `load_dataset(manifest, target) -> LoadReceipt`; schema implements all design vertices/edges and dataset/run namespace attributes. Admin schema deployment is separate from runtime credentials.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```python
first = load_dataset(small_manifest, isolated_graph)
second = load_dataset(small_manifest, isolated_graph)
assert first["counts"] == second["counts"]
assert second["duplicate_edges"] == 0
assert second["orphan_flagged_transactions"] == []
```

- [ ] **Confirm red.** Run `uv run --project pipelines pytest graph/tests/test_loading.py -q`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Create schema and loading jobs from normalized files. Add chronological NEXT edges using time then ID tie-break. Preserve all transaction rows, readable identity fields and document/case linkage. Make batches restartable with manifest/checkpoint files. Restrict resets to the named isolated graph; never drop a shared database. Record installed schema/query versions.
- [ ] **Confirm green and review.** Run `uv run --project pipelines pytest graph/tests/test_loading.py -q` again, then relevant neighboring tests and type/build checks. **Acceptance:** A clean load and interrupted/resumed load produce the same counts and paths. Re-running does not duplicate edges. Schema/loading credentials never appear in Worker or browser configuration.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p2.2): install-the-source-graph-and-restartable-loading-jobs`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P2.3 — Reconcile all seeds and enforce data visibility

**Depends on:** P2.2; P1.1.  
**Files to create or extend:** pipelines/src/fraud_data/reconcile.py; graph/queries/get_case_context.gsql; graph/tests/test_scope.py; reports/data-reconciliation.json.  
**Interface contract:** `getCaseContext(caseId, scope): ToolReceipt<CaseContext>` and `reconcile_source_graph(manifest) -> ReconciliationReport`; source versions/cutoffs are required.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```python
result = get_case_context("TEST-CASE-01", scope_at_open)
assert result["data"]["flagged_transaction"]["id"] == "TEST-TXN-03"
assert "TEST-TXN-FUTURE" not in [r["id"] for r in result["entityRefs"]]
assert result["scope"]["effectiveAsOf"] == scope_at_open["effectiveAsOf"]
```

- [ ] **Confirm red.** Run `uv run --project pipelines pytest graph/tests/test_scope.py -q`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Reconcile full source and graph counts, all 20 seeds, customer/card links and historical affected IDs. Enforce the declared evidence cutoff in every query, preserve raw timestamps and verify unknown versus missing fields. A flagged transaction timestamp beyond the declared cutoff is a source conflict to investigate, not permission for general future access.
- [ ] **Confirm green and review.** Run `uv run --project pipelines pytest graph/tests/test_scope.py -q` again, then relevant neighboring tests and type/build checks. **Acceptance:** Every supplied seed resolves to the correct source card/customer, or the gate is explicitly blocked. Missing source fields have explicit unknown flags. Initial queries cannot see future data.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p2.3): reconcile-all-seeds-and-enforce-data-visibility`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P3 — Investigation queries and graph algorithm

### P3.1 — Build timeline and authoritative episode-facts queries

**Depends on:** P2.3.  
**Files to create or extend:** graph/queries/get_card_timeline.gsql; graph/queries/get_episode_facts.gsql; graph/tests/test_timeline_episode.py; packages/contracts/src/tools.ts.  
**Interface contract:** `getCardTimeline(cardId, from, to, page, scope): ToolReceipt<CardTimeline>`; `getEpisodeFacts(txnIds, scope): ToolReceipt<EpisodeFacts>`; include Coverage and all authoritative amounts/dates.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```python
episode = get_episode_facts(["TEST-TXN-01", "TEST-TXN-01", "TEST-TXN-02"], scope)
assert episode["data"]["exposure_cents"] == 1035
assert episode["data"]["unique_transaction_count"] == 2
page = get_card_timeline("TEST-CARD-01", page_size=1, scope=scope)
assert page["coverage"]["complete"] is False
assert page["coverage"]["nextCursor"]
```

- [ ] **Confirm red.** Run `uv run --project pipelines pytest graph/tests/test_timeline_episode.py -q`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Implement bounded windows, baseline aggregates and deterministic pagination. Episode facts reject unresolved IDs and inaccessible future transactions. Return first/last activity, source card/customer IDs, exact amounts and duplicate handling. Expand affected records across all pages before total exposure is called complete.
- [ ] **Confirm green and review.** Run `uv run --project pipelines pytest graph/tests/test_timeline_episode.py -q` again, then relevant neighboring tests and type/build checks. **Acceptance:** Negative amounts sum by absolute value; duplicates count once; timestamp ties resolve stably; partial results are explicit and never silently treated as the complete episode.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p3.1): build-timeline-and-authoritative-episode-facts-queries`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P3.2 — Implement pattern candidates and counterevidence

**Depends on:** P3.1.  
**Files to create or extend:** graph/queries/detect_patterns.gsql; graph/queries/behavior_baseline.gsql; config/investigation.json; graph/tests/test_patterns.py.  
**Interface contract:** `detectPatterns(cardId, windows, scope): ToolReceipt<PatternFindings>` returns candidate type, observations, transaction IDs, detector config, counterevidence and unknown premises.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```python
testing = detect_patterns("TEST-CARD-TESTING", detector_config, scope)
assert testing["data"]["card_testing"]["small_count"] == 3
assert testing["data"]["card_testing"]["settlement_status"] == "unknown"
benign = detect_patterns("TEST-CARD-NEW-PHONE", detector_config, scope)
assert benign["data"]["device_novelty"] is True
assert "confirmed_fraud" not in benign["data"]
```

- [ ] **Confirm red.** Run `uv run --project pipelines pytest graph/tests/test_patterns.py -q`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Implement card-testing candidates, online bursts, amount/product deviation, new-device indicators, mixed-channel anomalies and recurring behavior candidates. Use history and observed source fields, not invented merchant/geolocation names. Return benign explanations and source evidence; do not issue an automatic fraud verdict from a new phone or risk score. Version the proposed small-amount/follow-on windows.
- [ ] **Confirm green and review.** Run `uv run --project pipelines pytest graph/tests/test_patterns.py -q` again, then relevant neighboring tests and type/build checks. **Acceptance:** Test 2/3 transactions, one-hour boundaries, isolated legitimate purchases, repeated ordinary travel-like region activity, missing device, and missing merchant/status. Every claim points to actual fixture rows.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p3.2): implement-pattern-candidates-and-counterevidence`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P3.3 — Trace shared origins and run a real graph algorithm

**Depends on:** P3.1; P3.2.  
**Files to create or extend:** graph/queries/trace_shared_origins.gsql; graph/algorithms/bounded_component.gsql; graph/tests/test_shared_origins.py; packages/contracts/src/tools.ts.  
**Interface contract:** `traceSharedOrigins(...)` and `analyzeComponent(...)` return paths, related cards, time windows, origin quality and boundary coverage. Candidate, monitored and implicated card sets remain distinct.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```python
component = analyze_component(["TEST-TXN-RING"], window, limits, scope)
assert set(component["data"]["candidate_cards"]) == {"TEST-CARD-A", "TEST-CARD-B"}
assert "TEST-CARD-COMMON-DOMAIN" not in component["data"]["implicated_cards"]
assert component["data"]["algorithm_executed_in"] == "TigerGraph"
```

- [ ] **Confirm red.** Run `uv run --project pipelines pytest graph/tests/test_shared_origins.py -q`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Create a synthetic graph with a genuine time-bounded shared-origin candidate and unrelated cards sharing a common domain. Execute bounded traversal/component membership in GSQL/TigerGraph, not only in frontend JavaScript. Return the path evidence and filtering/truncation explanation. Device/region/domain links initiate investigation; they do not independently prove a coordinated actor.
- [ ] **Confirm green and review.** Run `uv run --project pipelines pytest graph/tests/test_shared_origins.py -q` again, then relevant neighboring tests and type/build checks. **Acceptance:** Known positive/negative component membership matches. High-degree weak origins do not explode traversal. Caps surface incompleteness; the UI can show a bounded subgraph without changing full episode arithmetic.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p3.3): trace-shared-origins-and-run-a-real-graph-algorithm`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P4 — Protected MCP and GraphRAG

### P4.1 — Expose protected, allowlisted domain tools through official MCP

**Depends on:** P0.3; P3.1; P3.2; P3.3.  
**Files to create or extend:** services/tigergraph-mcp/Dockerfile; services/tigergraph-mcp/auth_proxy.py; apps/agent/src/tools/mcp.ts; apps/agent/src/tools/registry.ts; tests/mcp.test.ts.  
**Interface contract:** `callGraphTool(name, args, scope): Promise<ToolReceipt<unknown>>`; registry maps only design tool names to pinned installed queries. Server-side enforcement rejects arbitrary query/schema operations.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
await expect(callGraphTool("drop_graph", {}, scope)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
await expect(callGraphTool("getCardTimeline", { limit: 1000000 }, scope)).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
expect(redactMcpLog({ Authorization: "secret" }).Authorization).not.toBe("secret");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/mcp.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Deploy the official MCP service on an approved CPU host with TLS/auth and no origin bypass. Prefer proven native Streamable HTTP; the fallback bridge must preserve official MCP semantics and tool receipts. Restrict credentials and add proxy enforcement when database grants are insufficient. Cloudflare connects with server-held credentials, fixed URL and compatible SDK version. Handle transport reset, expired sessions, typed errors and read retry budgets.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/mcp.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Live allowed query succeeds through MCP. Direct unauthorized requests and runtime arbitrary GSQL fail. No tools are exposed merely because the official server advertises them.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p4.1): expose-protected-allowlisted-domain-tools-through-official-m`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P4.2 — Index source-grounded documents and case narratives in TigerGraph

**Depends on:** P2.2; P0.3.  
**Files to create or extend:** pipelines/src/fraud_data/documents.py; pipelines/src/fraud_data/embed.py; graph/schema/document_vectors.gsql; pipelines/tests/test_documents.py; reports/retrieval-index.json.  
**Interface contract:** `chunk_documents(sources) -> DocumentChunk[]`; `embed_and_load(chunks, model_config) -> IndexReceipt` records source locators/hashes, trust class, model, dimension and eligible times.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```python
chunks = chunk_documents([policy_source, historical_case_source])
assert all(c["source_hash"] and c["locator"] for c in chunks)
assert next(c for c in chunks if c["rule_id"] == "R10")["text"] == expected_r10_text
with pytest.raises(ValueError):
    validate_embedding([0.1, 0.2], expected_dimension=3)
```

- [ ] **Confirm red.** Run `uv run --project pipelines pytest pipelines/tests/test_documents.py -q`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Chunk policy by rule and cases by coherent narrative; preserve provenance. Use a pretrained embedding model with recorded query/document settings. Store/search vectors in TigerGraph. Add only a small selected set of external narrative/typology documents after extraction checks; label their source and do not let them overwrite policy thresholds. Missing PDF text requires page inspection; no fake citations or invented section names.
- [ ] **Confirm green and review.** Run `uv run --project pipelines pytest pipelines/tests/test_documents.py -q` again, then relevant neighboring tests and type/build checks. **Acceptance:** Real vector search returns expected indexed content. Dimension/model mismatch fails visibly. Existing verified chunks are reused by content hash, and exact rule retrieval does not depend on semantic ranking.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p4.2): index-source-grounded-documents-and-case-narratives-in-tiger`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P4.3 — Combine graph evidence and eligible case/document retrieval

**Depends on:** P4.1; P4.2.  
**Files to create or extend:** apps/agent/src/tools/retrieval.ts; packages/domain/src/evidence-packet.ts; graph/queries/retrieve_history.gsql; tests/retrieval.test.ts.  
**Interface contract:** `retrieveSimilarCases(query, entityIds, scope)`; `retrievePolicyContext(ruleIds, query, scope)`; `buildEvidencePacket(receipts, budget)` returns a compact packet with counterevidence and coverage.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const hits = filterEligibleHistory(historyFixtures(), scope, { excludeCaseId: "TEST-CC-TARGET" });
expect(hits.map(h => h.id)).not.toContain("TEST-CC-TARGET");
expect(hits.map(h => h.id)).not.toContain("TEST-CC-FUTURE");
expect(hits.every(h => h.trustClass === "organizer_history")).toBe(true);
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/retrieval.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Join structural relevance and vector relevance with exact source locators. Enforce date and held-out exclusions before model context construction. Separate generated/simulated memory from organizer truth and keep canonical similar_prior_cases historical-only. If filtering removes top-k, retrieve further eligible candidates or report limited recall. Never insert raw 590k-row data into context.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/retrieval.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** No target label or future case reaches a historical evaluation prompt. Simulated replies stay tainted after retrieval. Relevant cleared cases and counterevidence can be returned, and every packet claim resolves to a receipt.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p4.3): combine-graph-evidence-and-eligible-case/document-retrieval`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P5 — Deterministic policy and canonical outputs

### P5.1 — Implement policy predicates and exact approval routing

**Depends on:** P1.1; P1.2.  
**Files to create or extend:** packages/policy/src/facts.ts; packages/policy/src/rules.ts; packages/policy/src/routes.ts; tests/policy-boundaries.test.ts.  
**Interface contract:** `routeAction(action, exposureCents): Route`; `evaluateRulePredicates(facts, assessment): RuleFinding[]`; findings include obligations, prohibitions, missing premises and source rule references.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
expect(routeAction("BLOCK_CARD", 250000)).toBe("L1");
expect(routeAction("BLOCK_CARD", 250001)).toBe("L2");
expect(routeAction("FILE_REPORT", 0)).toBe("L2");
expect(routeAction("DECLINE_TRANSACTION", 0)).toBe("L1");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/policy-boundaries.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Implement all 14 action identifiers, R1–R10, case/SAR triggers, and unknown-aware predicates from the design. Write the complete monetary/probability/time boundary table as parameterized tests. Distinguish an action being permitted from being required, and a shared profile from several cards with supported fraud. Keep dataset policy separate from external regulatory context.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/policy-boundaries.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** All source rules have positive, negative, unknown and applicable boundary tests. Neither missing settlement nor unknown merchant identity becomes a satisfied predicate. L1/L2 actions never receive auto route.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p5.1): implement-policy-predicates-and-exact-approval-routing`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P5.2 — Resolve explicit conflicts and enforce defensible stopping

**Depends on:** P5.1; P1.3 for evidence-family fixtures.  
**Files to create or extend:** packages/policy/src/evaluate.ts; packages/domain/src/stop.ts; packages/domain/src/evidence-independence.ts; tests/policy-conflicts-stop.test.ts; docs/references/policy-interpretations.md.  
**Interface contract:** `evaluatePolicy(facts, assessment): PolicyDecision`; `decideStop(assessment, evidence, unresolved, budget): StopDecision`; source conflicts return visible explanation and review requirements.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const result = evaluatePolicy(facts({ customerDenied: "true", recurringSameMerchant: "true", recurringSameAmount: "true", recurringMonthly: "true", recurringBelongsToCustomer: "true" }), assessment());
expect(result.actions.map(a => a.action)).not.toContain("BLOCK_CARD");
expect(result.interpretations).toContain("R2_R7_specific_exception");
expect(decideStop(assessment({ probability: 0.90 }), duplicateEvidence(), [], budget()).settled).toBe(false);
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/policy-conflicts-stop.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Implement the proposed R2/R7 exception transparently and R3 scope/conflict behavior. Retain contradictory evidence; do not silently turn uncertain into legitimate. Deduplicate underlying facts for the independence check. Budget/timeout stops are operational pauses or escalations, never proof. Include evidence-family rationale and record that independence tagging is a review aid rather than a statistical theorem.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/policy-conflicts-stop.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** R8 conflicting evidence escalates below $500 too. Two paraphrases do not satisfy the two-evidence stop. R10 prohibition survives all other rules. No same-scope contradictory final actions remain hidden.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p5.2): resolve-explicit-conflicts-and-enforce-defensible-stopping`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P5.3 — Build the answer compiler and semantic/provenance validator

**Depends on:** P5.1; P5.2; P1.1; P1.2.

**Integration note:** Live episode-query integration is verified in P7.3; the compiler uses the P1 contract and fixture port here.  
**Files to create or extend:** packages/exporter/src/compile.ts; packages/exporter/src/validate.ts; packages/exporter/src/narratives.ts; tests/exporter.test.ts.  
**Interface contract:** `compileAnswer(snapshot, sourceIndex, metrics): Answer`; `validateAnswer(answer, sourceIndex, receipts): ValidationReport`; errors have field paths, source requirements and repair ownership.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const answer = validAnswer();
answer.sar.file = true;
answer.next_best_actions.final = [];
expect(validateAnswer(answer, sourceIndex(), receipts()).errors.map(e => e.code)).toContain("SAR_ACTION_MISMATCH");
answer.case.affected_txn_ids = ["NONEXISTENT"];
expect(validateAnswer(answer, sourceIndex(), receipts()).errors.map(e => e.code)).toContain("UNKNOWN_ENTITY");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/exporter.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Compile arithmetic, IDs, dates, metrics and persistence fields from trusted records. Validate all field and cross-field requirements in design §13. Add narrative validators for supported entities/figures/assumptions and factual action status; sentence-length heuristics are supplemented by human review. Keep extra run metadata out of cases/*.json. Define a business-payload hash that excludes its own persistence receipt to avoid circular validation.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/exporter.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Legitimate answers clear exposure and SAR. FILE_REPORT and sar.file agree. No-request initial/final arrays are identical. A failed/unverified graph write cannot export written_to_graph=true.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p5.3): build-the-answer-compiler-and-semantic/provenance-validator`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P6 — Durable execution, evidence and authorization

### P6.1 — Persist case identity, revisions and append-only events

**Depends on:** P1.3; P5.3.  
**Files to create or extend:** apps/agent/src/case-agent/CaseAgent.ts; apps/agent/src/case-agent/store.ts; apps/agent/src/case-agent/migrations.ts; tests/worker/case-store.test.ts.  
**Interface contract:** `CaseAgent` is a SQLite-backed `Agent`; `applyCommand(command, principal): CommandReceipt`; `loadSnapshot(): CaseSnapshot`; `appendEvent(event, expectedRevision)` is atomic and idempotent.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const h = await createHarness({ evidenceClass: "local-runtime" });
await h.command({ type: "START", key: testKey(), idempotencyKey: "start-1" });
await h.restart();
await h.command({ type: "START", key: testKey(), idempotencyKey: "start-1" });
expect((await h.events()).filter(e => e.type === "CASE_STARTED")).toHaveLength(1);
```

- [ ] **Confirm red.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/case-store.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Implement app-owned tables from design §10 with schema migrations and version checks. Preserve immutable initial/final assessment revisions, source hashes and simulation provenance. Use workspace/run/case identity, not connection identity. Publish a safe projection, not privileged records through SDK state. Keep invalid state transitions as typed failures.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/case-store.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Actual local DO restart retains case/events. Duplicate starts reuse the run. Migration round-trip test preserves history. A client cannot overwrite privileged state through generic state sync.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p6.1): persist-case-identity-revisions-and-append-only-events`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P6.2 — Add bounded work leases, continuation and recovery

**Depends on:** P6.1.  
**Files to create or extend:** apps/agent/src/case-agent/scheduler.ts; apps/agent/src/case-agent/lease.ts; apps/agent/src/case-agent/recovery.ts; tests/worker/recovery.test.ts.  
**Interface contract:** `claimWork(expectedRevision): Lease`; `commitWork(lease, result)` rejects stale fences; `scheduleContinuation(reason)` records recoverable work using the SDK scheduler.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const h = await createHarness({ evidenceClass: "local-runtime" });
const lease = await h.claimWork();
await h.expireAndRecoverLease();
await expect(h.commitWork(lease, { result: "late" })).rejects.toMatchObject({ code: "STALE_REVISION" });
expect((await h.snapshot()).lastResult).not.toBe("late");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/recovery.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Create durable operation intents before awaits; verify fences after external calls. Recover expired leases with a newer fence. Schedule bounded passes and reconcile intended schedules after interruption; make duplicate callback delivery harmless. Use one SDK scheduling owner, never a second raw alarm dispatcher. Cancellation fences future work while retaining past effects.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/recovery.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Duplicate callbacks yield one visible transition. Browser disconnect does not cancel the investigation. A late provider result cannot overwrite a newer decision. No concurrency lock is held across network I/O.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p6.2): add-bounded-work-leases-continuation-and-recovery`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P6.3 — Implement controlled evidence requests and virtual-time simulation

**Depends on:** P6.1; P6.2; P5.2.  
**Files to create or extend:** apps/agent/src/simulation/evidence.ts; apps/agent/src/case-agent/evidence-requests.ts; config/simulation-profiles/; tests/worker/evidence-simulation.test.ts.  
**Interface contract:** `requestEvidence(request, decisionRevision)` persists request before response; `consumeEvidenceResponse(requestId, response, principal)` validates scope, source and revision; simulator uses the same path.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const h = await createHarness({ simulation: "denies" });
const request = await h.requestEvidenceForSeed();
await h.deliverEvidence(request.id);
await h.deliverEvidence(request.id);
const events = await h.events();
expect(events.filter(e => e.type === "EVIDENCE_CONSUMED")).toHaveLength(1);
expect(events.findIndex(e => e.type === "INITIAL_DECISION_RECORDED")).toBeLessThan(events.findIndex(e => e.type === "EVIDENCE_CONSUMED"));
```

- [ ] **Confirm red.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/evidence-simulation.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Add explicit confirms/denies/no-response/step-up/analyst profiles. Record assumptions, scope, asked-after step and simulation origin. Never select a reply from a hidden or desired verdict. Advance virtual 2016 time for the no-response branch, not real wall-clock 24h. Keep existing source customer-report triggers distinct from assumed replies. Reject stale/conflicting duplicate response mutation.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/evidence-simulation.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Initial decision exists before any response is consumed. No-response R4 runs at virtual 24h. Simulation taint reaches graph memory, summary and SAR. Absent team profile defaults to disclosed no-response, not invented confirmation.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p6.3): implement-controlled-evidence-requests-and-virtual-time-simu`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P6.4 — Project cases to TigerGraph with a durable outbox and readback

**Depends on:** P6.1; P4.1; P5.3.  
**Files to create or extend:** apps/agent/src/projections/outbox.ts; apps/agent/src/projections/tigergraph.ts; graph/queries/upsert_investigation.gsql; graph/queries/read_investigation.gsql; tests/worker/projection.test.ts.  
**Interface contract:** `persistCaseProjection(snapshot, operationId): ProjectionReceipt`; `reconcileProjection(operationId)` compares stored business revision/hash before reporting success.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const h = await createHarness();
await h.injectFault("graph-write-succeeded-response-lost");
await h.projectCurrentCase();
await h.restart();
await h.flush();
expect(await h.graphCaseCount()).toBe(1);
expect((await h.snapshot()).projection.verified).toBe(true);
```

- [ ] **Confirm red.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/projection.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Commit outbox intent with the case revision, write only allowed investigation types, and read back the actual graph record/hash. Use stable operation IDs and revision-specific storage so older writes cannot overwrite newer projections. Reconcile success-with-lost-response instead of blindly creating another case. Keep model assessments and simulations out of organizer-history truth. Add the required two-case memory test: persist case A, retrieve it from a later related case B in memory-enabled mode, and assert its simulation/agent provenance survives. This is not optional just because scored runs use a frozen history snapshot.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/projection.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Partial failure preserves DO state and pending projection. Duplicate retry creates no duplicate case. Export reports graph success only after readback; projection lag is visible.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p6.4): project-cases-to-tigergraph-with-a-durable-outbox-and-readba`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P6.5 — Protect commands and live connections with authenticated scope

**Depends on:** P6.1; P6.2; P5.3.  
**Files to create or extend:** apps/agent/src/index.ts; apps/agent/src/auth/principal.ts; apps/agent/src/auth/authorize.ts; apps/agent/src/auth/origin.ts; apps/agent/src/routes/cases.ts; tests/auth-api.test.ts.  
**Interface contract:** `authenticate(request): Principal`; `authorize(principal, operation, caseKey)`; protected routes for start/status/events/evidence/approval/export. Case identity is derived from authorized server-side workspace/run scope.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const request = new Request("https://app.test/api/cases/TEST-CASE-01/start", {
  method: "POST", body: JSON.stringify({ role: "L2", workspaceId: "other" })
});
expect((await testApp.fetch(request)).status).toBe(401);
expect(await allowedFor(analystPrincipal(), "approve:L2")).toBe(false);
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/auth-api.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Implement one clear session/Access-based auth approach selected in the readiness decision log; keys and roles are server-held. Authorize HTTP and live-channel connects, guard client state mutation, enforce Origin/CSRF, body limits and rate limits. Start requests accept an idempotency key; mutating revision-sensitive commands include expectedRevision. Batch service credentials start/read/export only and cannot approve.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/auth-api.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Unauthenticated requests fail; forged role/body claims fail; cross-workspace reads/writes fail; unauthorized live connections receive no case data. Safe read routes never expose secrets or raw private state.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p6.5): protect-commands-and-live-connections-with-authenticated-sco`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P6.6 — Gate and reconcile simulated action execution

**Depends on:** P6.5; P6.3; P6.4; P5.1.  
**Files to create or extend:** apps/agent/src/case-agent/actions.ts; apps/agent/src/simulation/actions.ts; apps/agent/src/auth/approvals.ts; tests/worker/approvals.test.ts.  
**Interface contract:** `approveAction(actionId, expectedRevision, payloadHash, principal)` creates a bound approval; `executeApprovedAction(...)` checks current facts and stores one operation receipt.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const h = await createHarness();
const action = await h.stageAction({ action: "FILE_REPORT", route: "L2" });
await expect(h.approve(action.id, l1Principal())).rejects.toMatchObject({ code: "UNAUTHORIZED" });
await h.changeDecisionExposure();
await expect(h.approve(action.id, l2Principal())).rejects.toMatchObject({ code: "STALE_REVISION" });
```

- [ ] **Confirm red.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/approvals.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Bind approval to action/targets/exposure/policy/decision hash and authenticate the approver. Separate recommended, pending, approved, rejected, executing, executed, failed and unknown. Implement only mock financial adapters, but do not bypass authorization for them. Auto actions use the same idempotent execution journal. Reconcile unknown delivery before retrying.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/approvals.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** No L1/L2 action executes without a current authorized approval. Changing exposure can increase route and invalidates approval. Duplicate approval/execute calls create one mock effect. SAR drafts do not claim a filing occurred.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p6.6): gate-and-reconcile-simulated-action-execution`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P7 — NVIDIA integration and first live outcome

### P7.1 — Implement the tested NVIDIA model adapter

**Depends on:** P0.3; P1.1; P1.3.  
**Files to create or extend:** apps/agent/src/providers/nim.ts; apps/agent/src/providers/usage.ts; tests/nim-adapter.test.ts; config/model-capabilities.json.  
**Interface contract:** `invokeNim(messages, tools, options): ModelTurn` returns validated text/tool proposals, observed usage and provider request metadata. Only capability-tested options are sent.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const result = await invokeNimWithFixture("two-round-tools.json");
expect(result.turns[1].toolResults[0].toolCallId).toBe(result.turns[0].toolCalls[0].id);
expect(result.usage.source).toBe("provider");
await expect(invokeNimWithFixture("malformed-tool-arguments.json")).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/nim-adapter.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Use a fixed approved NVIDIA origin and server-side key. Support correct assistant/tool message round trips, non-streaming core responses, timeouts, 429 retry-after and bounded retries. Streaming is optional and requires fragmented tool-argument assembly before execution. Record model/options/version, avoid secret logs, and implement one bounded schema repair without fabricating facts. Do not silently replace NIM with another provider.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/nim-adapter.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Valid multi-turn tool use passes live. Malformed/partial arguments never execute. Unknown usage is not claimed as observed zero. Provider errors leave a recoverable workflow state.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p7.1): implement-the-tested-nvidia-model-adapter`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P7.2 — Integrate the bounded investigation loop with policy and durable state

**Depends on:** P7.1; P6.1–P6.6; P4.3; P5.3.  
**Files to create or extend:** apps/agent/src/case-agent/investigate.ts; packages/domain/src/assessment.ts; packages/domain/src/evidence.ts; apps/agent/src/prompts/investigation.ts; tests/investigation-loop.test.ts.  
**Interface contract:** `advanceInvestigation(caseKey, lease, ports): PassResult` uses the real domain tools, validates assessment proposals, records decisions, consumes controlled evidence, projects and compiles output.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const h = await createHarness({ modelScript: "weak-signal-then-denial", simulation: "denies" });
await h.command({ type: "START", key: testKey(), idempotencyKey: "loop-1" });
await h.flush();
const answer = await h.answer();
expect(answer.next_best_actions.initial.some(a => a.action === "VERIFY_WITH_CUSTOMER")).toBe(true);
expect(answer.next_best_actions.final.find(a => a.action === "BLOCK_CARD").route).toBe("L1");
expect(await h.executedActions()).not.toContain("BLOCK_CARD");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/investigation-loop.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Build the observe/query/assess/policy/request/reassess/persist/export loop. All claims and affected IDs must resolve to receipts. Include counterevidence, unknown predicates and provenance. Record real usage and invocation events from the beginning. Limit tools/turns, handle stale leases, and preserve a valid unresolved state on failure. Chat questions use a read-only explanation mode unless an explicit command initiates further investigation.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/investigation-loop.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** End-to-end fixture branches cover fraud, legitimate, uncertainty, unknown pattern, missing data and policy conflict. No hard-coded case verdicts. No model-set approval, exposure, metrics or graph-success flags are trusted.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p7.2): integrate-the-bounded-investigation-loop-with-policy-and-dur`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P7.3 — Prove the first complete source case on live services

**Depends on:** P7.2; P2.3; P4.1; P6.5.  
**Files to create or extend:** scripts/one-case-smoke.ts; tests/live/one-case.test.ts; reports/first-live-case/; docs/references/manual-case-walkthrough.md.  
**Interface contract:** `runOneCase(caseId, runId, profile): LiveCaseReceipt` calls the protected deployed start/status/export API; same agent implementation as the UI/batch runner.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const result = await runOneCase(sourceCaseId, uniqueRunId, "no_response");
expect(result.providers).toEqual(expect.arrayContaining(["NVIDIA", "TigerGraphMCP"]));
expect(result.answer.case.written_to_graph).toBe(true);
expect(result.validation.errors).toEqual([]);
expect(result.graphReadback.businessHash).toBe(result.businessHash);
```

- [ ] **Confirm red.** Run `pnpm test:live -- tests/live/one-case.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Pick one actual source case after manual inspection without copying the README example. Run NIM, official MCP, graph queries, document retrieval, policy, simulation, outbox readback and export. Interrupt/reconnect the client once. Save redacted trace and independent manual review. If source semantics remain blocked, report that failure; do not replace this gate with a synthetic case.
- [ ] **Confirm green and review.** Run `pnpm test:live -- tests/live/one-case.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** First working milestone achieved only with live receipts, valid source IDs and persisted graph output. The report distinguishes observed evidence, assumed response and unapproved actions. No hidden-key accuracy claim.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p7.3): prove-the-first-complete-source-case-on-live-services`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P8 — Analyst web product

### P8.1 — Build the analyst case workspace and conversational surface

**Depends on:** P7.3; P6.5.  
**Files to create or extend:** apps/web/src/cases/CaseList.tsx; apps/web/src/cases/CaseWorkspace.tsx; apps/web/src/chat/CaseChat.tsx; apps/web/src/api.ts; tests/e2e/workspace.spec.ts.  
**Interface contract:** Browser uses authenticated server routes and source case IDs; `CaseViewModel` is the safe presentation projection. Chat mode distinguishes explanation from mutation.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
await page.goto("/cases/TEST-CASE-01");
await expect(page.getByText("Bank risk score", { exact: true })).toBeVisible();
await expect(page.getByText("Assessed fraud probability", { exact: true })).toBeVisible();
await page.getByRole("textbox", { name: "Ask about this case" }).fill("Why this recommendation?");
await page.getByRole("button", { name: "Send" }).click();
await expect(page.getByTestId("case-revision")).toHaveText("1");
```

- [ ] **Confirm red.** Run `pnpm exec playwright test tests/e2e/workspace.spec.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Implement case list, selected case header, bank score versus assessment, progress, evidence request state, and read-only explanation chat. Provide loading/empty/unauthorized/unavailable states. Explicit action controls start/resume/cancel with the correct idempotency and revision semantics. Do not make every chat message rerun investigation. Keep app assets and secrets separated.
- [ ] **Confirm green and review.** Run `pnpm exec playwright test tests/e2e/workspace.spec.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Case selection and explanation work without mutating a frozen assessment. Browser refresh reopens the same case. Keyboard navigation and responsive layout work. Error states distinguish no data from service failure.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p8.1): build-the-analyst-case-workspace-and-conversational-surface`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P8.2 — Expose evidence, bounded graph and report provenance

**Depends on:** P8.1; P3.3; P5.3.  
**Files to create or extend:** apps/web/src/evidence/Timeline.tsx; apps/web/src/evidence/GraphView.tsx; apps/web/src/evidence/EvidenceDrawer.tsx; apps/web/src/reports/ReportPreview.tsx; tests/e2e/evidence.spec.ts.  
**Interface contract:** Clicking evidence/path resolves a ToolReceipt-backed view; graph rendering consumes bounded source-derived node/edge data and has an accessible table alternative.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
await page.goto("/cases/TEST-CASE-01");
await page.getByRole("button", { name: "Open evidence 1" }).click();
await expect(page.getByText("Simulated response", { exact: true })).toBeVisible();
await expect(page.getByRole("table", { name: "Connected entities" })).toBeVisible();
await expect(page.getByText("Pending L2 approval", { exact: true })).toBeVisible();
```

- [ ] **Confirm red.** Run `pnpm exec playwright test tests/e2e/evidence.spec.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Add ordered evidence/decision timeline, observed-versus-assumed badges, query/source locators, graph path inspector, counterevidence and coverage warnings. Show initial/final differences and policy references. SAR preview distinguishes recommended filing from executed filing and preserves simulated qualifications. Escape HTML and sanitize Markdown; show exact source names/codes rather than invented display identities.
- [ ] **Confirm green and review.** Run `pnpm exec playwright test tests/e2e/evidence.spec.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Every displayed evidence link resolves. Partial graph coverage is visible. A synthetic prompt-injection string renders as text and cannot execute. SAR/JSON preview agrees with the exporter.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p8.2): expose-evidence-bounded-graph-and-report-provenance`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P8.3 — Implement role-aware approvals and replay-safe live updates

**Depends on:** P8.1; P8.2; P6.6.  
**Files to create or extend:** apps/web/src/approvals/ApprovalPanel.tsx; apps/web/src/cases/live-events.ts; apps/web/src/cases/connection-state.ts; tests/e2e/approval-reconnect.spec.ts.  
**Interface contract:** Client processes `{sequence,eventId,revision,payload}` with dedupe and snapshot recovery. Approval requests bind displayed action hash/revision and are reauthorized on the server.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
await page.goto("/cases/TEST-CASE-01");
await expect(page.getByRole("button", { name: "Approve L2 action" })).toBeDisabled();
await simulateReconnectWithDuplicateEvents(page);
await expect(page.getByTestId("action-row")).toHaveCount(1);
await expect(page.getByText("Connection restored", { exact: true })).toBeVisible();
```

- [ ] **Confirm red.** Run `pnpm exec playwright test tests/e2e/approval-reconnect.spec.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Implement sequenced event replay, reconnect cursor, snapshot fallback, duplicate suppression and stale revision handling. Explain disabled role controls. Authorized reviewers see exact scope/exposure before approval. A changed recommendation invalidates the visible approval and prompts review. Simulator controls are restricted to demo-authorized roles and never masquerade as external customer evidence.
- [ ] **Confirm green and review.** Run `pnpm exec playwright test tests/e2e/approval-reconnect.spec.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Two clients see one consistent case history. Replayed events do not duplicate actions. Unauthorized roles cannot approve via UI or forged API calls. Reconnect retains pending approvals and case progress.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p8.3): implement-role-aware-approvals-and-replay-safe-live-updates`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P9 — Benchmark and evaluation

### P9.1 — Audit invocation metrics and expose truthful observability

**Depends on:** P7.2; P8.2.  
**Files to create or extend:** packages/domain/src/metrics.ts; scripts/metrics-report.ts; apps/web/src/cases/MetricsPanel.tsx; tests/metrics.test.ts.  
**Interface contract:** `summarizeUsage(events, exportBoundary): MetricsSummary` separates graph calls, cache/retry counts, LLM tokens, embedding usage, wall latency, active time and estimation/missing status.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const metrics = summarizeUsage(usageEventsWithRetryAndVirtualDay(), exportBoundary());
expect(metrics.graphPhysicalCalls).toBe(3);
expect(metrics.virtualElapsedSeconds).toBe(86400);
expect(metrics.latencySeconds).toBe(12);
expect(metrics.tokenUsageStatus).toBe("provider_observed");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/metrics.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Reconcile the invocation ledger already produced by the agent with actual provider responses. Count graph/retrieval writes/readbacks as documented and cache hits separately. Freeze export metrics after required readback. Display incomplete/estimated usage rather than fake zero; retain tokenizer/method metadata for defensible estimates. Add redacted request tracing tied to run/case/operation IDs.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/metrics.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Exported metrics are generated by code, not LLM text. Real versus virtual time remains distinct. Lost response/usage gaps are visible. Logs and UI never reveal service credentials.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p9.1): audit-invocation-metrics-and-expose-truthful-observability`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P9.2 — Run and validate all 20 cases through the real agent

**Depends on:** P7.3; P9.1; P5.3.  
**Files to create or extend:** scripts/batch.ts; scripts/validate-cases.ts; tests/batch.test.ts; reports/runs/; cases/.  
**Interface contract:** `runBatch(casePack, runConfig): BatchReport` uses protected application APIs, concurrency 2 by default, stable run/case idempotency and restartable export. `validateCaseSet(directory, casePack)` enforces exact membership.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const report = validateCaseSet(syntheticAnswersMissingOneCase(), syntheticCasePack());
expect(report.valid).toBe(false);
expect(report.errors.map(e => e.code)).toContain("MISSING_CASE");
expect(validateCaseSet(answersWithExtraCase(), syntheticCasePack()).valid).toBe(false);
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/batch.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Implement resumable CLI with --run-id, explicit profile, dataset/policy/model versions and bounded concurrency. Read the case list from source; never hard-code outputs or branch by desired verdict. Export exactly 20 files from the deployed agent, verify each graph record and run semantic/source validation. Preserve failed/blocked cases as report entries rather than fabricated successful exports. Write additional monitoring cases only outside canonical cases/.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/batch.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Live batch ends with exactly the source case set, all fields present, source-resolving IDs and verified graph writes. Conformance is reported separately from unknown hidden-key accuracy. Rerun resumes instead of creating duplicate cases.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p9.2): run-and-validate-all-20-cases-through-the-real-agent`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P9.3 — Evaluate historical proxy cases without label leakage

**Depends on:** P9.1; P4.3; P2.3.  
**Files to create or extend:** pipelines/src/fraud_data/evaluation_split.py; scripts/evaluate.ts; tests/evaluation-leakage.test.ts; reports/evaluation/.  
**Interface contract:** `buildHistoricalSplit(history, config): EvaluationSplit`; `evaluatePredictions(predictions, labels): EvaluationReport`; all outputs label reconstructed triggers/windows as a proxy task.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const packet = buildHeldOutPacket("TEST-CC-TARGET", eligibleHistory());
expect(JSON.stringify(packet)).not.toContain("TARGET_FINAL_ANALYST_NOTE");
expect(packet.features).not.toHaveProperty("outcome");
expect(packet.features).not.toHaveProperty("final_affected_txn_membership");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/evaluation-leakage.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Create a declared chronological split using available July–October cases. Audit retrieval/features for target notes, outcome edges, duplicate narrative leakage, future cases and final episode membership. Run frozen configurations and calculate Brier/log loss, precision/recall, class support and reliability bins with sample-size caveats. Do not use the 20 benchmark cases as a calibration fitting set or force a 50/50 verdict mix.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/evaluation-leakage.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Evaluation is reproducible and explicitly proxy-based where original triggers are absent. Leakage tests pass. No 20-case hidden accuracy claim. Any tuning change gets a new run/version rather than overwriting prior results.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p9.3): evaluate-historical-proxy-cases-without-label-leakage`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P10 — Deployed reliability and security

### P10.1 — Deploy isolated protected services and verify migration/recovery paths

**Depends on:** P8.3; P9.2.  
**Files to create or extend:** services/tigergraph-mcp/deploy.md; apps/agent/wrangler.jsonc; scripts/deploy-check.ts; docs/references/deployment-runbook.md; tests/live/deployment.test.ts.  
**Interface contract:** `verifyDeployment(target): DeploymentReport` checks authenticated Worker/DO, fixed MCP origin, real NIM access, vector capability, migrations, source versions and teardown inventory.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const check = await verifyDeployment(approvedTarget);
expect(check.publicMcpWithoutAuth.status).toBe(401);
expect(check.runtimeCanModifySchema).toBe(false);
expect(check.graphVectorProbe.passed).toBe(true);
expect(check.workerVersion).toBe(check.expectedWorkerVersion);
```

- [ ] **Confirm red.** Run `pnpm test:live -- tests/live/deployment.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Confirm account/project/resource names before writes. Deploy static assets/Worker/DO migrations and the pinned protected MCP service only to authorized targets. Set secrets through approved secret storage. Test unauthorized origin access, runtime least privilege, warmup/start behavior and graph auto-stop/auto-start configuration when applicable. Record last-good deployment and data recovery procedure; never promise destructive migrations are automatically reversible.
- [ ] **Confirm green and review.** Run `pnpm test:live -- tests/live/deployment.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Deployed UI and service paths work together. No bypass exposes MCP admin tools. Version mismatch blocks release. Team can identify resources/cost controls and follow the documented recovery/teardown procedure.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p10.1): deploy-isolated-protected-services-and-verify-migration/reco`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P10.2 — Inject failures and test authorization, replay and prompt-injection defenses

**Depends on:** P10.1; P6.2; P6.6; P9.1.  
**Files to create or extend:** scripts/failure-drill.ts; tests/worker/fault-matrix.test.ts; tests/e2e/security.spec.ts; reports/failure-drills/.  
**Interface contract:** `runFailureDrill(scenario, target): DrillReceipt` names the injected fault, expected invariant, actual outcome and evidence class.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const h = await createHarness();
await h.injectFault("model-note-requests-L2-bypass");
await h.command({ type: "START", key: testKey(), idempotencyKey: "security-1" });
await h.flush();
expect(await h.executedActions()).not.toContain("FILE_REPORT");
expect((await h.snapshot()).unauthorizedToolExecutions).toBe(0);
```

- [ ] **Confirm red.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/fault-matrix.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Exercise NIM 429/timeout/invalid JSON, MCP reset/auth expiry, graph partial write, response lost after action, browser disconnect, duplicate callbacks, stale approval, simultaneous clients, future memory, forged roles, unsafe source text and disallowed tool names. Use tiny controlled resources for live drills; do not attack unrelated endpoints. Record what truly ran and any limits on restart simulation.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run --config vitest.workers.config.ts tests/worker/fault-matrix.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** No unauthorized or duplicate mock effect. Restart yields consistent case state. Upstream failure is visible and recoverable. Prompt/source text cannot grant authority, leak secrets or change tool endpoints.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p10.2): inject-failures-and-test-authorization-replay-and-prompt-inj`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P10.3 — Verify resource limits, completeness and accessible fallback behavior

**Depends on:** P10.2; P8.2; P9.1.  
**Files to create or extend:** scripts/resource-check.ts; tests/e2e/accessibility.spec.ts; tests/tool-budgets.test.ts; reports/resource-review.json.  
**Interface contract:** `reviewResourceUsage(traces, limits): ResourceReport`; graph/UI caps, payload budgets and critical-path latency are measured against configured targets.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const result = summarizeCappedEpisode({ returned: 200, available: 450, nextCursor: "page-2" });
expect(result.complete).toBe(false);
expect(result.canClaimTotalExposure).toBe(false);
expect(result.nextAction).toBe("paginate_or_report_unresolved");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/tool-budgets.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Measure representative cases including a high-degree profile and long card history. Keep raw CSVs and large receipts out of Worker memory/bundle, and bound simultaneous requests. Confirm budget stops are not false decisions. Check graph table alternative, keyboard/focus states, narrow-window layout, source text escaping and projection-unavailable behavior. Record observed latency without claiming unmeasured throughput.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/tool-budgets.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Caps do not hide incomplete investigation scope. UI remains usable without graph rendering or token streaming. No memory/quota warning is concealed by retry loops.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p10.3): verify-resource-limits-completeness-and-accessible-fallback-`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P11 — Release and submissions

### P11.1 — Freeze the reproducible release and verify the full case package

**Depends on:** P9.2; P9.3; P10.3.  
**Files to create or extend:** scripts/verify-release.ts; reports/release-manifest.json; submission/checklist.md; README.md; cases/; tests/release-check.test.ts.  
**Interface contract:** `verifyRelease(repo, manifests, receipts): ReleaseReport` checks required artifacts, exact 20 cases, source/config/code hashes, test evidence classes, unresolved decisions and secret scan results.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const result = verifyRelease(releaseFixture({ graphReadbacks: 19, expectedCases: 20 }));
expect(result.ready).toBe(false);
expect(result.errors).toContain("MISSING_GRAPH_READBACK");
expect(verifyRelease(releaseFixture({ secretLeak: true })).ready).toBe(false);
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/release-check.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Run clean frozen installs, typecheck, tests, build, live smoke, batch conformance and secret scan. Document exact reproduction commands and approved environment variables without secrets. Freeze case outputs and manifests at a named commit; retain evaluation and failure reports. Make source ambiguities and unsupported claims visible. Do not mark blocked gates complete or merge without permission.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/release-check.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Another engineer can reproduce setup and inspect all case receipts. Release checklist has zero silently skipped requirements. No product-accuracy or production-readiness claim exceeds the evidence.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p11.1): freeze-the-reproducible-release-and-verify-the-full-case-pac`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P11.2 — Prepare every hackathon submission artifact

**Depends on:** P11.1.  
**Files to create or extend:** submission/demo-script.md; submission/blog.md; submission/social-post.md; submission/checklist.md; tests/submission-check.test.ts.  
**Interface contract:** `validateSubmissionInventory(root): SubmissionReport` verifies working-agent link/reference, repository, cases, video status, blog and social status without pretending drafts are published.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const inventory = validateSubmissionInventory(submissionFixture({ videoStatus: "script_only" }));
expect(inventory.complete).toBe(false);
expect(inventory.missing).toContain("recorded_demo_video");
expect(inventory.socialStatus).toBe("draft");
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/submission-check.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Write a 3–5 minute demo script using verified cases: suspicious-but-legitimate/uncertain restraint, and a graph-connected investigation with visible evidence and approval gating. Include interruption/recovery or memory evidence where it fits. Prepare architecture/implementation/learning/limitations blog and a social draft tagging @TigerGraphDB with a verified blog/demo link once available. Team records/uploads video and authorizes publication; list these as human-owned steps until actually done.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/submission-check.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** All source submission items are accounted for. Recorded video is distinguished from script; published blog/post from drafts. No invented demo links, user outcomes, customer replies or benchmark scores.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p11.2): prepare-every-hackathon-submission-artifact`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## P12 — Optional extensions

### P12.1 — Optional: train and serve an evaluated case-level risk estimator

**Depends on:** P11.1; explicit team scope approval.  
**Files to create or extend:** pipelines/src/fraud_data/train_case_model.py; packages/domain/src/optional-risk-model.ts; tests/risk-model-parity.test.ts; reports/model-card.md.  
**Interface contract:** `estimateCaseRisk(features, modelVersion): RiskSignal` returns an auxiliary score and model provenance; never action authority. Exported preprocessing is identical to training.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const score = estimateCaseRisk(parityFixture.features, parityFixture.version);
expect(Math.abs(score.probability - parityFixture.pythonProbability)).toBeLessThan(1e-6);
expect(score).not.toHaveProperty("approvalRoute");
expect(() => estimateCaseRisk(incompatibleFeatures(), parityFixture.version)).toThrow();
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/risk-model-parity.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Build only from eligible historical case labels and as-of features. Start with a simple interpretable baseline; compare against bank score and assessment on the predeclared proxy split. Do not label unlabeled transactions negative. Calibrate on held-out predictions, document selection bias/uncertainty, and deploy a small compatible model inside Worker or an authenticated CPU endpoint. Keep NIM as the LLM provider.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/risk-model-parity.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** Training/inference preprocessing parity passes and held-out evidence supports any claimed benefit. Failure to improve means leave the optional tool disabled. No core-policy or output regression.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p12.1): optional:-train-and-serve-an-evaluated-case-level-risk-estim`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

### P12.2 — Optional: monitor additional alerts without contaminating the benchmark

**Depends on:** P11.1; explicit team scope approval.  
**Files to create or extend:** apps/agent/src/monitoring/scan.ts; graph/queries/scan_alerts.gsql; scripts/run-monitor.ts; tests/monitoring.test.ts; monitoring-cases/.  
**Interface contract:** `scanAlerts(cursor, window, limits): AlertPage` starts the same case workflow with a distinct monitoring run/namespace; dedupe key derives from dataset/transaction/trigger policy.

- [ ] **Write the failing tests.** Include this focused assertion and all acceptance cases below:

```ts
const first = await scanAndAdmit(monitorFixture(), "scan-1");
const retry = await scanAndAdmit(monitorFixture(), "scan-1");
expect(first.admittedCaseIds).toEqual(retry.admittedCaseIds);
expect(first.outputDirectory).toBe("monitoring-cases");
expect(first.canonicalBenchmarkFilesAdded).toBe(0);
```

- [ ] **Confirm red.** Run `pnpm exec vitest run tests/monitoring.test.ts`. Before implementation, expect a missing behavior/import or the named invariant to fail; fix harness/setup failures before interpreting the result.
- [ ] **Implement the scoped deliverable.** Use bounded scheduled windows and restartable cursors to inspect bank-score alerts plus declared graph-pattern candidates. Preserve below-threshold fraud possibility and do not equate score with verdict. Reuse the same agent/policy, not a parallel decision engine. Keep costs and admission limits explicit; store additional investigations outside cases/ and count them as innovation only, as the README specifies.
- [ ] **Confirm green and review.** Run `pnpm exec vitest run tests/monitoring.test.ts` again, then relevant neighboring tests and type/build checks. **Acceptance:** No duplicate alert cases on retry, no unapproved actions, no changes to the canonical 20-case set, and generated monitoring memory remains source/trust separated.
- [ ] **Commit and record evidence.** Stage only this task's intended files, commit as `feat(p12.2): optional:-monitor-additional-alerts-without-contaminating-th`, and append the exact test/integration receipt to `reports/progress.md`. Do not include secrets or unrelated edits.

**Phase gate:** Apply the matching gate in design §17. Any unmet mandatory dependency remains blocked, regardless of fixture success.

---

## Coverage cross-check

| Design requirement | Implementing tasks |
|---|---|
| Source/authority and unresolved decisions (§1–3) | P0.1–P0.3, P2.1, P11.1 |
| Repo boundaries and data model (§4–5) | P1.1–P1.3, P2.1–P2.3 |
| Bounded tools and real graph algorithm (§6–7) | P3.1–P3.3, P4.1–P4.3 |
| Assessment, counterevidence and stopping (§8) | P5.2, P7.2 |
| All policy rules and approval routes (§9) | P5.1–P5.3, P6.6 |
| Persistence, leases, replay, projections (§10) | P6.1–P6.6, P8.3, P10.2 |
| Explicit evidence simulation (§11) | P6.3, P7.2, P9.2 |
| NVIDIA inference integration (§12) | P0.3, P7.1–P7.3 |
| Exact output and SAR integrity (§13) | P1.1, P5.3, P6.4, P9.2 |
| Usable chat/workspace and live recovery (§14) | P8.1–P8.3 |
| Evaluation, metrics and leakage controls (§15) | P9.1–P9.3, P10.3 |
| Secure deployment and failure checks (§16) | P6.5–P6.6, P10.1–P10.3 |
| Submission artifacts and truthful completion (§17–19) | P11.1–P11.2 |
| Optional learned model and monitoring | P12.1–P12.2 |

## Milestone completion receipts

**M1 — Trustworthy foundation:** P0–P5. Source graph, genuine graph algorithm, protected MCP/vector retrieval, and pure policy/export tests all supported by receipts.

**M2 — One complete live investigation:** P6–P7. One source case survives interruption, progresses through explicit evidence, obeys approval controls, persists and exports valid JSON.

**M3 — Analyst-ready and all-case complete:** P8–P9. Usable interface and exactly the 20 source answer files, validated without claiming access to hidden ground truth.

**M4 — Reproducible submission:** P10–P11. Deployed reliability/security evidence, frozen manifest, complete source-required submission inventory. Human recording/publication steps remain pending until actually performed.

## Handoff at an interruption

Do not leave only a prose success claim. Update progress with the exact current branch/commit, completed task receipts, failing test, unresolved decision ID, live-resource state, next unblocked task and any explicit team authorization still needed. Resume from the next unverified task; do not redo architecture or regenerate this plan unless implementation evidence justifies a specific recorded amendment.

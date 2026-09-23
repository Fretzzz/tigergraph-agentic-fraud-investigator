# Build progress

## P0.1 - Bootstrap the repository and source-aware readiness report

- Commit: 0a936ad
- Files: workspace/toolchain files; readiness contract and tests; non-deploying Worker scaffold; doctor/live/release guards; D01-D10 register; readiness report.
- Commands:
  - `pnpm exec vitest run tests/readiness.test.ts` - PASS, 1 file / 4 tests.
  - `pnpm typecheck` - PASS.
  - `pnpm exec tsx scripts/doctor.ts` - BLOCKED as designed (exit 2): NIM, MCP, and TigerGraph/vector live configuration and receipts are absent.
  - focused secret-pattern scan - PASS.
- Evidence class: fixture/local tooling. No cloud write and no live-provider claim.
- Source/architecture decisions: the governing Cloudflare CaseAgent + NVIDIA NIM + official TigerGraph MCP + TigerGraph graph/vector architecture is unchanged. D01-D10 are transcribed into `docs/references/decisions.md`; source semantics and entitlements remain explicitly blocked where evidence is absent.
- Next unblocked task: P1.1 contracts can proceed independently. P0.2 requires actual organizer CSVs; P0.3 requires approved live provider resources and credentials.

## P1.1 - Define the exact benchmark and domain contracts

- Commit: a9b182a
- Files: canonical answer schema/types; domain, policy-fact and tool receipt contracts; committed generated JSON Schema; synthetic valid fixture; contract tests.
- Commands:
  - `pnpm exec vitest run tests/contracts.test.ts` - PASS, 1 file / 11 tests.
  - `pnpm typecheck` - PASS.
- Evidence class: fixture/local contract validation.
- Source/architecture decisions: every S2 field and exact enum is transcribed; canonical objects reject extra operational fields; policy predicates use explicit `true | false | unknown` plus evidence/request refs; internal runtime state remains separate.
- Next unblocked task: P1.2 exact money, ID and dataset-local time primitives.

## P1.2 - Implement exact money, ID and temporal primitives

- Commit: 3edec34
- Files: exact USD-cent parser and absolute sum; verbatim transaction-ID primitive; strict dataset-local timestamp parser/comparator; shared TypeScript/Python fixtures and Python 3.12 `uv` lock.
- Commands:
  - `pnpm exec vitest run tests/primitives.test.ts` - PASS, 1 file / 11 tests.
  - `uv run --project pipelines pytest pipelines/tests/test_primitives.py -q` - PASS, 1 test.
  - `pnpm typecheck` - PASS.
- Evidence class: fixture/local cross-language validation.
- Source/architecture decisions: money accepts exactly two decimal places until P0.2 proves another source policy; numeric-looking IDs remain verbatim; source timestamps remain dataset-local and are never converted with browser timezone.
- Next unblocked task: P1.3 controlled ports/test evidence classes, then P5 fixture policy lane while live/source gates remain blocked.

## P1.3 - Create controlled test ports and enforce test evidence classes

- Commit: be6b507
- Files: controlled clock/port contracts; source-shaped fixtures; deterministic harness with fault injection and secret redaction; Vitest configs; offline CI workflow.
- Commands:
  - `pnpm exec vitest run tests/testkit.test.ts` - PASS, 1 file / 5 tests.
  - `pnpm test:unit` - PASS, 3 files / 27 tests.
  - `uv run --project pipelines pytest pipelines/tests -q` - PASS, 1 test.
  - `pnpm typecheck` - PASS.
  - `pnpm test:live` without `APPROVED_LIVE_TARGET` - BLOCKED as designed, nonzero.
- Evidence class: fixture/local tooling. Live-provider and deployed evidence remain distinct and cannot be skipped green.
- Source/architecture decisions: fixture ports are explicitly labeled and will be adapted to the real Worker/DO runtime as P6 lands; no separate fake production policy engine was added.
- Next unblocked task: P5.1 deterministic policy using the frozen contracts; P0.2/P0.3 remain blocked on source files and live services.

## P5.1 - Implement policy predicates and exact approval routing

- Commit: 39dd8c5
- Files: all-14-action approval router; explicit-unknown fact helpers; R1-R10 finding engine; monetary/probability/unknown boundary tests.
- Commands:
  - `pnpm exec vitest run tests/policy-boundaries.test.ts` - PASS, 1 file / 7 tests.
  - `pnpm test:unit` - PASS, 5 files / 38 tests.
  - `pnpm typecheck` - PASS.
- Evidence class: fixture/local deterministic policy.
- Source/architecture decisions: action routing matches the dataset policy; exposure comparisons use cents; unknown settlement/shared origin/recurring identity remain missing premises rather than false facts; obligations and prohibitions are separate.
- Next unblocked task: P5.2 conflict resolution and stopping.

## P5.2 - Resolve explicit conflicts and enforce defensible stopping

- Commit: 5947f09
- Files: transparent policy evaluator; R2/R7 interpretation record; evidence-family deduplication; stop decision logic; conflict/stop tests.
- Commands:
  - `pnpm exec vitest run tests/policy-conflicts-stop.test.ts` - PASS, 1 file / 6 tests.
  - `pnpm test:unit` - PASS, 6 files / 44 tests.
  - `pnpm typecheck` - PASS.
- Evidence class: fixture/local deterministic policy.
- Source/architecture decisions: R7 is the specific exception when a customer denial conflicts with a supported recurring pattern; contradiction stays visible. Two paraphrases cannot satisfy the two-evidence stop. Budget/timeouts remain operational blocks.
- Next unblocked task: P5.3 answer compiler and provenance validator.

## P5.3 - Build the answer compiler and semantic/provenance validator

- Commit: e71cea2
- Files: trusted-record compiler; schema and cross-field validator; source/history/projection receipt checks; narrative helpers; exporter tests.
- Commands:
  - `pnpm exec vitest run tests/exporter.test.ts` - PASS, 1 file / 6 tests.
  - `pnpm test:unit` - PASS, 7 files / 50 tests.
  - `pnpm typecheck` - PASS.
- Evidence class: fixture/local compiler validation. Live episode-query integration remains P7.3.
- Source/architecture decisions: canonical export contains no runtime metadata; FILE_REPORT/SAR, legitimate-case, no-request and graph-write invariants are enforced; source and prior-case IDs need trusted indexes and receipts.
- Next unblocked task: prepare P6 durable execution, while live/source-dependent P2-P4/P7 stay blocked.

## P0.2 - Inspect the actual CSVs and resolve source semantics

- Commit: 03d2716
- Files: streaming profiler/auditor; synthetic inspection tests; actual data profile with source hashes; dataset decision record.
- Commands:
  - `uv run --project pipelines pytest pipelines/tests/test_inspect.py -q` - PASS.
  - `uv run --project pipelines python -m fraud_data.inspect /downloads/hhgoa --output reports/data-profile.json` - PASS on all actual organizer CSVs.
  - `pnpm test:unit` - PASS, 7 files / 50 tests.
  - `pnpm typecheck` - PASS.
- Evidence class: actual organizer source files plus local fixture tests. Raw CSVs are not committed.
- Source decisions: observed counts/header/null/date/hash profile replaces assumptions. D01 canonical card mapping remains blocked by evidence; D04 merchant/recipient identity and D05 authorization status remain unknown rather than invented.
- Next unblocked task: request organizer mapping clarification; proceed with independent runtime durability work. P2 canonical graph construction cannot truthfully pass yet.

## P0.3 - Provider capability report logic (live gate blocked)

- Commit: 3d6b5bf
- Files: capability observation validator/tests; explicit live probe gate; blocked model/MCP/vector/DO capability manifest; intentionally unpinned MCP blocker receipt.
- Commands:
  - `pnpm exec vitest run tests/capabilities.test.ts` - PASS, 1 file / 3 tests.
  - `pnpm test:unit` - PASS, 8 files / 53 tests.
  - `pnpm typecheck` - PASS.
  - `pnpm probe:providers --live` without approved target/config - BLOCKED as designed, nonzero.
- Evidence class: fixture/report logic only. This is not completion of P0.3.
- Blocker: no approved isolated TigerGraph/Cloudflare/NVIDIA resources, exact provider identities, or live credentials are available. No MCP version is guessed or pinned and no live capability is claimed.
- Next: run and capture the six real observations after resources are approved; only then mark P0.3 complete.

## Deadline demo slice - HHG-003 end to end on a local graph (not a plan task; scoped deviation)

- Branch: feat/hhg-003-demo-slice. Commits: 3da7142 (lockfile), 8b0f153 (case slice), d6a29af (local graph + investigator + canonical answer), plus the analyst view commit.
- Why: submission deadline Sept 24, 2026 11:59 PM IST; no TigerGraph, NVIDIA or Cloudflare credentials; D01 suffix rule undocumented. The team chose a one-case demo anchored on HHG-003's case-pack IDs, clearly labeled as local.
- What runs:
  - `pnpm case:slice /downloads/hhgoa HHG-003 data/slices/HHG-003.json` - strict-replay slice from the organizer CSVs (986 customer transactions up to case open, 49 identity rows, 6 visible closed cases, source SHA-256s in the manifest). No K-suffix inference: only the seed and closed-case transactions carry canonical card IDs.
  - `RUN_ID=demo pnpm case:run HHG-003` - 8 local-graph queries with receipts, deterministic assessment, existing P5 policy/compiler/validator; writes `cases/HHG-003.json` and `reports/runs/demo/HHG-003.run.json`; validator PASS.
  - `pnpm web` then open http://localhost:8765/ - static analyst view (steps, evidence, subgraph, initial/final actions with routes, memory, limitations). Screenshot: docs/demo/hhg-003-analyst-view.png, visually checked in headless Chrome.
- Tests: `pnpm test:unit` PASS 10 files / 68 tests; `uv run --project pipelines pytest pipelines/tests -q` PASS 5 tests; `pnpm typecheck` PASS.
- Evidence class: actual organizer source data on a local in-memory graph. NOT live TigerGraph, NOT NVIDIA NIM (tokens = 0), NOT Cloudflare. written_to_graph=false.
- Deviations from the plan, stated openly: static HTML/JS view instead of React/Vite; deterministic code instead of the NIM-driven loop; local graph instead of TigerGraph/MCP. Customer replies use one fixed disclosed default (no reply in 24h). Probability weights are a transparent heuristic.
- HHG-003 result: uncertain, p=0.55, escalated; initial CREATE_CASE, VERIFY_WITH_CUSTOMER, BLOCK_CARD (L1), ESCALATE_TO_ANALYST; final swaps VERIFY for MONITOR_CARD (R4); no SAR. Only 1 of 20 cases is produced; this is not the all-20 deliverable.

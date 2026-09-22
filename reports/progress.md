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

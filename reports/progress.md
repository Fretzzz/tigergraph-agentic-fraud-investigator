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

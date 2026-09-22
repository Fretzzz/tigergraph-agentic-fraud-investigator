# Implementation decision register

Status values are `selected`, `blocked`, or `needs-organizer`. These entries transcribe D01-D10 from the governing design; they do not resolve source or provider questions without evidence.

| ID | Status | Selected default / required evidence | Current blocker scope |
|---|---|---|---|
| D01 card mapping | needs-organizer | Inspect actual organizer files and use an explicit or fully validated mapping. Never infer suffix ordering. | Real card graph and benchmark outputs |
| D02 evidence cutoff | selected | `strict_replay` at `opened_at`; virtual time exposes later evidence. Any retrospective mode must be named. | Organizer comparability remains unverified |
| D03 timestamp timezone | selected | Preserve raw dataset-local timestamps; synthetic UTC normalization is only a documented technical convention. | None for fixtures |
| D04 merchant/recipient identity | blocked | Unsupported predicates stay `unknown` unless actual fields prove identity. Product code/domain are not identity. | R7 and exact-recipient R6 claims |
| D05 authorization status | blocked | Missing pending/settled status is `unknown`; simulated evidence must be explicit. | R4/R5 status branches |
| D06 detector windows | selected | `< $5` candidate threshold and 24-hour follow-on search are configurable detector defaults, not policy. | Final detector review |
| D07 rule precedence | selected | Use design section 9 conflict behavior; do not equate “strongly suspected” with stop threshold. | Policy-review acceptance |
| D08 created versus dataset IDs | selected | Dataset IDs must resolve; created IDs use a separate operational namespace and write receipts. | Validator implementation |
| D09 illustrative answer | selected | HHG-017 example is shape-only, never a factual oracle. | Fixture discipline |
| D10 entitlements | blocked | Live receipts must prove TigerGraph vector/query support, NIM behavior, DO limits, TLS MCP and credentials. | All live/deployment gates |

## Toolchain receipt

- Runtime observed: Node.js 22.x.
- Package manager pinned: pnpm 10.17.1.
- TypeScript pinned: 5.9.2.
- Vitest pinned: 3.2.4.
- P0.1 deliberately does not claim Worker, NIM, MCP, TigerGraph or vector compatibility. Those require the P0.3 live probes.

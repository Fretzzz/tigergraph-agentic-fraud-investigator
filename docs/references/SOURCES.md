# Source register and evidence boundaries

Prepared 22 September 2026. This register distinguishes organizer requirements, vendor capability documentation, and proposed engineering decisions. The planning package is not a dataset inspection or live integration test report.

## Organizer sources

### S1 — Uploaded hackathon brief

Local original: [hackathon-brief.md](../sources/hackathon-brief.md). Original title: **TigerGraph Agentic Fraud Investigation HHGOA**. Copied byte-for-byte from the user's attachment.

SHA-256: `a8f929eb8ee8f98e10db67c27887b23b4a5f171830818be78b7a64c0c7db9436`

Relevant sections: Core Challenge / Design Guidelines; What Participants Build With; Dataset; Submissions; Judging Criteria; What Success Looks Like. The source requires TigerGraph, GSQL/graph algorithms, TigerGraph MCP, GraphRAG and an interface. It permits simulated actions and does not require training a new classifier.

### S2 — Dataset README from the linked organizer folder

Local original: [dataset-readme.md](../sources/dataset-readme.md). Fetched through the connected Google Drive service for this planning task. Source metadata reported modification on **18 September 2026 at 06:38:00 UTC**. Snapshot: 38,663 bytes, 472 file lines.

SHA-256: `57e6dd7c7766b4efe3e903f111be2f4237d058d53e3b1738d6e56dcd6cecda59`

Source locations for the coding agent:

```text
Dataset folder:
https://drive.google.com/drive/folders/1YDJUW1fiE7Jx8R9KqknC4IcsED9zll2A
README:
https://drive.google.com/file/d/1-a1N26_O_wmvf2gtAuTP00jf124vbqhC/view
```

| Snapshot lines | Content |
|---|---|
| 7–29 | Task, three outputs, startup workflow |
| 52–107 | Files, column definitions, closed cases and case pack |
| 109–121 | Five documented patterns |
| 152–165 | Risk-score caveat, legitimate cases, simulations, no public-label recovery |
| 167–182 | Suggested graph schema and document retrieval |
| 190–285 | Fraud Policy v1.0, actions, routes, R1–R10, cases versus reports, stopping |
| 289–362 | Exact answer contract and enumerations |
| 364–434 | Illustrative example only; not a factual benchmark solution |
| 436–443 | Important output constraints |
| 447–472 | Actual 20-case table |

The four CSVs are not included and were **not inspected for this plan**. Row counts in the design are source-reported reconciliation expectations. D01–D10 explicitly retain the missing schema/semantic answers. The sample answer's identifiers differ from the actual case-table entry; its examples must not be copied as ground truth.

## Official technology references

These sources were consulted for architectural feasibility, not as substitutes for pinned-version integration tests. Only a short capability summary is derived from each; the implementation design, task decomposition, safety controls and numerical resource defaults are our proposed engineering choices.

### S3 — Cloudflare Agents runtime

Official overview describes durable identity, SQL storage, real-time connections and scheduled work. The project should use a tested `Agent` runtime and bounded custom loop, not assume all optional harness features are necessary.

```text
https://developers.cloudflare.com/agents/
```

### S4 — External model calls from Agents

Official documentation permits external providers and OpenAI-compatible endpoints. Compatibility still requires testing the selected NVIDIA endpoint and its supported parameters.

```text
https://developers.cloudflare.com/agents/runtime/operations/using-ai-models/
```

### S5 — Cloudflare MCP client

The official client API documents Streamable HTTP transport selection, authentication headers and connection handling. The plan uses it as a client of the TigerGraph service, not as an excuse to expose generic administrative tools.

```text
https://developers.cloudflare.com/agents/model-context-protocol/apis/client-api/
```

### S6 — Durable Object concurrency guidance

Official guidance discusses event interleaving across external awaits and warns against holding `blockConcurrencyWhile` across I/O. The plan's leases, revision checks and outboxes are application design, not a claim of cross-service transactions.

```text
https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
```

### S7 — Agent state synchronization and routing

State documentation says `setState` persists and broadcasts state; routing documentation describes pre-request and pre-connection hooks. Private case/approval state must not be blindly client-synchronized.

```text
https://developers.cloudflare.com/agents/runtime/lifecycle/state/
https://developers.cloudflare.com/agents/runtime/communication/routing/
```

### S8 — Worker limits

The consulted official limits page specifies 128 MB memory per isolate. The implementation must check its actual plan's CPU/subrequest/storage limits; no particular service tier or price is assumed here.

```text
https://developers.cloudflare.com/workers/platform/limits/
```

### S9 — Official TigerGraph MCP server

The official project documents TigerGraph connectivity and recommends 4.2+ for TigerVector/hybrid retrieval. Retrieved versions differed on Python ranges and native HTTP transport examples; therefore the plan deliberately makes installed-version HTTP initialization and tool execution a hard capability test rather than claiming universal support. Do not substitute the similarly named older DevLabs repository without a documented reason.

```text
https://github.com/tigergraph/tigergraph-mcp
https://github.com/tigergraph/tigergraph-mcp/blob/main/README.md
```

### S10 — NVIDIA hosted NIM

NVIDIA's API Catalog quickstart and language-NIM overview document hosted inference access. This does not establish the team's quota, entitlement or model-specific capabilities.

```text
https://docs.api.nvidia.com/nim/docs/api-quickstart
https://docs.api.nvidia.com/nim/docs/overview
```

### S11 — NVIDIA tool calling

The versioned official NIM documentation describes `tools`, `tool_choice` and the model/tool-result round trip. It concerns NIM functionality; hosted catalog endpoints still need their own capability probe. No universal structured-output or streaming guarantee is assumed.

```text
https://docs.nvidia.com/nim/large-language-models/1.15.0/function-calling.html
```

### S12 — TigerGraph vector operations

An official vector-operation reference was surfaced, but full-page retrieval was unsuccessful during preparation. Treat it as a documentation pointer, not a verified implementation recipe. Resolve vector schema/query syntax against the installed database documentation and a live isolated vector test before writing production GSQL.

```text
https://www.tigergraph.com/docs/gsql-ref/4.2/vector/
```

### S13 — Scheduling and alarm behavior

Cloudflare's scheduling API documents persisted scheduled callbacks. Underlying DO alarms document at-least-once execution and retries. The exact scheduler integration is pinned/tested by P0/P6; do not add raw alarm management beside SDK scheduling or assume exactly-once effects.

```text
https://developers.cloudflare.com/agents/runtime/execution/schedule-tasks/
https://developers.cloudflare.com/durable-objects/api/alarms/
```

## Not independently verified

No credentials, cloud-account permissions, budgets, NIM model quota, actual TigerGraph instance version, vector entitlements, CSV card mappings, merchant identity, settlement status or hidden answer key were available/verified. No application repository was inspected, no product code generated, and no application tests/deployments were run.

The regulatory URLs listed inside S2 are organizer-provided context. Their contents were not independently analyzed for this plan. Any selected documents must be fetched, read and indexed with accurate source/page locators during P4.2. The supplied hackathon policy remains the decision contract.

## Change-control rule

When organizers update a source, save a new snapshot and hash, identify changed requirements, update affected contracts/tests, and create a new policy/dataset version. Do not silently mix outputs from different source versions in one canonical 20-case release.

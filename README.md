# Fraud Investigation Agent — Coding-Agent Build Pack

**Prepared:** 22 September 2026  
**Scope:** TigerGraph × Hacker House Goa fraud-investigation challenge; Cloudflare Workers/Durable Objects; NVIDIA NIM; analyst web chat.

## Start here

This pack contains a comprehensive build specification and a phase-driven implementation task list. It is designed to be copied into a new or existing application repository without needing the preceding chat.

| File | Use |
|---|---|
| [Build plan and design](docs/superpowers/specs/2026-09-22-fraud-investigation-design.md) | Architecture, data graph, tools, complete policy/output contract, durable execution, simulation, UI, evaluation, security and release gates. |
| [Phased task list](docs/superpowers/plans/2026-09-22-fraud-investigation-implementation-plan.md) | 12 required phases, 38 required tasks, and an optional phase with 2 extensions. Every task includes dependencies, files, interfaces, acceptance assertions, test commands and a completion gate. |
| [Coding-agent handoff](HANDOFF.md) | Copy-paste execution prompt, reading order, authorization limits and milestone checkpoints. |
| [Source register](docs/references/SOURCES.md) | Organizer source hashes/locators, official technology references and explicit verification limits. |
| [Original brief](docs/sources/hackathon-brief.md) | Unmodified uploaded challenge document. |
| [Dataset README](docs/sources/dataset-readme.md) | Unmodified retrieved organizer README, including the policy, complete answer format and actual case table. |

## Core decisions

Build an investigator, not a new fraud detector. NIM supplies the LLM; TigerGraph supplies graph and vector evidence; the DO owns durable execution; code controls policy, permissions and exports. All financial actions and new customer replies are simulated, with visible provenance. The optional custom model is intentionally outside the required implementation path.

The 38 required tasks proceed from source/capability verification to contracts, ingestion, queries, MCP/GraphRAG, policy, durable runtime, live NIM integration, interface, all-case evaluation, release hardening and submission. The first milestone that demonstrates the product is one complete real-source case with a valid graph-backed export—not a standalone chat UI.

## How to use

Copy the contents into the repository, preserving any existing files of the same name rather than overwriting blindly. Read the build plan and give the coding agent `HANDOFF.md`. Keep the original source snapshots with the plan; they resolve exact rule identifiers and output fields better than a summary does.

The plan intentionally does not select an unverified model ID, invent the card-ID mapping or assume the installed TigerGraph/MCP versions. P0 produces real capability and dataset-semantic receipts before dependent work proceeds.

## Status and limitations

These are planning documents, not an implemented application. No application repository, CSV dataset, cloud deployment or model was tested here. Source documents were reviewed and preserved; official platform references were checked for architectural feasibility, with unresolved retrieval/version differences disclosed in the source register. The included `PACK_CHECKS.json` validates this document package only; it is not an application test report.

Required source deliverables also include a recorded demo video, blog and social post. The task list differentiates a script/draft from actual recording/publication so an agent cannot incorrectly mark those complete.

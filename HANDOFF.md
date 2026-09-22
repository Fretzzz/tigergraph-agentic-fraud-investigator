# Coding-agent handoff

Paste the prompt below into the coding agent **after placing this build pack in the target repository**. Existing team instructions and explicit authorization boundaries remain in force.

---

Implement the TigerGraph Fraud Investigation Agent described by this repository's build pack. This is an implementation task, not a request to produce another architecture proposal.

Read, in order:

1. `docs/sources/hackathon-brief.md`
2. `docs/sources/dataset-readme.md`
3. `docs/superpowers/specs/2026-09-22-fraud-investigation-design.md`
4. `docs/superpowers/plans/2026-09-22-fraud-investigation-implementation-plan.md`
5. `docs/references/SOURCES.md`

Inspect the actual repository and working-tree state before changing anything. Preserve existing user work and reuse equivalent modules; the proposed paths are not permission to replace an existing application. Create/use an isolated feature branch/worktree. Do not merge or push to main without explicit approval.

Build the required stack: Cloudflare Worker plus one SQLite-backed CaseAgent per workspace/run/case, NVIDIA NIM for LLM inference, official TigerGraph MCP, TigerGraph graph and vector retrieval, deterministic policy and approval enforcement, and a web chat/case workspace. Do not add a new prediction model or multi-agent architecture to the critical path.

Start at P0 and execute the plan task-by-task. After P1, independent graph/data and policy work may proceed in separate lanes, but one integration owner controls shared contracts, routing, migrations and dependency locks. Use test-first changes and focused commits. Do not check a task off until its exact tests and acceptance gate are satisfied and its evidence class is recorded.

Your first live milestone is one actual source case from trigger through graph-backed evidence, an initial decision, a recorded simulated response when needed, a revised final decision, correctly pending approvals, verified graph persistence and valid benchmark JSON. Then finish the UI and run the same deployed agent on all 20 cases. A second answer-generation script or hard-coded case conclusions is not acceptable.

Enforce the following throughout:

- Risk score is a signal, not the verdict. Do not recover public IEEE-CIS/Kaggle labels.
- Never invent card mappings, merchant identity, recipient addresses, settlement state or geography. Resolve the design's D01–D10 checks and retain unknowns where the source does not support a fact.
- Initial recommendations are stored before any simulated evidence is consumed. Simulator branches are fixed/disclosed, not chosen to support a desired outcome.
- Only auto actions execute autonomously. L1/L2 approvals bind actual authenticated role, action scope, exposure, decision revision and payload hash.
- Duplicate commands, callbacks and response-loss retries produce no duplicate mock actions or graph cases; late results cannot overwrite newer revisions.
- Source history, generated conclusions and simulated evidence retain separate trust/provenance. Demonstrate retrieval of a newly stored case in a separate memory-enabled run without laundering its verdict into historical truth.
- Graph/vector/MCP/NIM integration must be proved with live receipts. Passing mocks cannot satisfy live gates. Never mark a graph write successful before readback.
- Canonical `cases/` contains exactly the 20 source IDs with the exact required fields. Report conformance separately from unknown hidden-key accuracy.

External writes, billable resource creation, destructive graph operations, publication, real financial actions and repository merges require explicit team authorization. All financial/customer/report actions in this build are simulations. Never place secrets in prompts, source control, browser code or logs.

If a required credential or source-semantic answer is genuinely missing, record the exact blocked check and continue independent tasks that can be completed correctly. Do not fake a successful integration, silently replace the required stack, or restart the entire planning exercise. Ask only for the specific non-resolvable access/decision needed.

Maintain `reports/progress.md` after every task with task ID, commit, changed files, exact commands/results, evidence class, blockers and next task. At each milestone, provide the reviewer a runnable demonstration and receipts. If interrupted, leave the current branch/commit, next unverified task, failing command and live-resource state so execution can resume without reconstructing context.

Proceed with repository inspection and P0.1.

---

## Reviewer checkpoints

M1: Source/graph/tooling/policy foundation (P0–P5).  
M2: First full live case with recovery and verified export (P6–P7).  
M3: Analyst UI and all 20 outputs (P8–P9).  
M4: Deployment hardening and complete submission inventory (P10–P11).

Optional P12 work is not authorized by default and must not delay the core milestones. The team remains responsible for supplying approved accounts/credentials, resolving organizer-only ambiguities, and actually recording/publishing artifacts when tools cannot do so.

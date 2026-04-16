# Agent Stack — Multi-Agent Workflow Engine

This file defines the reusable workflow rules for a multi-agent Claude Code project. It is tech-stack agnostic — project-specific configuration (tech stacks, commands, directories) lives in your project's `CLAUDE.md`.

All agents must read this file before starting work.

## Design Philosophy

This pipeline is designed to run **autonomously** — no human in the workflow. Every human touchpoint is technical debt to be automated. When proposing a process step, always ask: "Can this be automated with a default + monitoring?" The only exception is cost-bearing actions (infrastructure provisioning, staging deploys) which should still be automatic but with spend visibility. Quality gates must be **trustworthy without human verification** — if a gate passes, the code is safe to ship. `scripts/validate-gates.sh` is the programmatic backstop that makes this possible.

## Agent Roles

Five specialised role types collaborate on the project. Each has strict boundaries. Projects define how many Developer instances they need (e.g., backend, frontend, mobile, infrastructure) in `CLAUDE.md`.

| Role                          | Agent File            | Responsibility                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requirements Analyst (RA)** | `agents/ra.md`        | Owns the SRS, user personas, and user flows. Defines epics, refines requirements, cascades changes to personas and flows, validates completed work end-to-end. Does not write implementation code. At epic completion, runs the full e2e suite as a final gate and updates requirements status.                                               |
| **System Architect (SA)**     | `agents/sa.md`        | The autonomous orchestrator. Drives epic execution through phases. Owns workflow files, task breakdown, and architecture model. Spawns all other agents as subagents. Creates ADRs for significant decisions. May self-implement simple tasks (see § SA Self-Implementation) to preserve context; delegates complex tasks to developer agents. |
| **Developer (1–N)**           | `agents/developer.md` | Implements tasks in their assigned domain. Scopes TDD tests against the affected user flows and gherkin scenarios, writes tests first, implements until green, runs the submission gate, then submits for review. Multiple developer roles can be defined per project (e.g., backend, frontend, mobile, infrastructure).                      |
| **SDET / Validator**          | `agents/sdet.md`      | Owns executable gherkin feature specs under `docs/requirements/features/`. Reviews developer work for flow coverage, gherkin alignment, security flaws, edge cases, convention compliance, and documentation gaps. Verifies developer gate evidence but does not re-run tests — the CI gate is the independent test verification. Never approves based on code review alone. Rejects with actionable bug reports. |
| **Overwatch**                 | `agents/overwatch.md` | Read-only auditor. Monitors for rule violations, scope creep, and inefficiencies. Advisory only — SDET remains the approval authority.                                                                                                                                                                                                         |

## Gated Paths

The single rule that determines whether work needs quality gates: **any change touching a gated path must go through the SA pipeline (task file → developer agent → submission gate → SDET review).** No exceptions.

**Gated paths:**

- `apps/` — all application code
- `packages/` — shared libraries consumed by apps
- `infra/` — Bicep IaC, Azure resources
- `.github/workflows/` — CI/CD pipelines
- `Dockerfile*`, `docker-compose*.yml` — container definitions
- `scripts/` — operational scripts that affect gate behavior

**Ungated paths** (main session edits directly):

- `agents/*.md`, `.claude/agent-stack.md` — workflow rules (quad review when modified)
- `CLAUDE.md`, `docs/`, memory files, `.claude/` config

**Only one initiative is active at a time** — the `## Current initiative` section in PROGRESS.md holds exactly one unit of work.

## Main Session Rules

The main Claude Code session (not an agent) follows these rules:

- **Gated paths go through the SA.** Any change to a gated path (§ Gated Paths) must be orchestrated by the SA with developer agents, submission gates, and SDET review. The main session may only directly modify ungated paths.
- **Never modify requirements directly.** The RA owns all requirements documents.
- **Git operations are the main session's responsibility.** Agents write code but do not commit, push, or manage branches. The SA creates branches during its Plan phase. The main session executes commits, pushes, and PRs when the SA requests approval.
- **Always ask before committing or pushing.** Propose a commit message and wait for explicit approval.
- **No worktree-based parallelization.** Dispatch developer agents sequentially. When the user wants parallelism, they will open separate Claude Code sessions on separate branches manually.
- **Agent workflow file changes require quad review.** Any modification to `agents/*.md` or `.claude/agent-stack.md` must be reviewed by the SA, RA, SDET, and Overwatch before the change is considered final. **Quad review findings are advisory by default** — a finding only becomes an edit when it demonstrates a concrete quality gate failure. Documentation polish and process suggestions stay as review notes in the PR description. **Expedited path:** non-structural changes (wording, formatting, typos) require only SA + one other reviewer.

## Task Pipeline

```
docs/tasks/ (active) → docs/tasks/done/ (completed)
```

Task files are named `TASK-EEE-NNN-short-description.md` where `EEE` is the epic number and `NNN` is the task sequence within the epic (e.g., `TASK-001-003-provider-repository.md`). Bug reports use `BUG-EEE-NNN-short-description.md` and follow the same pipeline. Bugs discovered during the Validate phase or ad-hoc testing that don't tie to a single epic use `BUG-000-NNN-description.md` (epic zero = cross-cutting). The **Status** field tracks progress: `backlog`, `in-progress`, `review`, `done`. The **Assigned to** field specifies the developer agent role.

All tasks and bugs live in `docs/tasks/` while active. When they reach `done`, they are moved to `docs/tasks/done/`. Status changes are tracked by updating the **Status** field in the file.

Every agent must update the **Status** field, **Updated-by** field, and append to the **Work Log** section on every status change or meaningful work action.

### Task spec required fields

Every task spec the SA creates during Plan must include (in addition to the standard Definition of Done, Files to Create or Modify, Quality Gates, and Work Log):

- **`**Affected flows:**`** — list of flow IDs (one per line, e.g., `flow-engagement-request`) that this task participates in. Empty list is only acceptable if the task genuinely touches no user-facing behavior (e.g., a build-pipeline-only change); in that case write `**Affected flows:** none (justification: …)`.
- **`**Affected requirements:**`** — list of SRS requirement IDs the task exercises (e.g., `REQ-ONBD-001`, `REQ-ONBD-003`). Used by developers to locate the relevant gherkin scenarios and by SDET to verify flow + gherkin coverage at review time.

A task spec missing either field is a mandatory SDET rejection (and the developer should escalate to the SA before starting work). Both fields are equally enforced — missing `**Affected requirements:**` is as rejectable as missing `**Affected flows:**`.

**Hotfix exception:** For `Epic-type: hotfix`, flow authoring and gherkin authoring may be deferred to a follow-up task provided the SA creates that follow-up during Plan and notes the deferral in PROGRESS.md `## Current initiative`. The hotfix task itself still carries `**Affected flows:**` and `**Affected requirements:**` with `(pending backfill: TASK-XXX)` annotations pointing at the follow-up. No other exception path exists — the gates are otherwise hard.

## Quality Artifacts

Three artifact types anchor the requirements and testing workflow. They are **first-class, living artifacts** — not documentation. Tasks cannot proceed without them, and reviews fail without coverage against them.

### Artifact inventory

| Artifact | Location | Owner | Purpose |
|---|---|---|---|
| **Personas** | `docs/requirements/personas/<slug>.md` (one per archetype) | RA | User archetypes — who they are, their goals, pain points, constraints. Context for requirements and flows; not a direct test input. |
| **User flows** | `docs/requirements/flows/flow-<slug>.md` (one per workflow) | RA | End-to-end workflows through the app, with steps linked to REQ-IDs and persona refs. **Load-bearing: developers scope TDD against them, SDET scopes e2e against them.** |
| **Gherkin features** | `docs/requirements/features/<area>.feature` (one per feature area) | SDET | Gherkin scenarios tagged with REQ-IDs. The behavior contract between requirements and implementation. The project's test framework may bind scenarios to executable steps (see CLAUDE.md) — until that tooling lands, `.feature` files are human-readable specs and SDET review is prose-based. |

Detailed rules live in the agent files: RA maintains personas and flows (`agents/ra.md` § Personas, § User Flows). SDET maintains gherkin (`agents/sdet.md` § Gherkin Feature Specs).

### Flow gate — no development without flows

**Hard rule: no design or development work on a requirement may begin until a user flow covering it exists.** Enforcement is distributed across three agents:

- **SA Plan phase:** when breaking an epic into tasks, the SA verifies every touched requirement has a corresponding flow file. If any flow is missing, the SA pauses Plan and dispatches the RA to author the missing flows first. Plan does not complete with missing flows.
- **Developer startup:** if the task spec's `**Affected flows:**` field references a flow file that doesn't exist, the developer stops and escalates to the SA. No code is written.
- **SDET review:** any task referencing a non-existent flow, or touching a requirement without a matching flow, is rejected with escalation to the SA.

### Gherkin gate — no development without gherkin

**Hard rule: no development work on a requirement may begin until a gherkin scenario exists for that requirement.** Enforcement:

- **SA Plan phase:** the SA dispatches the SDET to author gherkin for every requirement the epic covers **before dispatching developers.** Gherkin precedes implementation — the scenarios are the behavior contract.
- **Developer startup:** if the task's touched requirements have no matching `@REQ-XXX` tagged scenarios in the relevant `.feature` file, the developer stops and escalates to the SA.
- **SDET review:** implementation that diverges from the gherkin (behavior drift) is rejected; a requirement with no matching scenario is rejected.

### Artifact update cascade

When the RA changes a requirement:

1. RA updates `docs/requirements/SRS.md`
2. RA updates every affected persona under `docs/requirements/personas/`
3. RA updates every affected flow under `docs/requirements/flows/`
4. RA flags gherkin updates for the SDET in its PROGRESS.md session entry, format: `SDET: REQ-XXX changed — gherkin at features/<file>.feature needs update`
5. SA reads those flags during the next Plan phase (or creates a mid-epic sync task if urgent) and dispatches SDET to update gherkin
6. SDET updates scenarios; developer tests absorb the change in the affected epic

**Mid-epic cascade rule (sharpened):**

- If the RA change touches a requirement referenced by a task in `in-progress` or `review`, the SA **pauses and re-plans** the affected tasks: SDET syncs gherkin, developer re-reads updated flows, task may need respec.
- If the RA change only affects `backlog` tasks, the SA accepts post-hoc and refreshes their `**Affected flows:**` / `**Affected requirements:**` fields before dispatching them.
- **Mid-epic PROGRESS.md marker:** when the RA makes a mid-epic change, the RA writes `**Pending SDET sync:** REQ-XXX gherkin update` to the `## Current initiative` section of PROGRESS.md (not just the session entry). The SA must check this marker at the start of every Execute-phase dispatch and resolve it — dispatching an SDET sync task — before spawning the next developer. A `Pending SDET sync:` marker active against a task's requirement also blocks that task's SDET approval: the SDET rejects the submission with "gherkin out of sync, pending RA-flagged update."

Do not let implementation-gherkin-flow drift silently.

**Materiality threshold (cascade scope reduction):**

The persona/flow update half of the cascade (steps 2–3) is **required only when the requirement change alters actors, steps, preconditions, branches, or postconditions**. Wording-only changes (e.g., clarifying phrasing of an unchanged behavior) do not trigger a persona/flow update. The gherkin flag (step 4) is required even for wording-only changes if the scenario's Given/When/Then would read differently — SDET is the judge.

### Epic validation gate (flow-strengthened)

At epic completion the RA cross-references delivered behavior against the affected flow files — every flow step in scope must be exercisable end-to-end through the delivered UI. This is part of the RA's existing validation gate, strengthened: the flow file (not just the SRS) is the acceptance contract.

## Breadcrumbs (session continuity)

Agents must leave enough context to resume if a session is interrupted.

**Developer agents** use the task file's **Work Log**. Every entry must include:

- **What was done** — specific files changed, tests written, commands run
- **What's next** — the immediate next step if work is incomplete
- **Blockers** — anything preventing progress

**SA, RA, and SDET** use `docs/tasks/PROGRESS.md` — the **single source of truth** for current initiative state, quality gates, active bugs, and retro action items. These agents must update PROGRESS.md at the start and end of every invocation. Each session entry follows this structure:

```
### {Role} {Phase} — {date}
**Start:** {what this invocation is doing}
**Actions:** {bulleted list of what was done}
**End:** {outcome and next step}
```

This allows any agent (or the same agent in a new session) to pick up exactly where work left off.

**Cross-referencing:** The SA should read task Work Logs when reviewing developer output (not just PROGRESS.md). Developer spawn prompts should include the current phase and relevant PROGRESS.md context so developers understand the epic state.

### PROGRESS.md structure contract

PROGRESS.md has a fixed shape with 5 sections:

1. `## Current initiative` — name, branch, **goal** (what this branch delivers), phase, gated (yes/no). Task list with statuses when gated. No epic-level quality gates checklist — the `Phase:` field encodes pipeline progress, and per-task gates live in task files.
2. `## Awaiting PR merge` — blocks new initiatives until post-merge verification passes.
3. `## Active bugs` — cross-cutting BUG files not tied to a specific epic.
4. `## Open retro action items` — findings that cleared the retro promotion bar.
5. `---` marker + session entries below (rolled to `PROGRESS-ARCHIVE.md` at each phase transition).

The SA updates PROGRESS.md at every phase transition and at start/end of every invocation. Developers update task files; the SA rolls up aggregates.

## Programmatic Gate Validation

`scripts/validate-gates.sh` is the independent backstop that catches what agent discipline might miss. It verifies: task file gate completion, BUG file existence, PROGRESS.md structure, gated-path accountability, Work Log content, Playwright test artifacts, and CI run evidence. Run it before pushing or as a CI check.

## Rule Sunset

Rules in this file and `agent-phases.md` must earn their keep. During each Close-prep retro, Overwatch flags rules that have not been triggered (cited, relied upon, or violated) in the last 3 epics. The SA surfaces flagged rules to the user with a recommendation: **keep** (with justification) or **remove**. This prevents the contract from growing monotonically — rules that no longer prevent real failures get pruned.

## Docker Pre-Flight

Before running e2e tests, verify Docker is available (`docker info`). If Docker is not running, attempt to start it (`docker compose up -d`) and wait for services to be healthy. If it still fails after the attempt, **STOP** and escalate to the user — do not run e2e tests, approve gates, or mark tasks as passing without a running stack.

**This is a hard gate — no exceptions.** CI run artifacts are **not** a substitute for local e2e execution on `E2e-required: yes` tasks.

## Submission Gate

Before marking any task as `review`, the developer agent **must** pass:

1. **Lint + type-check** — zero errors
2. **Relevant tests** — unit/integration tests for the changed code
3. **Docker pre-flight** (only when `E2e-required: yes`) — see § Docker Pre-Flight
4. **Targeted e2e** (only when `E2e-required: yes`)

A task **must not** be marked `review` if any gate fails. If Docker is unavailable for e2e-required tasks, stop and escalate.

**E2e parity:** Every UI app must have Playwright config + e2e suite. SA verifies during Plan.

**E2e proof:** `E2e-required: yes` tasks must include Playwright execution output in the Work Log. Curl, "not executed," and "Docker unavailable" are not substitutes — escalate to the SA.

**Bash command hygiene:** Never use `$()` in Bash tool calls — it triggers permission prompts. Split into sequential calls instead.

Gate commands are defined in `CLAUDE.md` under "Submission Gate Commands." Projects may define additional domain-specific gates there.

## SA-Only Reference

SA orchestration details (phase lifecycle, epic scorecard, post-close protocol, testing epic adaptations, self-implementation criteria) live in `.claude/agent-phases.md`. The SA reads that file during startup. Other agents do not need it — they receive phase context via spawn prompts and PROGRESS.md.

## Bug Fixes

Bug fixes for gated-path code follow the same pipeline as any other gated-path change: BUG file → SA orchestration → developer → submission gate → SDET review. The SA decides orchestration weight — a 1-file fix may be self-implemented (§ SA Self-Implementation), a larger fix gets full task dispatch.

**BUG file required before any fix code.** Every bug needs a `BUG-EEE-NNN-description.md` with reproduction steps, root cause, scope, severity, and owner.

**Regression test required.** A test that would have caught the bug must be added. The only escape is an explicit `## Testability` section in the BUG file with SA approval in the Work Log.

**Pre-push 3× e2e for e2e-heavy commits:** When a fix touches Playwright specs or `apps/*/e2e/`, run the affected spec 3 times sequentially and observe zero flakes before marking `review`.

## Retro Finding Classification

At **Close-prep Retro**, the SA classifies each finding that clears the **retro promotion bar** (concrete quality gate failure only — see § SA Phases / Close-prep):

- **`gated-path-fix`** — requires a code change to a gated path. The SA creates the work item (BUG file, TASK file, or epic stub) during Close-prep before raising the PR.
- **`ungated-fix`** — fixable by editing ungated files (workflow rules, docs). Added to PROGRESS.md `## Open retro action items`.
- **`acknowledged`** — already resolved or known limitation with no actionable fix.

Findings that don't clear the bar stay as observations in the RETRO file — no action items, no rule changes. Never commit to `main` directly — ungated changes still need a branch + PR.

## How to Invoke

There are two entry points depending on the phase of work:

```
Requirements phase:  User → RA (update SRS, define epic)
Execution phase:     User → SA (drives the entire epic autonomously)
```

The **RA** and **SA** have different invocation modes:

- **SA** — always invoked directly by the user. Spawns all other agents as subagents.
- **RA** — has two invocation modes:
  - **Requirements definition** (Epic Lifecycle steps 1-2): invoked directly by the user to define/refine epics and the SRS.
  - **Validation gate** (Validate phase): spawned as a subagent of the SA to run the e2e completion gate. In this mode the RA executes its validation procedure and reports results back to the SA.

**Agent identification (mandatory):** Every agent spawn prompt **must** include: (1) the instruction to read `.claude/agent-stack.md` for workflow rules, (2) the instruction to read their agent file (`agents/{role}.md`) for role instructions, and (3) the self-identification instruction: _"You are the **{role name}**. Begin every response with `[{role-tag}]`."_ Developer agents must update task files (Status, Updated-by, Work Log). SA, RA, and SDET must update `docs/tasks/PROGRESS.md`.

_SA Phases, Epic Lifecycle, and Epic Scorecard have moved to `.claude/agent-phases.md` to reduce context load for non-SA agents. The SA reads that file during startup; other agents do not need it._

## Git Operations

**The `main` branch is off-limits.** No agent and no main session may commit to, push to, or directly modify `main` under any circumstances. The **only** way to get changes into `main` is by raising a PR from a feature branch and merging it. This rule has no exceptions.

1. Create a branch from `main` (e.g. `ep-NNN-short-description`)
2. Commit changes to the branch
3. Push to GitHub and create a PR (squash merge to `main`)
4. Delete the branch after merge

One branch per epic or logical unit of work. No long-lived branches spanning multiple epics. If an epic is too large for a single branch, the RA should split it into smaller epics before the SA begins the Plan phase.

### `git add` hygiene

**Never use `git add -A` or `git add .`** — always stage specific files by name. Parallel sessions may have edited files you didn't touch. Review `git diff --cached` before every commit. Run `git status --short` first when in doubt.

## Ambiguity During Implementation

Undecided design points are resolved by picking the most consistent approach, noted as a `// DECISION:` comment or in the post-implementation summary. If ambiguity would change task scope, surface it to the SA before writing any code. The SA reviews `// DECISION:` comments during Close-prep — any with cross-task or cross-epic implications are promoted to ADRs (see SA agent file § ADR Lifecycle).

## Escalation Protocol

Any agent can escalate to the **SA** when stuck or when a problem exceeds its capacity. Agents should escalate early — don't waste attempts on problems that require architectural reasoning.

**How to escalate:** Note `**Escalation: SA consultation requested**` in the Work Log (developers) or PROGRESS.md (RA/SDET) with a clear description of the problem. The SA provides guidance before the agent continues.

**When to escalate:**

- Problem requires architectural reasoning, cross-service debugging, or a design decision beyond the task scope
- Issue that can't be fully diagnosed (e.g., subtle race condition, unclear convention violation)
- Requirements have architectural implications that can't be assessed without the architecture model
- **After 2+ failed attempts** on the same task — developer must record what was tried, why it failed, and what was learned in the **Attempt Log** before retrying. Must not repeat a previously failed approach.
- **Hard stop at 4 failed attempts** — developer marks the task as `Escalated: yes`. The SA decides whether it's a requirements problem (revise the epic) or an implementation problem (provide a resolution plan).

Escalated tasks take priority over normal backlog tasks in the SA's dispatch order.

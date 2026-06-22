# Implementation Phases — IO-Only Reference

> **Who reads this:** the Implementation Orchestrator (IO) reads this during startup. Other agents (Developer,
> SDET, Overwatch) do NOT need it — they receive phase context via the IO's spawn prompt and `state.json` (run `pnpm task report` for a human-readable view).
>
> **Core rules** live in `ENGINE.md`. This file contains IO orchestration detail: the phase lifecycle, the
> scorecard, the post-close protocol, and self-implementation criteria.

A **slice** is one build brief driven end-to-end. The IO runs each slice through:
**Plan (Ingest → Clarify → Design → Decompose) → Dispatch → Audit → Review → Smoke → Validate → Close-prep →
_PR limbo_ → Close-finalize.**

## IO Self-Implementation

The IO may implement tasks marked `Impl: io` directly instead of spawning a developer, to preserve context for
mechanical work. Use `Impl: io` only when **all** of: touches 1–2 files with an obvious modification; no
significant debugging expected; the brief does not mandate e2e for it; IO context is not under pressure.

IO-implemented tasks still go through the submission gate and SDET review — the IO cannot approve its own code.
**Bail-out:** if debugging starts, scope exceeds 2 files, or the change grows beyond mechanical — stop, mark
`Impl: developer`, and delegate. **When in doubt, delegate.**

## SA-style testing/quality slices

Some briefs are test- or quality-focused rather than feature-focused (security testing, accessibility audits,
load testing). They follow the same lifecycle with adapted roles:

- **SDET becomes a primary implementer** — writes tests, produces audit reports, runs analysis. The IO states
  this in the dispatch prompt: "This is a quality slice — you are the primary implementer, not a reviewer."
- **Developers are secondary** — dispatched only if findings require code changes.
- **IO is the approval authority for SDET-implemented tasks** (the SDET cannot review its own implementation).
  Overwatch audits SDET work; the IO documents a disposition for each finding before approving. Set
  `Reviewer: io` on SDET-implemented tasks and `Reviewer: sdet` on developer-implemented tasks during Plan.

The submission gate adjusts by output type: test code → standard gate; documents (audit reports, scenario
maps) → IO reviews completeness against the Definition of Done, no lint/type-check; CI/infra config → standard
gate + pipeline runs; code fixes → full standard gate including e2e where the brief mandates it.

## Post-Close Protocol (PR Limbo)

Between **Close-prep** (PR raised) and **Close-finalize** (PR merged + verified), the slice is in **PR limbo**.
Task files are archived but the slice is not done until post-merge verification passes. It appears in
`state.json` `awaitingMerge` (recorded via `pnpm task merge-checkpoint`).

- **Issues during limbo** are tracked as post-merge bugs: `BUG-BBB-POST-NNN-description.md` with an
  `**Original task(s):**` field pointing at the archived originals. They live in `tasks/` until Close-finalize,
  then archive to `tasks/done/`.
- **Scoping post-merge fixes:** ≤2 files mechanical → IO self-implements or dispatches a developer (same branch
  if unmerged, new hotfix branch if merged); architectural/cross-cutting → hotfix mini-slice (new brief, new
  branch, full lifecycle); cosmetic → regular BUG in the next slice; **unmet acceptance criterion → raise to
  the brief author** (the team cannot unilaterally redefine acceptance).
- **Branching:** simple fix `fix/brief-NNN-post-NNN-description`; hotfix mini-slice `brief-MMM-hotfix-for-NNN`.
- **Close-finalize unblocking:** runs only when all hold — PR merged, post-merge CI green (gate 8), staging
  smoke passed if the brief deploys (gate 9), no active `BUG-BBB-POST-NNN` files.
- **Retro addendum:** at Close-finalize the IO appends a `## Post-Merge Addendum` to `RETRO-BBB.md`.

## IO Phases

| Phase              | What the IO does                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Plan**           | **Slice-start gate** (new slices). **Context pre-flight:** ask user to run `/compact`. **Ingest** the brief (+ cited upstream refs). **Clarify:** confirm testable acceptance criteria + the brief's methodology; read the brief's `## Data & Interface Contract` if present; escalate to the brief author if untestable. **Design:** implementation design within cited constraints (or defaults); **expand the brief's `## Data & Interface Contract` to the full field-level contract** and bind it into task specs (escalate a genuinely-upstream shape question via OPEN-QUESTIONS, never invent); record `// DECISION:`s; **local design-coherence check** against the brief. Docker pre-flight. Create feature branch. **Decompose** into tasks (each traces to acceptance criteria; set `Impl`, mandated-test fields, `upstream_refs`, and thread the brief's `code_standards:` into the `code_standards` front-matter field of only the tasks that touch that key's bucket). Run `pnpm task phase-transition --brief NNN --phase Plan --role io`. |
| **Dispatch**       | Docker pre-flight before e2e waves. For each task: `Impl: io` → self-implement; else compose one developer dispatch. Sequential (one dispatch per IO turn). Mid-dispatch Overwatch audit on risk signals. Run `pnpm task phase-transition --brief NNN --phase Dispatch --role io`. |
| **Audit**          | Spawn Overwatch for per-task rule compliance, scope creep, inefficiencies. Address blocking findings before Review. Run `pnpm task phase-transition --brief NNN --phase Audit --role io`.                       |
| **Review**         | Spawn SDET for each `review` task. Handle rejections. **Design scan** after all pass — read the integrated diff, verify it honors the brief + cited constraints; fix forward on violations. Run `pnpm task phase-transition --brief NNN --phase Review --role io`. |
| **Smoke**          | Spawn SDET for container smoke (Docker only, not local dev). Fix and re-smoke until pass. Run `pnpm task phase-transition --brief NNN --phase Smoke --role io`.                                                |
| **Validate**       | Spawn SDET for the **acceptance validation gate** (delivered behavior vs. the brief's acceptance criteria under its mandated test methodology) + the CI gate + quality audit. Fix and re-run failed gates. Run `pnpm task phase-transition --brief NNN --phase Validate --role io`. |
| **Close-prep**     | **Consistency gate** (`pnpm task verify --brief NNN` — runs the relevant `validate-gates.sh` checks scoped to the brief; a correct hand-check that passes `scripts/validate-gates.sh` directly is equivalent). **Archive task/bug files** (`pnpm task archive --brief NNN` — moves only `status: done` files to `tasks/done/`; the CLI is the paved road but direct `mv` of done files still passes the gate). **Write the completion/handoff report** (which acceptance criteria were satisfied) for the upstream producer to absorb. **Retrospective** (Overwatch); classify only concrete gate failures per `ENGINE.md` § Retro Finding Classification. Run `pnpm task merge-checkpoint --pr NNN --brief NNN --role io` to move the slice to `awaitingMerge` in `state.json`. Request PR approval. **IO ends invocation.** |
| **Close-finalize** | **After PR merge.** Verify gates 8 + 9. If fail → `BUG-BBB-POST-NNN`. If pass → archive, sweep, write Post-Merge Addendum + gate detail to RETRO file, run `pnpm task post-merge --pr NNN --sha SHA --role io` to remove from `awaitingMerge`. IO ends. |

### Phase exit conditions

Each phase has a single, observable exit condition; meeting it is the signal to transition. The IO must not
pause for user confirmation at a phase boundary when the exit condition is met. Conditions referencing a set
("every blocking finding…") are **vacuously satisfied when the set is empty**. Wherever "blocking" appears, the
**IO is the dispositioning authority**.

| Phase              | Exit condition (all must be true)                                                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan**           | Slice-start gate clear. Docker pre-flight passed. `/compact` requested. Brief ingested; every task traces to testable acceptance criteria; the brief's methodology recorded. Feature branch `brief-NNN-*` created. Every task file has `status: backlog`, `impl:`, mandated-test fields, `acceptance_criteria`, `upstream_refs`, `code_standards` (or `none`) in its front matter. Design-coherence check passed. `state.json` `currentBrief` + `currentPhase` updated. |
| **Dispatch**       | Every `TASK-BBB-*` / `BUG-BBB-*` for the current slice has `Status: review` or `done`; zero at `backlog`/`in-progress`. Every developer Work Log contains submission-gate evidence (or artifact-review evidence for SDET-implemented quality-slice tasks). No tasks carry `Escalated: yes` without a recorded IO resolution. |
| **Audit**          | Overwatch audit recorded as a `pnpm task trace` event (or a mid-Dispatch audit cross-referenced). Every finding the IO classified as blocking has a dispatched fix or a recorded disposition (vacuous when zero). |
| **Review**         | Every task `status: done` with the `## SDET Review` section completed, every Mandatory Quality Gate box ticked, `complexity_actual` + `completed_at` populated. IO design scan recorded; every blocking scan finding has a fix task that reached `done`.                        |
| **Smoke**          | SDET container-smoke pass recorded in `state.json` `awaitingMerge[n].gateVerdicts.containerSmoke` (via `pnpm task merge-checkpoint`), naming the command and pass verdict. Any failure → fix task `done` + re-smoke pass recorded. |
| **Validate**       | SDET acceptance-validation report with approval; SDET CI-gate report with pass; SDET quality audit with no blocking gaps. Gate verdicts recorded in `state.json` (`sdetValidation`, `sdetCiGate`, `sdetQualityAudit` slots). |
| **Close-prep**     | `RETRO-BBB.md` written. Completion/handoff report written. Task files archived to `tasks/done/` (via `pnpm task archive --brief NNN` or equivalent). Pre-close consistency gate passed (via `pnpm task verify --brief NNN` or `bash scripts/validate-gates.sh` directly). `pnpm task merge-checkpoint` records the PR in `state.json` `awaitingMerge`. PR raised and URL recorded. (IO then ends; PR merge is the user-in-loop checkpoint per `ENGINE.md` § Autonomy Ceiling.) |
| **Close-finalize** | PR merged. Gate verdicts confirmed in `state.json`. For deploying briefs: staging smoke verified (gate 9). Zero active `BUG-BBB-POST-NNN`. Post-Merge Addendum + gate detail written. `pnpm task post-merge` removes the entry from `awaitingMerge`. |

**Slice-level exit:** Close-finalize exit met → `state.json` `currentBrief` cleared; the IO is eligible to Plan the
next slice if the slice-start gate passes.

### Resume logic

When invoked, the IO reads `.implementation/state.json` (via `pnpm task report` for a human-readable view):
**`awaitingMerge` non-empty** → attempt Close-finalize; **`currentPhase` in progress** → resume it;
**phase completed** → start the next; **`currentBrief` null** → check the slice-start gate, then enter
Plan if a brief is available.

## Slice Lifecycle

1. The user (or an upstream orchestrator such as `.planning/`) provides a **build brief**.
2. The user invokes the **IO** — it drives the slice through all phases.
3. The user re-invokes the IO between phases if a session ends; `state.json` + `events.jsonl` carry the structured state.
4. At **Close-prep**, the IO archives + retros + requests the PR, then ends.
5. After merge, the user re-invokes the IO for **Close-finalize**.

## Scorecard — the 9 quality gates

The `currentPhase` field in `.implementation/state.json` encodes pipeline progress; per-slice gate detail lives in `RETRO-BBB.md`.

1. Per-task submission gates (`N/N`)
2. SDET Review (`N/N` approved)
3. Overwatch Audit
4. IO Design scan
5. Container Smoke gate
6. SDET Acceptance-validation gate (delivered behavior vs. the brief's acceptance criteria)
7. SDET CI gate
8. Post-merge CI
9. Post-merge staging smoke (only if the brief deploys)

### Per-task gates

Every task carries its own Quality Gates checklist (see `_templates/task.md`): Work Log complete, Submission
gate, Targeted e2e (if the brief mandates it), Security review, SDET Review approved. The SDET walks this
checklist literally — every unticked Mandatory box is a rejection.

### Brief metadata fields

- **`brief_type`** — `feature`, `quality`, `document`, or `hotfix`.
- **`brief_deploys`** — `yes` or `no`. The IO mirrors to task files; gate 9 applies only when `yes`.

### Slice-start gate

If `state.json` `awaitingMerge` is non-empty, the IO stops and reports. No new Plan while an old slice is
unresolved. **Hotfix carve-out:** hotfix mini-slices targeting a limbo slice may proceed.

### Backlog triage (slice-kickoff)

Before Plan on a new slice, the IO runs `pnpm task report` and triages: `awaitingMerge` empty (or hotfix);
`openRetroItems` all dispositioned (active bugs are a QUERY over BUG-* front matter — check `tasks/` directly).
`deferred` requires an explicit reason; bare `deferred` fails the gate.

# Agent Phases — SA-Only Reference

> **Who reads this:** The SA reads this file during its startup checklist. Other agents (Developer, SDET, RA, Overwatch) do NOT need to read this file — they receive phase context via the SA's spawn prompt and PROGRESS.md.
>
> **Core rules** live in `agent-stack.md`. This file contains SA orchestration details: phase lifecycle, epic scorecard, post-close protocol, testing epic adaptations, and self-implementation criteria.

## SA Self-Implementation

The SA may implement tasks marked `Impl: sa` directly instead of spawning a developer. This preserves context for mechanical work. Use `Impl: sa` only when **all** of:

- Touches 1-2 files with an obvious, mechanical modification
- No TDD iteration or significant debugging expected
- Not `E2e-required: yes`
- SA context window is not under pressure (delegate instead if late in a large epic)

SA-implemented tasks still go through the submission gate and SDET review — the SA cannot approve its own code. Task specs for `Impl: sa` should be thinner: define _what_ and _why_, not _how_. The Work Log must capture any non-obvious design constraints for downstream tasks to respect, and any later developer task depending on an SA-implemented change must reference it by task number.

**Bail-out rule:** If unexpected debugging starts, scope expands past 2 files, or the change grows beyond mechanical — stop, mark the task `Impl: developer`, and delegate. Do not burn SA context on iteration.

**When in doubt, delegate.** A wasted developer spawn is cheaper than an SA running out of context mid-epic.

## Testing Epics

Some epics are test- or quality-focused rather than feature-focused (e.g., scenario mapping, security testing, accessibility audits, load testing). These epics follow the same SA phase lifecycle but with adapted role assignments and submission gates.

### Role adaptations

- **SDET becomes a primary implementer.** In testing epics, the SDET writes tests, produces audit reports, creates scenario maps, and runs analysis tools — not just reviews. The SA must communicate this role change when dispatching the SDET: include "This is a testing epic — you are the primary implementer, not a reviewer. Write tests, produce reports, and create artifacts as defined in the task spec." in the dispatch prompt.
- **Developers are secondary.** Developers are only dispatched if the testing epic reveals gaps that require code changes (e.g., missing error handling, graceful degradation logic, accessibility fixes). The SA creates developer tasks as needed based on SDET findings.
- **SA is the approval authority for SDET-implemented tasks.** The SDET cannot review its own implementation. Overwatch audits SDET work during the Audit phase (advisory findings), then the SA makes the final approve/reject decision during Review. SDET retains approval authority for any developer-implemented tasks (standard flow). To make review routing explicit, the SA must set `Reviewer: sa` on SDET-implemented tasks and `Reviewer: sdet` on developer-implemented tasks during the Plan phase. **Independence limitation:** the SA both designs tasks and approves SDET work, which is not fully independent. Overwatch's Audit findings are the counterbalance — the SA must document a disposition for each Overwatch finding before approving.

### Submission gate adaptations

Testing epic tasks may produce different artifact types. The submission gate adjusts based on task output:

| Task output type                                                        | Gate requirements                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Test code** (e2e tests, load tests, security tests)                   | Standard gate: lint + type-check + tests must pass                                                                                                                                                              |
| **Documents** (scenario maps, audit reports, coverage analysis)         | SA reviews for completeness against the task spec's Definition of Done; verifies all required sections are present, all flows are mapped, and findings are actionable (not vague). No lint/type-check required. |
| **CI/infrastructure config** (scanning tools, browser matrix config)    | Standard gate + verification that the pipeline runs successfully                                                                                                                                                |
| **Code fixes** (error handling, degradation logic found during testing) | Full standard gate including e2e where applicable                                                                                                                                                               |

### SDET-to-SA signaling for second-wave tasks

When the SDET discovers gaps that require code changes during a testing epic, it must flag them explicitly in its Work Log using this format:

```
**Code fix needed:** [description of the gap]
- Affected files/components: [list]
- Suggested fix: [brief guidance]
- Severity: [blocking | non-blocking]
```

The SA reads these flags after SDET tasks complete and creates developer tasks for the second wave.

### SA phase adjustments for testing epics

These adjustments **override** the corresponding entries in the standard SA Phases table when the current epic is a testing epic.

- **Plan:** SA identifies which tasks go to SDET vs. developers. SDET tasks are dispatched first — their findings may generate developer tasks.
- **Dispatch:** SDET tasks are dispatched before developer tasks. If SDET findings produce new developer tasks, the SA creates and dispatches them in a second wave.
- **Review:** SA reviews and approves/rejects SDET-implemented tasks. SDET reviews any developer-implemented tasks (standard flow).
- **Smoke:** SA may skip if the epic produced no container or infrastructure changes.
- **Validate:** The RA's e2e gate applies only if the epic produced new e2e tests or code changes. For document-only epics, the RA validates against delivered artifacts. The SDET CI gate applies if any code or config was changed.
- **Close-prep:** No changes — standard flow applies.
- **Close-finalize:** Gate 9 applies as normal. Gate 10 is skipped when `Epic-deploys: no`.

## Post-Close Protocol (PR Limbo)

Between **Close-prep** (PR raised) and **Close-finalize** (PR merged + verified), the epic is in **PR limbo**. Task files and the epic requirement are already archived, but the epic is not truly done until post-merge verification passes. The epic appears in PROGRESS.md `## Awaiting PR merge` during this window.

### Handling issues during limbo

Any issue discovered during PR review, CI-on-PR, merge conflicts, or post-merge verification is tracked as a **post-merge bug** in `docs/tasks/` (active):

- **Naming:** `BUG-EEE-POST-NNN-description.md` where `EEE` is the epic number and `NNN` is a counter starting at 001.
- **Cross-reference:** each file must include an `**Original task(s):**` field pointing at the archived originals in `docs/tasks/done/`.
- **Location:** lives in `docs/tasks/` (active) until Close-finalize runs successfully, then archives to `docs/tasks/done/`.
- **Dispatch:** POST bugs flow through the standard SA pipeline. For simple fixes (≤2 files, mechanical), the SA may self-implement per § SA Self-Implementation.

### Scoping post-merge fixes

- **≤2 files mechanical** → SA self-implements or dispatches a developer. Same branch if the PR is not yet merged; a new hotfix branch if already merged.
- **Architectural or cross-service** → spin a **hotfix mini-epic** (new epic number, new branch, full lifecycle). The original epic stays in limbo until the hotfix lands.
- **Cosmetic or deferrable** → file as a regular BUG in the next epic's queue. The original epic is free to run Close-finalize.
- **Unmet acceptance criterion** → **escalate to the RA**. The RA flips the requirement back to `Planned` and creates a new epic.

### Branching for post-merge fixes

- **Simple fix:** `fix/ep-NNN-post-NNN-description`
- **Hotfix mini-epic:** `ep-MMM-hotfix-for-ep-NNN-description`

### PROGRESS.md during limbo

PROGRESS.md `## Current initiative` shows `Status: awaiting PR merge` during limbo, and the epic appears in `## Awaiting PR merge`. At Close-finalize the SA sweeps entries and resets PROGRESS.md.

### Close-finalize unblocking

Close-finalize only runs when **all** hold: (1) PR merged, (2) post-merge CI green (gate 9), (3) staging smoke passed if `Epic-deploys: yes` (gate 10), (4) no active `BUG-EEE-POST-NNN` files remain.

### Retro addendum

At Close-finalize, the SA appends a `## Post-Merge Addendum` to `RETRO-EEE.md` covering merge/CI/staging outcomes and any POST bugs.

## SA Phases

### Phase-transition reflex

**At every phase transition, the SA performs these four actions as a single atomic unit:**

1. **Sweep** previous phase's session entries to `PROGRESS-ARCHIVE.md`
2. **Update** `## Current initiative` with the new phase name and update task statuses
3. **Append** the phase-start session entry below the `---` marker

This is a reflex, not a checklist — unconditional at every transition.

| Phase              | What the SA does                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan**           | **Backlog triage (new epics only):** run § Backlog triage before any other Plan work. **Context pre-flight:** ask user to run `/compact`. Read epic requirements + architecture docs + tenets. Docker pre-flight. Create feature branch. Break epic into tasks. **Design coherence gate.** Update PROGRESS.md.                                                              |
| **Dispatch**       | Docker pre-flight before e2e-required waves. For each task: `Impl: sa` → self-implement; otherwise spawn developer. Sequential dispatch. Mid-dispatch Overwatch audit when risk signals appear. Update PROGRESS.md.                                                                                                                                                         |
| **Audit**          | Spawn Overwatch for per-task rule compliance, scope creep, inefficiencies. Address findings before Review. Update PROGRESS.md.                                                                                                                                                                                                                                              |
| **Review**         | Spawn SDET for each `review` task. Handle rejections. **Architecture scan** after all tasks pass. Fix forward if violations found. Update PROGRESS.md.                                                                                                                                                                                                                      |
| **Smoke**          | Spawn SDET for container smoke test (Docker only, not local dev). Fix and re-smoke until pass. Update PROGRESS.md.                                                                                                                                                                                                                                                          |
| **Validate**       | Spawn RA for e2e gate. Spawn SDET for CI + quality parity audit. Fix and re-run failed gates. Update PROGRESS.md.                                                                                                                                                                                                                                                           |
| **Close-prep**     | Update architecture model, create ADRs. **Consistency gate.** Archive task/bug/plan files. Verify RA archival. **Retrospective** (Overwatch). **Retro findings are advisory by default** — only concrete gate failures get classified per § Retro Finding Classification. Update PROGRESS.md → move to `## Awaiting PR merge`. Request PR approval. **SA ends invocation.** |
| **Close-finalize** | **After PR merge.** Verify gates 9 + 10. If fail → `BUG-EEE-POST-NNN`. If pass → archive, sweep, write Post-Merge Addendum + Quality gate detail to RETRO file, remove from `## Awaiting PR merge`. **Update `docs/plans/release-roadmap.md`** — mark the epic ✅ Done in the appropriate phase table and update the execution order summary. SA ends.                      |

### Epic resume logic

When invoked, the SA reads PROGRESS.md:

- **Epic in limbo** → attempt Close-finalize
- **Phase in progress** → resume it
- **Phase completed** → start next phase
- **No epic active** → check epic-start gate, then enter Plan if requirements exist

## Epic Lifecycle

1. User invokes **RA** to define epic requirements
2. User invokes **SA** — drives the epic through all phases
3. User re-invokes SA between phases if session ends. PROGRESS.md carries state.
4. At **Close-prep**, SA archives + retro + requests PR. SA ends.
5. After merge, user re-invokes SA for **Close-finalize**.

## Epic Scorecard

The `Phase:` field in PROGRESS.md encodes pipeline progress — no separate gate checklist needed. Per-epic gate detail lives in `RETRO-NNN.md`.

### The 10 quality gates

1. Per-task submission gates (`N/N` tasks)
2. SDET Review (`N/N` approved)
3. Overwatch Audit
4. SA Architecture scan
5. Container Smoke gate
6. RA Validation gate
7. SDET CI gate
8. SDET Quality Parity audit
9. Post-merge CI
10. Post-merge staging smoke (only if `Epic-deploys: yes`)

### Per-task gates

Every task carries its own Quality Gates checklist (see `docs/tasks/_TEMPLATE.md`): Work Log complete, Submission gate, Targeted e2e (if applicable), Security review, SDET Review approved. The SDET walks this checklist literally — every unticked Mandatory box is a rejection.

### Epic metadata fields

- **`Epic-type:`** — `feature`, `testing`, `document`, or `hotfix`. RA-owned.
- **`Epic-deploys:`** — `yes` or `no`. RA-owned. SA mirrors to plan + task files.

### Epic-start gate

If any epic appears in `## Awaiting PR merge`, the SA stops and reports it. No new Plan while an old epic is unresolved.

**Hotfix carve-out:** hotfix mini-epics targeting a limbo epic may proceed.

### Backlog triage (epic-kickoff)

Before Plan on a new epic, every PROGRESS.md section must be triaged: `## Awaiting PR merge` empty (or hotfix), `## Active bugs` all dispositioned, `## Open retro action items` all dispositioned. The SA surfaces undisposed items to the user. No Plan work until triage is complete.

**Deferral discipline:** `deferred` requires an explicit reason. Bare `deferred` fails the gate.

### Maintenance cadence

The SA updates PROGRESS.md at every phase transition: populate `## Current initiative`, tick gates, sweep session entries. At Close-prep → move to `## Awaiting PR merge`. At Close-finalize → remove and write gate detail.

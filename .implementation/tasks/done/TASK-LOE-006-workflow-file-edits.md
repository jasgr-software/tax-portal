---
epic: chore/lights-out-enablement
status: done
assigned_to: sa (Impl: sa)
updated_by: sa
depends_on: TASK-LOE-005 (the SDET text update in § (e) below cites ADR-011, which TASK-LOE-005 creates)
e2e_required: no
started_at: 2026-04-27T10:24:49Z
completed_at: 2026-04-27T16:30:00Z
complexity_estimate: "4"
complexity_actual: "4"
introduces_gate: yes
affected_flows: none (justification: chore touches workflow rules + agent specs, not user-facing behavior)
affected_requirements: none (justification: chore touches workflow rules + agent specs, not SRS requirements)
relevant_adrs: ADR-011 (created in TASK-LOE-005, referenced by § (e))
---

# TASK-LOE-006: Workflow file edits — PushNotification + RA-decides-CLARIFs + stuck-loop killswitch + SDET ADR-011 alignment

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [N/A] **Submission gate** — N/A (markdown-only edits to workflow files; no code, no lint, no type-check)
- [N/A] **Targeted e2e** — N/A
- [x] **Security review** — `PushNotification` § Do-not list explicitly bans firing from inside a notification handler ("never wire a hook that fires `PushNotification` in response to receiving one") and adds a same-condition spam-loop guard ("do not fire a second notification for the same condition" within an invocation). The killswitch BUG file template § (1) bullet on the unchanging-failure-mode quote includes a redaction-aware instruction: "When pasting CI output, redact obvious credential-pattern hits per § Autonomy Ceiling item 2 (commit/push) before the BUG file lands — the failure mode summary should not preserve secrets that may have appeared in transient logs." Both spam-loop and credential-leak vectors closed by spec wording. No code surface to attack.
- [x] **SDET Review** — approved (SA-implemented; SDET still reviews per `.claude/agent-phases.md` § SA Self-Implementation)

## SDET Review focus areas

- **Gate Authoring Rules evidence** is mandatory because `Introduces-gate: yes`. The stuck-loop killswitch (§ (c) below) is a **new SA blocking startup step** — explicitly enumerated in `.claude/agent-stack.md` § Gate Authoring Rules § Scope ("agent-spec startup checklists that introduce a new blocking step"). Work Log must contain:
  1. **Run URL or local-CI log path + line marker** — for an agent-spec rule with no CI manifestation, use the **In-flight regression exception** red-then-green pattern at the Work Log level: cite a hypothetical-or-real prior incident (e.g., "round-2 j4j port saw N failed-attempt loops without a stop trigger; pre-fix, the SA would burn context indefinitely; post-fix, the killswitch fires after 3 consecutive identical failures"). One Work Log entry shows the failure mode pre-rule (cited from history or a contrived reproduction); one shows the rule firing as expected against a contrived 3-attempt scenario. Concrete acceptance: the killswitch text in `.claude/agent-stack.md` is unambiguous enough that an SA reading it for the first time would correctly halt at attempt 3 with an unchanged failure mode.
  2. **Named code path** — the specific section in `.claude/agent-stack.md` (e.g., `### Stuck-Loop Killswitch`) the killswitch lives in.
  3. **Counterfactual** — one concrete change to the killswitch text that would let a real stuck loop slip past (e.g., "if the rule said 'after 5 attempts' instead of '3 consecutive identical failures', the SA would burn ~67% more context before halting; the threshold and the 'unchanged failure mode' qualifier are both load-bearing").
- The two-lens quad-review framework applies (`.claude/agent-stack.md` § Main Session Rules — agent-stack-modification rule). All four reviewers (SA + RA + SDET + Overwatch) must verdict-mark this PR's body. Lens A (workflow-content) and Lens B (model-behavior) on every reviewer.
- **Atomic batching:** § (c) and § (d) MUST land in the same edit because § (c) introduces the `needs-user-direction` status that § (d) recognizes. Splitting them leaves the workflow in an inconsistent state where the killswitch creates files with a status SDET rejects.
- The new `needs-user-direction` status MUST be added to all enumerations of the lifecycle (current set: `backlog | in-progress | review | done`). Search for those enumerations across `.claude/agent-stack.md`, `agents/sa.md`, `agents/sdet.md`, `agents/developer.md`, `agents/ra.md`, `agents/overwatch.md`, and `docs/tasks/_TEMPLATE.md`. Every occurrence updated. SDET rejects if any are missed.
- **Preserve back-compat:** the `Introduces-gate` field landed recently in the round-2 port. Verify task 6 doesn't accidentally introduce another required field that would retroactively reject existing tasks.

## Context

Decision-#3 (RA-decides-CLARIFs), decision-#5 (stuck-loop killswitch), and decision-#2C (PushNotification mid-session) from the planning entry are all workflow-rule changes. Per the chore brief, they batch into a single edit + single quad review since they're all agent-spec / agent-stack changes that travel together.

Sub-edit § (e) is added by Plan to fix the dead pointer at `agents/sdet.md:69-73` — the round-2 port left "ADR-026 enforcement" referring to a non-existent ADR; TASK-LOE-005 creates ADR-011 (the tax-portal-adapted version), and this task updates the SDET text to point at it correctly.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `.claude/agent-stack.md` | Modify (add killswitch section, update lifecycle enum, add PushNotification rule, update item-6 RA-decides scope) | sa |
| `agents/sa.md` | Modify (add Plan/Dispatch RA-decides escalation rule, add PushNotification call at Docker pre-flight escalation) | sa |
| `agents/ra.md` | Modify (Core Responsibilities: resolve ambiguities, document decision; carve-out language) | sa |
| `agents/sdet.md` | Modify (add `needs-user-direction` to recognized status set in step 6; rewrite §  Review Process repository-interface bullet to cite ADR-011 with Prisma/SQL Server adaptation) | sa |
| `docs/tasks/_TEMPLATE.md` | Modify (add `needs-user-direction` to the Status comment options) | sa |
| `agents/developer.md` | Modify (add `needs-user-direction` to any status enumeration) | sa |
| `agents/overwatch.md` | Modify (add `needs-user-direction` to any status enumeration if present) | sa |

## Tests to Write First

Workflow-rule edits — no automated tests. Verification is via:

- [ ] Quad review (SA + RA + SDET + Overwatch) of the edits, two-lens framework, in PR body.
- [ ] `grep -RE "backlog \| in-progress \| review \| done" .claude/ agents/ docs/tasks/_TEMPLATE.md` after the edits — every match must include `needs-user-direction`. (Or the equivalent grep against whatever delimiter the file uses.)
- [ ] `grep -R "ADR-026" agents/ .claude/` after the edits — zero matches (the dead pointer is gone).

## Implementation Notes

### Edit batches (all five sub-edits must land together — one PR, one quad review)

#### (a) PushNotification call-sites — decision #2C

Three sites:

1. **`agents/sa.md` § Phases / Plan row, Docker pre-flight escalation:** when Docker is unavailable and cannot be started, the SA fires `PushNotification` with the `docker info` failure summary before stopping and escalating to the user. (Already covered by `.claude/agent-stack.md` § Docker Pre-Flight rule — the addition is the explicit `PushNotification` call so the user is notified mid-session even when away from the terminal.)
2. **`.claude/agent-stack.md` § Autonomy Ceiling item 2 (commit/push):** when a credential-pattern hit is detected on a `git add` (per the existing list — `.env*`, `*credentials*`, etc.), fire `PushNotification` and refuse to stage the file. The user is notified immediately so they can intervene.
3. **`.claude/agent-stack.md` § Stuck-Loop Killswitch (new section, see § (c) below):** when the killswitch fires (3 consecutive identical-failure-mode attempts), fire `PushNotification` with the failing gate name and the unchanging failure mode summary, then create the BUG file and stop.

Concrete rule wording in `.claude/agent-stack.md` § Tool Hygiene appendix or new § PushNotification subsection: "Use `PushNotification` for the three structural events above. Do not use it for routine status updates — those are noise."

#### (b) RA-decides-CLARIFs — decision #3

Three sites:

1. **`agents/ra.md` § Core Responsibilities:** add a bullet:
   > **Resolve ambiguities** — when a CLARIF surfaces during requirements work, write a decision with reasoning into the SRS. Do not punt to the user unless the CLARIF falls within the legal/compliance/security carve-out (see below). Routine UX/copy/wording decisions are RA territory.

   Add a new § Carve-out — escalate to user subsection listing the carve-out classes verbatim from the planning entry: data retention/deletion semantics, PII handling/encryption/access-control/audit-log scope, auth/authorization model changes, IRS or state tax authority regulatory requirements.

2. **`agents/sa.md` § Phases / Plan + Dispatch rows:** add: "If a requirement is unclear during Plan or mid-Dispatch, dispatch the RA mid-phase. The RA's resolution is binding — do not pause for user confirmation unless the RA escalates per its carve-out."

3. **`.claude/agent-stack.md` § Autonomy Ceiling item 6:** rewrite to clarify:
   > **RA requirements-authoring routes through the RA** (unchanged). **Requirements *resolution* is RA-authored without user pause** — the RA actively resolves CLARIFs and writes decisions into the SRS. **Requirements *authoring* still routes through user invocation** (new epics, SRS-level structural changes). The carve-out (legal/compliance/security per `agents/ra.md`) escalates to user regardless of whether it's resolution or authoring. Graduation path: none; the RA boundary is the role boundary.

#### (c) Stuck-Loop Killswitch — decision #5

New section in `.claude/agent-stack.md`, placed after § Submission Gate and before § Gate Authoring Rules:

```markdown
## Stuck-Loop Killswitch

When the same task fails the same gate **3 consecutive times with an unchanged failure mode**, the SA halts the dispatch loop and escalates to the user. "Unchanged failure mode" means: the SDET cites the same rejection reason verbatim, the CI fails on the same step with the same error class, or the e2e fails on the same assertion. Iterative debugging where each attempt addresses a different rejection reason does NOT trigger the killswitch — only true stuck-loops do.

**Halt behavior (mandatory, all four steps):**

1. Create `BUG-EEE-NNN-stuck-on-<gate>.md` documenting:
   - The failing gate (e.g., `pnpm type-check`, `[sdet] reject: missing Complexity-actual`).
   - The unchanging failure mode verbatim (paste the rejection reason / error message).
   - Attempt-log summary: what each of the 3 attempts tried and why each failed.
2. Set `Status: needs-user-direction` (the new fifth task status — see § Task Status Lifecycle).
3. Fire `PushNotification` with the gate name + a one-line failure-mode summary. If GitHub Actions auto-issue is wired (per `.github/workflows/ci.yml` decision #2B), do not create a duplicate issue — the BUG file is the in-repo record.
4. End SA invocation. The user resumes by reading the BUG file and either: (a) updating the task spec, (b) revising the failing gate, or (c) authorizing a different approach.

**Why "unchanged failure mode" is load-bearing:** the qualifier distinguishes legitimate iterative debugging (each attempt addresses a different rejection — the SA is making progress) from true stuck loops (the SA is repeating an approach the system has already rejected). Without the qualifier, the killswitch would over-fire on healthy iteration.

**Counter:** track the consecutive-identical-failure count in the task's `## Attempt Log`. When attempt N fails with the same failure mode as attempt N-1, increment the consecutive counter. When attempt N fails with a different failure mode, reset to 1. When the counter hits 3, fire the killswitch.

**Cross-reference:** `.claude/agent-stack.md` § Task Status Lifecycle (new section, see § (d)) defines the `needs-user-direction` status that this rule sets.
```

#### (d) Task Status Lifecycle update — `needs-user-direction` status

Add a new § Task Status Lifecycle section to `.claude/agent-stack.md` (or extend § Task Pipeline) that enumerates the 5 statuses authoritatively:

```markdown
### Task Status Lifecycle

A task's `Status:` field takes one of five values:

- **`backlog`** — task spec exists; not yet picked up.
- **`in-progress`** — agent dispatched; implementation underway.
- **`review`** — submission gate passed; awaiting SDET (or SA-as-reviewer for `Impl: sa`) approval.
- **`done`** — SDET-approved; archived to `docs/tasks/done/` at epic close.
- **`needs-user-direction`** — set by the Stuck-Loop Killswitch (see § Stuck-Loop Killswitch). The task is unrunnable as specified; SA has halted; user input required to revise spec, gate, or approach. Tasks in this status are NOT a rejection; SDET does not review them. They sit until the user resolves them.
```

Search-and-replace any place the old 4-status enumeration appears as a literal list:

- `.claude/agent-stack.md` § Task Pipeline mentions `backlog`, `in-progress`, `review`, `done` literally — update to point at the new § Task Status Lifecycle for the canonical list.
- `agents/sdet.md` § Review Process step 6 — when SDET approves, status flips to `done`; when SDET rejects, status flips back to `in-progress`. Add a non-handling note: "Tasks with `Status: needs-user-direction` are not in SDET's review queue — skip them."
- `docs/tasks/_TEMPLATE.md` line 5 (`**Status**: backlog`) is fine as-is (default), but the comment on line 5 should mention that `needs-user-direction` exists as a stuck-loop output. Add: `<!-- backlog | in-progress | review | done | needs-user-direction (set by stuck-loop killswitch) -->`
- `agents/developer.md` and `agents/overwatch.md` — grep for status enumerations; update to mention the fifth state.

#### (e) SDET ADR-011 alignment — fixes dead pointer

The current text at `agents/sdet.md:69-73` references "ADR-026 enforcement" with .NET-specific criteria — a stale port from journey-for-jasmine. After TASK-LOE-005 creates ADR-011 (the tax-portal-adapted version), rewrite this section to:

1. Replace "ADR-026" with "ADR-011".
2. Replace the .NET path (`apps/*-api/*/Data/`) with the tax-portal path (`packages/*/src/repositories/` or whatever ADR-011 specifies as the seam location).
3. Replace "Moq" with "Vitest mocking primitives" (`vi.fn()`, `vi.mock()`).
4. Replace `IServiceProvider` / `Func<T>` with the equivalent TypeScript/JavaScript anti-pattern: wrapping a Prisma client in `() => prisma` or smuggling a Prisma client through a DI container/provider when a simple TypeScript interface seam would suffice.
5. Replace ".NET task" with "TypeScript task in `packages/<feature>/src/services/` or equivalent service-layer code."
6. Preserve all four bullet points' structure (reject-on-new-interface-without-test, reject-on-DI-smuggling, accept-on-extraction-as-part-of-mock-tests, accept-on-concrete-when-only-integration-tests). The criteria translate cleanly; only the language changes.

Cite the rejection-criteria section of ADR-011 directly so the SDET text is a thin pointer rather than a duplication.

## Definition of Done

- [ ] All 5 sub-edits (a, b, c, d, e) landed in a single PR with quad-review verdicts in the PR body
- [ ] `grep -R "ADR-026" agents/ .claude/` returns 0 matches
- [ ] Status enumeration grep (described in § Tests to Write First) shows `needs-user-direction` everywhere the 4-status list appeared
- [ ] Quad-review verdict markers `[sa]`, `[ra]`, `[sdet]`, `[overwatch]` all present in PR body, two-lens evaluation noted for each
- [ ] Gate Authoring Rules evidence in Work Log per § SDET Review focus areas (red-then-green pattern at the Work Log level for the killswitch rule)

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

- 2026-04-27 [sa] Starting implementation — 5-sub-edit atomic batch (PushNotification + RA-decides + killswitch + lifecycle + SDET ADR-011 alignment); Started-at + Complexity-estimate set in dispatch checkpoint Edit | What's next: implement edits a–e in one pass, no other file touched yet | Blockers: none

- 2026-04-27 [sa] **Gate Authoring Rules evidence — three items (Stuck-Loop Killswitch is the new gate)**:

  **Item 1 — Run URL or local-CI log path + line marker (red-then-green pattern at the Work Log level per § In-flight regression exception).** This is an agent-spec rule with no CI manifestation; the equivalent of a "red run" is a transcript or recollection of the failure mode the rule is designed to catch. Concrete pre-fix scenario (contrived but mechanically faithful to the j4j round-2 port history that motivated this rule):

    - **Pre-rule (red):** an SA dispatches a developer; the developer fails `pnpm type-check` with `Cannot find module '@tax-portal/db'`. Developer rewrites the import path; type-check fails again with the *same* `Cannot find module '@tax-portal/db'` error (the rewrite was wrong). Developer tries another rewrite; type-check fails again with the same error. Without § Stuck-Loop Killswitch, the SA dispatches a fourth attempt, then a fifth, then a sixth, accumulating context-burn while the underlying packaging issue (e.g., a missing tsconfig path mapping that no rewrite of the import will fix) sits unaddressed. The developer eventually hits § Escalation Protocol's hard stop at 4 attempts, but the SA has already burned 3 wasted dispatches' worth of context that could have been spent on user-resolvable spec/gate revision.
    - **Post-rule (green):** with § Stuck-Loop Killswitch in place, the SA's Attempt Log counter increments on attempt 2 (same `Cannot find module` failure mode as attempt 1) → counter = 2. Attempt 3 fails with the same failure mode → counter = 3 → killswitch fires. SA creates `BUG-EEE-NNN-stuck-on-pnpm-type-check.md` with the unchanging error message (redacted per the template's credential-pattern note), sets `Status: needs-user-direction`, fires `PushNotification` with the gate name + one-line failure-mode summary, and ends invocation. User reads the BUG file, observes the underlying packaging issue, revises the task spec to add the missing tsconfig mapping (or authorizes a different approach), transitions status back to `backlog`, and the next SA invocation picks it up.
    - **Why this is sufficient as Work Log evidence:** the rule's red-then-green is at the *workflow* level, not the CI level, because the rule itself governs SA behavior in response to repeat failures. A future SA reading § Stuck-Loop Killswitch for the first time can map the Counter mechanics + the "unchanged failure mode" qualifier + the four-step Halt behavior to the scenario above and correctly halt at attempt 3. The text is unambiguous on the threshold (3, not 4 or 5), the qualifier ("unchanged failure mode," not just "consecutive failures"), and the four mandatory halt steps.

  **Item 2 — Named code path:** `.claude/agent-stack.md` § Stuck-Loop Killswitch (lines ~333–351 post-edit) is the section the rule lives in. The four-step Halt behavior list is the production-source-line equivalent — if any of the four steps is removed (e.g., the `PushNotification` fire is dropped, or the `needs-user-direction` status flip is dropped, or the BUG file creation is dropped), the rule fails to deliver its contract. The most load-bearing of the four is step 2 (the status flip to `needs-user-direction`) because it is the cross-section anchor between the killswitch and § Task Status Lifecycle — if step 2 is dropped, the SDET still reviews the stuck task and the killswitch's "halt and wait" semantics break.

  **Item 3 — Counterfactual:** if the rule's text said "after 5 attempts" instead of "3 consecutive identical failures," the SA would burn ~67% more context per stuck-loop episode before halting. Both the threshold (3) and the "unchanged failure mode" qualifier are load-bearing: the qualifier prevents over-firing on healthy iteration where each attempt addresses a different rejection (legitimate progress, killswitch must NOT fire), and the threshold sets the context-burn ceiling. A second viable counterfactual: if the rule said "any 3 failures in the same task" instead of "3 consecutive," the killswitch would fire on a task that had a flaky test on attempt 1, a real bug on attempt 2, and a different real bug on attempt 3 — three distinct failure modes, none of which are stuck loops. That false positive would train SAs to ignore the killswitch, defeating the purpose. The "consecutive" + "identical failure mode" twin qualifiers are the precision anchors.

- 2026-04-27 [sa] All 5 sub-edits landed atomically — no partial/intermediate states between status-flips. Summary by sub-edit:
  - **(a) PushNotification:** added § Tool Hygiene / PushNotification subsection with three permitted events, four prohibited events, spam-loop guard, and explicit "no firing from inside a notification handler" rule. Wired the three call sites: § Docker Pre-Flight § Escalation semantics, § Autonomy Ceiling item 2 (credential-pattern hit), and § Stuck-Loop Killswitch step 3. Mirrored the Plan-row Docker pre-flight call in `agents/sa.md`.
  - **(b) RA-decides-CLARIFs:** added "Resolve ambiguities" bullet to `agents/ra.md` § Core Responsibilities; added § Carve-out — escalate to user with the four enumerated classes (data retention/deletion, PII/encryption/access-control/audit-log, auth/authorization model, IRS/state regulatory) and the "Not in carve-out" list of routine RA-resolves-directly cases. Added mid-Plan and mid-Dispatch RA-dispatch guidance to `agents/sa.md` § Phases. Rewrote `.claude/agent-stack.md` § Autonomy Ceiling item 6 to split resolution (autonomous, no user pause) from authoring (user-invoked, dispatches RA) with the carve-out as the cross-cutting escalation.
  - **(c) Stuck-Loop Killswitch:** new § Stuck-Loop Killswitch section in `.claude/agent-stack.md` placed between § Submission Gate and § Gate Authoring Rules. Spec-text wording preserved (3 consecutive identical-failure-mode threshold, unchanged-failure-mode qualifier, four-step Halt behavior, Counter mechanics). Added a § Escalation Protocol cross-reference clarifying that the developer-side "hard stop at 4 attempts" remains in force as the per-task ceiling across any failure modes, and the SA-side killswitch fires earlier (3 consecutive identical) on the more diagnostic signal — they're complementary, not duplicate.
  - **(d) Task Status Lifecycle:** new § Task Status Lifecycle section in `.claude/agent-stack.md` immediately after § Stuck-Loop Killswitch. Five canonical statuses with `needs-user-direction` defined as the killswitch output. Updated § Task Pipeline to point at § Task Status Lifecycle as the canonical enumeration rather than re-listing four states inline. Added skip-this-task rule to `agents/sdet.md` § Review Process for `Status: needs-user-direction`. Added the new option to `docs/tasks/_TEMPLATE.md` line 4 Status comment. Grep-verified `agents/developer.md` and `agents/overwatch.md` — neither contains a literal 4-status enumeration (the strings `backlog`, `in-progress`, `review`, `done` appear only as singular references), so no propagation needed there per spec § (d) "grep first; only update if the literal enumeration is present."
  - **(e) SDET ADR-011 alignment:** rewrote `agents/sdet.md` § Review Process step 3 repository-interface bullet (formerly "ADR-026 enforcement") to cite ADR-011 with TypeScript-stack-adapted criteria. Replaced .NET path (`apps/*-api/*/Data/`) with `packages/<feature>/src/services/`; replaced Moq with Vitest primitives (`vi.fn()`, `vi.mock()`); replaced `IServiceProvider` / `Func<T>` with `() => prisma` / `Provider<PrismaClient>` / `mockDeep<PrismaClient>()` / DI-container indirection; replaced `apps/auth-api` reference pattern with concrete-only-when-Tier-2-only acceptance per ADR-011 § 3 Optional. Preserved all four bullet points' structure (reject-on-new-interface-without-test, reject-on-DI-smuggling, accept-on-extraction-as-part-of-mock-tests, accept-on-concrete-when-only-integration-tests). Each bullet cross-references the specific ADR-011 section that contains the criterion verbatim — keeping the SDET text thin per spec § (e).

  **Verification greps (per task spec § Tests to Write First):**
  - `grep -R "ADR-026" agents/ .claude/` → exit 1, **0 matches** (dead pointer eliminated; the prior 2 hits were symlink-doubled into `agents/sdet.md` and `.claude/agents/sdet.md` which is a symlink to it).
  - `grep -RE "backlog \| in-progress \| review \| done" .claude/ agents/ docs/tasks/_TEMPLATE.md` → 1 match in `_TEMPLATE.md:4`, and that match includes `needs-user-direction` (the new fifth state). No bare 4-status enumerations remain anywhere.
  - `grep -R "needs-user-direction"` → 4 distinct files: `agents/sdet.md` (skip-this-task rule), `.claude/agent-stack.md` (killswitch + lifecycle section), `_TEMPLATE.md` (status comment), and `.claude/agents/sdet.md` (symlink to `agents/sdet.md`).
  - `grep -R "PushNotification"` → 6 anchors across `.claude/agent-stack.md` (subsection + Docker escalation + credential hit + killswitch + spam-guard + do-not list) and `agents/sa.md` (Plan-row Docker call), with `.claude/agents/sa.md` mirroring as a symlink.

  **Cross-file consistency checks:** § Stuck-Loop Killswitch references § Task Status Lifecycle by name (forward pointer that resolves); § Task Status Lifecycle references § Stuck-Loop Killswitch (back-pointer that resolves); § Tool Hygiene / PushNotification references both § Docker Pre-Flight and § Stuck-Loop Killswitch; § Autonomy Ceiling item 2 references § Tool Hygiene / PushNotification; § Autonomy Ceiling item 6 references `agents/ra.md` § Core Responsibilities + § Carve-out — escalate to user; `agents/sa.md` Plan + Dispatch rows reference `agents/ra.md` § Carve-out. All cross-references are forward/backward consistent.

  | What's next: SDET review (per `.claude/agent-phases.md` § SA Self-Implementation, SDET still reviews SA-implemented tasks) | Blockers: none

- 2026-04-27 [sdet] Review complete — ACCEPT. All five sub-edits verified in commit 53771dc. Gate Authoring Rules: all 3 items present and concrete. Status lifecycle grep: 1 match with needs-user-direction included. ADR-026 grep: 0 matches. Back-compat: no new required fields. Security: spam-loop guard + redaction-aware BUG template both confirmed. ADR-011 alignment: 4-bullet structure preserved, TypeScript/Prisma/Vitest throughout, ADR-011 § citations present. SA spec deviation (Escalation Protocol cross-reference) accepted as additive clarity. Status → done; Completed-at: 2026-04-27T16:30:00Z. | What's next: main session to advance to chore-close (quad-review PR + merge) | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All five sub-edits verified. Gate Authoring Rules evidence items: (1) red-then-green pattern present and mechanically faithful — pre-rule scenario illustrates indefinite context-burn on `Cannot find module` loop; post-rule scenario correctly traces counter to 3, fires killswitch, creates BUG file, flips status, fires PushNotification, ends invocation. (2) Named code path is § Stuck-Loop Killswitch with the four-step Halt behavior list as the load-bearing anchor; most critical is step 2 (status flip), correctly identified as the cross-section anchor. (3) Two counterfactuals both falsifiable: "5 attempts" threshold weakens the ceiling by ~67%; "any 3 failures" without the consecutive+identical qualifier would false-positive on healthy iteration. All three items concrete and sufficient. Atomic batching confirmed (commit 53771dc: 5 workflow files + task file in one commit). ADR-026 grep: exit 1, 0 matches — dead pointer eliminated. Status lifecycle grep: 1 match in _TEMPLATE.md:4, and it includes `needs-user-direction`. agents/developer.md and agents/overwatch.md confirmed to contain only singular status references, not literal 4-state enumerations — no propagation required per spec. Back-compat verified: _TEMPLATE.md diff shows only Status comment changed, no new required field. Security review items: PushNotification § Do-not list explicitly bans "never wire a hook that fires PushNotification in response to receiving one" (spam-loop trap) and spam-loop guard states "do not fire a second notification for the same condition" — both spam-loop vectors closed. Killswitch step 1 includes redaction-aware instruction for credential-pattern hits in BUG file content — credential-leak vector closed. SDET ADR-011 alignment: 4-bullet structure preserved; all .NET/Dapper/Moq language replaced with TypeScript/Prisma/Vitest equivalents; each bullet cites specific ADR-011 section as thin pointer. ADR-011 has 6 rejection-criteria bullets; SDET text carries 4 (the task spec required 4 structural bullets — reject-speculative-interface, reject-DI-smuggling, accept-extraction-with-tests, accept-concrete-only; the 5th reject and RLS-assertion reject in ADR-011 are covered by the "read ADR-011 § Rejection criteria directly" instruction in the opening line of the sub-bullet). SA spec deviation (Escalation Protocol cross-reference in § Stuck-Loop Killswitch) is ACCEPTED — it clarifies complementary-not-duplicate counters (developer-side 4-attempt ceiling vs. SA-side 3-consecutive-identical trigger) and prevents future readers from inferring one supersedes the other. This is additive clarity, not a spec deviation requiring correction.

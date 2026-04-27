# TASK-NNN: Title

**Epic**: EP-XXX
**Status**: backlog <!-- backlog | in-progress | review | done | needs-user-direction (set by stuck-loop killswitch — see .claude/agent-stack.md § Stuck-Loop Killswitch and § Task Status Lifecycle) -->
**Assigned to**: — <!-- webapp-developer | devops -->
**Updated-by**: —
**Depends on**: none
**E2e-required**: no
**Started-at**: — <!-- ISO 8601 UTC, set when status first leaves backlog -->
**Completed-at**: — <!-- ISO 8601 UTC, set in the atomic close edit when status → done -->
**Complexity-estimate**: — <!-- 1-5 (1=very easy, 5=very hard), set when picking up the task, before reading implementation notes -->
**Complexity-actual**: — <!-- 1-5, set when marking review based on actual effort -->

<!--
The four fields above are the Task Metadata Contract — see .claude/agent-stack.md
§ Task Metadata Contract. SDET rejects review → done if Complexity-actual is missing
or out of range. RA rejects epic close if any done task is missing any of the four.
-->

---

## Quality Gates

<!--
Tick each box as the gate passes. The developer ticks the first 4; the SDET
ticks the SDET Review box on approval. **If a gate does not apply to this
task, edit the literal text `[ ]` to `[N/A]` — do not leave it unticked.**
Targeted e2e is N/A unless `E2e-required: yes`. The SDET walks this list as a
checklist — every unticked Mandatory box is a rejection, including unticked
boxes that should have been marked `[N/A]`. See `agents/sdet.md` § Review
Process for the underlying rules.
-->

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — `pnpm lint` + `pnpm type-check` + domain tests pass (run independently by SDET)
- [ ] **Targeted e2e** — actual execution output in Work Log _(N/A unless `E2e-required: yes`)_
- [ ] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified
- [ ] **SDET Review** — approved

## SDET Review focus areas

<!--
Filled in by the SA at task creation. Examples:
- "Touches Next.js middleware — verify HTTP security headers (CSP/HSTS/XFO/XCTO)"
- "New route handler with form input — walk OWASP Top 10"
- "Adds Prisma query — verify SESSION_CONTEXT wrapper per ADR-003"
- "Touches Dockerfile or compose — verify docs/operations/inventory.md and runbook.md updated"
- "Adds new dependency — re-run dependency vulnerability scan"
Leave blank only when none of the conditional SDET checks apply.
-->

## Context

<!-- Why this task exists. Reference SRS requirement IDs and C4 level. -->

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |

## Tests to Write First

- [ ] `<test case>` — expected: `<outcome>`

## Implementation Notes

<!-- Guidance from the SA. Not implementation code. -->

## Definition of Done

- [ ] All tests pass
- [ ] `pnpm lint` and `pnpm type-check` pass
- [ ] If E2e-required: yes — targeted e2e passes
- [ ] <!-- task-specific criteria -->

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

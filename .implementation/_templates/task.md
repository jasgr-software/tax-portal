# TASK-NNN: Title

**Brief**: BRIEF-XXX
**Status**: backlog <!-- backlog | in-progress | review | done | needs-user-direction (set by stuck-loop killswitch — see .implementation/ENGINE.md § Stuck-Loop Killswitch and § Task Status Lifecycle) -->
**Assigned to**: — <!-- developer role per CLAUDE.md (e.g. webapp-developer | devops) -->
**Updated-by**: —
**Depends on**: none
**Impl**: developer <!-- developer | io -->
**E2e-required**: no <!-- set from the brief's methodology.e2e — no unless the brief mandates e2e -->
**Started-at**: — <!-- ISO 8601 UTC, set when status first leaves backlog -->
**Completed-at**: — <!-- ISO 8601 UTC, set in the atomic close edit when status → done -->
**Complexity-estimate**: — <!-- 1-5 (1=very easy, 5=very hard), set when picking up the task, before reading implementation notes -->
**Complexity-actual**: — <!-- 1-5, set when marking review based on actual effort -->

<!--
The four metadata fields above are the Task Metadata Contract — see .implementation/ENGINE.md
§ Task Metadata Contract. SDET rejects review → done if Complexity-actual is missing or out of
range. The IO rejects slice close if any done task is missing any of the four.
-->

**Acceptance criteria:** <!-- the brief AC ids this task satisfies (e.g. AC-007-01, AC-007-03), or "none — <justification>" -->
**Upstream refs:** <!-- REQ-/ADR-/EPIC- ids the brief cites that this task must honor, or "none". Read only when the cited layer is present. -->
**Code standards:** <!-- the brief's code_standards: ids this task must honor + tag via `// CS-<LANG>-NNN` (CS-GEN-003), or "none". SDET checks each cited standard's verification hook; a failing `required` standard is a rejection. -->
**Introduces-gate:** <!-- yes | no | advisory. yes → three-item evidence in Work Log per ENGINE.md § Gate Authoring Rules -->

<!--
Tests are scoped against the task's acceptance criteria under the methodology the brief mandates
(TDD when methodology.tdd: required; bind acceptance_scenarios when methodology.acceptance_format
calls for them; otherwise derive tests from the criteria). The engine mandates no specific
methodology — the brief does. Project-specific test-tier requirements, if any, live in CLAUDE.md.
-->

---

## Quality Gates

<!--
Tick each box as the gate passes. The developer ticks the first 4; the SDET
ticks the SDET Review box on approval. **If a gate does not apply to this
task, edit the literal text `[ ]` to `[N/A]` — do not leave it unticked.**
Targeted e2e is N/A unless the brief mandates e2e. The SDET walks this list as
a checklist — every unticked Mandatory box is a rejection, including unticked
boxes that should have been marked `[N/A]`. See .implementation/agents/sdet.md
§ Review Process for the underlying rules.
-->

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [ ] **Targeted e2e** — actual execution output in Work Log _(N/A unless the brief mandates e2e)_
- [ ] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified
- [ ] **SDET Review** — approved

## SDET Review focus areas

<!--
Filled in by the IO at task creation. Examples:
- "Touches middleware — verify HTTP security headers (CSP/HSTS/XFO/XCTO)"
- "New route handler with form input — walk OWASP Top 10"
- "Cites ADR in Upstream refs — verify the implementation honors it"
- "Touches Dockerfile or compose — verify .implementation/operations/ docs updated"
- "Adds new dependency — re-run dependency vulnerability scan"
Leave blank only when none of the conditional SDET checks apply.
-->

## Context

<!-- Why this task exists. Reference the brief's acceptance criteria (and any cited upstream refs). -->

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |

## Tests to Write First

<!-- When the brief mandates TDD; otherwise the test plan that proves the acceptance criteria. -->

- [ ] `<test case>` — expected: `<outcome>`

## Implementation Notes

<!-- Guidance from the IO. Not implementation code. -->

## Definition of Done

- [ ] Acceptance criteria for this task are satisfied and tested
- [ ] Lint + type-check + build pass
- [ ] Brief-mandated tests pass (e2e/coverage when the brief requires them)
- [ ] <!-- task-specific criteria -->

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

---
brief: BRIEF-XXX
status: backlog
assigned_to: —
updated_by: —
depends_on: none
impl: developer
e2e_required: "no"
started_at: —
completed_at: —
complexity_estimate: —
complexity_actual: —
introduces_gate:
acceptance_criteria: [<!-- the brief AC ids this task satisfies (e.g. AC-007-01, AC-007-03), or \none — <justification>\ -->]
upstream_refs:
code_standards: "<!-- the brief's code_standards: ids this task must honor + tag via `// CS-<LANG>-NNN` (CS-GEN-003), or \\\"none\\\". SDET checks each cited standard's verification hook; a failing `required` standard is a rejection. -->"
---





# TASK-NNN: Title

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

# BUG-NNN: Short description of the issue

**Status**: backlog
**Found in**: TASK-NNN <!-- the task being reviewed when the bug was discovered -->
**Category**: <!-- security | edge-case | architecture-violation | test-coverage | code-quality | accessibility | i18n -->
**Severity**: <!-- critical | major | minor -->
**Assigned to**: — <!-- webapp-developer | devops -->
**Updated-by**: —
**Started-at**: — <!-- ISO 8601 UTC, set when status first leaves backlog -->
**Completed-at**: — <!-- ISO 8601 UTC, set in the atomic close edit when status → done -->
**Complexity-estimate**: — <!-- 1-5 (1=very easy, 5=very hard), set when picking up the bug -->
**Complexity-actual**: — <!-- 1-5, set when marking review -->

<!--
The four fields above are the Task Metadata Contract — see .claude/agent-stack.md
§ Task Metadata Contract. Same enforcement as tasks.
-->

---

## Quality Gates

<!--
Tick each box as the gate passes. The developer ticks the first 6; the SDET
ticks the SDET Review box on approval. **If a gate does not apply to this
bug, edit the literal text `[ ]` to `[N/A]` — do not leave it unticked.**
Targeted e2e is N/A unless the bug touches an `E2e-required: yes` surface.
Post-merge verification is N/A unless the bug affects a deployed surface
(staging or production). The SDET walks this list — every unticked Mandatory
box is a rejection, including unticked boxes that should have been marked
`[N/A]`. See `agents/sdet.md` § Review Process for the underlying rules.
-->

- [ ] **Reproduction confirmed** — documented in Reproduction / Evidence section below
- [ ] **Regression test added** — proves the bug does not recur
- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — `pnpm lint` + `pnpm type-check` + domain tests pass
- [ ] **Targeted e2e** — actual execution output in Work Log _(N/A unless bug touches an `E2e-required: yes` surface)_
- [ ] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified
- [ ] **SDET Review** — approved
- [ ] **Post-merge verification** — staging/prod confirms fix _(N/A unless bug affects a deployed surface)_

## SDET Review focus areas

<!--
Filled in by whoever files the bug (SA, SDET, or main session via Bug Fix Fast Path).
Same conventions as task SDET Review focus areas — list any conditional SDET checks
that apply to this fix:
- "Fix touches middleware — verify HTTP security headers"
- "Endpoint behavior change — walk OWASP Top 10"
- "Bumps a dependency — run vulnerability scan on the upgrade"
- "Touches Dockerfile/compose — update docs/operations/inventory.md / runbook.md"
Leave blank only when none of the conditional checks apply.
-->

## Description

<!-- What the SDET found. Be specific: what is wrong, where it is, and why it matters. -->

---

## Expected Behavior

<!-- What should happen instead. -->

---

## Files Involved

<!-- List the files where the issue was observed. -->

| File              | Issue                               |
| ----------------- | ----------------------------------- |
| `path/to/file.ts` | Description of problem in this file |

---

## Reproduction / Evidence

<!-- How to reproduce or verify the issue. Test output, log snippets, or steps. -->

---

## Work Log

<!-- Same format as tasks. Append-only. -->

_(No entries yet)_

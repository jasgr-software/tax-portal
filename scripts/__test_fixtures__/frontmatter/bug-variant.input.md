# BUG-000-002: validate-gates.sh check_ci_evidence Item 1 regex rejects prose-form evidence

**Epic**: cross-cutting (BUG-000-NNN)
**Status**: closed
**Found in**: TASK-LOE-006 (surfaced during quad-review)
**Category**: code-quality
**Severity**: major
**Assigned to**: devops
**Updated-by**: devops
**Started-at**: 2026-04-27T11:02:14Z
**Completed-at**: 2026-04-27T12:45:00Z
**Complexity-estimate**: 2
**Complexity-actual**: 2

---

## Summary

`check_ci_evidence()` uses a regex that rejects the prose-form evidence block in real task files.

## Root cause

The regex expected structured JSON but real tasks use prose.

## Work Log

- 2026-04-27 [devops] Fixed regex | What's next: re-run gates | Blockers: none

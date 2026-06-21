---
epic: test
status: wip
assigned_to: devops
updated_by: devops
depends_on: none
e2e_required: no
started_at: 2026-04-28T10:00:00Z
completed_at: 2026-04-28T09:00:00Z
complexity_estimate: 7
complexity_actual: 2
introduces_gate: no
---

# TASK-TEST-004: Fixture task — malformed front matter (illegal status, clock inversion, out-of-range complexity)

This fixture is intentionally malformed:
- status: "wip" is not a legal status value
- complexity_estimate: 7 is out of range (must be 1-5)
- clock inversion: completed_at (09:00Z) is before started_at (10:00Z)

## Quality Gates

- [x] **Work Log complete**
- [x] **Submission gate**
- [N/A] **Targeted e2e**
- [x] **Security review**
- [x] **SDET Review** — approved

## Work Log

- 2026-04-28 [devops] Starting implementation — malformed fixture | What's next: done | Blockers: none
- 2026-04-28 [devops] Implementation complete, marking review | What's next: SDET review | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: malformed fixture — expected to fail schema check

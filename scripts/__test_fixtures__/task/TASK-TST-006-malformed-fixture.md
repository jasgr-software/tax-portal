---
brief: BRIEF-TST-001
status: bad-status-value
assigned_to: devops
updated_by: devops
depends_on: none
impl: developer
e2e_required: "no"
started_at: not-a-timestamp
completed_at: —
complexity_estimate: 99
complexity_actual: —
introduces_gate: no
acceptance_criteria: [AC-TST-001-01]
upstream_refs: none
---

# TASK-TST-006: Fixture task — malformed front matter (for verify test)

Test fixture with intentionally malformed front matter:
- status: bad-status-value (not a valid enum)
- started_at: not-a-timestamp (not ISO 8601)
- complexity_estimate: 99 (out of range)

The verify command must return non-zero exit for this fixture.

## Work Log

- 2026-06-21 [devops] malformed fixture for verify test | What's next: N/A | Blockers: none

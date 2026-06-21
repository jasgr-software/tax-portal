---
epic: test
status: done
assigned_to: devops
updated_by: sdet
depends_on: none
e2e_required: no
started_at: "not-a-date"
completed_at: "also-not-a-date"
complexity_estimate: 2
complexity_actual: 2
introduces_gate: no
---

# TASK-TEST-BADTS-001: Fixture task — done with non-ISO timestamp values

This fixture has started_at and completed_at set to strings that are quoted
but do NOT match the ISO 8601 format. The validate-gates.sh broadened regex
MUST still reject these — the optional-quote tolerance must not over-broaden
to accept any quoted string.

## Quality Gates

- [x] **Work Log complete**
- [x] **Submission gate**
- [N/A] **Targeted e2e**
- [x] **Security review**
- [x] **SDET Review** — approved

## Work Log

- 2026-06-21 [devops] Starting implementation — bad-timestamp rejection fixture | What's next: review | Blockers: none
- 2026-06-21 [devops] Marking as review — bad-timestamp rejection fixture complete | What's next: SDET review | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: fixture for Defect-A no-over-broadening check — quoted non-ISO timestamps must still FAIL check_task_file_completion

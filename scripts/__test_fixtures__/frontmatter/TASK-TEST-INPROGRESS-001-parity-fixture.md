---
brief: BRIEF-TEST
epic: test/parity-fixture
status: in-progress
assigned_to: devops
updated_by: devops
depends_on: none
impl: developer
e2e_required: no
started_at: "2026-06-21T18:52:52Z"
completed_at:
complexity_estimate: "3"
complexity_actual:
introduces_gate: no
acceptance_criteria: [AC-TEST-001]
upstream_refs: none
code_standards: none
---

# TASK-TEST-INPROGRESS-001: Stable in-progress fixture for AC-LOE-010-05 parity test

This file is a **stable, dedicated fixture** for the metrics hook parity test
(Suite 4 in validate-gates.test.ts). It must never be mutated by the task
lifecycle — it exists solely to give the parity assertions a predictable shape.

Key properties:
- status: in-progress (not done — so completed_at is empty/absent)
- started_at: quoted ISO 8601 form (exercises Defect-A tolerance from the TS side)
- complexity_estimate: "3" (quoted scalar form)
- complexity_actual: empty (in-progress task)
- assigned_to: devops (known value for the field-name alignment assertion)

## Work Log

- 2026-06-21 [devops] Starting implementation — parity fixture task | What's next: implementation | Blockers: none

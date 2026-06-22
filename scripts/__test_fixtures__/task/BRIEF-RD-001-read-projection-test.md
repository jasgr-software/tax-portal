---
id: BRIEF-RD-001
title: Read projection test brief (fixture for TASK-LOE-011-002)
status: ready
acceptance_criteria:
  - id: AC-RD-001-01
    text: "The show command returns only requested metadata fields, not the whole file."
  - id: AC-RD-001-02
    text: "The list command returns a compact table of IDs and status for a brief."
  - id: AC-RD-001-03
    text: "The next command returns a single actionable task id with one-line scope."
  - id: AC-RD-001-04
    text: "The summary command returns counts by status, open gates, and missing metadata."
methodology:
  tdd: optional
  acceptance_format: prose
  e2e: optional
code_standards:
  - "CS-INFRA-004 (recommended) — zero runtime npm dependencies"
  - "CS-GEN-003 (recommended) — cite governing authority in comments"
---

# BRIEF-RD-001 — Read projection test brief (fixture)

> Test fixture for TASK-LOE-011-002. This brief file is used by brief-context tests.

## Scope

Test fixture scope.

## Acceptance criteria

- **AC-RD-001-01..04** — as in front matter above.

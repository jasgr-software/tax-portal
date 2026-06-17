---
id: EPIC-902
title: Sample not-ready epic (fixture)
phase: 2
status: clarifying
slice: A sample epic that must FAIL the readiness gate on every criterion.
requirements:
  - REQ-SAMPLE-002: [AC-SAMPLE-002-01]
depends_on: [EPIC-903]
open_questions:
  - PQ-001 — which provider issues the token?
architecture:
  - ADR-006
---

# EPIC-902 — Sample not-ready epic (fixture)

Should fail: status != planned, one open question, dependency not delivered, and
no COVERAGE rows mention EPIC-902.

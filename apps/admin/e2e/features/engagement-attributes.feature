# apps/admin/e2e/features/engagement-attributes.feature
#
# Human-readable Gherkin spec for BRIEF-011 (EPIC-011 engagement attributes).
# Scenarios copied verbatim from .planning/EPIC-011-engagement-attributes.md
# § Acceptance scenarios — per task spec: do NOT re-author; bind the epic's.
#
# Status: human-readable spec. Executable Playwright tests are in:
#   apps/admin/e2e/specs/engagement-attributes.spec.ts     (admin journeys: 007-01/-02, 008-01, 009-01/-02)
#   apps/portal/e2e/specs/engagement-note-confidentiality.spec.ts  (portal negative: 008-03)
#   packages/db/src/engagement-note.rls.test.ts           (tier-3 RLS hard gate: 008-02/-03)
#   packages/db/src/engagement-attributes.test.ts         (tier-3 per-engagement isolation: 007-03, 009-03)
#
# Cucumber tooling is not yet integrated (see CLAUDE.md § Executable gherkin tooling).
# When the binder lands, these scenarios will be wired to step definitions under:
#   apps/admin/e2e/steps/engagement-attributes.steps.ts
#
# All admin scenarios require AUTH_PROVIDER=mock; admin at http://localhost:13001 (ADMIN_PORT).
# Portal negative (008-03) runs on http://localhost:3000.
#
# Scenario coverage map:
#   AC-LIFE-007-01: Playwright e2e — apps/admin/e2e/specs/engagement-attributes.spec.ts
#   AC-LIFE-007-02: Playwright e2e — apps/admin/e2e/specs/engagement-attributes.spec.ts
#   AC-LIFE-007-03: tier-3 integration — packages/db/src/engagement-attributes.test.ts
#   AC-LIFE-008-01: Playwright e2e — apps/admin/e2e/specs/engagement-attributes.spec.ts
#   AC-LIFE-008-02: tier-3 RLS — packages/db/src/engagement-note.rls.test.ts (TASK-011-001)
#   AC-LIFE-008-03: tier-3 RLS — packages/db/src/engagement-note.rls.test.ts (TASK-011-001)
#              AND: Playwright e2e — apps/portal/e2e/specs/engagement-note-confidentiality.spec.ts
#   AC-LIFE-009-01: Playwright e2e — apps/admin/e2e/specs/engagement-attributes.spec.ts
#   AC-LIFE-009-02: Playwright e2e — apps/admin/e2e/specs/engagement-attributes.spec.ts
#   AC-LIFE-009-03: tier-3 integration — packages/db/src/engagement-attributes.test.ts

Feature: Engagement attributes — due date, internal notes, priority flag (EPIC-011)

  Background:
    Given the accountant is authenticated (AUTH_PROVIDER=mock, ACCOUNTANT role)
    And the admin surface is running at http://localhost:13001

  # ─── REQ-LIFE-007 — Per-engagement due date ────────────────────────────────

  @AC-LIFE-007-01
  Scenario: AC-LIFE-007-01 — The accountant sets a due date
    Given the accountant viewing an engagement with no due date
    When she sets a due date on it
    Then the engagement carries that due date

  @AC-LIFE-007-02
  Scenario: AC-LIFE-007-02 — The accountant updates a due date
    Given an engagement that already has a due date
    When the accountant changes it to a new date
    Then the engagement's due date reflects the new value

  @AC-LIFE-007-03
  Scenario: AC-LIFE-007-03 — A due date belongs to the individual engagement
    Given two distinct engagements
    When the accountant sets a due date on one
    Then only that engagement carries the due date and the other is unaffected

  # ─── REQ-LIFE-008 — Accountant-only internal notes per engagement ───────────

  @AC-LIFE-008-01
  Scenario: AC-LIFE-008-01 — The accountant records internal notes
    Given the accountant viewing an engagement
    When she records an internal note on it
    Then the note is stored against that engagement

  @AC-LIFE-008-02
  Scenario: AC-LIFE-008-02 — Internal notes are visible only to the accountant
    Given an engagement with an internal note
    When the note's visibility is examined
    Then only the accountant can read it

  @AC-LIFE-008-03
  Scenario: AC-LIFE-008-03 — Internal notes are never shown to a client or participant
    Given an engagement with an internal note and a client participant on that engagement
    When the client participant accesses the engagement through any portal path
    Then the internal note is never shown to them

  # ─── REQ-LIFE-009 — Engagement flagging and prioritization ─────────────────

  @AC-LIFE-009-01
  Scenario: AC-LIFE-009-01 — The accountant flags an engagement as priority
    Given the accountant viewing an unflagged engagement
    When she flags it as a priority
    Then the engagement is marked as prioritized

  @AC-LIFE-009-02
  Scenario: AC-LIFE-009-02 — The accountant removes the priority flag
    Given a flagged engagement
    When the accountant removes the flag
    Then the engagement is no longer marked as prioritized

  @AC-LIFE-009-03
  Scenario: AC-LIFE-009-03 — The priority flag is per individual engagement
    Given two distinct engagements
    When the accountant flags one as a priority
    Then only that engagement is flagged and the other is unaffected

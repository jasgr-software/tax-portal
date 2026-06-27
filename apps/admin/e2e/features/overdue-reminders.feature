# apps/admin/e2e/features/overdue-reminders.feature
#
# Human-readable Gherkin acceptance scenarios for EPIC-019 — Overdue reminder engine
# (admin surface — apps/admin).
#
# Acceptance criteria covered: AC-FILE-012-02, AC-DASH-008-01, AC-DASH-008-02, AC-MSG-018-03
#
# These scenarios are verbatim from BRIEF-019 § Acceptance scenarios.
# The executable gate is apps/admin/e2e/specs/overdue-reminders.spec.ts (Playwright .spec.ts).
# The Cucumber tooling is not yet chosen; this .feature file is the human-readable contract
# that the .spec.ts verifies behavior against (see CLAUDE.md § Executable gherkin tooling).
#
# ADR-006: admin surface only — cadence config and overdue flag are accountant affordances.
# ADR-012: tier-6 e2e.
# ADR-023: time-injectable seam; no wall-clock waits (past-due dueDate seeded directly).
# CS-GEN-003: AC ids cited.

Feature: Overdue detection & reminder cadence configuration (admin surface)
  As the accountant (jane)
  I want to configure when and how often overdue reminders are raised
  And see overdue document requests flagged clearly in the admin view

  # ── AC-FILE-012-02 ─────────────────────────────────────────────────────────────

  @AC-FILE-012-02
  Scenario: Overdue requests are flagged/surfaced as overdue when viewed
    Given a document request whose due date has passed and that is unfulfilled
    When the accountant views the request in the document-requests page
    Then it is flagged/surfaced as overdue (overdue badge is visible)

  # ── AC-DASH-008-01 + AC-MSG-018-03 ────────────────────────────────────────────

  @AC-DASH-008-01 @AC-MSG-018-03
  Scenario: Accountant sets the global default overdue-reminder frequency
    Given the accountant on her settings surface (/settings/reminders)
    When she sets a global default overdue-reminder frequency
    Then that global default is recorded and applies where no override exists

  # ── AC-DASH-008-02 ─────────────────────────────────────────────────────────────

  @AC-DASH-008-02
  Scenario: Accountant sets a per-engagement overdue-reminder frequency override
    Given the accountant viewing an individual engagement
    When she sets an overdue-reminder frequency for that engagement
    Then that engagement carries its own reminder frequency

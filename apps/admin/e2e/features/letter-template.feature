# apps/admin/e2e/features/letter-template.feature
#
# EPIC-005 — Onboarding Spine: Engagement Letter
# Acceptance scenarios for the accountant engagement-letter template setting.
#
# Transcribed VERBATIM from .planning/EPIC-005-onboarding-spine-engagement-letter.md
# § Acceptance scenarios (L150–169). Do NOT re-author these scenarios.
#
# NOTE (CLAUDE.md § Executable gherkin tooling): The Cucumber tooling has NOT landed yet.
# These .feature files are human-readable specs. The executable Playwright tests that
# cover the same behavior live in:
#   apps/admin/e2e/specs/letter-template.spec.ts (tier-6 admin e2e)
#   apps/portal/e2e/specs/onboarding-cross-app.spec.ts (cross-app edit→sign loop)
# When Cucumber tooling is integrated, these files will be bound to step definitions
# under apps/admin/e2e/steps/. Until then, SDET review compares implementation
# behavior against these scenarios via prose.
#
# Tier annotation (per EPIC-005 § Traceability & sign-off contract):
#   @tier-2-5 — unit/component (TASK-005-004: default present, edit persists)
#   @tier-6   — e2e gate (this file: AC-IDNT-007-03 cross-app; AC-IDNT-007-01/-02 e2e surface)
#
# ADR-006: This page is apps/admin ONLY — clients never reach this surface.

Feature: Accountant engagement-letter template setting

  @AC-IDNT-007-01 @tier-6
  Scenario: A default letter template exists out of the box
    Given a fresh portal with no accountant-authored letter
    When the accountant opens the engagement-letter template setting
    Then a system-provided default engagement-letter template is already present

  @AC-IDNT-007-02 @tier-6
  Scenario: Accountant edits the letter template
    Given the engagement-letter template setting
    When the accountant edits the template's content and saves
    Then the edited content is retained as the current template

  @AC-IDNT-007-03 @tier-6
  Scenario: The edited template is what the client signs
    Given the accountant has edited the engagement-letter template
    When a client reaches the letter step in onboarding
    Then the letter presented for signature is the accountant's edited template

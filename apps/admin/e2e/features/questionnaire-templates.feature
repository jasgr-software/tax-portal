# apps/admin/e2e/features/questionnaire-templates.feature
#
# EPIC-006 — Intake questionnaire: per-service-type templates, client completion
# Acceptance scenarios for the accountant questionnaire-template management (admin surface).
#
# Transcribed VERBATIM from .planning/EPIC-006-intake-questionnaire.md
# § Acceptance scenarios (L104–123). Do NOT re-author these scenarios.
#
# NOTE (CLAUDE.md § Executable gherkin tooling): The Cucumber tooling has NOT landed yet.
# These .feature files are human-readable specs. The executable Playwright tests that
# cover the same behavior live in:
#   apps/admin/e2e/specs/questionnaire-templates.spec.ts (tier-6 admin e2e)
#   apps/portal/e2e/specs/questionnaire-cross-app.spec.ts (cross-app author→complete loop)
# When Cucumber tooling is integrated, these files will be bound to step definitions
# under apps/admin/e2e/steps/. Until then, SDET review compares implementation
# behavior against these scenarios via prose.
#
# Tier annotation (per EPIC-006 § Traceability & sign-off contract):
#   @tier-6 — e2e gate (this file: AC-DASH-012-01/-02/-03 admin authoring/editing)
#   @tier-3 — service integration (TASK-006-001/002: template↔service-type binding, isolation policy)
#
# ADR-006: Template management is apps/admin ONLY — clients never reach this surface.
# ADR-012: Tier-6 e2e.

Feature: Accountant questionnaire-template management

  @AC-DASH-012-01 @tier-6
  Scenario: Accountant creates a template from the admin UI
    Given the accountant in the Tax Portal questionnaire-template area
    When she creates a new intake questionnaire template
    Then the new template is saved and available

  @AC-DASH-012-02 @tier-6
  Scenario: Template is associated with a service type
    Given the accountant creating or editing a questionnaire template
    When she associates it with a service type
    Then the template is bound to that specific service type

  @AC-DASH-012-03 @tier-6
  Scenario: Accountant edits an existing template
    Given an existing questionnaire template
    When the accountant edits and saves it
    Then the edited template is retained as the current template for its service type

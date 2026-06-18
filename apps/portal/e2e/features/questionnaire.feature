# apps/portal/e2e/features/questionnaire.feature
#
# EPIC-006 — Intake questionnaire: per-service-type templates, client completion
# Acceptance scenarios for the client questionnaire completion (portal surface).
#
# Transcribed VERBATIM from .planning/EPIC-006-intake-questionnaire.md
# § Acceptance scenarios (L76–103). Do NOT re-author these scenarios.
#
# NOTE (CLAUDE.md § Executable gherkin tooling): The Cucumber tooling has NOT landed yet.
# These .feature files are human-readable specs. The executable Playwright tests that
# cover the same behavior live in:
#   apps/portal/e2e/specs/onboarding-questionnaire.spec.ts (tier-6 portal e2e, behind letter gate)
#   apps/portal/e2e/specs/questionnaire-cross-app.spec.ts (cross-app author→complete loop)
# When Cucumber tooling is integrated, these files will be bound to step definitions
# under apps/portal/e2e/steps/. Until then, SDET review compares implementation
# behavior against these scenarios via prose.
#
# Tier annotation (per EPIC-006 § Traceability & sign-off contract):
#   @tier-6 — e2e gate (this file: AC-ONBD-003-01 correct questionnaire shown,
#              AC-ONBD-003-03 step satisfied on submit)
#   @tier-3 — service integration (TASK-006-003/005: questionnaire resolution, answers recorded)
#
# ADR-006: Client questionnaire completion is portal-only — accountant never sees this surface.
# ADR-012: Tier-6 e2e.
# ADR-005: Client sees only their own engagement's questionnaire (sec.pol_QuestionnaireAnswer).

Feature: Client intake questionnaire completion

  @AC-ONBD-003-01 @tier-6
  Scenario: Questionnaire matches the engagement's service type
    Given an engagement for a given service type, with a questionnaire template defined for that service type
    When the client reaches the questionnaire step
    Then the questionnaire presented is the one for their engagement's service type

  @AC-ONBD-003-02 @tier-3
  Scenario: Accountant maintains a distinct template per service type
    Given two different service types in the catalog
    When the accountant defines a questionnaire template for each
    Then each service type carries its own distinct questionnaire template

  @AC-ONBD-003-03 @tier-6
  Scenario: Step is satisfied only on submission
    Given a client viewing the questionnaire who has not yet submitted it
    When the questionnaire step's satisfaction is evaluated
    Then the step is not satisfied until the client submits their completed questionnaire

  @AC-ONBD-003-04 @tier-3
  Scenario: Answers recorded against the engagement
    Given a client submits their completed questionnaire
    When the engagement is examined
    Then the client's submitted answers are recorded against that engagement

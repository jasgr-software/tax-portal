# apps/portal/e2e/features/onboarding.feature
#
# EPIC-005 — Onboarding Spine: Engagement Letter
# Acceptance scenarios for the client onboarding sequence and sign/unlock gate.
#
# Transcribed VERBATIM from .planning/EPIC-005-onboarding-spine-engagement-letter.md
# § Acceptance scenarios (L99–169). Do NOT re-author these scenarios.
#
# NOTE (CLAUDE.md § Executable gherkin tooling): The Cucumber tooling has NOT landed yet.
# These .feature files are human-readable specs. The executable Playwright tests that
# cover the same behavior live in:
#   apps/portal/e2e/specs/onboarding.spec.ts (tier-6 portal e2e)
#   apps/portal/e2e/specs/onboarding-cross-app.spec.ts (cross-app edit→sign loop)
# When Cucumber tooling is integrated, these files will be bound to step definitions
# under apps/portal/e2e/steps/. Until then, SDET review compares implementation
# behavior against these scenarios via prose.
#
# Tier annotation (per EPIC-005 § Traceability & sign-off contract):
#   @tier-6 — e2e gate (this file: sequence rendered, sign→unlock, position)
#   @tier-3 — service integration (TASK-005-001/-005: step-lock enforcement, signature recorded)
#
# Tags: AC id + tier. AC-ONBD-001-02/-002-01/-002-02/-002-04 are tier-3 (TASK-005-001/-005);
# they appear here for completeness of the gherkin contract but are NOT e2e gate tests.

Feature: Client onboarding sequence and engagement-letter sign gate

  # ─── AC-ONBD-001: Ordered three-step sequence ───────────────────────────────

  @AC-ONBD-001-01 @tier-6
  Scenario: Onboarding presents three ordered steps
    Given a client whose engagement is in onboarding
    When the client opens their engagement's onboarding
    Then they see exactly three steps in order: sign the engagement letter, complete the questionnaire, upload documents

  @AC-ONBD-001-02 @tier-3
  Scenario: Later steps cannot be reached before their predecessors
    Given a client whose engagement letter is not yet signed
    When the client attempts to start the questionnaire or the document upload
    Then the attempt is refused and the step remains locked

  @AC-ONBD-001-03 @tier-6
  Scenario: Client sees their position and what remains
    Given a client partway through onboarding
    When they view the onboarding sequence
    Then they can see which step they are on and which steps still remain

  # ─── AC-ONBD-002: Engagement-letter sign gate ────────────────────────────────

  @AC-ONBD-002-01 @tier-3
  Scenario: Questionnaire locked until the letter is signed
    Given an engagement whose letter has not been e-signed
    When the questionnaire step's accessibility is evaluated
    Then the questionnaire step is not accessible to the client

  @AC-ONBD-002-02 @tier-3
  Scenario: Document upload locked until the letter is signed
    Given an engagement whose letter has not been e-signed
    When the document-upload step's accessibility is evaluated
    Then the document-upload step is not accessible to the client

  @AC-ONBD-002-03 @tier-6
  Scenario: Signing the letter unlocks the remaining steps
    Given an engagement whose letter has just been e-signed by the client
    When onboarding is re-evaluated
    Then the questionnaire and document-upload steps become accessible

  @AC-ONBD-002-04 @tier-3
  Scenario: Signed letter recorded against the engagement
    Given a client has e-signed the engagement letter
    When the engagement is examined
    Then the signed engagement letter is recorded against it as evidence the gate was satisfied

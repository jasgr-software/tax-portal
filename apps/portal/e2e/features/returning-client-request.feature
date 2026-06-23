# apps/portal/e2e/features/returning-client-request.feature
#
# Gherkin acceptance scenarios for the returning-client new-engagement request flow.
# Source: .planning/EPIC-012-engagement-creation-participants.md § Acceptance scenarios.
# Brief: BRIEF-012 / acceptance_format: gherkin.
#
# These scenarios are bound verbatim from the epic's AC-DOOR-009-01..04.
# The executable test binding is apps/portal/e2e/specs/returning-client-request.spec.ts.
#
# Current state: .feature files are human-readable specs; Playwright tests in .spec.ts
# files cover the same Given/When/Then behavior.
# See CLAUDE.md § Executable gherkin tooling for the Cucumber/playwright-bdd adoption path.
#
# ADR-006: Returning-client request lives in apps/portal.
# ADR-022: Submission path is rate-limited (proven in actions.ts).
# DECISION-E: Contact resolved from on-file data (proven by absence of contact fields in UI).

Feature: Returning-client new-engagement request

  Background:
    Given the portal stack is running
    And the database is seeded with active services
    And a returning client has a prior accepted engagement on file

  # AC-DOOR-009-01 — A returning client starts a request from inside the portal
  Scenario: [AC-DOOR-009-01] A signed-in client opens the returning-client request flow without leaving the portal
    Given a signed-in existing client
    When they start a new engagement request from the client surface
    Then a returning-client request flow opens without leaving the portal

  # AC-DOOR-009-02 — The returning-client flow selects active services
  Scenario: [AC-DOOR-009-02] The flow lets the client select one or more active services
    Given a returning client in the request flow
    When they choose services
    Then they can select one or more active services for the request

  # AC-DOOR-009-03 — Basic contact info is not re-collected
  Scenario: [AC-DOOR-009-03] The flow does not ask the client to re-enter on-file contact info
    Given a returning client whose contact details are already on file
    When they complete the returning-client request flow
    Then they are not required to re-enter that basic contact information

  # AC-DOOR-009-04 — The request routes to the accountant like a front-door request
  Scenario: [AC-DOOR-009-04] A submitted request appears in the accountant inbox like a front-door request
    Given a returning client submits a new engagement request
    When the submission completes
    Then it is routed to the accountant for review the same way a front-door request is

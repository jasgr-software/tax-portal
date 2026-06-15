Feature: Public front door — browse services and submit an engagement request
  # EPIC-001 — Public front door
  # Source: .planning/EPIC-001-public-front-door.md § Acceptance scenarios
  # Bound to: apps/portal/e2e/specs/ (standard .spec.ts — see CLAUDE.md § Executable gherkin tooling)
  # AC ids: AC-DOOR-001-01..03, AC-DOOR-002-04, AC-DOOR-003-01..04, AC-DOOR-004-01..05
  #
  # Until the Cucumber binder lands, these scenarios are the human-readable spec contract.
  # Playwright specs in e2e/specs/ cover each scenario behavior and are tagged with AC ids.

  Background:
    Given the seed data includes at least 1 active service and at least 1 inactive service

  # ── REQ-DOOR-001 — Public services page, no login required ─────────────────────

  @AC-DOOR-001-01
  Scenario: Services page reachable anonymously
    Given a visitor with no account and no sign-in
    When they navigate to the public services page
    Then the page is served without requiring authentication

  @AC-DOOR-001-02
  Scenario: Active services are displayed
    Given the accountant has active services in the catalog
    When an anonymous visitor views the services page
    Then the currently active services are displayed

  @AC-DOOR-001-03
  Scenario: Viewing creates no account and asks for nothing personal
    Given an anonymous visitor on the services page
    When they browse the services
    Then no account is created and no personal information is required to view it

  # ── REQ-DOOR-002 — Deactivated service not visible publicly ────────────────────

  @AC-DOOR-002-04
  Scenario: Deactivated services do not appear publicly
    Given a service that has been deactivated
    When an anonymous visitor views the services page and the request form
    Then the deactivated service does not appear as a selectable option

  # ── REQ-DOOR-003 — Request form is a checklist of active services ───────────────

  @AC-DOOR-003-01
  Scenario: Form presents active services as a checklist
    Given the request form
    When an anonymous visitor opens it
    Then the active services are presented as selectable checklist items

  @AC-DOOR-003-02
  Scenario: No freeform need field replaces the checklist
    Given the request form
    When the visitor inspects how they express what they need
    Then selection is via the service checklist with no freeform "describe your need" field replacing it

  @AC-DOOR-003-03
  Scenario: No service-specific sub-questions
    Given the request form with services selected
    When the visitor completes it
    Then no service-specific sub-questions vary the form by which services are selected

  @AC-DOOR-003-04
  Scenario: Deactivated services are not checklist options
    Given a deactivated service
    When the visitor views the request form's checklist
    Then the deactivated service is not offered as a checklist option

  # ── REQ-DOOR-004 — Prospect submits an engagement request, no account ──────────

  @AC-DOOR-004-01
  Scenario: Prospect selects one or more services
    Given an anonymous visitor on the request form
    When they choose one or more active services
    Then their selection is captured for submission

  @AC-DOOR-004-02
  Scenario: Prospect provides basic contact information
    Given an anonymous visitor completing the request form
    When they enter their basic contact information
    Then the contact information is captured with the request

  @AC-DOOR-004-03 @smoke
  Scenario: Submitting creates a pending request (happy path)
    Given a completed request form with at least one service selected
    When the visitor submits it
    Then an engagement request is created in a pending (awaiting-review) state

  # Bound test lives at tier-3: packages/db/src/engagement-request.persistence.test.ts
  @AC-DOOR-004-04
  Scenario: No account is created at submission
    Given a visitor submitting an engagement request
    When the request is created
    Then no account is created for the visitor at submission time

  @AC-DOOR-004-05
  Scenario: Cannot submit with zero services
    Given an anonymous visitor on the request form with no services selected
    When they attempt to submit
    Then submission is blocked and no engagement request is created

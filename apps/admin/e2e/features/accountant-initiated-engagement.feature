Feature: Accountant-initiated engagement creation with duplicate guard

  As the tax accountant (Jane)
  I want to initiate new engagements for existing clients from my portal
  So that I can create work items without requiring client involvement
  And I am warned and shown existing engagements when a duplicate (client, service, tax year) is detected

  # AC-DOOR-010-01, AC-DOOR-010-02, AC-DOOR-010-03, AC-DOOR-010-04
  # AC-LIFE-010-01, AC-LIFE-011-01, AC-LIFE-011-02, AC-LIFE-011-03, AC-LIFE-011-04

  Background:
    Given the accountant is authenticated on the Tax Portal
    And at least one existing client exists in the system
    And at least one active service exists in the catalog

  # ── AC-DOOR-010-01 / AC-DOOR-010-02 / AC-DOOR-010-03 / AC-DOOR-010-04 ──────

  Scenario: [AC-DOOR-010-01][AC-DOOR-010-02][AC-DOOR-010-03][AC-DOOR-010-04] accountant-initiated engagement: accountant creates a new engagement for a client with no duplicates
    Given the accountant navigates to the "New Engagement" form
    When she selects an existing client from the client picker
    And she selects one or more active services
    And she enters a tax year
    And she submits the form
    Then a new engagement is created directly — no accept/decline step
    And the engagement is associated with the chosen client
    And she is redirected to the new engagement page

  # ── AC-LIFE-010-01 ───────────────────────────────────────────────────────────

  Scenario: [AC-LIFE-010-01] accountant-initiated engagement: second concurrent engagement for a different service type
    Given a client already has an active engagement for one service type
    When the accountant creates another engagement for the same client for a different service type
    Then the second engagement is created successfully
    And both engagements are visible in the engagements list

  # ── AC-LIFE-011-02 / AC-LIFE-011-04 ─────────────────────────────────────────

  Scenario: [AC-LIFE-011-02][AC-LIFE-011-04] accountant-initiated engagement: duplicate attempt shows warning and existing engagement (no creation)
    Given an engagement already exists for a client, a specific service type, and a specific tax year
    When the accountant attempts to create another engagement matching that same combination
    Then she is shown a duplicate warning before any second engagement is created
    And the warning displays the existing matching engagement
    And no new engagement has been created yet

  # ── AC-LIFE-011-03 (navigate path) ──────────────────────────────────────────

  Scenario: [AC-LIFE-011-03] accountant-initiated engagement: from the warning the accountant navigates to the existing engagement
    Given the duplicate warning is shown with the existing engagement
    When the accountant clicks "Go to existing engagement"
    Then she is taken to the existing engagement page
    And no second engagement was created

  # ── AC-LIFE-011-03 (override path) ──────────────────────────────────────────

  Scenario: [AC-LIFE-011-03] accountant-initiated engagement: from the warning the accountant overrides and creates the second engagement
    Given the duplicate warning is shown with the existing engagement
    When the accountant clicks "Create anyway (override)"
    Then a second engagement is created for the same (client, service, tax year) combination
    And the accountant is taken to the new engagement page

  # ── AC-LIFE-011-04 ───────────────────────────────────────────────────────────

  Scenario: [AC-LIFE-011-04] accountant-initiated engagement: duplicate is never silently blocked or redirected
    Given an engagement already exists for a client, service type, and tax year
    When the accountant submits for that same combination
    Then the system does not silently block the creation
    And the system does not silently redirect to the existing engagement
    And the accountant sees an explicit warning with a choice to navigate or override

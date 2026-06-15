# apps/portal/e2e/features/auth-two-role.feature
#
# Human-readable mirror of the bound AC-AUTH-005-02 / AC-AUTH-006-01 / AC-AUTH-006-02
# acceptance scenarios for the portal surface (TASK-004-005 / BRIEF-004).
#
# These are the PORTAL-SURFACE scenarios (client sign-up / sign-in / no-self-registration).
# The redirect matrix scenarios (AC-AUTH-010-*) are bound in the cross-app suite (TASK-004-008).
# The accountant sign-in scenarios are bound in apps/admin/e2e/features/auth-two-role.feature.
#
# Status: human-readable spec. Executable Playwright tests are in:
#   apps/portal/e2e/specs/client-signup.spec.ts
#
# Cucumber tooling is not yet integrated (see CLAUDE.md § Executable gherkin tooling).
# When the binder lands, these scenarios will be wired to step definitions under:
#   apps/portal/e2e/steps/auth-steps.ts
#
# All scenarios run against the mocked auth provider (AUTH_PROVIDER=mock).
# No real Clerk instance is contacted. The invitation is simulated via FIXTURE_INVITATION.

Feature: Two-role auth model — client surface (BRIEF-004)

  Background:
    Given the portal client surface is running at http://localhost:3000
    And AUTH_PROVIDER is set to "mock" (no real Clerk instance contacted)
    And the auth provider is pre-loaded with FIXTURE_INVITATION (role=CLIENT, ticket="mock-fixture-ticket-client-001")

  # ---------------------------------------------------------------------------
  # AC-AUTH-005-02: CLIENT signs up and signs in without a second factor
  # ---------------------------------------------------------------------------

  @AC-AUTH-005-02
  Scenario: Invited prospect completes sign-up without a second factor
    Given an invited prospect with a valid accountant-issued invitation ticket
    When the prospect navigates to /sign-up?ticket=mock-fixture-ticket-client-001
    And the prospect fills in their email and password
    And the prospect submits the sign-up form
    Then the sign-up succeeds without a second-factor step
    And the prospect is redirected to the client dashboard
    And no MFA enrollment or OTP prompt was shown at any point

  @AC-AUTH-005-02
  Scenario: Client signs in without a second factor
    Given an existing client account
    When the client navigates to /sign-in
    And the client enters their email and password
    And the client submits the sign-in form
    Then the sign-in succeeds without a second-factor step
    And the client is redirected to the client dashboard
    And no MFA prompt was shown at any point

  # ---------------------------------------------------------------------------
  # AC-AUTH-006-01: CLIENT account only via invitation
  # ---------------------------------------------------------------------------

  @AC-AUTH-006-01
  Scenario: Sign-up with a valid invitation ticket creates a CLIENT account
    Given a person with a valid accountant-issued invitation ticket
    When they navigate to /sign-up?ticket=mock-fixture-ticket-client-001
    And they complete the sign-up form
    Then a CLIENT account session is established server-side
    And they are redirected to the client dashboard

  @AC-AUTH-006-01
  Scenario: Attempting account creation without an invitation fails
    Given a person with no accountant-issued invitation
    When they attempt to sign up with an invalid or absent ticket
    Then no CLIENT account is created
    And they remain on the sign-up page or see an error

  # ---------------------------------------------------------------------------
  # AC-AUTH-006-02: No self-service registration path (negative invariant)
  # ---------------------------------------------------------------------------

  @AC-AUTH-006-02
  Scenario: The sign-up page without a ticket shows "invitation required" — no form
    Given the client surface
    When a visitor navigates to /sign-up (no ?ticket param)
    Then the "invitation required" message is displayed
    And no sign-up form is rendered
    And no account can be created from this state

  @AC-AUTH-006-02
  Scenario: The sign-in page offers no self-service registration path
    Given the sign-in page of the client surface
    When a visitor looks for a way to create an account on their own
    Then no "Register", "Create account", or "Sign up" button is present
    And an "invitation only" notice is displayed instead

  @AC-AUTH-006-02
  Scenario: No CLIENT session cookie is created when visiting /sign-up without a ticket
    Given a visitor navigating to /sign-up with no invitation ticket
    When the page loads
    Then no __mock_session cookie is set on the browser context
    And no CLIENT account has been created

  @AC-AUTH-006-02
  Scenario: The public services page offers no self-service registration path
    Given the public services page of the client surface
    When a visitor browses the page
    Then no "Register", "Create account", or "Sign up" link is visible
    And the page promotes the engagement request form (not account creation)

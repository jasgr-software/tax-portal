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

  # ---------------------------------------------------------------------------
  # AC-AUTH-010-02: Signed-in ACCOUNTANT → portal CLIENT-only route → redirect to admin
  # ---------------------------------------------------------------------------

  @AC-AUTH-010-02
  Scenario: ACCOUNTANT visiting a portal CLIENT-only route is redirected to admin (not 403)
    Given the portal surface is running at http://localhost:3000
    And AUTH_PROVIDER is set to "mock"
    And a signed-in ACCOUNTANT session cookie is present (set via /api/mock-session)
    When the ACCOUNTANT navigates to /dashboard (a CLIENT-only route)
    Then the middleware redirects with a 3xx status (307 or 308) BEFORE any dashboard content renders
    And the final destination is the admin app URL (ADMIN_APP_URL)
    And no CLIENT-only dashboard content is visible at any point
    And the response is a redirect, not a 403 Forbidden

  # ---------------------------------------------------------------------------
  # AC-AUTH-010-03: Signed-in ACCOUNTANT → portal PUBLIC route → served (no redirect)
  # ---------------------------------------------------------------------------

  @AC-AUTH-010-03
  Scenario: ACCOUNTANT visiting a portal public route is served (public allow-list honored)
    Given the portal surface is running at http://localhost:3000
    And AUTH_PROVIDER is set to "mock"
    And a signed-in ACCOUNTANT session cookie is present (set via /api/mock-session)
    When the ACCOUNTANT navigates to /services (a public portal route)
    Then the page is served with HTTP 200
    And the final URL is on the portal origin (localhost:3000)
    And no redirect to the admin app fires

  @AC-AUTH-010-03
  Scenario: ACCOUNTANT visiting the portal root (/) is served (public allow-list honored)
    Given the portal surface is running at http://localhost:3000
    And AUTH_PROVIDER is set to "mock"
    And a signed-in ACCOUNTANT session cookie is present
    When the ACCOUNTANT navigates to / (the portal root)
    Then the page is served with HTTP 200
    And the final URL is on the portal origin
    And no redirect to the admin app fires

  # ---------------------------------------------------------------------------
  # ADR-010 §3 / §8: Session continuity — portal session honored by admin
  # ---------------------------------------------------------------------------

  @AC-AUTH-010-03
  Scenario: Session minted on portal is honored by admin (no fresh sign-in prompt)
    Given the portal surface is running at http://localhost:3000
    And the admin surface is running at http://localhost:3001
    And AUTH_PROVIDER is set to "mock"
    And an ACCOUNTANT session is minted via portal /api/mock-session (shared localhost cookie)
    When the ACCOUNTANT navigates to the admin app
    Then the admin app honors the session (serves the page, no redirect to /sign-in)
    And the shared-cookie session model is confirmed (one Clerk app, two surfaces)

  # ---------------------------------------------------------------------------
  # ADR-010 §3 / §8: Global sign-out — clearing session causes portal to redirect
  # ---------------------------------------------------------------------------

  @AC-AUTH-010-01 @AC-AUTH-010-02
  Scenario: Global sign-out — after clearing the shared session, portal private route redirects to sign-in
    Given the portal surface is running at http://localhost:3000
    And AUTH_PROVIDER is set to "mock"
    And a CLIENT session is established via /api/mock-session
    When the shared session cookie is cleared (global sign-out — clears MOCK_SESSION_COOKIE_NAME)
    And the CLIENT navigates to /dashboard (a private portal route)
    Then the middleware redirects to portal /sign-in (unauthenticated redirect)
    And no /dashboard content is served

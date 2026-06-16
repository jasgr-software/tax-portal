# apps/admin/e2e/features/auth-cross-app.feature
#
# Human-readable mirror of the AC-AUTH-010-01 acceptance scenarios for the admin surface.
# Covers the exhaustive cross-app redirect matrix (TASK-004-008 / BRIEF-004).
#
# Status: human-readable spec. Executable Playwright tests are in:
#   apps/admin/e2e/specs/cross-app-redirect.spec.ts
#
# Cucumber tooling is not yet integrated (see CLAUDE.md § Executable gherkin tooling).
# When the binder lands, these scenarios will be wired to step definitions under:
#   apps/admin/e2e/steps/auth-steps.ts
#
# All scenarios run against the mocked auth provider (AUTH_PROVIDER=mock).
# No real Clerk instance is contacted.
#
# ADR-010 §1 matrix for the admin surface:
#   - admin has NO public routes (except /sign-in)
#   - CLIENT on ANY admin route → redirect (307/308) to PORTAL_APP_URL (not 403)
#   - ACCOUNTANT on admin route → served
#   - Unauthenticated on admin route → redirect to admin /sign-in

Feature: Cross-app redirect matrix — admin surface (BRIEF-004)

  Background:
    Given the admin surface is running at http://localhost:3001
    And AUTH_PROVIDER is set to "mock" (no real Clerk instance contacted)

  # ---------------------------------------------------------------------------
  # AC-AUTH-010-01: Signed-in CLIENT → any admin route → redirect to portal
  # ---------------------------------------------------------------------------

  @AC-AUTH-010-01
  Scenario: CLIENT visiting admin root is redirected to portal (not 403)
    Given a signed-in CLIENT session cookie is present (set via /api/mock-session)
    When the CLIENT navigates to the admin root (/)
    Then the middleware redirects with a 3xx status (307 or 308) BEFORE any admin content renders
    And the final destination is the portal app URL (PORTAL_APP_URL = http://localhost:3000)
    And no admin content is visible at any point
    And the response is a redirect, not a 403 Forbidden

  @AC-AUTH-010-01
  Scenario: CLIENT visiting a deep admin path is redirected to portal (middleware fires before 404)
    Given a signed-in CLIENT session cookie is present (set via /api/mock-session)
    When the CLIENT navigates to a deep admin path (e.g. /engagements/123)
    Then the middleware redirects with a 3xx status (307 or 308) BEFORE the 404 handler runs
    And the final destination is the portal app URL (PORTAL_APP_URL)
    And no admin content or 404 page is visible — the middleware fires first
    And the response is a redirect, not a 403 Forbidden

  # ---------------------------------------------------------------------------
  # ADR-010 §3 / §8: Session continuity — admin session honored by portal
  # ---------------------------------------------------------------------------

  @AC-AUTH-010-01
  Scenario: Session minted on admin is honored by portal (no fresh sign-in prompt)
    Given the portal surface is running at http://localhost:3000
    And the admin surface is running at http://localhost:3001
    And AUTH_PROVIDER is set to "mock"
    And a CLIENT session is minted via admin /api/mock-session (shared localhost cookie)
    When the CLIENT navigates to the portal app (a public route, /services)
    Then the portal app honors the session (serves the page, no redirect to portal /sign-in)
    And the shared-cookie session model is confirmed (one Clerk app, two surfaces)

  # ---------------------------------------------------------------------------
  # ADR-010 §3 / §8: Global sign-out — clearing session causes admin to redirect
  # ---------------------------------------------------------------------------

  @AC-AUTH-010-01
  Scenario: Global sign-out — after clearing the shared session, admin private route redirects to sign-in
    Given an ACCOUNTANT session is established via admin /api/mock-session
    And the ACCOUNTANT can access the admin root (session is valid)
    When the shared session cookie is cleared (global sign-out — clears MOCK_SESSION_COOKIE_NAME)
    And a private admin route is accessed (e.g. admin root /)
    Then the middleware redirects to admin /sign-in (unauthenticated redirect)
    And no admin content is served without authentication

  # ---------------------------------------------------------------------------
  # Admin has no public routes (ADR-010 §1, §7) — sign-in surface only
  # ---------------------------------------------------------------------------

  @AC-AUTH-010-01
  Scenario: Unauthenticated request to admin root redirects to admin sign-in
    Given no session cookie is present
    When an unauthenticated visitor navigates to the admin root
    Then the middleware redirects to admin /sign-in
    And no admin content is served without authentication

  @AC-AUTH-010-01
  Scenario: Admin sign-in page is accessible without authentication (no redirect loop)
    Given no session cookie is present
    When an unauthenticated visitor navigates to admin /sign-in
    Then the sign-in page is served (HTTP 200)
    And no redirect loop occurs

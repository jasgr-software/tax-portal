# apps/admin/e2e/features/services-catalog.feature
#
# Human-readable mirror of the BRIEF-002 acceptance scenarios for the services catalog.
# Covers the 7 gherkin scenarios from BRIEF-002 / EPIC-002.
#
# Status: human-readable spec. Executable Playwright tests are in:
#   apps/admin/e2e/specs/services-catalog.spec.ts         (AC-DOOR-002-01/-02/-03/-05, AC-DASH-010-01/-02/-03)
#   apps/admin/e2e/specs/services-catalog-cross-surface.spec.ts  (AC-DOOR-002-03 cross-surface loop)
#
# Cucumber tooling is not yet integrated (see CLAUDE.md § Executable gherkin tooling).
# When the binder lands, these scenarios will be wired to step definitions under:
#   apps/admin/e2e/steps/services-catalog.steps.ts
#
# All write scenarios run against the mocked auth provider (AUTH_PROVIDER=mock).
# No real Clerk instance is contacted.
#
# ADR-006: Catalog management (write) is admin-only — apps/portal has no write mirror.
#          The cross-surface loop is the only portal assertion (active service read).
# ADR-010: apps/admin has NO public routes. Every path requires ACCOUNTANT auth.
# ADR-012: Tier-6 e2e — exercises the full stack (DB + server actions + RLS policy).

Feature: Services catalog management (BRIEF-002)

  Background:
    Given the admin surface is running at http://localhost:13001
    And AUTH_PROVIDER is set to "mock" (no real Clerk instance contacted)

  # ---------------------------------------------------------------------------
  # AC-DOOR-002-01 / AC-DASH-010-01 — Accountant adds a service
  # ---------------------------------------------------------------------------

  @AC-DOOR-002-01 @AC-DASH-010-01
  Scenario: Accountant adds a service
    Given the signed-in accountant on the catalog management screen
    When she adds a new service with its details
    Then the service exists in the catalog and is available to be offered on the public front door

  @AC-DOOR-002-01 @AC-DASH-010-01
  Scenario: Add a service from the admin UI
    Given the accountant in the admin UI
    When she creates a new service through the catalog management screen
    Then the new service is saved and appears in her catalog list

  # ---------------------------------------------------------------------------
  # AC-DOOR-002-02 / AC-DASH-010-02 — Accountant edits a service
  # ---------------------------------------------------------------------------

  @AC-DOOR-002-02 @AC-DASH-010-02
  Scenario: Accountant edits a service
    Given an existing service in the catalog
    When the accountant edits its details
    Then the updated details are persisted and reflected wherever the service is shown

  @AC-DOOR-002-02 @AC-DASH-010-02
  Scenario: Edit a service from the admin UI
    Given the accountant viewing an existing service in the admin UI
    When she changes its details and saves
    Then the service reflects the edited details in the admin UI

  # ---------------------------------------------------------------------------
  # AC-DOOR-002-03 / AC-DASH-010-03 — Accountant deactivates a service
  # ---------------------------------------------------------------------------

  @AC-DOOR-002-03 @AC-DASH-010-03
  Scenario: Accountant deactivates a service
    Given an active service in the catalog
    When the accountant deactivates it
    Then the service is marked inactive and is no longer offered to prospects

  @AC-DOOR-002-03 @AC-DASH-010-03
  Scenario: Deactivate a service from the admin UI
    Given the accountant viewing an active service in the admin UI
    When she deactivates it
    Then the service is shown as inactive in the admin UI and is no longer offered to prospects

  # ---------------------------------------------------------------------------
  # AC-DOOR-002-03 — Cross-surface loop: deactivated service absent from public door
  # (This is EVIDENCE for AC-DOOR-002-03, NOT a sign-off on AC-DOOR-002-04 —
  #  AC-DOOR-002-04 is owned by EPIC-001 and covers the request form.)
  # ---------------------------------------------------------------------------

  @AC-DOOR-002-03
  Scenario: Deactivated service no longer selectable on the public door (cross-surface loop)
    Given an active service that is listed on the portal public services page
    When the accountant deactivates the service in the admin app
    Then the service is absent from the portal public services page (apps/portal /services)
    And the service is absent from the portal request form (/request)

  # ---------------------------------------------------------------------------
  # AC-DOOR-002-05 — Only the accountant may change the catalog
  # ---------------------------------------------------------------------------

  @AC-DOOR-002-05
  Scenario: Only the accountant may change the catalog
    Given a caller who is not the accountant (a client or an anonymous visitor)
    When that caller attempts to add, edit, or deactivate a service
    Then the change is rejected and the catalog is unaltered

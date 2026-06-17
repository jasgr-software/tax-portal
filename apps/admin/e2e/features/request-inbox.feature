# apps/admin/e2e/features/request-inbox.feature
#
# Human-readable binding of the EPIC-003 gherkin acceptance scenarios.
# These 20 scenarios are authored in .planning/EPIC-003-accountant-request-inbox.md § Acceptance scenarios
# and are NOT re-authored here — they are transcribed verbatim as the behavior contract.
#
# Status: human-readable spec (bound per CLAUDE.md § Executable gherkin tooling).
#   - Executable Playwright tests covering the e2e tier scenarios are in:
#       apps/admin/e2e/specs/request-inbox.spec.ts    (AC-DASH-011-*, AC-DOOR-006-01, AC-DOOR-005-02)
#       apps/admin/e2e/specs/request-accept.spec.ts   (AC-DOOR-006-02, AC-DOOR-007-01, AC-DOOR-006-05)
#       apps/admin/e2e/specs/request-decline.spec.ts  (AC-DOOR-006-03, AC-DOOR-008-01/-02/-04, AC-DOOR-006-05)
#   - Tier-3 integration tests (unit/service tier) are in:
#       packages/db/src/engagement-request.rls.test.ts         (AC-DOOR-005-01/-03)
#       packages/db/src/engagement-request.decide-boundary.rls.test.ts (AC-DOOR-006-04/-05)
#       packages/db/src/notification.rls.test.ts               (AC-DOOR-005-03, AC-MSG-013-01)
#       apps/admin/src/app/requests/actions.test.ts            (AC-DOOR-006-04/-05, AC-DOOR-007-01/-04, AC-DOOR-008-01/-02/-04)
#       apps/admin/src/app/requests/notifications.test.ts      (AC-DOOR-005-01/-02, AC-MSG-013-01)
#
# Cucumber tooling is not yet integrated (see CLAUDE.md § Executable gherkin tooling).
# When the binder lands, these scenarios will be wired to step definitions under:
#   apps/admin/e2e/steps/request-inbox.steps.ts
#
# All scenarios run against the mocked auth provider (AUTH_PROVIDER=mock).
# Email scenarios assert against the Mailhog SMTP catcher (EMAIL_PROVIDER=smtp, SMTP→Mailhog).
#
# ADR-005: engagement_request is accountant-readable only; notifications are accountant-only.
# ADR-006: inbox + decision actions are admin-only — no portal mirror.
# ADR-010: apps/admin has NO public routes — every path requires ACCOUNTANT auth.
# ADR-012: Tier-6 e2e exercises the full stack (DB + server actions + RLS policy + email).
# REQ-NFR-008: Email delivery proven against Mailhog catcher (acceptance invitation, decline reason).

Feature: Accountant request inbox — notify, review, accept/decline, invite (EPIC-003)

  Background:
    Given the admin surface is running at http://localhost:13001
    And AUTH_PROVIDER is set to "mock" (no real Clerk instance contacted)
    And EMAIL_PROVIDER is set to "smtp" (Mailhog catcher at localhost:18025)

  # ---------------------------------------------------------------------------
  # AC-DOOR-005-01 — New request notifies the accountant
  # (Tier-3 integration — see packages/db tests for executable coverage)
  # ---------------------------------------------------------------------------

  @AC-DOOR-005-01 @tier-3
  Scenario: New request notifies the accountant
    Given a prospect submits a new engagement request
    When the submission is recorded
    Then an in-portal notification is generated for the accountant

  # ---------------------------------------------------------------------------
  # AC-DOOR-005-02 — Notification identifies and leads to the request
  # (Tier-6 e2e — covered in request-inbox.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-005-02 @tier-6-e2e
  Scenario: Notification identifies and leads to the request
    Given a new-request notification for the accountant
    When she opens it
    Then it conveys that a new engagement request arrived and leads her to that request

  # ---------------------------------------------------------------------------
  # AC-DOOR-005-03 — Notification goes to the accountant only
  # (Tier-3 integration — see packages/db tests for executable coverage)
  # ---------------------------------------------------------------------------

  @AC-DOOR-005-03 @tier-3
  Scenario: Notification goes to the accountant only
    Given a new engagement request
    When notification recipients are determined
    Then only the accountant is notified — no client or anonymous party receives it

  # ---------------------------------------------------------------------------
  # AC-DOOR-006-01 — Accountant views a pending request
  # (Tier-6 e2e — covered in request-inbox.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-006-01 @tier-6-e2e
  Scenario: Accountant views a pending request
    Given a pending engagement request
    When the accountant opens it in the inbox
    Then she sees the request and its submitted details

  # ---------------------------------------------------------------------------
  # AC-DOOR-006-02 — Accountant accepts a request
  # (Tier-6 e2e — covered in request-accept.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-006-02 @tier-6-e2e
  Scenario: Accountant accepts a request
    Given a pending engagement request
    When the accountant accepts it
    Then the request moves to the accepted state

  # ---------------------------------------------------------------------------
  # AC-DOOR-006-03 — Accountant declines a request
  # (Tier-6 e2e — covered in request-decline.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-006-03 @tier-6-e2e
  Scenario: Accountant declines a request
    Given a pending engagement request
    When the accountant declines it
    Then the request moves to the declined state

  # ---------------------------------------------------------------------------
  # AC-DOOR-006-04 — Only the accountant decides
  # (Tier-3 integration — see packages/db + actions.test.ts for executable coverage)
  # (Also covered partially via security tests in request-inbox.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-006-04 @tier-3
  Scenario: Only the accountant decides
    Given a pending engagement request
    When a non-accountant caller attempts to accept or decline it
    Then the attempt is rejected and the request remains pending

  # ---------------------------------------------------------------------------
  # AC-DOOR-006-05 — A decided request is no longer pending
  # (Tier-6 e2e — covered in request-accept.spec.ts and request-decline.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-006-05 @tier-6-e2e
  Scenario: A decided request is no longer pending
    Given a request that has been accepted or declined
    When its state is examined or a second decision is attempted
    Then it is no longer pending and does not await a further decision

  # ---------------------------------------------------------------------------
  # AC-DOOR-007-01 — Acceptance sends an invitation
  # (Tier-6 e2e via Mailhog — covered in request-accept.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-007-01 @tier-6-e2e @mailhog
  Scenario: Acceptance sends an invitation
    Given the accountant accepts an engagement request
    When the acceptance is processed
    Then an invitation is sent to the prospect's contact email

  # ---------------------------------------------------------------------------
  # AC-DOOR-007-02 — Invitation directs to account creation
  # (Tier-6 e2e — covered in request-accept.spec.ts body assertion)
  # ---------------------------------------------------------------------------

  @AC-DOOR-007-02 @tier-6-e2e @mailhog
  Scenario: Invitation directs to account creation
    Given an accepted-request invitation received by the prospect
    When the prospect opens it
    Then it directs them to create their own portal account

  # ---------------------------------------------------------------------------
  # AC-DOOR-007-03 — Account exists only after sign-up
  # (Cross-epic seam — paired with EPIC-004 AC-AUTH-006-01)
  # (Tier-3 integration — no User row created; see actions.test.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-007-03 @tier-3 @cross-epic
  Scenario: Account exists only after sign-up
    Given an invitation has been sent but the prospect has not completed sign-up
    When the system state is examined
    Then no portal client account exists for that prospect yet

  # ---------------------------------------------------------------------------
  # AC-DOOR-007-04 — Invitation is tied to the accepted request
  # (Tier-3 integration — ticket persisted on EngagementRequest; see actions.test.ts)
  # (Also verified at tier-6 via DB assertion in request-accept.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-007-04 @tier-3
  Scenario: Invitation is tied to the accepted request
    Given a prospect completes sign-up from an acceptance invitation
    When the resulting client account is examined
    Then it is linked to the accepted engagement request the invitation came from

  # ---------------------------------------------------------------------------
  # AC-DOOR-008-01 — Decline captures a reason
  # (Tier-6 e2e — covered in request-decline.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-008-01 @tier-6-e2e
  Scenario: Decline captures a reason
    Given the accountant declines an engagement request
    When she is declining it
    Then she can write a brief free-text reason message

  # ---------------------------------------------------------------------------
  # AC-DOOR-008-02 — Reason is emailed to the prospect
  # (Tier-6 e2e via Mailhog — covered in request-decline.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-008-02 @tier-6-e2e @mailhog
  Scenario: Reason is emailed to the prospect
    Given the accountant submits a decline with a reason
    When the decline is processed
    Then the reason is sent to the prospect's contact email

  # ---------------------------------------------------------------------------
  # AC-DOOR-008-03 — Prospect needs no account to receive it
  # (Tier-3 integration — plain email delivery only; see actions.test.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-008-03 @tier-3
  Scenario: Prospect needs no account to receive it
    Given a declined prospect who has no portal account
    When the decline reason is delivered
    Then they receive the explanation by email without needing to sign in

  # ---------------------------------------------------------------------------
  # AC-DOOR-008-04 — Decline reason retained in the portal
  # (Tier-6 e2e — covered in request-decline.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DOOR-008-04 @tier-6-e2e
  Scenario: Decline reason retained in the portal
    Given a request has been declined with a reason
    When the accountant later views that declined request
    Then the decline reason is retained and shown attached to the request

  # ---------------------------------------------------------------------------
  # AC-DASH-011-01 — Accountant views all requests
  # (Tier-6 e2e — covered in request-inbox.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DASH-011-01 @tier-6-e2e
  Scenario: Accountant views all requests
    Given engagement requests exist in various states
    When the accountant opens the request inbox in the admin UI
    Then she can view all engagement requests

  # ---------------------------------------------------------------------------
  # AC-DASH-011-02 — Requests distinguishable by state
  # (Tier-6 e2e — covered in request-inbox.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DASH-011-02 @tier-6-e2e
  Scenario: Requests distinguishable by state
    Given engagement requests that are pending, accepted, and declined
    When the accountant views the inbox
    Then each request's state is distinguishable

  # ---------------------------------------------------------------------------
  # AC-DASH-011-03 — Pending requests are identifiable
  # (Tier-6 e2e — covered in request-inbox.spec.ts)
  # ---------------------------------------------------------------------------

  @AC-DASH-011-03 @tier-6-e2e
  Scenario: Pending requests are identifiable
    Given a mix of decided and undecided requests
    When the accountant views the inbox
    Then she can identify which requests are still pending a decision

  # ---------------------------------------------------------------------------
  # AC-MSG-013-01 — New service request notification
  # (Tier-3 integration — see packages/db/notification.rls.test.ts)
  # ---------------------------------------------------------------------------

  @AC-MSG-013-01 @tier-3
  Scenario: New service request notification
    Given a new service (engagement) request is submitted
    When notifications are generated
    Then the accountant receives a notification of the new service request

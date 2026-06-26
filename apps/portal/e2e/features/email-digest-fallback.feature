# apps/portal/e2e/features/email-digest-fallback.feature
#
# Gherkin acceptance scenarios — Email digest fallback: nudge→sign-in + client default-on
# (EPIC-018 / TASK-018-005)
#
# Acceptance format: gherkin (prose-bound)
# Executable proof: apps/portal/e2e/specs/email-nudge-signin.spec.ts (AC-MSG-008-01/-03)
#                   apps/portal/e2e/specs/client-emailed-without-optin.spec.ts (AC-MSG-011-02)
#
# NOTE: Cucumber tooling is NOT yet chosen (see CLAUDE.md § Executable gherkin tooling).
# This file is a HUMAN-READABLE acceptance spec. The binding to Playwright is in the
# .spec.ts files listed above — standard .spec.ts tests that cover the scenario behavior
# below. When the Cucumber binder lands, step definitions will live at:
#   apps/portal/e2e/steps/email-digest-fallback.steps.ts
#
# Cross-surface context (CLAUDE.md § Platform-frontend scope):
#   The dispatch runs on apps/admin (trigger seam → dispatchDailyDigest).
#   The nudge lands in Mailhog (SMTP) and the sign-in journey lands on apps/portal.
#   Both surfaces are exercised in the tier-6 e2e proof.
#
# ADR-006: CLIENT nudge → PORTAL_APP_URL/sign-in (portal surface). // ADR-006
# ADR-012: Tier-6 e2e acceptance gate. // ADR-012
# ADR-023: SMTP → Mailhog for dev/e2e; no real ESP key wired. // ADR-023
# ADR-025: content-free nudge via EmailProvider port; no ESP SDK. // ADR-025
# REQ-MSG-008: content-free nudge contract. // REQ-MSG-008
# REQ-MSG-011: client default-on (no opt-in step). // REQ-MSG-011
# CS-GEN-003: AC ids cited in every scenario. // CS-GEN-003

Feature: Email digest fallback — content-free nudge and portal sign-in (portal surface)
  In order to stay informed about my portal activity without sensitive data leaving the portal
  As a CLIENT user (sarah-returning-client persona)
  I need to receive a content-free nudge email that only tells me to sign in,
  without revealing any detail about what activity is waiting for me

  # ─── Content-free nudge → portal sign-in ─────────────────────────────────────

  # AC-MSG-008-01
  @AC-MSG-008-01
  Scenario: Client nudge email is content-free (no sensitive activity detail)
    Given a CLIENT with an unread in-portal notification
    And the notification contains sensitive detail:
      | category          | example value            |
      | client name       | seeded in Notification   |
      | document name     | seeded in Notification   |
      | message content   | seeded in Notification   |
      | engagement ref    | seeded in Notification   |
      | event description | seeded in Notification   |
    When the daily digest dispatch runs
    Then a nudge email arrives in the client's inbox
    And the email subject contains only a generic "new activity" statement
    And the email body contains only a generic "new activity" statement and a sign-in URL
    And the email subject does NOT contain any of the seeded sensitive strings
    And the email body does NOT contain any of the seeded sensitive strings

  # AC-MSG-008-03
  @AC-MSG-008-03
  Scenario: Sign-in URL in the nudge email leads to the portal sign-in page
    Given a client received a content-free nudge email (AC-MSG-008-01)
    And the email contains a sign-in URL
    When the client follows the sign-in URL from the email
    Then they land on the CLIENT portal sign-in page (apps/portal /sign-in)
    And they do NOT land on the accountant (admin) surface

  # Combined scenario — both AC-MSG-008-01 and AC-MSG-008-03 in one journey
  @AC-MSG-008-01 @AC-MSG-008-03
  Scenario: Content-free nudge delivered to Mailhog and sign-in link leads to portal
    Given a CLIENT with unread in-portal activity
    And the Notification row contains sensitive detail (client name, document, message, engagement ref, event)
    When the daily digest dispatch runs via the admin trigger seam (ENABLE_DIGEST_TRIGGER=true)
    Then a nudge email is captured in Mailhog via the real SMTP path (EMAIL_PROVIDER=smtp)
    And the delivered email subject and body are content-free:
      | assertion side | what is true                         | what is absent            |
      | positive       | "new activity" in subject and body   | (all seeded detail)       |
      | positive       | sign-in URL in body                  |                           |
      | negative       | (nothing else)                       | client name               |
      | negative       | (nothing else)                       | document name             |
      | negative       | (nothing else)                       | message content           |
      | negative       | (nothing else)                       | engagement reference      |
      | negative       | (nothing else)                       | event description         |
    And following the sign-in URL from the email navigates to the portal /sign-in page

  # ─── Client default-on (no opt-in step) ──────────────────────────────────────

  # AC-MSG-011-02
  @AC-MSG-011-02
  Scenario: Newly created client receives a nudge without performing any opt-in step
    Given a newly created CLIENT user (User row inserted with no emailNudgeEnabled set)
    And the DB default (emailNudgeEnabled = 1 / true) is in effect
    And no opt-in step has been performed:
      - no call to setEmailNudgePreferenceForCurrentUser()
      - no visit to a notification preferences page
      - no explicit opt-in configuration
    And a notification-worthy event has occurred (unread Notification in the CLIENT's feed)
    When the daily digest dispatch runs
    Then a nudge email arrives for this client in Mailhog
    And the nudge arrived purely because of the DB default (proving default-on behavior)
    And the delivered email is content-free (no Notification detail in subject or body)
    And the delivered email contains a portal sign-in URL

  # ─── Security property re-assertion on real SMTP path ────────────────────────

  # REQ-MSG-008 (cross-referenced in both AC-MSG-008-01 and AC-MSG-011-02 tests)
  @REQ-MSG-008
  Scenario: Content-free property is proven on the real SMTP path (not just unit tests)
    Given the tier-3 integration tests prove content-free at the composer level
    When the tier-6 e2e dispatch triggers the real SMTP → Mailhog path
    Then the delivered Mailhog message is also content-free
    And this proves the content-free contract survives the full stack (not just the unit-level composer)
    And no Notification field (type, title, body, linkedItemType, linkedItemId) appears in the email

# apps/admin/e2e/features/email-digest-suppression.feature
#
# Human-readable acceptance scenarios for the accountant email-suppression toggle.
#
# AC-MSG-010-01: The accountant can turn off her own email notifications entirely.
#
# These scenarios are the human-readable specification.
# The executable mirror is: apps/admin/e2e/specs/accountant-email-suppression.spec.ts
# Per CLAUDE.md current state, .feature files are the human-readable spec the .spec.ts mirrors;
# Cucumber tooling is not yet wired (tooling TBD).
#
# ADR-006: apps/admin surface only — NO client email-settings UI. // ADR-006
# ADR-003: identity from session cookie; all DB writes via withRequestContext. // ADR-003
# ADR-012: Tier-6 e2e against the docker-compose stack. // ADR-012
# CS-TS-004: server action guards ACCOUNTANT role from cookie before any DB write. // CS-TS-004
# CS-TS-001: write goes through withRequestContext (SESSION_CONTEXT set). // CS-TS-001
# CS-GEN-003: governing keys cited. // CS-GEN-003

Feature: Accountant email digest suppression
  As the solo tax accountant
  I want to turn off my own email digest notifications
  So that I am not emailed when I have unread portal notifications

  Background:
    Given the accountant is authenticated on the admin surface (apps/admin)
    And the accountant's email notifications are enabled (default state)

  # AC-MSG-010-01 — Happy path: accountant turns off email notifications
  Scenario: [AC-MSG-010-01] Accountant turns off her own email notifications via the settings UI
    Given the accountant navigates to /settings/notifications
    And the email digest toggle shows "Email notifications are enabled"
    When the accountant clicks the email digest toggle to turn it off
    Then the toggle shows "Email notifications are suppressed"
    And the preference is persisted (a page reload reflects the off state)
    And the accountant's email digest will not be sent by the dispatcher

  # AC-MSG-010-01 — Persistence: preference survives a full page reload
  Scenario: [AC-MSG-010-01] Suppressed preference persists after page reload
    Given the accountant has turned off her email notifications
    When she reloads the /settings/notifications page
    Then the toggle still shows "Email notifications are suppressed"
    And the toggle data-email-enabled attribute is "false"

  # Security: CLIENT session cannot access the settings toggle
  Scenario: A CLIENT session cannot reach the notification settings page
    Given a user is authenticated with the CLIENT role
    When they attempt to reach /settings/notifications
    Then they receive an unauthorized response
    And no preference write is performed

  # Security: unauthenticated user cannot toggle suppression
  Scenario: An unauthenticated caller is rejected before any DB write
    Given no valid session cookie is present
    When setOwnEmailNudgeSuppressionAction is called with suppress=true
    Then the action returns { success: false } with an "Unauthorized" error
    And setEmailNudgePreferenceForCurrentUser is never called

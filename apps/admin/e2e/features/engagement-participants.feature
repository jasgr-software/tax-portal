Feature: Multi-participant engagement invitation

  As the tax accountant (Jane)
  I want to invite additional participants to an engagement
  So that both clients can access their shared engagement through their own accounts

  # AC-LIFE-012-02, AC-LIFE-012-03, AC-AUTH-007-01, AC-AUTH-007-02

  Background:
    Given the accountant is authenticated on the Tax Portal
    And an engagement exists with one primary client participant

  # ── AC-AUTH-007-01 ────────────────────────────────────────────────────────────

  Scenario: [AC-AUTH-007-01] one engagement can have more than one CLIENT participant
    Given the accountant navigates to the engagement participants page
    When she invites a second participant by email
    Then the engagement participants list shows two participants
    And the engagement has more than one CLIENT participant

  # ── AC-LIFE-012-02 / AC-AUTH-007-02 ──────────────────────────────────────────

  Scenario: [AC-LIFE-012-02][AC-AUTH-007-02] each participant signs in with their own distinct account
    Given two participants are linked to the same engagement
    When their accounts are examined
    Then each participant has their own distinct user record
    And their clerkUserIds are different
    And they do not share a login

  # ── AC-LIFE-012-03 ───────────────────────────────────────────────────────────

  Scenario: [AC-LIFE-012-03] all linked participants are associated with the same engagement
    Given the accountant invites a second participant to an engagement
    When the participants page is loaded for that engagement
    Then all linked participants appear in the list
    And all are associated with the same engagement

  # ── AC-AUTH-007-03 (surface-level complement to tier-3 RLS in TASK-012-001) ──

  Scenario: [AC-AUTH-007-03] participant reaches the shared engagement through their own account
    Given participant-A and participant-B are both linked to engagement-E
    And an unrelated client has no link to engagement-E
    When participant-A signs in with their own account and navigates to engagement-E
    Then they reach the engagement successfully
    When the unrelated client navigates to engagement-E
    Then they receive a not-found response (cannot access the engagement)

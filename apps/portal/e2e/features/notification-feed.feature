# apps/portal/e2e/features/notification-feed.feature
#
# Gherkin acceptance scenarios — Client notification feed (EPIC-016 / TASK-016-007)
#
# Acceptance format: gherkin (prose-bound)
# Executable proof: apps/portal/e2e/specs/notification-feed.spec.ts
#
# NOTE: Cucumber tooling is NOT yet chosen (see CLAUDE.md § Executable gherkin tooling).
# This file is a HUMAN-READABLE acceptance spec. The binding to Playwright is in
# apps/portal/e2e/specs/notification-feed.spec.ts — standard .spec.ts that covers
# the scenario behavior below. When the Cucumber binder lands, step definitions will
# live at apps/portal/e2e/steps/notification-feed.steps.ts.
#
# ADR-012: Tier-6 e2e acceptance gate.
# ADR-010: Cross-app session boundary (AC-MSG-015-02/-015-03 exercised cross-app).
# ADR-006: Portal surface (Client Portal — apps/portal).
# ADR-023: Real-time transport seam — REALTIME_PROVIDER=mock + ALLOW_MOCK_REALTIME=true.
# CS-GEN-003: AC ids cited in every scenario.

Feature: Client notification feed (portal surface)
  In order to stay informed about engagement activity
  As a Client (sarah-returning-client persona)
  I need an in-portal notification feed with real-time updates and an unread badge

  # ─── Source-event → feed (feed is the authoritative record) ──────────────────

  # AC-MSG-007-03
  @AC-MSG-007-03
  Scenario: In-portal feed contains the notification regardless of other channels
    Given a notification also triggered an out-of-portal nudge
    When the user consults the in-portal feed
    Then the feed contains the notification and the other channel has not replaced it

  # ─── Real-time notification arrival ──────────────────────────────────────────

  # AC-MSG-012-01
  @AC-MSG-012-01
  Scenario: Notification surfaces without manual refresh
    Given a user with the portal open
    When a notification-worthy event occurs for them
    Then the notification surfaces in their feed promptly without them refreshing

  # AC-MSG-012-02
  @AC-MSG-012-02
  Scenario: Multiple events appear in real time
    Given a user is viewing the portal
    When multiple events occur for them
    Then each new notification appears in the feed in real time as it occurs

  # AC-MSG-012-03
  @AC-MSG-012-03
  Scenario: Unread badge increments without manual refresh
    Given a user with the portal open and a known unread count
    When a new notification arrives in real time
    Then the unread-count badge increments without a manual refresh

  # ─── Auto-mark-read on linked-item view ──────────────────────────────────────

  # AC-MSG-015-02 — also exercised cross-app (see cross-app spec)
  @AC-MSG-015-02
  Scenario: Viewing the linked item marks the notification read
    Given an unread notification whose linked item the user has not yet viewed
    When the user views that linked item
    Then the notification is automatically marked read

  # AC-MSG-015-03
  @AC-MSG-015-03
  Scenario: Read state reflected in feed; no separate dismiss action
    Given a notification auto-marked read by viewing its item
    When the user looks at their feed and unread count
    Then the notification shows read and the count has decreased, with no separate dismiss action

  # ─── Unread-count badge ───────────────────────────────────────────────────────

  # AC-MSG-017-01
  @AC-MSG-017-01
  Scenario: Unread badge is present in the navigation on any portal area
    Given an authenticated user
    When they navigate to any area of the portal
    Then an unread-notification count badge is present in the navigation

  # AC-MSG-017-02
  @AC-MSG-017-02
  Scenario: Badge shows the correct unread count
    Given a user with a known number of unread notifications
    When they look at the navigation badge
    Then the badge shows that number of unread notifications

  # AC-MSG-017-03
  @AC-MSG-017-03
  Scenario: Badge updates when notifications are marked read or a new one arrives
    Given a visible unread-count badge
    When a notification is marked read or a new notification arrives
    Then the badge updates to reflect the new unread count

  # ─── Source-event: engagement status change → client notification ──────────────

  # AC-MSG-014-03
  @AC-MSG-014-03
  Scenario: Client receives in-portal notification when accountant changes engagement status
    Given a client with an active engagement
    When the accountant changes that engagement's status
    Then the client receives an in-portal notification of the status change

  # AC-MSG-014-04
  @AC-MSG-014-04
  Scenario: Client receives in-portal notification when a deliverable is made ready
    Given a client with an engagement
    When a deliverable is made ready for them
    Then the client receives an in-portal notification that a deliverable is ready

  # AC-MSG-014-05
  @AC-MSG-014-05
  Scenario: Client notified when accountant accepts their engagement request
    Given a prospective/returning client whose engagement request is pending
    When the accountant accepts the request
    Then the client is notified their request was accepted

  # AC-MSG-014-06
  @AC-MSG-014-06
  Scenario: Client notified when accountant declines their engagement request
    Given a prospective/returning client whose engagement request is pending
    When the accountant declines the request
    Then the client is notified their request was declined

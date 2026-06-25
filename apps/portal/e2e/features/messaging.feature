# apps/portal/e2e/features/messaging.feature
#
# Gherkin acceptance scenarios — Client messaging journeys (EPIC-017 / TASK-017-008)
#
# Acceptance format: gherkin (prose-bound)
# Executable proof: apps/portal/e2e/specs/messaging.spec.ts
#
# NOTE: Cucumber tooling is NOT yet chosen (see CLAUDE.md § Executable gherkin tooling).
# This file is a HUMAN-READABLE acceptance spec. The binding to Playwright is in
# apps/portal/e2e/specs/messaging.spec.ts — standard .spec.ts that covers
# the scenario behavior below. When the Cucumber binder lands, step definitions will
# live at apps/portal/e2e/steps/messaging.steps.ts.
#
# ADR-006: Portal surface (Client Portal — apps/portal) — client journeys.
# ADR-009: Signed-URL attachment retrieval path.
# ADR-012: Tier-6 e2e acceptance gate.
# CS-TS-003: Both surfaces (portal + admin) exercise the same shared DB + actions.
# CS-GEN-003: AC ids cited in every scenario.

Feature: Client messaging journeys (portal surface)
  In order to communicate with my accountant about my engagement
  As a Client (sarah-returning-client persona)
  I need to read and reply to messages, download attachments via signed URLs,
  track unread state, and be notified when the accountant sends messages

  # ─── Engagement thread: one-per-engagement; persistent history ───────────────

  # AC-MSG-001-01
  @AC-MSG-001-01
  Scenario: One thread per engagement
    Given the client has an active engagement
    When the client navigates to the engagement's messages page
    Then exactly one message thread is present for that engagement

  # AC-MSG-001-03
  @AC-MSG-001-03
  Scenario: Full ordered history persists across sessions
    Given the client and accountant have exchanged messages in an engagement thread
    When the client navigates away and returns to the thread
    Then all previously sent messages appear in chronological order

  # AC-MSG-001-04
  @AC-MSG-001-04
  Scenario: Both parties can read and contribute to the engagement thread
    Given an engagement thread with messages from both parties
    When the client opens the engagement's messages page
    Then the client sees messages from both themselves and the accountant
    And the client can submit a new reply in the thread

  # ─── Attachments: visible + retrieve via signed URL ─────────────────────────

  # AC-MSG-004-01
  @AC-MSG-004-01
  Scenario: Client attaches a file when sending a message
    Given an engagement thread
    When the client selects a file and sends a message
    Then the attachment is stored and associated with the message

  # AC-MSG-004-02
  @AC-MSG-004-02
  Scenario: Attachment is visible alongside the message
    Given a message with an attachment in an engagement thread
    When the client views the thread
    Then the attachment is listed alongside the message

  # AC-MSG-004-03
  @AC-MSG-004-03
  Scenario: Client retrieves an attachment via a short-lived signed URL
    Given a message with an active (scan-clean) attachment in the thread
    When the client clicks "Download" on the attachment
    Then requestAttachmentUrlAction returns a signed URL for the client
    And the signed URL allows the client to retrieve the file

  # AC-MSG-004-04
  @AC-MSG-004-04
  Scenario: Attachment sent by accountant is visible to client
    Given the accountant attached a file in the engagement thread
    When the client views the same thread
    Then the attachment is visible to the client alongside the message

  # ─── Per-viewer unread indicator ─────────────────────────────────────────────

  # AC-MSG-005-01
  @AC-MSG-005-01
  Scenario: Unread indicator appears when there are unread messages for the client
    Given a thread where the client has not yet read a message sent by the accountant
    When the client views the thread list
    Then the thread shows an unread indicator

  # AC-MSG-005-02
  @AC-MSG-005-02
  Scenario: Unread indicator appears for both engagement and general thread kinds
    Given threads of both 'engagement' and 'general' kinds with unread messages
    When the client views the messages hub
    Then both thread kinds show the unread indicator

  # AC-MSG-005-04
  @AC-MSG-005-04
  Scenario: Unread indicator clears after viewing the thread
    Given an engagement thread with an unread indicator for the client
    When the client opens the thread (triggering markThreadReadAction)
    Then the thread no longer shows an unread indicator on next load

  # ─── Archived thread stays readable ─────────────────────────────────────────

  # AC-MSG-006-03
  @AC-MSG-006-03
  Scenario: Archived thread remains fully readable after engagement is completed
    Given an engagement in 'Complete' status (thread archived)
    When the client navigates to the engagement's messages page
    Then all messages in the thread are still readable

  # ─── Notifications: accountant sends → client notified; no cross-leak ────────

  # AC-MSG-014-01
  @AC-MSG-014-01
  Scenario: Client receives a new-message notification when accountant sends a message
    Given an engagement thread between client and accountant
    When the accountant sends a message in that thread
    Then a new-message notification appears in the client's notification feed
    And the notification is only visible to the client, not to the accountant

  # AC-MSG-013-02
  @AC-MSG-013-02
  Scenario: Accountant receives a new-message notification when client sends a message
    Given an engagement thread between client and accountant
    When the client sends a message in that thread
    Then a new-message notification appears in the accountant's notification feed
    And the notification is only visible to the accountant, not to the client

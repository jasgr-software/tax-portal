# apps/admin/e2e/features/messaging.feature
#
# Gherkin acceptance scenarios — Accountant messaging journeys (EPIC-017 / TASK-017-008)
#
# Acceptance format: gherkin (prose-bound)
# Executable proof: apps/admin/e2e/specs/messaging.spec.ts
#
# NOTE: Cucumber tooling is NOT yet chosen (see CLAUDE.md § Executable gherkin tooling).
# This file is a HUMAN-READABLE acceptance spec. The binding to Playwright is in
# apps/admin/e2e/specs/messaging.spec.ts — standard .spec.ts that covers
# the scenario behavior below. When the Cucumber binder lands, step definitions will
# live at apps/admin/e2e/steps/messaging.steps.ts.
#
# ADR-006: Admin surface (Tax Portal — apps/admin) — accountant journeys.
# ADR-009: Signed-URL attachment retrieval path.
# ADR-012: Tier-6 e2e acceptance gate.
# CS-TS-003: Both surfaces (portal + admin) exercise the same shared DB + actions.
# CS-GEN-003: AC ids cited in every scenario.

Feature: Accountant messaging journeys (admin surface)
  In order to communicate with clients and manage engagement conversations
  As the Accountant (jane-accountant persona)
  I need to send and receive messages, attach files, track unread state,
  and be notified when clients send messages

  # ─── One thread per engagement; persistent history ───────────────────────────

  # AC-MSG-001-01
  @AC-MSG-001-01
  Scenario: One thread per engagement
    Given an engagement exists between accountant and client
    When the accountant navigates to the engagement's messages page
    Then exactly one message thread is present for that engagement

  # AC-MSG-001-03
  @AC-MSG-001-03
  Scenario: Full ordered history persists across sessions
    Given the accountant and client have exchanged messages in an engagement thread
    When the accountant navigates away and returns to the thread
    Then all previously sent messages appear in chronological order

  # AC-MSG-001-04
  @AC-MSG-001-04
  Scenario: Both parties can read and contribute to the engagement thread
    Given an engagement thread with messages from both parties
    When the accountant opens the engagement's messages page
    Then the accountant sees messages from both themselves and the client
    And the accountant can submit a new reply in the thread

  # ─── General thread: accountant starts + ordered history ─────────────────────

  # AC-MSG-002-01
  @AC-MSG-002-01
  Scenario: Accountant starts a general thread via the client selector
    Given a client user exists in the system
    When the accountant opens the messages hub and clicks "New Message Thread"
    And selects a client from the populated selector and clicks Create
    Then a new general thread is created and appears in the thread list

  # AC-MSG-002-03
  @AC-MSG-002-03
  Scenario: Messages in a general thread are retained in chronological order
    Given a general thread exists between the accountant and a client
    When the accountant sends messages to that thread
    Then the messages appear in the thread in chronological (send) order

  # ─── Attachments: attach + retrieve via signed URL ───────────────────────────

  # AC-MSG-004-01
  @AC-MSG-004-01
  Scenario: Accountant attaches a file when sending a message
    Given an engagement thread with at least one message
    When the accountant selects a file and sends a message
    Then the attachment is stored and associated with the message

  # AC-MSG-004-02
  @AC-MSG-004-02
  Scenario: Attachment is visible alongside the message for thread participants
    Given a message with an attachment in an engagement thread
    When the accountant views the thread
    Then the attachment is listed alongside the message

  # AC-MSG-004-03
  @AC-MSG-004-03
  Scenario: Participant retrieves an attachment via a short-lived signed URL
    Given a message with an active (scan-clean) attachment in an engagement thread
    When the accountant clicks "Download" on the attachment
    Then requestAttachmentUrlAction returns a signed URL
    And the signed URL allows the participant to retrieve the file

  # AC-MSG-004-04
  @AC-MSG-004-04
  Scenario: Attachment is visible to the other party (the client) after upload
    Given the accountant attaches a file in an engagement thread
    When the client views the same thread
    Then the attachment is visible to the client alongside the message

  # ─── Per-viewer unread indicator ─────────────────────────────────────────────

  # AC-MSG-005-01
  @AC-MSG-005-01
  Scenario: Unread indicator appears when there are unread messages for the viewer
    Given a thread where the accountant has not yet read a message sent by the client
    When the accountant views the thread list
    Then the thread shows an unread indicator

  # AC-MSG-005-02
  @AC-MSG-005-02
  Scenario: Unread indicator appears for both engagement and general thread kinds
    Given threads of both 'engagement' and 'general' kinds with unread messages
    When the accountant views the messages hub
    Then both thread kinds show the unread indicator

  # AC-MSG-005-04
  @AC-MSG-005-04
  Scenario: Unread indicator clears after viewing the thread
    Given an engagement thread with an unread indicator for the accountant
    When the accountant opens the thread (triggering markThreadReadAction)
    Then the thread no longer shows an unread indicator on next load

  # ─── Archived thread stays readable ─────────────────────────────────────────

  # AC-MSG-006-03
  @AC-MSG-006-03
  Scenario: Archived thread remains fully readable after engagement is completed
    Given an engagement in 'Complete' status (thread archived)
    When the accountant navigates to the engagement's messages page
    Then all messages in the thread are still readable
    And the thread is visible in the messages hub

  # ─── Notifications: client sends → accountant notified; no cross-leak ────────

  # AC-MSG-013-02
  @AC-MSG-013-02
  Scenario: Accountant receives a new-message notification when client sends a message
    Given an engagement thread between accountant and client
    When the client sends a message in that thread
    Then a new-message notification appears in the accountant's notification feed
    And the notification is only visible to the accountant, not to the client

  # AC-MSG-014-01
  @AC-MSG-014-01
  Scenario: Client receives a new-message notification when accountant sends a message
    Given an engagement thread between accountant and client
    When the accountant sends a message in that thread
    Then a new-message notification appears in the client's notification feed
    And the notification is only visible to the client, not to the accountant

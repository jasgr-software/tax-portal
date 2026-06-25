---
id: EPIC-017
title: Per-engagement & general messaging threads with attachments
phase: 4
status: delivered
slice: The accountant and her clients exchange plain-text messages — with file attachments — in a per-engagement thread (and accountant-initiated general threads), with per-viewer unread indicators, indefinite retention and archive-on-close; sending a message notifies the recipient through the EPIC-016 feed.
requirements:
  - REQ-MSG-001: [AC-MSG-001-01, AC-MSG-001-02, AC-MSG-001-03, AC-MSG-001-04]
  - REQ-MSG-002: [AC-MSG-002-01, AC-MSG-002-02, AC-MSG-002-03]
  - REQ-MSG-003: [AC-MSG-003-01, AC-MSG-003-02, AC-MSG-003-03]
  - REQ-MSG-004: [AC-MSG-004-01, AC-MSG-004-02, AC-MSG-004-03, AC-MSG-004-04, AC-MSG-004-05]
  - REQ-MSG-005: [AC-MSG-005-01, AC-MSG-005-02, AC-MSG-005-03, AC-MSG-005-04]
  - REQ-MSG-006: [AC-MSG-006-01, AC-MSG-006-02, AC-MSG-006-03]
  - REQ-MSG-013: [AC-MSG-013-02]
  - REQ-MSG-014: [AC-MSG-014-01]
architecture:
  - ADR-005   # RLS — a thread is readable only by its participants (engagement participants / the client on a general thread)
  - ADR-003   # SESSION_CONTEXT — message reads/writes run under the propagated principal
  - ADR-006   # monorepo — threads render on both apps/portal (client) and apps/admin (accountant)
  - ADR-008   # object storage abstraction — message attachments stored via the storage seam
  - ADR-009   # signed-url file access — attachments retrieved via short-lived signed URLs, never public
  - ADR-021   # file upload safety — attachments scanned before they are made available (REQ-NFR-009)
  - ADR-018   # data retention — threads retained indefinitely; archived (not deleted) on engagement close
  - ADR-012   # testing pyramid — participant isolation + plain-text + scan-before-available are hard tier-3 gates
depends_on: [EPIC-016, EPIC-013, EPIC-010]
source:
  - .requirements/REQ-MSG-001.md
  - .requirements/REQ-MSG-002.md
  - .requirements/REQ-MSG-003.md
  - .requirements/REQ-MSG-004.md
  - .requirements/REQ-MSG-005.md
  - .requirements/REQ-MSG-006.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
  - .architecture/decisions/ADR-021-file-upload-safety.md
open_questions: []
---

# EPIC-017 — Per-engagement & general messaging threads with attachments

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice delivers the **conversation surface** that replaces email. Every engagement has exactly **one**
dedicated thread its participants — the accountant and the client(s) — can read and contribute to; the
accountant can also open an **accountant-initiated general thread** with a client that is not tied to any
engagement. Messages are **plain text only** (markup is shown verbatim, no inline images) and may carry
**one or more file attachments**, which follow the same type/size rules and **malware scanning** as
engagement document upload and are retrieved by the thread's participants via signed URLs. Each thread
shows a **per-viewer unread indicator** that clears once the viewer has seen the new messages. Threads are
retained **indefinitely** and, when an engagement closes, the thread is **archived rather than deleted** and
stays fully readable. Sending a message raises a **new-message notification** to the recipient through the
EPIC-016 feed.

## Requirements delivered

- **REQ-MSG-001 — Per-engagement message thread**
  - **AC-MSG-001-01** — each engagement has exactly one dedicated thread.
  - **AC-MSG-001-02** — a message sent in the thread is recorded there and visible to the engagement's participants.
  - **AC-MSG-001-03** — the thread preserves full history in send order and persists across sessions.
  - **AC-MSG-001-04** — both the accountant and the client participant(s) can read and contribute.
- **REQ-MSG-002 — General threads outside an engagement**
  - **AC-MSG-002-01** — the accountant can start a general thread with a client, not tied to an engagement.
  - **AC-MSG-002-02** — a general thread is associated with the client and visible to the accountant and that client.
  - **AC-MSG-002-03** — messages in a general thread are recorded and retained as ordered history, like engagement threads.
- **REQ-MSG-003 — Plain text only**
  - **AC-MSG-003-01** — a message body is treated and displayed as plain text; no rich-text styling applied.
  - **AC-MSG-003-02** — markup/formatting entered in a body is shown verbatim, not interpreted or rendered.
  - **AC-MSG-003-03** — images are not embedded inline in a message body.
- **REQ-MSG-004 — File attachments**
  - **AC-MSG-004-01** — a sender can attach one or more files to a message.
  - **AC-MSG-004-02** — a message's attachments are visible to the thread's participants alongside the message.
  - **AC-MSG-004-03** — a participant can open/download a file attached to a message in a thread they participate in.
  - **AC-MSG-004-04** — attachments remain available for as long as the carrying message is retained.
  - **AC-MSG-004-05** — attachments are subject to the same file-type/size rules as document upload and to malware scanning before availability (REQ-NFR-009).
- **REQ-MSG-005 — Unread indicators**
  - **AC-MSG-005-01** — a thread with messages the viewer has not read displays an unread indicator to that viewer.
  - **AC-MSG-005-02** — the unread indicator is shown on all threads, engagement and general.
  - **AC-MSG-005-03** — unread state is per-viewer: a thread can be unread for one participant and read for another.
  - **AC-MSG-005-04** — once the viewer has seen the new messages, the indicator clears for that viewer.
- **REQ-MSG-006 — Kept forever, archived on close**
  - **AC-MSG-006-01** — threads are retained indefinitely; closing/completing an engagement does not delete the thread or messages.
  - **AC-MSG-006-02** — on engagement close, the thread is marked archived rather than deleted.
  - **AC-MSG-006-03** — an archived thread remains fully readable by its participants at all times.
- **REQ-MSG-013 — Accountant notification types** (the message-sourced one)
  - **AC-MSG-013-02** — the accountant is notified when a new message is received.
- **REQ-MSG-014 — Client notification types** (the message-sourced one)
  - **AC-MSG-014-01** — a client is notified when a new message is received.

## Architecture adherence
- **ADR-005 — RLS via security policies.** A thread and its messages/attachments are readable **only by its
  participants** — the engagement's participants for an engagement thread, the associated client for a
  general thread. The per-policy test — a non-participant client reads **zero**; null SESSION_CONTEXT reads
  zero; a participant reads — is a **hard** tier-3 gate (AC-MSG-001-02/-04, AC-MSG-002-02).
- **ADR-003 — SESSION_CONTEXT.** All message reads/writes and attachment access run under the propagated
  principal via the `packages/db` wrapper.
- **ADR-006 — Monorepo, two apps.** Threads render on both `apps/portal` (client) and `apps/admin`
  (accountant); general-thread creation is an `apps/admin` affordance.
- **ADR-008 / ADR-009 — Object storage + signed URLs.** Attachments are stored through the storage seam and
  retrieved via short-lived signed URLs scoped to a participant; no attachment is ever publicly addressable.
- **ADR-021 — File upload safety.** Message attachments are scanned **before** they are made available to
  participants (AC-MSG-004-05 / REQ-NFR-009) — a **hard** tier-3 obligation, reusing the EPIC-007 scan seam.
- **ADR-018 — Data retention.** Threads are retained indefinitely and archived-not-deleted on close,
  consistent with the v1 no-hard-delete stance.
- **ADR-012 — Testing pyramid.** Participant isolation, plain-text treatment, and scan-before-available are
  hard tier-3 gates; the send/receive/attach/archive journeys are tier-6 e2e.

## Acceptance scenarios

### AC-MSG-001-01 — One thread per engagement
```gherkin
Given an engagement
When its message thread is examined
Then exactly one dedicated thread is associated with that engagement
```

### AC-MSG-001-02 — A message is recorded and visible to participants
```gherkin
Given the accountant and a client participant on an engagement
When one of them sends a message in the engagement thread
Then the message is recorded in that thread and visible to the engagement's participants
```

### AC-MSG-001-03 — Full ordered history persists
```gherkin
Given several messages have been exchanged in an engagement thread
When a participant re-opens the thread in a later session
Then the full conversation history is shown in the order it was sent
```

### AC-MSG-001-04 — Both parties can read and contribute
```gherkin
Given an engagement thread
When either the accountant or a client participant uses it
Then each can both read the thread and contribute messages to it
```

### AC-MSG-002-01 — Accountant starts a general thread
```gherkin
Given the accountant and a client
When she starts a general thread with that client
Then a thread exists that is not associated with any engagement
```

### AC-MSG-002-02 — General thread is associated with the client
```gherkin
Given an accountant-initiated general thread with a client
When its visibility is examined
Then it is associated with that client and visible to the accountant and that client only
```

### AC-MSG-002-03 — General-thread messages retained as ordered history
```gherkin
Given a general thread with messages
When it is re-opened later
Then its messages are recorded and shown as persistent ordered history, like an engagement thread
```

### AC-MSG-003-01 — Body is plain text
```gherkin
Given a message is sent with a text body
When it is displayed
Then it is shown as plain text with no rich-text styling applied
```

### AC-MSG-003-02 — Markup is shown verbatim
```gherkin
Given a message body containing markup or formatting syntax
When the message is displayed
Then the syntax is shown verbatim and is not interpreted or rendered
```

### AC-MSG-003-03 — No inline images in the body
```gherkin
Given a message body
When it is rendered
Then no image is embedded inline within the message body
```

### AC-MSG-004-01 — Sender attaches one or more files
```gherkin
Given a participant composing a message
When they attach one or more files and send it
Then the message carries those attachments
```

### AC-MSG-004-02 — Attachments visible to participants
```gherkin
Given a message with attachments in a thread
When a participant views the message
Then the attachments are visible alongside it
```

### AC-MSG-004-03 — Participant retrieves an attachment
```gherkin
Given a message attachment in a thread a participant belongs to
When that participant opens or downloads it
Then they receive the file
```

### AC-MSG-004-04 — Attachment available while the message is retained
```gherkin
Given a message with an attachment
When the message remains retained over time
Then the attachment remains available to participants
```

### AC-MSG-004-05 — Attachments scanned and bound by upload rules
```gherkin
Given a participant attaches a file subject to the document-upload type/size rules
When the file is uploaded
Then it is malware-scanned before being made available to the thread's participants
```

### AC-MSG-005-01 — Unread indicator on a thread with new messages
```gherkin
Given a thread containing messages the current viewer has not read
When the viewer looks at their thread list
Then that thread displays an unread indicator to them
```

### AC-MSG-005-02 — Unread indicator on engagement and general threads
```gherkin
Given both engagement threads and general threads with unread messages
When the viewer looks at their threads
Then the unread indicator is shown on both kinds of thread
```

### AC-MSG-005-03 — Unread state is per-viewer
```gherkin
Given a thread with a new message that one participant has read and another has not
When each participant views the thread list
Then the thread is unread for the one who has not read it and read for the one who has
```

### AC-MSG-005-04 — Indicator clears once seen
```gherkin
Given a thread showing an unread indicator to a viewer
When that viewer reads the thread's new messages
Then the unread indicator clears for that viewer
```

### AC-MSG-006-01 — Threads retained indefinitely
```gherkin
Given an engagement with a message thread
When the engagement is closed or completed
Then the thread and its messages are not deleted
```

### AC-MSG-006-02 — Archived, not deleted, on close
```gherkin
Given an engagement is closed
When its thread's state is examined
Then the thread is marked archived rather than deleted
```

### AC-MSG-006-03 — Archived thread stays readable
```gherkin
Given an archived thread
When a participant opens it
Then it remains fully readable
```

### AC-MSG-013-02 — Accountant notified of a new message
```gherkin
Given a client sends a message in a thread the accountant participates in
When the message is sent
Then the accountant receives an in-portal new-message notification
```

### AC-MSG-014-01 — Client notified of a new message
```gherkin
Given the accountant sends a message in a thread a client participates in
When the message is sent
Then the client receives an in-portal new-message notification
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-MSG-001-NN` / `-002-NN` / `-003-NN` / `-004-NN` / `-005-NN` / `-006-NN`
  / `-013-02` / `-014-01` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration / security (tier 3)** — AC-MSG-001-02 / -002-02 (participant-isolation RLS, hard),
    AC-MSG-003-01/-02/-03 (plain-text treatment), AC-MSG-004-05 (scan-before-available, hard),
    AC-MSG-005-03 (per-viewer state), AC-MSG-006-01/-02 (retention/archive).
  - **e2e (tier 6)** — AC-MSG-001-01/-03/-04, AC-MSG-002-01/-03, AC-MSG-004-01/-02/-03/-04,
    AC-MSG-005-01/-02/-04, AC-MSG-006-03, AC-MSG-013-02, AC-MSG-014-01.

## Out of scope
- **The notification feed mechanism, real-time delivery, badge, read-tracking** → **EPIC-016** (this slice
  *emits* the new-message notification; the feed surfaces it).
- **Email digest of new-message notifications** (REQ-MSG-008/009) → **EPIC-018**.
- **Whether a client may originate a general thread** — resolved by REQ-MSG-002 Notes as
  **accountant-initiated only**; client-originated general threads are out of scope.
- **Attachment storage/scan mechanism** is reused from EPIC-007 (REQ-NFR-009) — not re-built here.

## Links
- Requirements: REQ-MSG-001, REQ-MSG-002, REQ-MSG-003, REQ-MSG-004, REQ-MSG-005, REQ-MSG-006, REQ-MSG-013 (-02), REQ-MSG-014 (-01)
- Architecture: ADR-003, ADR-005, ADR-006, ADR-008, ADR-009, ADR-012, ADR-018, ADR-021
- Personas: `personas/jane-accountant.md`, `personas/sarah-returning-client.md`, `personas/martha-and-james-married-couple.md`
- Flows: `flows/flow-message-exchange.md` (the primary flow this slice realizes — reconciled from its Phase-4 stub)
- Epics: depends on EPIC-016 (feed receives the new-message notification), EPIC-013 (attachment storage/scan seam), EPIC-010 (engagement close → archive)
- Open questions: none

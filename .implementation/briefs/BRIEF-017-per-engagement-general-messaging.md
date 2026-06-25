---
id: BRIEF-017
title: Per-engagement & general messaging threads — plain-text messages, scanned signed-URL attachments, per-viewer unread, indefinite retention + archive-on-close, new-message notifications onto the EPIC-016 spine
status: ready
acceptance_criteria:
  - id: AC-MSG-001-01
    text: "Each engagement has exactly one dedicated message thread associated with it."
  - id: AC-MSG-001-02
    text: "A message sent in an engagement's thread is recorded in that thread and visible to the engagement's participants."
  - id: AC-MSG-001-03
    text: "The thread preserves the full conversation history in the order messages were sent, and the history persists across sessions."
  - id: AC-MSG-001-04
    text: "Both the accountant and the client participant(s) of the engagement can read and contribute to the engagement's thread."
  - id: AC-MSG-002-01
    text: "The accountant can start a general message thread with a client that is not associated with any engagement."
  - id: AC-MSG-002-02
    text: "A general thread is associated with the client and is visible to the accountant and that client."
  - id: AC-MSG-002-03
    text: "Messages in a general thread are recorded and retained as persistent, ordered conversation history, the same as engagement threads."
  - id: AC-MSG-003-01
    text: "A message body is treated and displayed as plain text; no rich-text styling is applied to it."
  - id: AC-MSG-003-02
    text: "Markup or formatting syntax entered in a message body is not interpreted or rendered — it is shown verbatim as plain text."
  - id: AC-MSG-003-03
    text: "Images are not embedded inline within a message body."
  - id: AC-MSG-004-01
    text: "A sender can attach one or more files to a message."
  - id: AC-MSG-004-02
    text: "A message's attachments are visible to the thread's participants alongside the message."
  - id: AC-MSG-004-03
    text: "A thread participant can retrieve (open or download) a file attached to a message in a thread they participate in."
  - id: AC-MSG-004-04
    text: "Attachments remain available for as long as the message that carries them is retained."
  - id: AC-MSG-004-05
    text: "Message attachments are subject to the same file-type and size rules as engagement document upload, and to malware scanning before they are made available (REQ-NFR-009)."
  - id: AC-MSG-005-01
    text: "A thread that contains messages the current viewer has not yet read displays an unread indicator to that viewer."
  - id: AC-MSG-005-02
    text: "The unread indicator is shown on all message threads, both engagement and general."
  - id: AC-MSG-005-03
    text: "The unread state is per-viewer: a thread can be unread for one participant while read for another."
  - id: AC-MSG-005-04
    text: "Once the viewer has seen a thread's new messages, the unread indicator clears for that viewer."
  - id: AC-MSG-006-01
    text: "Message threads are retained indefinitely; closing or completing an engagement does not delete its thread or any of its messages."
  - id: AC-MSG-006-02
    text: "When an engagement closes, its thread is marked archived rather than deleted."
  - id: AC-MSG-006-03
    text: "An archived thread remains fully readable by its participants at all times."
  - id: AC-MSG-013-02
    text: "The accountant receives an in-portal notification when a new message is received."
  - id: AC-MSG-014-01
    text: "A client receives an in-portal notification when a new message is received."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "HARD tier-3 participant-isolation RLS (ADR-005 / ADR-003 / CS-SQL-001): a thread, its messages, and its attachments are readable ONLY by the thread's participants — the engagement's participants for an engagement thread, the associated client for a general thread. Per-policy test is mandatory and proven BOTH ways: a non-participant client reads ZERO of another thread's messages/attachments; a null SESSION_CONTEXT reads ZERO; a participant reads; the accountant reads. A missing/one-directional isolation test is a rejection (AC-MSG-001-02/-04, AC-MSG-002-02)."
    - "HARD tier-3 plain-text treatment (REQ-MSG-003): a message body is stored and displayed as plain text — markup/formatting entered in a body is shown VERBATIM (never interpreted or rendered), and no image is embedded inline in the body. The proof includes a body carrying markup/HTML/script-like syntax shown literally (AC-MSG-003-01/-02/-03)."
    - "HARD tier-3 scan-before-available (ADR-021 / REQ-NFR-009): message attachments reuse the EPIC-007 FileScanner seam and the same file-type/size rules as document upload; an attachment is NOT made available to participants until it is scanned clean. infected/indeterminate never becomes retrievable. Reuse the EPIC-007/-013 pipeline — do not rebuild it (AC-MSG-004-05)."
    - "HARD tier-3 per-viewer unread state (REQ-MSG-005): unread is tracked per (thread, viewer); a thread can be unread for one participant and read for another at the same time, and the indicator clears for a viewer once that viewer has seen the new messages (AC-MSG-005-03/-04)."
    - "HARD tier-3 indefinite retention + archive-on-close (ADR-018 / REQ-MSG-006): threads + messages are retained indefinitely (engagement close/complete deletes nothing); engagement close marks the thread ARCHIVED (not deleted) and an archived thread stays fully readable. Distinct from EPIC-016's ≥90-day notification floor — do not conflate (AC-MSG-006-01/-02/-03)."
    - "Tier-6 e2e send/receive/attach/archive journeys, BOTH surfaces (ADR-006 / ADR-009 / ADR-012): one-thread-per-engagement; full ordered history persists across sessions; both parties read+contribute; accountant starts a general thread; attach one+ files and a participant retrieves via a short-lived signed URL; unread indicator present/per-kind/clears; archived thread stays readable — exercised on apps/portal (client) and apps/admin (accountant)."
    - "Tier-6 e2e new-message notification onto the EPIC-016 spine: sending a message emits exactly one new-message notification to the recipient through the EPIC-016 feed — accountant notified when a client sends (AC-MSG-013-02), client notified when the accountant sends (AC-MSG-014-01); the recipient-only entitlement holds (no cross-participant leak)."
acceptance_scenarios: .planning/EPIC-017-per-engagement-general-messaging.md   # Given/When/Then reproduced verbatim in § Acceptance scenarios below
demo:
  applicable: yes
  apps: [portal, admin]
  personas: [jane-accountant, sarah-returning-client]
  flows: [flow-message-exchange]
source:
  - planning: .planning/EPIC-017-per-engagement-general-messaging.md
  - requirements: .requirements/REQ-MSG-001.md
  - requirements: .requirements/REQ-MSG-002.md
  - requirements: .requirements/REQ-MSG-003.md
  - requirements: .requirements/REQ-MSG-004.md
  - requirements: .requirements/REQ-MSG-005.md
  - requirements: .requirements/REQ-MSG-006.md
  - requirements: .requirements/REQ-MSG-013.md
  - requirements: .requirements/REQ-MSG-014.md
  - requirements: .requirements/REQ-NFR-009.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-003-session-context.md
  - architecture: .architecture/decisions/ADR-006-monorepo-two-apps.md
  - architecture: .architecture/decisions/ADR-008-object-storage-abstraction.md
  - architecture: .architecture/decisions/ADR-009-signed-url-file-access.md
  - architecture: .architecture/decisions/ADR-021-file-upload-safety.md
  - architecture: .architecture/decisions/ADR-018-data-retention-lifecycle.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
code_standards:
  - "CS-TS-001 (required) — request-scoped DB access only through the packages/db wrapper (ADR-003 SESSION_CONTEXT): thread/message reads, message sends, mark-read writes, attachment-access checks"
  - "CS-TS-002 (required) — never import the raw requestDb/adminDb pools outside packages/db"
  - "CS-TS-003 (recommended) — apply shared patterns to BOTH surfaces (threads render on apps/portal and apps/admin)"
  - "CS-TS-004 (experimental) — every server action resolves identity from the request cookie and guards role before any DB write (send-message, mark-read, start-general-thread, sign-attachment-URL)"
  - "CS-SQL-001 (required) — every participant-scoped table ships a SECURITY POLICY + a participant/non-participant RLS test (pol_Thread / pol_Message / pol_MessageAttachment)"
  - "CS-SQL-002 (required) — raw-SQL track only for what Prisma cannot express (the thread/message/attachment security policies live in db/policies/)"
  - "CS-SQL-003 (required) — RLS predicates are inline TVFs, shallow, admin/accountant-first, fail-closed (the participant branches; reuse the EPIC-013 fn_engagement_access participant logic)"
  - "CS-GEN-001 (recommended) — no secrets or PII in logs (message bodies, client identities, attachment storage keys, signed-URL tokens)"
  - "CS-GEN-002 (recommended) — additive, non-destructive wiring of the new-message emit into the existing EPIC-016 Notification spine and of archive-on-close into the EPIC-010 Complete transition"
  - "CS-GEN-003 (recommended) — cite the governing ADR/REQ in code & test comments"
---

# BRIEF-017 — Per-engagement & general messaging threads with attachments

> **Self-contained build brief for the EPIC-017 slice (Phase 4 — the conversation surface that replaces email).**
> Delivers a **per-engagement message thread** (exactly one per engagement) and an **accountant-initiated
> general thread** with a client, carrying **plain-text** messages and **one-or-more file attachments** that
> reuse the EPIC-007/-013 storage + **malware-scan** seam and are retrieved by participants via short-lived
> **signed URLs**. Each thread shows a **per-viewer unread indicator** that clears on view; threads are
> retained **indefinitely** and **archived (not deleted)** on engagement close; sending a message **emits a
> new-message notification** to the recipient through the **EPIC-016** feed. `source:` refs are read-only
> context; the brief stands alone. Composed by the Conductor from `.planning/EPIC-017` + its cited `REQ-*`/ADRs.
> **This slice does NOT close a roadmap phase** (EPIC-018..023 remain `planned`; EPIC-023 is the Phase-4
> closer) — **no** phase-walkthrough obligation rides this PR.

## Scope

Stand up the **messaging conversation surface** — the email replacement — across **both** the accountant
(`apps/admin` — Tax Portal) and clients (`apps/portal` — Client Portal). Six capabilities:

1. **Per-engagement thread (exactly one).** Every engagement has **one** dedicated thread its participants —
   the accountant and the client participant(s) (the EPIC-012 `EngagementParticipant` set) — can read and
   contribute to. A message sent in the thread is **recorded** there and **visible to those participants**;
   the thread preserves **full history in send order** and **persists across sessions**.

2. **Accountant-initiated general thread.** The accountant can open a **general thread** with a client that is
   **not** tied to any engagement; it is **associated with that client** and visible to the **accountant and
   that client only**. General-thread creation is an **`apps/admin` affordance** — clients participate in but
   do **not** originate general threads (REQ-MSG-002 Notes, resolved: accountant-initiated only).

3. **Plain text only.** A message body is **stored and displayed as plain text**: markup/formatting entered in
   a body is shown **verbatim** (never interpreted or rendered), and **no image is embedded inline** in the
   body. Files travel as **attachments** (capability 4), never inline.

4. **File attachments (reuse the EPIC-007/-013 seam).** A message may carry **one or more** attachments. They
   are subject to the **same file-type/size rules as engagement document upload** and to **malware scanning
   before they are made available** (REQ-NFR-009) — **scan-before-available**, reusing the EPIC-007 `FileScanner`
   port + the EPIC-013 storage path; they are **retrieved by participants via short-lived signed URLs** (ADR-009)
   and are **never publicly addressable** (ADR-008). An attachment remains available **as long as its carrying
   message is retained**.

5. **Per-viewer unread indicator.** A thread containing messages the **current viewer** has not read displays
   an **unread indicator to that viewer**, on **both** engagement and general threads. Unread is **per-viewer**
   (a thread can be unread for one participant and read for another), and the indicator **clears for a viewer**
   once that viewer has **seen** the new messages.

6. **Indefinite retention + archive-on-close + new-message notification.** Threads + messages are retained
   **indefinitely** — closing/completing an engagement deletes **nothing**; on engagement close the thread is
   marked **archived rather than deleted** and **stays fully readable**. Sending a message raises a **new-message
   notification** to the **recipient** through the **EPIC-016** feed: the accountant is notified when a client
   sends (AC-MSG-013-02); a client is notified when the accountant sends (AC-MSG-014-01).

Built on **EPIC-016** (the notification feed spine — receives the new-message notification), **EPIC-013** (the
attachment storage + scan + signed-URL seam and the `EngagementParticipant` participant-isolation pattern), and
**EPIC-010** (the engagement Complete transition that triggers archive-on-close). This slice establishes the
conversation contract that later Phase-4 slices reference (EPIC-018 email-digests the new-message notification;
EPIC-020 surfaces recent-message activity on the dashboard).

## Out of scope

- **The notification feed mechanism itself** — real-time delivery, the unread-count **badge**, read-tracking →
  **EPIC-016** (already delivered). This slice **emits** the new-message notification; the EPIC-016 feed surfaces
  it. Do **not** re-build the feed/badge.
- **Email digest of new-message notifications** (REQ-MSG-008/009) → **EPIC-018**. This slice is the **in-portal
  thread + the in-portal new-message notification** only.
- **Client-originated general threads.** Resolved by REQ-MSG-002 Notes as **accountant-initiated only** — a
  client cannot start a general thread (they participate in one the accountant opens).
- **The attachment storage / scan / signed-URL mechanism** — **reused** from EPIC-007 (`FileStorage` + the
  `FileScanner` scan-before-available pipeline) and EPIC-013 (the participant-scoped document storage path).
  This slice **consumes** that seam for message attachments; it does **not** re-implement storage, scanning, or
  signed-URL minting.
- **Rich text, message editing/deletion, reactions, read receipts beyond the unread indicator, typing
  indicators, threaded replies** — none are in REQ-MSG-001..006; plain-text append-only threads only.
- **Real-time/live message arrival inside an open thread** is **not** an EPIC-017 AC — REQ-MSG-012 real-time
  delivery is the EPIC-016 notification path (the new-message **notification** surfaces in real time via the
  already-built feed). In-thread live-update of the message list is **not** required here.
- **Cross-practice dashboard / activity aggregation** (REQ-DASH-*) → **EPIC-020/021**.

## Acceptance criteria

Each AC is covered by automated test(s) **tagged with its AC id** at the prescribed tier (§ Methodology). An
AC is implemented only when its tagged test(s) **pass in CI**; the epic is delivered only when all **24** are
`verified` in `COVERAGE.md`.

### REQ-MSG-001 — Per-engagement message thread
- **AC-MSG-001-01** — Each engagement has exactly one dedicated message thread associated with it.
- **AC-MSG-001-02** — A message sent in an engagement's thread is recorded in that thread and visible to the engagement's participants.
- **AC-MSG-001-03** — The thread preserves the full conversation history in the order messages were sent, and the history persists across sessions.
- **AC-MSG-001-04** — Both the accountant and the client participant(s) of the engagement can read and contribute to the engagement's thread.

### REQ-MSG-002 — General threads outside an engagement
- **AC-MSG-002-01** — The accountant can start a general message thread with a client that is not associated with any engagement.
- **AC-MSG-002-02** — A general thread is associated with the client and is visible to the accountant and that client.
- **AC-MSG-002-03** — Messages in a general thread are recorded and retained as persistent, ordered conversation history, the same as engagement threads.

### REQ-MSG-003 — Plain text only
- **AC-MSG-003-01** — A message body is treated and displayed as plain text; no rich-text styling is applied to it.
- **AC-MSG-003-02** — Markup or formatting syntax entered in a message body is not interpreted or rendered — it is shown verbatim as plain text.
- **AC-MSG-003-03** — Images are not embedded inline within a message body.

### REQ-MSG-004 — File attachments
- **AC-MSG-004-01** — A sender can attach one or more files to a message.
- **AC-MSG-004-02** — A message's attachments are visible to the thread's participants alongside the message.
- **AC-MSG-004-03** — A thread participant can retrieve (open or download) a file attached to a message in a thread they participate in.
- **AC-MSG-004-04** — Attachments remain available for as long as the message that carries them is retained.
- **AC-MSG-004-05** — Message attachments are subject to the same file-type and size rules as engagement document upload, and to malware scanning before they are made available (REQ-NFR-009).

### REQ-MSG-005 — Unread indicators
- **AC-MSG-005-01** — A thread that contains messages the current viewer has not yet read displays an unread indicator to that viewer.
- **AC-MSG-005-02** — The unread indicator is shown on all message threads, both engagement and general.
- **AC-MSG-005-03** — The unread state is per-viewer: a thread can be unread for one participant while read for another.
- **AC-MSG-005-04** — Once the viewer has seen a thread's new messages, the unread indicator clears for that viewer.

### REQ-MSG-006 — Kept forever, archived on close
- **AC-MSG-006-01** — Message threads are retained indefinitely; closing or completing an engagement does not delete its thread or any of its messages.
- **AC-MSG-006-02** — When an engagement closes, its thread is marked archived rather than deleted.
- **AC-MSG-006-03** — An archived thread remains fully readable by its participants at all times.

### REQ-MSG-013 — Accountant notification type (the message-sourced one)
- **AC-MSG-013-02** — The accountant receives an in-portal notification when a new message is received.

### REQ-MSG-014 — Client notification type (the message-sourced one)
- **AC-MSG-014-01** — A client receives an in-portal notification when a new message is received.

## Methodology & quality requirements

- **Acceptance format: gherkin.** Bind the Given/When/Then scenarios in § Acceptance scenarios to executable
  tests (carried verbatim from the epic). Each test's title/annotation contains its **AC id** (the AC-id
  test-tag contract — what makes the Validate write-back possible).
- **Tier mapping (ADR-012 testing pyramid; per the epic's sign-off contract):**
  - **Service integration / security (tier 3)** — **AC-MSG-001-02 / -002-02** (participant-isolation RLS, hard),
    AC-MSG-003-01/-02/-03 (plain-text treatment), **AC-MSG-004-05** (scan-before-available, hard),
    AC-MSG-005-03 (per-viewer unread state), AC-MSG-006-01/-02 (retention / archive).
  - **e2e (tier 6)** — AC-MSG-001-01/-03/-04, AC-MSG-002-01/-03, AC-MSG-004-01/-02/-03/-04, AC-MSG-005-01/-02/-04,
    AC-MSG-006-03, AC-MSG-013-02, AC-MSG-014-01.
- **e2e required** (CLAUDE.md IO e2e defaults): this slice touches SQL Server **security policies** +
  `SESSION_CONTEXT` propagation (thread/message reads + sends + mark-read under the propagated principal),
  **file upload/download via signed URLs** (message attachments), the **malware-scan** seam (scan-before-available),
  and **cross-module boundaries** (sending a message → an EPIC-016 notification; engagement close → archive). E2E
  runs against the full docker-compose stack with **both apps up**; send/receive/attach/archive + the unread
  indicator are exercised on **both** the portal and admin surfaces.
- **Hard extra gates** — see front-matter `extra_gates`: participant-isolation RLS (participant reads / non-participant
  reads zero / null SESSION_CONTEXT reads zero / accountant reads — proven **both ways**), plain-text treatment
  (markup verbatim, no inline image), scan-before-available (reusing the EPIC-007 seam), per-viewer unread state,
  indefinite retention + archive-on-close, the send/receive/attach/archive e2e journeys on both surfaces, and the
  new-message notification onto the EPIC-016 spine.
- **UI demo (`demo.applicable: yes`)** — a `@demo` Playwright walkthrough captures an AC-tagged screenshot
  gallery into `docs/demos/EPIC-017/` across **both surfaces**, walking the **jane-accountant** journey (open an
  engagement thread + a general thread, send a message with an attachment, see the unread indicator on `apps/admin`)
  and the **sarah-returning-client** journey (read + reply in an engagement thread, open an attachment via signed
  URL, receive the new-message notification on `apps/portal`) along `flow-message-exchange`. **Non-gating** (the
  e2e gate is the gate); see `.orchestration/DEMO-POLICY.md`.

## Constraints

Non-negotiables (cite the originating ADR/REQ in code/test comments per CS-GEN-003):

- **ADR-005 — RLS via security policies.** A **thread, its messages, and its attachments** are readable **only
  by the thread's participants** — the engagement's participants (the EPIC-012 `EngagementParticipant` set) for
  an engagement thread, the **associated client** for a general thread; the **accountant** reads the threads she
  participates in. New client-/participant-scoped tables → each ships a **policy + isolation test** (CS-SQL-001):
  a **non-participant** reads **zero**, a **null** SESSION_CONTEXT reads **zero**, a **participant** reads. A
  missing/one-directional isolation test is a **rejection**. Predicate shape follows CS-SQL-003 (inline TVF,
  shallow, admin/accountant-first, fail-closed) and **reuses the EPIC-013 `fn_engagement_access` participant
  branch** rather than re-deriving participation. **Hard tier-3 obligation.**
- **ADR-003 — SESSION_CONTEXT.** Thread/message reads, **message sends**, **mark-read writes**, attachment-access
  checks, and signed-URL authorization run under the propagated principal via the `packages/db` wrapper that sets
  `SESSION_CONTEXT` before the first real query (CS-TS-001/-002). **No** route handler bypasses the wrapper.
- **ADR-006 — Monorepo, two apps.** Threads render on **both** `apps/portal` (client) and `apps/admin`
  (accountant); they are the **same model under two principals** (CS-TS-003 — shared patterns on both surfaces).
  **General-thread creation is an `apps/admin` affordance** (accountant-initiated only).
- **ADR-008 / ADR-009 — Object storage + signed URLs.** Message attachments are stored through the **storage seam**
  and retrieved via **short-lived signed URLs scoped to a participant**; **no** attachment is ever publicly
  addressable. The signed-URL action signs **only a server-resolved storage key** for an attachment the requesting
  principal participates in — never a client-supplied key (the EPIC-013 version-download IDOR lesson: thread the
  attachment id → resolve under request-pool/RLS → assert thread participation → sign the **server-resolved** key,
  with a cross-resource key-substitution negative).
- **ADR-021 — File upload safety.** Message attachments are **scanned before** they are made available to
  participants (AC-MSG-004-05 / REQ-NFR-009) — **reuse the EPIC-007 `FileScanner` seam** (verdict
  `clean｜infected｜indeterminate`, fail-closed); `infected`/`indeterminate` **never** becomes retrievable. Same
  file-type/size rules as document upload. **Hard tier-3 obligation; do not rebuild the scanner.**
- **ADR-018 — Data retention.** Threads + messages are retained **indefinitely** and **archived-not-deleted** on
  engagement close, consistent with the v1 no-hard-delete stance. This is **distinct** from EPIC-016's **≥90-day**
  notification floor — **do not conflate** the two retention policies.
- **ADR-012 — Testing pyramid.** Honor the tier mapping above; participant isolation, plain-text treatment, and
  scan-before-available are **hard tier-3** integration/security; the send/receive/attach/archive journeys + the
  new-message notification are **tier-6** e2e.

## Code standards

- **CS-TS-001** (`required`) — request-scoped DB access only through the `packages/db` wrapper (ADR-003): thread/
  message reads, message sends, mark-read writes, attachment-access checks.
- **CS-TS-002** (`required`) — never import the raw `requestDb`/`adminDb` pools outside `packages/db`.
- **CS-TS-003** (`recommended`) — apply shared patterns to **both** surfaces (threads render on `apps/portal` and
  `apps/admin`).
- **CS-TS-004** (`experimental`) — every server action resolves identity from the request cookie and guards role
  before any DB write (**send-message**, **mark-read**, **start-general-thread** [accountant-only], **sign-attachment-URL**).
- **CS-SQL-001** (`required`) — every participant-scoped table ships a SECURITY POLICY **and** a participant/
  non-participant RLS test (`pol_Thread` / `pol_Message` / `pol_MessageAttachment`).
- **CS-SQL-002** (`required`) — raw-SQL track only for what Prisma cannot express (the thread/message/attachment
  security policies live in `db/policies/` per ADR-005).
- **CS-SQL-003** (`required`) — RLS predicates are inline TVFs, shallow, admin/accountant-first, fail-closed (the
  participant branches; **reuse** `fn_engagement_access`).
- **CS-GEN-001** (`recommended`) — no secrets or PII in logs (message bodies, client identities, attachment
  storage keys, signed-URL tokens).
- **CS-GEN-002** (`recommended`) — additive, non-destructive wiring of the **new-message emit** into the existing
  EPIC-016 `Notification` spine and of **archive-on-close** into the EPIC-010 Complete transition.
- **CS-GEN-003** (`recommended`) — cite the governing ADR/REQ in code & test comments.

## Data & Interface Contract

> Altitude-bounded: only the shapes that **trace** to the epic's behavior + cited ADRs. The IO expands these into
> the full field-level contract at Design; genuinely upstream shape questions are escalated via `OPEN-QUESTIONS.md`,
> never invented. Field-level minutiae (exact column types, the per-viewer read-watermark vs per-message-read
> representation, the attachment MIME/size limit values [inherited from document upload], the signed-URL TTL value
> [inherited from ADR-009], the notification-type discriminator value for "new message") are **not** fixed here.

- **Thread entity (net-new).** A thread is **discriminated** by kind: an **engagement thread** (scoped to one
  engagement; **exactly one per engagement** — uniqueness on the engagement) or a **general thread** (scoped to a
  **client**, **accountant-initiated**, not tied to any engagement). State set: **active** ↔ **archived**;
  transition: **archive** (automatic, on engagement close/complete — never a delete; general threads have no
  engagement and are not archived by this path). Participation is **derived**: engagement-thread participants are
  the engagement's `EngagementParticipant` set + the accountant; general-thread participants are the associated
  client + the accountant. *(traces: REQ-MSG-001/-002/-006; ADR-005, ADR-018)*
- **Message entity (net-new).** A message belongs to **one thread**, carries a **plain-text body**, a **sender
  principal**, and a **created-at** that establishes **send order**. Append-only (no edit/delete in scope). Ordered
  history is the messages of a thread by created-at. *(traces: REQ-MSG-001-03, REQ-MSG-003; ADR-018)*
- **MessageAttachment entity (net-new, reuses the EPIC-007/-013 storage+scan seam).** An attachment belongs to
  **one message** (a message may have **zero or more**), references a **server-owned storage key** (via the
  `FileStorage` seam, ADR-008), carries a **scan verdict** state from the `FileScanner` seam (ADR-021), and is
  **retrievable only when scanned clean**. It is retrieved via a **short-lived signed URL** scoped to a participant
  (ADR-009). *(traces: REQ-MSG-004, REQ-NFR-009; ADR-008/-009/-021)*
- **Per-viewer read state (net-new).** Unread is tracked **per (thread, viewer)** so the same thread can be unread
  for one participant and read for another, and so the indicator **clears for a single viewer** when that viewer
  sees the new messages. The exact representation (a last-read **watermark** per (thread, viewer) vs per-message
  read rows) is an **IO Design decision** bounded by this behavior. *(traces: REQ-MSG-005; ADR-003)*
- **Participant access (RLS, net-new policies).** `pol_Thread` / `pol_Message` / `pol_MessageAttachment` each
  expose rows **only to the thread's participants** (reusing `fn_engagement_access` for engagement threads;
  associated-client + accountant for general threads); a **null** SESSION_CONTEXT reads **nothing** (fail-closed).
  This is the hard participant-isolation gate (AC-MSG-001-02/-04, AC-MSG-002-02). *(traces: REQ-MSG-001/-002;
  ADR-005, ADR-003)*
- **Interface contracts.**
  - *Read a thread + its messages (both apps):* input = the authenticated viewing principal + the thread; output =
    the thread's messages in send order + its attachments (RLS-scoped to a participant) + the per-viewer unread
    state; **runs through the `packages/db` wrapper**. *(traces: REQ-MSG-001/-002/-005; ADR-003/-005/-006)*
  - *Send a message (server action, both apps):* input = the viewing principal (a thread participant) + a plain-text
    body + zero-or-more attachment uploads; effect = a new message appended to the thread, attachments stored and
    **scanned before availability**, and **exactly one new-message notification** emitted to the recipient(s)
    through the EPIC-016 feed (AC-MSG-013-02 / -014-01). Body is stored/served as **plain text** (no render).
    *(traces: REQ-MSG-001-02, REQ-MSG-003, REQ-MSG-004, REQ-MSG-013-02, REQ-MSG-014-01; ADR-021)*
  - *Start a general thread (server action, `apps/admin` only):* input = the accountant + a client; effect = a new
    general thread associated with that client, visible to the accountant + that client only. **Accountant-only**
    (role-guarded). *(traces: REQ-MSG-002; ADR-006, CS-TS-004)*
  - *Mark-read (server action, both apps):* input = the viewing principal + the thread being viewed; effect = the
    per-viewer unread state for that (thread, viewer) clears, reflected in the indicator. *(traces: REQ-MSG-005-04;
    ADR-003, CS-TS-004)*
  - *Retrieve an attachment (server action, both apps):* input = the viewing principal + the attachment id; effect =
    a short-lived signed URL minted **only** for an attachment the principal participates in and that is **scanned
    clean** — signs the **server-resolved** storage key only. *(traces: REQ-MSG-004-03/-05; ADR-008/-009/-021)*
  - *Archive-on-close (wiring into the EPIC-010 Complete transition):* when an engagement closes/completes, its
    thread is marked **archived** (not deleted) and stays readable. Additive wiring (CS-GEN-002). *(traces:
    REQ-MSG-006; ADR-018)*
- **Field-shape obligations (ADR-002 conventions).** Net-new tables follow the project's PK / `DATETIMEOFFSET` /
  identity conventions; the security-policy predicates ride the **raw-SQL track** (`db/policies/`, CS-SQL-002).

## Acceptance scenarios

> Reproduced verbatim from `.planning/EPIC-017-per-engagement-general-messaging.md` (the canonical behavior
> contract). Bind each to an executable test tagged with its AC id.

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

## References

- Planning: `.planning/EPIC-017-per-engagement-general-messaging.md` (the slice + behavior contract)
- Requirements: REQ-MSG-001, REQ-MSG-002, REQ-MSG-003, REQ-MSG-004, REQ-MSG-005, REQ-MSG-006, REQ-MSG-013 (-02
  only), REQ-MSG-014 (-01 only), REQ-NFR-009 (malware scanning of all uploads)
- Architecture: ADR-005 (participant-scoped RLS on thread/message/attachment — the isolation gate), ADR-003
  (SESSION_CONTEXT — reads/sends/mark-read/signed-URL under the propagated principal), ADR-006 (monorepo — threads
  on both apps; general-thread creation an admin affordance), ADR-008 (object storage abstraction — attachments via
  the storage seam), ADR-009 (signed-url file access — short-lived participant-scoped attachment URLs), ADR-021
  (file upload safety — scan-before-available, reuse the EPIC-007 scanner), ADR-018 (data retention — indefinite
  threads, archive-on-close), ADR-012 (testing tiers)
- Personas: `.planning/personas/jane-accountant.md` (the single work surface — threads replace her email),
  `.planning/personas/sarah-returning-client.md`, `.planning/personas/martha-and-james-married-couple.md`
  (multi-participant engagement — both clients are thread participants)
- Flows: `.planning/flows/flow-message-exchange.md` (the primary flow this slice realizes — reconciled from its
  Phase-4 stub)
- Prior art: EPIC-016 (the `Notification` feed spine — receives the new-message notification), EPIC-013 (the
  `EngagementParticipant` participant-isolation pattern + the `fn_engagement_access` participant branch + the
  document storage/scan/signed-URL path the attachment seam reuses), EPIC-007 (the `FileStorage` + `FileScanner`
  scan-before-available pipeline), EPIC-010 (the engagement Complete transition that triggers archive-on-close),
  EPIC-012 (the multi-participant engagement model)

## Notes

- **Reuse, do not re-implement the file and notification seams.** Attachment **storage + scanning + signed-URL**
  retrieval already exist (EPIC-007 `FileStorage`/`FileScanner`, EPIC-013 the participant-scoped document path);
  the **notification feed + badge + real-time delivery** already exist (EPIC-016). This slice **consumes** both —
  it adds the **thread/message/attachment** model + policies, the **plain-text** treatment, the **per-viewer
  unread** indicator, the **archive-on-close** wiring, and the **new-message emit** onto the EPIC-016 spine. Edits
  to the existing `Notification` spine and the EPIC-010 Complete transition are **additive** (CS-GEN-002).
- **The participant-isolation proof is the panel/SDET trap** (per ADR-005 history — mirroring EPIC-013's
  both-party-download trap, EPIC-014's no-client-delete trap, EPIC-015's no-client-purge trap, and EPIC-016's
  per-viewer-notification trap): `pol_Thread`/`pol_Message`/`pol_MessageAttachment` must be proven with **hard
  tier-3 isolation tests** — a **non-participant** client reads **zero** of another thread's messages/attachments,
  a **null** SESSION_CONTEXT reads **zero**, a **participant** reads, the **accountant** reads her threads. A
  one-directional assertion is insufficient. **For a multi-participant engagement** (EPIC-012 — e.g.
  martha-and-james), **every** participant reads; a client on a **different** engagement reads zero.
- **The signed-URL attachment path inherits the EPIC-013 IDOR lesson.** The retrieve-attachment action must sign
  **only a server-resolved storage key** for an attachment the requesting principal participates in — thread the
  **attachment id** → resolve the attachment + its thread under the request pool/RLS → assert the principal is a
  **thread participant** AND the attachment is **scanned clean** → sign the **server-resolved** key. Carry a
  **cross-resource key-substitution negative** (a participant of thread A cannot mint a URL for an attachment of
  thread B by substituting ids/keys).
- **Plain text is a treatment + a safety property** (REQ-MSG-003): the body is stored and rendered as **plain
  text** — markup/HTML/script-like syntax is shown **verbatim** (never interpreted, no XSS surface), and **no
  image is embedded inline**. The proof includes a body containing markup/HTML displayed literally.
- **Scan-before-available is a hard gate** (REQ-NFR-009 / ADR-021): an attachment is **not retrievable** until the
  `FileScanner` returns **clean**; `infected`/`indeterminate` never becomes available. Reuse the EPIC-007 seam
  (mock-first per the standing [[mock-third-party-integrations]] directive) — do **not** build a new scanner.
- **Retention is indefinite — distinct from EPIC-016's 90-day floor** (ADR-018): threads + messages are kept
  **forever** (no hard delete in v1) and **archived (not deleted)** on engagement close. Do **not** apply EPIC-016's
  ≥90-day notification floor to threads, and do **not** delete on archive — archive is a **state**, the thread
  **stays readable**.
- **New-message notification rides the EPIC-016 spine** (REQ-MSG-013-02 / -014-01): sending a message emits
  **exactly one** new-message notification to the **recipient** — the accountant when a client sends, the client
  when the accountant sends — and **only** to entitled participants (no cross-participant leak; the EPIC-016
  recipient-only entitlement holds). This is the **new source event** EPIC-016 explicitly deferred to this slice.
- **IO Design discretion (bounded):** the per-viewer unread representation (last-read watermark vs per-message read
  rows), the thread/message list query + pagination shape, the attachment upload UX, and whether the general-thread
  ↔ engagement-thread discriminator is a kind-column or separate tables are **IO Design decisions** bounded by the
  contract above — do not over-build. The **participant-isolation RLS** (proven both ways), **plain-text treatment**,
  **scan-before-available**, **per-viewer unread**, **indefinite retention + archive-on-close**, and the
  **recipient-only new-message notification** are **non-negotiable**.
- **Cross-surface parity (CLAUDE.md § Platform-frontend scope).** Threads render on **both** `apps/portal` and
  `apps/admin`; audits, e2e, and mirror-file checks default to **both** surfaces. This is a genuine two-surface
  slice — the parity rule is load-bearing here.
- **Build order:** EPIC-017 is the **second** Phase-4 epic, built on the EPIC-016 spine. EPIC-018 (email digest)
  digests the new-message notification this slice emits; EPIC-020 surfaces recent-message activity. This slice does
  **not** close Phase 4 (EPIC-023 is the closer) — **no** phase-walkthrough video rides this PR.
</content>

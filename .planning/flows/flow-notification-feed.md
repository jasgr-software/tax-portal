# Flow — In-portal notification feed & email nudge

> A **targeted, lightweight** end-to-end flow — the per-slice journey through the notification spine, not an
> exhaustive product-wide flow. Planning-altitude: steps and key branches, no screens/endpoints/test code.

- **Actor:** `personas/jane-accountant.md` (accountant) and `personas/sarah-returning-client.md` / `personas/martha-and-james-married-couple.md` (clients) — both roles have a feed
- **Trigger:** a notification-worthy event occurs for a user (a message arrives, a document is uploaded, an engagement status changes, a request is decided, an item becomes overdue)
- **Outcome:** the user sees the notification in their in-portal feed in real time, the unread-count badge reflects it, and viewing the linked item clears it — with an at-most-daily content-free email as the away-from-portal nudge
- **Realized by:** EPIC-016 (the feed mechanism, real-time, badge, read-tracking, retention, already-sourced types), EPIC-018 (email digest fallback); event types extended by EPIC-017 (new message) and EPIC-019 (overdue / due-date / document-request)

## Happy path
1. An event occurs for which the user is entitled to a notification (its source slice emits it).
2. The system records a `Notification` for the entitled user, scoped to that user only (per-viewer RLS).
3. With the portal open, the notification surfaces in the user's feed in real time and the navigation unread-count badge increments — no manual refresh.
4. If the user is away and has email enabled, the event contributes to that day's single content-free digest nudge ("you have new activity — sign in"), never one email per event.
5. The user opens the notification's linked item; the notification is auto-marked read and the badge decrements with no separate dismiss step.

## Key branches
- **Recipient is a client** → the feed renders on `apps/portal` and shows only that client's own notifications; a second client never sees it (AC-MSG-014-07).
- **Recipient is the accountant with email suppressed** → no email nudge is sent; the in-portal feed still receives every notification (AC-MSG-010-02/-03).
- **Linked item lives on the other app** → following the link honors the cross-app session boundary (ADR-010); the read-mark still applies.
- **Notification older than 90 days** → retained for at least the 90-day floor, then eligible for expiry (distinct from indefinite thread retention).
- **Declined prospect with no account** → reached by email only (EPIC-003); the in-portal accepted/declined feed entry applies to a client who holds an account at decision time.

## Acceptance scenarios
- AC-MSG-007-01/-02/-03, AC-MSG-012-01/-02/-03, AC-MSG-015-01/-02/-03, AC-MSG-016-01/-02, AC-MSG-017-01/-02/-03 — covered in EPIC-016
- AC-MSG-013-03, AC-MSG-014-03/-04/-05/-06/-07 — covered in EPIC-016
- AC-MSG-008-01/-02/-03, AC-MSG-009-01/-02/-03, AC-MSG-010-01/-02/-03/-04, AC-MSG-011-01/-02 — covered in EPIC-018
- AC-MSG-013-02, AC-MSG-014-01 (new-message types) — covered in EPIC-017
- AC-MSG-013-05/-06, AC-MSG-014-02 (reminder types) — covered in EPIC-019

## Links
- Persona: `personas/jane-accountant.md`, `personas/sarah-returning-client.md`, `personas/martha-and-james-married-couple.md`
- Epics: EPIC-016 (spine), EPIC-018 (email), extended by EPIC-017 (messaging) and EPIC-019 (reminders)
- Requirements: REQ-MSG-007/008/009/010/011/012/013/014/015/016/017

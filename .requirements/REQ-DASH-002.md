---
id: REQ-DASH-002
title: Dashboard activity feed
domain: DASH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DASH-002
  - seed/intake.md
open_questions: []
---

# REQ-DASH-002 — Dashboard activity feed

## User need
Throughout the day clients send messages, upload documents, and submit new requests, and engagements
change state. The accountant needs one unified, chronological stream of everything that has happened
recently across all clients, so she can catch up quickly without checking each engagement individually.

## Proposed solution
The accountant dashboard presents an activity feed: a single chronological view of recent activity
across the whole practice. The feed includes new messages, document uploads, new engagement requests,
engagement status changes, and items that have become overdue. Each entry identifies what happened and
which client or engagement it relates to.

## Acceptance criteria
- **AC-DASH-002-01** — The dashboard displays an activity feed combining recent activity from across all
  clients and engagements in one view.
- **AC-DASH-002-02** — The feed includes new messages, document uploads, new engagement requests,
  engagement status changes, and overdue items.
- **AC-DASH-002-03** — Each feed entry indicates what occurred and the client or engagement it relates
  to.
- **AC-DASH-002-04** — Feed entries are ordered so that the most recent activity is identifiable.

## Links
- Related: REQ-DASH-001 (summary metrics), REQ-DASH-003 (needs-action items)
- Open questions: none

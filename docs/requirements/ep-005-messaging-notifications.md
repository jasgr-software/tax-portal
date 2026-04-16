# Epic 005 — Messaging & In-Portal Notifications

**Epic-type:** feature  
**Epic-deploys:** yes  
**Phase:** 4  
**Status:** Pending (awaiting Epic 003 completion; can run parallel to Epic 004)  
**Priority:** P1

---

## Purpose

Deliver per-engagement message threads, general (non-engagement) threads, real-time in-portal notifications via Supabase Realtime, unread indicators, and the email digest fallback. The accountant and clients communicate entirely within the portal — email is a nudge only.

---

## Requirements in scope

| Requirement ID | Summary |
|---|---|
| REQ-MSG-001 | Per-engagement message threads with persistent history |
| REQ-MSG-002 | General threads (accountant to client, outside any engagement) |
| REQ-MSG-003 | Plain text messages only |
| REQ-MSG-004 | File attachments within messages |
| REQ-MSG-005 | Unread indicators on all threads |
| REQ-MSG-006 | Threads kept forever; archived on engagement close |
| REQ-MSG-007 | In-portal notification feed as primary channel |
| REQ-MSG-008 | Email fallback: activity nudge only, no content |
| REQ-MSG-009 | One digest email per day max |
| REQ-MSG-010 | Accountant can suppress email entirely |
| REQ-MSG-011 | Client email fallback on by default |
| REQ-MSG-012 | Real-time delivery via Supabase Realtime |
| REQ-MSG-013 | Accountant notification types (full list) |
| REQ-MSG-014 | Client notification types (full list) |
| REQ-MSG-015 | Notifications marked read when linked item viewed |
| REQ-MSG-016 | Notification history retained minimum 90 days |
| REQ-MSG-017 | Unread count badge in nav |
| REQ-MSG-018 | Auto-reminder cron for overdue document requests |

---

## Acceptance Criteria

_Placeholder — to be fully detailed by the RA before this epic is handed to the SA._

**Key acceptance criteria to define:**
- AC-005-001: Message thread UI — send, receive, display messages within engagement context
- AC-005-002: General thread creation and display
- AC-005-003: File attachment within a message (upload + download)
- AC-005-004: Unread indicators update in real time via Supabase Realtime
- AC-005-005: Notification feed renders all notification types for accountant and client
- AC-005-006: Real-time notification delivery — new notification appears without page refresh
- AC-005-007: Notification read marking when linked item is viewed
- AC-005-008: Nav badge shows correct unread count, updates in real time
- AC-005-009: Email digest cron job sends at most one email per day per user with pending unread
- AC-005-010: Notification preference management (accountant email suppression, client default-on)
- AC-005-011: Thread archiving on engagement completion (still accessible, just archived)
- AC-005-012: Notification history cleanup — records older than 90 days may be pruned (or retained; SA to decide)

---

## Dependencies

- Epic 001 (Supabase Realtime infrastructure from scaffold)
- Epic 003 completed (engagement context exists for engagement threads)
- Can be developed in parallel with Epic 004 on separate branches — SA should coordinate

---

## Notes for SA

- This epic and Epic 004 may be parallelizable at the developer level but must not run on the same branch. The SA should assess whether to serialize them or open separate feature branches with separate developer sessions.
- The email digest cron can share infrastructure with the auto-reminder cron from Epic 004 — SA should consider combining them into a single scheduled function.

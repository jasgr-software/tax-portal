# Epic 004 — Secure File Exchange

**Epic-type:** feature  
**Epic-deploys:** yes  
**Phase:** 4  
**Status:** Pending (awaiting Epic 003 completion)  
**Priority:** P1

---

## Purpose

Deliver the full secure file exchange system within engagements: folder-structured documents, signed-URL access, version history, document requests with auto-reminders, and the 7-year soft-delete retention model.

---

## Requirements in scope

| Requirement ID | Summary |
|---|---|
| REQ-FILE-001 | Both sides upload and download files |
| REQ-FILE-002 | No file type restrictions |
| REQ-FILE-003 | AES-256 at rest, signed URL access only |
| REQ-FILE-004 | Only accountant can delete files |
| REQ-FILE-005 | 7-year retention after engagement completion |
| REQ-FILE-006 | Soft-delete: files marked deleted but retained |
| REQ-FILE-007 | Accountant creates labeled document requests |
| REQ-FILE-008 | Document checklist per engagement |
| REQ-FILE-009 | Version history — file replacement retains previous versions |
| REQ-FILE-010 | Folder structure per engagement managed by accountant |
| REQ-FILE-011 | Top-level organization by engagement and tax year |
| REQ-FILE-012 | Auto-reminder for overdue document requests (cron) |
| REQ-NFR-002 | Signed URLs, never public |
| REQ-NFR-006 | Programmatic retention enforcement |

---

## Acceptance Criteria

_Placeholder — to be fully detailed by the RA before this epic is handed to the SA. Core acceptance criteria will cover: file upload/download via signed URLs, folder CRUD by accountant, document request creation and fulfillment tracking, soft-delete and retention policy, version history, auto-reminder cron job._

**Key acceptance criteria to define:**
- AC-004-001: File upload by accountant and client via Supabase Storage signed upload URLs
- AC-004-002: File download via time-limited signed download URLs (never public)
- AC-004-003: Accountant can soft-delete a file; deleted file remains in storage, UI shows deleted state
- AC-004-004: Folder creation, rename, deletion (delete only if empty, or cascade — SA to decide and ADR)
- AC-004-005: Document request creation by accountant with label and optional due date
- AC-004-006: Client sees outstanding document requests as a checklist; fulfillment marks the request
- AC-004-007: File version replacement — uploading a file with the same label/path creates a new version; previous version accessible
- AC-004-008: Auto-reminder cron job creates overdue notifications when document request due date passes
- AC-004-009: Retention enforcement — a scheduled job or DB constraint prevents hard-delete of docs within retention window (outside of REQ-IDNT-005 hard-delete path)

---

## Dependencies

- Epic 003 completed (engagement in "In Progress" state required to exercise file exchange)

---

## Notes for SA

- Supabase Storage bucket policies and signed URL generation are key implementation concerns. The SA should create an ADR for the storage architecture.
- Auto-reminder cron in v1 can be Vercel Cron (serverless) or a Supabase Edge Function — SA to decide.
- CLARIF-005 (hard delete vs retention conflict) must be resolved before the retention enforcement implementation.

-- TASK-014-001: Document.deletedAt (soft-delete tombstone) + Engagement.completedAt (retention anchor)
-- ADR-002: SQL Server 2022; DATETIMEOFFSET timestamps; Track A Prisma migration (additive columns)
-- ADR-018 §1: soft-delete-first — Document.deletedAt is the tombstone column (NULL=active, non-NULL=soft-deleted)
-- ADR-018 §3: Engagement.completedAt is the retention-clock anchor for the 7-year floor
-- ADR-009: Document.deletedAt per the signed-URL doc soft-delete definition
-- BRIEF-014: File deletion, soft-delete & 7-year retention — accountant-only delete
-- CS-GEN-002: additive — no destructive operations; both columns are nullable (existing rows unaffected)
-- CS-GEN-003: governing ADR-018/ADR-009/ADR-002/DECISION-014-A/DECISION-014-B cited above
-- DECISION-014-A: completedAt is the retention-clock anchor (write seam in TASK-014-002)
-- DECISION-014-B: deletedAt is the soft-delete tombstone; FILTER predicate change is Track B (0012)
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations in this migration. (CS-GEN-002)
--   - Adds Document.deletedAt DATETIMEOFFSET NULL (soft-delete tombstone):
--       NULL = active document. Non-NULL = soft-deleted (tombstoned by accountant action in TASK-014-003).
--       ADR-009: Document.deletedAt per the signed-URL doc soft-delete definition.
--       ADR-018 §1: soft-delete-first; no request-path physical DELETE.
--       ADR-002: DATETIMEOFFSET timestamp convention (not DATETIME2, not UTC-only).
--       RLS impact: Track B 0012-document-soft-delete-filter.sql adds the CLIENT-branch
--         AND @documentDeletedAt IS NULL condition to fn_document_access FILTER predicate.
--       The BLOCK predicates on pol_Document are UNCHANGED (client INSERT/upload keeps working).
--   - Adds Engagement.completedAt DATETIMEOFFSET NULL (retention-clock anchor):
--       NULL = engagement not yet complete. Non-NULL = completion timestamp.
--       ADR-018 §3: the 7-year (configurable) retention floor is measured from this timestamp.
--       Back-fill of existing status='Complete' rows (from filingConfirmedAt / updatedAt) is
--       Track B (db/migrations/0006-soft-delete-retention-backfill.sql).

-- Alter Document: add deletedAt nullable column
-- ADR-002: DATETIMEOFFSET; NULL = active, non-NULL = soft-deleted tombstone
-- DECISION-014-B: tombstone; CLIENT-branch RLS filter added in Track B (0012)
ALTER TABLE [dbo].[Document]
    ADD [deletedAt] DATETIMEOFFSET NULL;
GO

-- Alter Engagement: add completedAt nullable column
-- ADR-018 §3: retention-clock anchor; write seam in TASK-014-002
-- DECISION-014-A: completedAt; back-fill of existing Complete rows in Track B (0006)
ALTER TABLE [dbo].[Engagement]
    ADD [completedAt] DATETIMEOFFSET NULL;
GO

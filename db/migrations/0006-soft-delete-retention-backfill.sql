-- db/migrations/0006-soft-delete-retention-backfill.sql
-- Track B: raw SQL migration — ADR-002, ADR-018 §3, BRIEF-014 / TASK-014-001
-- Applied by: scripts/db-migrate.ts (Track B step — after Track A Prisma migrations)
--
-- Purpose:
--   1. Back-fill Engagement.completedAt for existing status='Complete' rows:
--      Uses filingConfirmedAt if available (the authoritative completion signal — AC-LIFE-005-03),
--      else falls back to updatedAt (best available proxy for existing data).
--      New rows going forward have completedAt set on the completion transition (TASK-014-002).
--   2. Add filtered index on Document.deletedAt (WHERE deletedAt IS NULL):
--      Supports the RLS CLIENT-branch EXISTS lookups that filter active (non-deleted) documents.
--      Optional performance — not an ADR-005 requirement but per ADR-005 §5 Mitigation A.
--
-- ADR-018 §3: retention clock anchored at engagement completion.
-- ADR-002: raw SQL track for things Prisma cannot express (filtered indexes, DB-level backfill).
-- CS-SQL-002: Track B only — not expressible via Track A (Prisma cannot express filtered indexes).
-- CS-GEN-002: additive — no destructive operations; UPDATE only touches NULL completedAt rows.
-- CS-GEN-003: governing keys cited above and inline below. // CS-GEN-003
-- DECISION-014-A: completedAt is the retention-clock anchor; this back-fill populates existing rows.
--
-- Idempotent: back-fill UPDATE is guarded by WHERE completedAt IS NULL; index creation is guarded
-- by IF NOT EXISTS.

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1: Back-fill Engagement.completedAt for existing status='Complete' rows
-- ─────────────────────────────────────────────────────────────────────────────
-- ADR-018 §3: completedAt is the retention-clock anchor for the 7-year floor.
-- Only rows where status='Complete' AND completedAt IS NULL are updated.
-- Strategy:
--   Use filingConfirmedAt when available (the authoritative completion signal per EPIC-010).
--   Fall back to updatedAt for rows where filingConfirmedAt is NULL (older pre-EPIC-010 data).
-- Idempotent: WHERE completedAt IS NULL ensures re-runs are safe.
-- CS-GEN-002: additive UPDATE; no existing data is removed.
-- // ADR-018 // DECISION-014-A // CS-GEN-002 // CS-GEN-003
UPDATE [dbo].[Engagement]
SET [completedAt] = COALESCE([filingConfirmedAt], [updatedAt])
WHERE [status] = N'Complete'
  AND [completedAt] IS NULL;
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2: Optional filtered index on Document.deletedAt (WHERE deletedAt IS NULL)
-- ─────────────────────────────────────────────────────────────────────────────
-- ADR-005 §5 Mitigation A: filtered index supports the CLIENT-branch EXISTS predicate that
-- qualifies active (non-deleted) documents. The RLS predicate in fn_document_access passes
-- @documentDeletedAt to the FILTER; SQL Server can use this index for the common active-doc case.
-- CS-SQL-002: Track B only — Prisma cannot express filtered indexes.
-- CS-GEN-002: additive — IF NOT EXISTS guard makes this idempotent.
-- // CS-SQL-002 // ADR-005 // CS-GEN-002 // DECISION-014-B
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Document_deletedAt_active'
      AND object_id = OBJECT_ID('dbo.Document')
)
BEGIN
    CREATE INDEX [IX_Document_deletedAt_active]
        ON [dbo].[Document] ([engagementId])
        WHERE [deletedAt] IS NULL;
END
GO

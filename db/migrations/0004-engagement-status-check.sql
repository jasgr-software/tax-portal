-- db/migrations/0004-engagement-status-check.sql
-- Track B: raw SQL — ADR-002 (non-Prisma constraint)
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations)
--
-- Adds a CHECK constraint enforcing the 4-value Engagement.status set.
-- Mirrors the Document.status 3-value CHECK pattern in db/policies/0007-document-policy.sql.
--
-- CS-GEN-002: Additive — extends the prior 2-value set ('New', 'In Progress') to the
--   4-value set ('New', 'In Progress', 'Review', 'Complete') without forking the column.
-- AC-LIFE-001-01: Exactly-one-status invariant enforced at the DB layer.
--
-- Idempotent: DROP IF EXISTS → ADD.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.

-- Drop existing CHECK constraint if present (idempotent re-apply)
IF EXISTS (
    SELECT 1
    FROM sys.check_constraints cc
    JOIN sys.tables t ON t.[object_id] = cc.[parent_object_id]
    JOIN sys.schemas s ON s.[schema_id] = t.[schema_id]
    WHERE s.name = N'dbo'
      AND t.name = N'Engagement'
      AND cc.name = N'CK_Engagement_status'
)
    ALTER TABLE [dbo].[Engagement] DROP CONSTRAINT [CK_Engagement_status];
GO

-- Add CHECK constraint enforcing the 4-value status set (AC-LIFE-001-01, CS-GEN-002)
ALTER TABLE [dbo].[Engagement]
    ADD CONSTRAINT [CK_Engagement_status]
    CHECK ([status] IN (N'New', N'In Progress', N'Review', N'Complete'));
GO

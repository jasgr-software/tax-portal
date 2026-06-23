-- TASK-011-001: EngagementNote table + dueDate/isPriority columns on Engagement
-- ADR-002: SQL Server 2022; NEWSEQUENTIALID() PKs; DATETIMEOFFSET timestamps; @db.Date for dueDate
-- ADR-004: Prisma sole ORM (Track A migration)
-- ADR-005: EngagementNote is covered by sec.pol_EngagementNote (Track B: 0008-engagement-note-policy.sql)
--          dueDate/isPriority reuse sec.pol_Engagement — no new policy (CS-GEN-002)
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations in this migration.
--   - Adds dueDate (nullable DATE) + isPriority (BIT NOT NULL default 0) to Engagement.
--     DECISION-011-A: dueDate is a calendar date (@db.Date) — no time/offset needed.
--     DECISION-011-B: isPriority is non-null with default false.
--   - Creates EngagementNote table (DECISION-011-C):
--       UNIQUEIDENTIFIER PK NEWSEQUENTIALID(), engagementId FK→Engagement NO ACTION,
--       body NVARCHAR(Max), createdBy NVARCHAR(64), createdAt/updatedAt DATETIMEOFFSET.
--   - FK uses ON DELETE NO ACTION (never cascade-delete notes with engagement — intentional).
--   - CS-GEN-002: additive — no existing column removed, no existing table altered destructively.
--
-- Acceptance criteria satisfied (DB layer):
--   AC-LIFE-008-02 — accountant can add internal notes to an engagement (EngagementNote table)
--   AC-LIFE-008-03 — notes never shown to client (sec.pol_EngagementNote enforces this in Track B)
--
-- Applied via: pnpm db:migrate (Track A: prisma migrate deploy via scripts/db-migrate.ts)
-- Note: prisma migrate dev fails with P3019 in this environment (provider name mismatch in
-- schema-engine wasm vs migration_lock.toml). Migration is handcrafted and applied via
-- 'prisma migrate deploy' (same pattern as TASK-010-001, TASK-009-001 prior migrations).

BEGIN TRY

BEGIN TRAN;

-- ─── AlterTable: Engagement — add dueDate + isPriority (DECISION-011-A / DECISION-011-B) ───
-- dueDate: nullable DATE column (calendar date, no time component — DECISION-011-A)
--   Client-readable is acceptable (no confidentiality AC on dueDate).
--   Write path is accountant-only (enforced at app layer — TASK-011-002).
--   CS-GEN-002: additive column — does not alter or remove any existing column.
ALTER TABLE [dbo].[Engagement]
    ADD [dueDate] DATE NULL;

-- isPriority: non-null BIT with default 0 (false) — DECISION-011-B
--   Client-readable is acceptable (no confidentiality AC on isPriority).
--   CS-GEN-002: additive column.
ALTER TABLE [dbo].[Engagement]
    ADD [isPriority] BIT NOT NULL CONSTRAINT [Engagement_isPriority_df] DEFAULT 0;

-- ─── CreateTable: EngagementNote (DECISION-011-C) ────────────────────────────
-- Internal accountant note on an engagement. Never client-readable.
-- RLS: sec.pol_EngagementNote (accountant-only) applied in Track B (0008-engagement-note-policy.sql).
-- AC-LIFE-008-02: accountant can create notes on any engagement.
-- AC-LIFE-008-03: notes are invisible to CLIENT principals (enforced by policy).
-- ADR-002: UNIQUEIDENTIFIER PK with NEWSEQUENTIALID(); DATETIMEOFFSET timestamps.
-- CS-SQL-001: policy + rls.test.ts both required — both ship in this task.
-- CS-SQL-003: predicate is an inline TVF, admin/accountant-first, fail-closed.
CREATE TABLE [dbo].[EngagementNote] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [EngagementNote_id_df] DEFAULT NEWSEQUENTIALID(),
    [engagementId] UNIQUEIDENTIFIER NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    -- createdBy: accountant clerkId at creation (audit trail — mirrors DocumentRequest.createdBy)
    [createdBy] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [EngagementNote_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [EngagementNote_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey: EngagementNote → Engagement (NO ACTION — never cascade-delete notes)
-- FK uses NO ACTION to preserve notes even if engagement transitions states (intentional).
-- ADR-002: onDelete: NoAction maps to ON DELETE NO ACTION.
ALTER TABLE [dbo].[EngagementNote]
    ADD CONSTRAINT [EngagementNote_engagementId_fkey]
    FOREIGN KEY ([engagementId]) REFERENCES [dbo].[Engagement]([id])
    ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

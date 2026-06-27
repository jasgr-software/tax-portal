-- TASK-019-001: EPIC-019 cadence schema — Track A Prisma migration
-- ADR-002: SQL Server 2022; NEWSEQUENTIALID() PKs; DATETIMEOFFSET timestamps
-- ADR-004: Prisma sole ORM (Track A migration)
-- ADR-005: ReminderSetting gets its own RLS policy in Track B (db/policies/0018-reminder-setting-policy.sql)
--
-- All changes are ADDITIVE (CS-GEN-002):
--   1. DocumentRequest.dueDate (DATE NULL)               — DECISION-019-C
--   2. DocumentRequest.lastReminderSentAt (DATETIMEOFFSET NULL) — DECISION-019-E
--   3. Engagement.reminderFrequencyDaysOverride (INT NULL)     — DECISION-019-A
--   4. Engagement.lastApproachingDueNotifiedAt (DATETIMEOFFSET NULL) — DECISION-019-F
--   5. New table: ReminderSetting (singleton global cadence config) — DECISION-019-B
--
-- Existing rows remain valid — no NOT NULL columns added without defaults (CS-GEN-002).
-- Security policy for ReminderSetting applied via Track B (db/policies/0018-reminder-setting-policy.sql).
--
-- // CS-GEN-002 // CS-GEN-003 // ADR-002 // ADR-005 // DECISION-019-A // DECISION-019-B
-- // DECISION-019-C // DECISION-019-E // DECISION-019-F

BEGIN TRY

BEGIN TRAN;

-- ─── 1. DocumentRequest additive columns (DECISION-019-C + DECISION-019-E) ──────
-- DECISION-019-C: accountant-settable calendar due date (mirrors Engagement.dueDate @db.Date).
-- DECISION-019-E: per-request reminder dispatch watermark (mirrors User.lastNudgeSentAt).
-- CS-GEN-002: both nullable — existing rows remain valid. // CS-GEN-002
ALTER TABLE [dbo].[DocumentRequest]
    ADD [dueDate] DATE,
        [lastReminderSentAt] DATETIMEOFFSET;

-- ─── 2. Engagement additive columns (DECISION-019-A + DECISION-019-F) ────────────
-- DECISION-019-A: per-engagement cadence override reuses sec.pol_Engagement (no new policy).
-- DECISION-019-F: approaching-due idempotency watermark (mirrors User.lastNudgeSentAt).
-- CS-GEN-002: both nullable — existing rows remain valid. // CS-GEN-002
ALTER TABLE [dbo].[Engagement]
    ADD [reminderFrequencyDaysOverride] INT,
        [lastApproachingDueNotifiedAt] DATETIMEOFFSET;

-- ─── 3. New table: ReminderSetting (DECISION-019-B) ─────────────────────────────
-- Global accountant-only singleton cadence config.
-- RLS policy applied in Track B (db/policies/0018-reminder-setting-policy.sql) — CS-SQL-002.
-- ADR-002: NEWSEQUENTIALID() PK; DATETIMEOFFSET timestamps.
-- CS-SQL-001: this table gets its own policy + isolation test. // CS-SQL-001
-- CS-SQL-002: security policy is in Track B, NOT here. // CS-SQL-002
CREATE TABLE [dbo].[ReminderSetting] (
    [id]                       UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ReminderSetting_id_df] DEFAULT NEWSEQUENTIALID(),
    [reminderFrequencyDays]    INT              NOT NULL,
    [approachingDueWindowDays] INT              NOT NULL,
    [defaultRequestDueDays]    INT              NULL,
    [createdAt]                DATETIMEOFFSET   NOT NULL CONSTRAINT [ReminderSetting_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [updatedAt]                DATETIMEOFFSET   NOT NULL,
    CONSTRAINT [ReminderSetting_pkey] PRIMARY KEY CLUSTERED ([id])
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

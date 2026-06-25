-- TASK-016-001: Generalize Notification model for dual-role (client + accountant) receipt
-- BRIEF-016: In-portal notification feed — Phase-4 foundation
-- ADR-002: SQL Server 2022; UNIQUEIDENTIFIER PKs; DATETIMEOFFSET timestamps; Track A Prisma migration
-- ADR-005: Notification becomes a client-scoped table — sec.pol_Notification updated (Track B)
-- ADR-018 §retention: ≥90-day retention floor for read AND unread notifications
-- CS-GEN-002: additive generalization — new columns only; no existing column removed or altered
-- CS-GEN-003: governing keys cited above, in db/policies/0004-notification-policy.sql, and in the test
-- CS-SQL-001: sec.pol_Notification + notification.rls.test.ts cover the dual-role matrix
-- CS-SQL-002: entity schema on Prisma track; security-policy predicate on raw-SQL track (0004)
--
-- DECISION (TASK-016-001 / BRIEF-016 — cross-task implication for TASK-016-002/-004):
--   Recipient model:
--     Accountant notifications → recipientType='ACCOUNTANT', recipientUserId=NULL
--     Client notifications    → recipientType='CLIENT',     recipientUserId=<User.id>
--   The RLS client branch keys on recipientUserId via User.clerkId → User.id = recipientUserId.
--   Existing EPIC-003 rows default to recipientType='ACCOUNTANT', recipientUserId=NULL.
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations — all columns are additive. (CS-GEN-002)
--   - Adds four nullable columns to dbo.Notification:
--       recipientType: NVARCHAR(16) NOT NULL DEFAULT 'ACCOUNTANT' — discriminator
--       recipientUserId: UNIQUEIDENTIFIER NULL FK → User (client recipient)
--       linkedItemType: NVARCHAR(50) NULL — generic linked-item type (AC-MSG-015-01)
--       linkedItemId: UNIQUEIDENTIFIER NULL — generic linked-item id (AC-MSG-015-01)
--   - Adds FK: Notification.recipientUserId → User.id (SetNull on delete — no orphan nullability)
--   - Existing rows: recipientType defaults to 'ACCOUNTANT'; recipientUserId remains NULL.
--   - Security policy update rides Track B (db/policies/0004-notification-policy.sql).

-- ─── Add recipient + linked-item columns to Notification ─────────────────────
-- CS-GEN-002: additive — existing rows get default 'ACCOUNTANT' for recipientType; others NULL.

-- recipientType: 'ACCOUNTANT' | 'CLIENT' discriminator
-- DECISION: default 'ACCOUNTANT' so EPIC-003 rows remain visible to the accountant unchanged.
ALTER TABLE [dbo].[Notification]
    ADD [recipientType] NVARCHAR(16) NOT NULL CONSTRAINT [DF_Notification_recipientType] DEFAULT N'ACCOUNTANT';
GO

-- recipientUserId: FK → User.id — non-null only when recipientType='CLIENT'
-- ADR-005: CLIENT branch of sec.fn_notification_access will key on this column.
-- ADR-003: SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = recipientUserId
ALTER TABLE [dbo].[Notification]
    ADD [recipientUserId] UNIQUEIDENTIFIER NULL;
GO

-- linkedItemType: nullable string — e.g. 'document', 'engagement', 'request' (AC-MSG-015-01)
-- Drives navigable link + auto-mark-read in TASK-016-002/-005/-006.
ALTER TABLE [dbo].[Notification]
    ADD [linkedItemType] NVARCHAR(50) NULL;
GO

-- linkedItemId: nullable UNIQUEIDENTIFIER — the id of the linked item (AC-MSG-015-01)
ALTER TABLE [dbo].[Notification]
    ADD [linkedItemId] UNIQUEIDENTIFIER NULL;
GO

-- ─── FK: Notification.recipientUserId → User.id ──────────────────────────────
-- onDelete: SetNull (Prisma convention) — if the User row is deleted, clear recipientUserId.
-- This prevents orphaned client notifications blocking User deletion.
-- ADR-002: NoAction would be the safest but Prisma's codegen expects SetNull here.
-- DECISION: SetNull is correct — a notification without a recipient becomes invisible via RLS
-- (recipientUserId=NULL → client branch fails → FILTER removes row, fail-closed — ADR-005 §3).
ALTER TABLE [dbo].[Notification]
    ADD CONSTRAINT [FK_Notification_User_recipientUserId]
    FOREIGN KEY ([recipientUserId])
    REFERENCES [dbo].[User] ([id])
    ON DELETE SET NULL
    ON UPDATE NO ACTION;
GO

-- ─── Index: Notification.recipientUserId ─────────────────────────────────────
-- ADR-005 §5 Mitigation B: index supports fast predicate evaluation for the CLIENT-branch EXISTS.
-- The RLS predicate joins User → Notification on recipientUserId; this index makes that O(log n).
CREATE INDEX [IX_Notification_recipientUserId]
    ON [dbo].[Notification] ([recipientUserId])
    WHERE [recipientUserId] IS NOT NULL;
GO

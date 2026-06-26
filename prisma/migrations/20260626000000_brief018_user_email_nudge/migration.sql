-- TASK-018-001: User.emailNudgeEnabled + User.lastNudgeSentAt (email-digest fallback preference columns)
-- BRIEF-018: Email digest fallback — per-recipient email preference + dispatch-state watermark
-- ADR-002: SQL Server 2022; DATETIMEOFFSET timestamps; Track A Prisma migration (additive columns)
-- REQ-MSG-010: opt-out preference — emailNudgeEnabled governs whether the nudge is sent
-- REQ-MSG-011: client default-on — AC-MSG-011-01: no opt-in step; DB DEFAULT 1 satisfies this
-- CS-GEN-002: additive — no existing column removed or altered; no destructive operations
-- CS-GEN-003: governing REQ-MSG-010 / REQ-MSG-011 / ADR-002 cited in schema and here
--
-- Note: prisma migrate dev fails with P3019/P3014 in this environment (shadow DB permission
-- constraint — taxportal_admin cannot CREATE DATABASE on master). Migration is hand-crafted
-- and applied via 'prisma migrate deploy' (consistent pattern with all prior migrations in
-- this project: TASK-011-001, TASK-013-001, TASK-015-001, TASK-016-001, TASK-017-001, etc.).
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations in this migration. (CS-GEN-002)
--   - Adds two columns to dbo.[User]:
--       emailNudgeEnabled: BIT NOT NULL DEFAULT 1
--         → AC-MSG-011-01: a newly created client User row gets emailNudgeEnabled=1 with no
--           opt-in step. The DEFAULT 1 at the DB level means every INSERT that omits this
--           column (seed, sign-up, e2e fixture, etc.) inherits the true value automatically.
--         → Governs ONLY the fallback email nudge; never affects the in-portal Notification feed.
--         → REQ-MSG-010 (opt-out governance), REQ-MSG-011 (client default-on).
--       lastNudgeSentAt: DATETIMEOFFSET NULL
--         → NULL = never nudged. Written by dispatcher (TASK-018-003).
--         → ADR-002: DATETIMEOFFSET timestamp convention.
--         → Enforces at-most-one-per-day cap (REQ-MSG-009; ADR-025 §6).
--   - Both columns carry no PII. (SDET security gate)
--   - No new RLS policy added — brief does not cite ADR-005 for this slice.
--   - No Track B raw-SQL file. (per task spec)
--   - Existing User rows (clientUserId, ACCOUNTANT) receive DEFAULT 1 for emailNudgeEnabled
--     and NULL for lastNudgeSentAt — correct posture (existing users default-on, never nudged).
--
-- Applied via: pnpm db:migrate (Track A: prisma migrate deploy via scripts/db-migrate.ts)

BEGIN TRY

BEGIN TRAN;

-- ─── AlterTable: User — add emailNudgeEnabled (REQ-MSG-010 / REQ-MSG-011 / AC-MSG-011-01) ───
-- BIT NOT NULL DEFAULT 1 → every new User row is nudge-enabled with no opt-in step.
-- CS-GEN-002: additive column — no existing column removed or altered. // CS-GEN-002
-- REQ-MSG-010 // REQ-MSG-011 // ADR-002
ALTER TABLE [dbo].[User]
    ADD [emailNudgeEnabled] BIT NOT NULL CONSTRAINT [User_emailNudgeEnabled_df] DEFAULT 1;

-- ─── AlterTable: User — add lastNudgeSentAt (REQ-MSG-009 / ADR-025 §6) ─────────────────────
-- DATETIMEOFFSET NULL: NULL = never nudged. Written by dispatcher (TASK-018-003).
-- ADR-002: DATETIMEOFFSET timestamp convention. // ADR-002
-- CS-GEN-002: additive nullable column — existing rows get NULL (correct: never nudged yet). // CS-GEN-002
ALTER TABLE [dbo].[User]
    ADD [lastNudgeSentAt] DATETIMEOFFSET NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

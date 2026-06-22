-- TASK-010-001: EPIC-010 engagement lifecycle confirmation columns migration
-- ADR-002: SQL Server 2022; DATETIMEOFFSET timestamps; Track A Prisma migration
-- ADR-004: Prisma sole ORM (Track A migration)
-- ADR-005: Reuses sec.pol_Engagement — no new policy (CS-GEN-002)
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations in this migration.
--   - Adds deliveryConfirmedAt, filingConfirmedAt columns to Engagement:
--       NULL = not confirmed; non-null = confirmed timestamp (DECISION-010-A).
--   - DATETIMEOFFSET for timestamps per ADR-002 § Timestamp convention.
--   - No new table, no new FK, no new policy — additive only (CS-GEN-002).
--
-- Acceptance criteria satisfied (DB layer):
--   AC-LIFE-005-03 — → Complete gated on BOTH confirmations non-null
--   DECISION-010-A — confirmation representation as nullable DATETIMEOFFSET columns
--   DECISION-010-B — reopen clears both (app-layer; this migration only adds the columns)
--
-- Applied via: pnpm db:migrate (Track A: prisma migrate deploy via scripts/db-migrate.ts)
-- Note: prisma migrate dev fails with P3019 in this environment (provider name mismatch in
-- schema-engine wasm vs migration_lock.toml). Migration is handcrafted and applied via
-- 'prisma migrate deploy' (same pattern as prior migrations).

BEGIN TRY

BEGIN TRAN;

-- ─── AlterTable: Engagement — add lifecycle confirmation columns (DECISION-010-A) ─
-- deliveryConfirmedAt: NULL = delivery not confirmed; non-null = delivery confirmed timestamp.
-- filingConfirmedAt:   NULL = filing not confirmed; non-null = filing confirmed timestamp.
-- AC-LIFE-005-03: → Complete gated on BOTH columns non-null (server-side guard in engagement.ts).
-- DECISION-010-B: reopen clears both so a future re-completion re-gates on both confirmations.
-- CS-GEN-002: additive — no column removed, no status column forked.
-- ADR-005: No new client-scoped table; sec.pol_Engagement reused unchanged.
ALTER TABLE [dbo].[Engagement]
    ADD [deliveryConfirmedAt] DATETIMEOFFSET NULL;

ALTER TABLE [dbo].[Engagement]
    ADD [filingConfirmedAt] DATETIMEOFFSET NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

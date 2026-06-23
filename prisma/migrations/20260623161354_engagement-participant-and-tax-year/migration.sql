-- TASK-012-001: EngagementParticipant table + taxYear column on Engagement
-- ADR-002: SQL Server 2022; NEWSEQUENTIALID() PKs; DATETIMEOFFSET timestamps; Track A Prisma migration
-- ADR-004: Prisma sole ORM (Track A migration)
-- ADR-005: EngagementParticipant is covered by sec.pol_EngagementParticipant (Track B: 0009-engagement-participant-policy.sql)
--          taxYear reuses sec.pol_Engagement — no new policy needed for the column (CS-GEN-002)
-- ADR-012: Tier-3 RLS test coverage required (CS-SQL-001)
-- BRIEF-012: multi-participant engagements + engagement identity tuple (client, service type, tax year)
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations in this migration.
--   - Adds taxYear (nullable INT) to Engagement (DECISION-B, BRIEF-012):
--       Third component of the engagement identity tuple. No UNIQUE constraint — duplicate
--       guard is application-level (TASK-012-002 DECISION-C; accountant override must be possible).
--   - Creates EngagementParticipant table (DECISION-D, BRIEF-012):
--       UNIQUEIDENTIFIER PK NEWSEQUENTIALID(), engagementId FK→Engagement NO ACTION,
--       userId FK→User NO ACTION, role NVARCHAR(20) DEFAULT 'CLIENT', createdAt DATETIMEOFFSET.
--       @@unique([engagementId, userId]): each user linked at most once per engagement.
--   - Both FKs use ON DELETE NO ACTION / ON UPDATE NO ACTION (Prisma cyclic-cascade avoidance).
--
-- Acceptance criteria (DB layer):
--   AC-LIFE-012-01/-03 — an engagement can have >1 participant; all link to the same engagement
--   AC-AUTH-007-01/-03 — a single engagement may have multiple CLIENT participants
--   DECISION-B (BRIEF-012) — taxYear = nullable year integer (e.g. 2025)
--   DECISION-D (BRIEF-012) — participant link tracked in EngagementParticipant join table
--
-- CS-SQL-001: EngagementParticipant ships sec.pol_EngagementParticipant (Track B) + isolation test.
-- CS-GEN-002: additive — no existing table/column modified destructively.
-- CS-GEN-003: governing keys cited throughout.
--
-- Applied via: pnpm db:migrate (Track A: prisma migrate deploy via scripts/db-migrate.ts)
-- Note: prisma migrate dev fails with P3019 in this environment (provider name mismatch in
-- schema-engine wasm vs migration_lock.toml). Migration is handcrafted and applied via
-- 'prisma migrate deploy' (same pattern as prior migrations in this project).

BEGIN TRY

BEGIN TRAN;

-- ─── AlterTable: Engagement — add taxYear column (DECISION-B, BRIEF-012) ─────
-- taxYear: nullable INT year value (e.g. 2025). Third component of the engagement
-- identity tuple (client, service type, tax year). No DB UNIQUE constraint — the
-- duplicate-detection guard is application-level (accountant override must be possible).
-- NULL = existing engagements (no back-fill per DECISION-B); set at creation time.
-- CS-GEN-002: additive column — does not alter or remove any existing column.
ALTER TABLE [dbo].[Engagement]
    ADD [taxYear] INT NULL;

-- ─── CreateTable: EngagementParticipant (DECISION-D, BRIEF-012) ──────────────
-- Join table: Engagement ↔ User (many-to-many) for the multi-participant feature.
-- CLIENT-SCOPED: a participant reads only their own link rows via sec.pol_EngagementParticipant.
-- UNIQUEIDENTIFIER PK with NEWSEQUENTIALID() per ADR-002 § PK convention.
-- DATETIMEOFFSET for createdAt per ADR-002 § Timestamp convention.
-- No updatedAt — participant links are immutable after creation (no edit path in v1).
CREATE TABLE [dbo].[EngagementParticipant] (
    [id]           UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_EngagementParticipant_id] DEFAULT (NEWSEQUENTIALID()),
    [engagementId] UNIQUEIDENTIFIER NOT NULL,
    [userId]       UNIQUEIDENTIFIER NOT NULL,
    -- role: 'CLIENT' (default, v1 only); reserved for future differentiation
    [role]         NVARCHAR(20) NOT NULL CONSTRAINT [DF_EngagementParticipant_role] DEFAULT N'CLIENT',
    [createdAt]    DATETIMEOFFSET NOT NULL CONSTRAINT [DF_EngagementParticipant_createdAt] DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT [PK_EngagementParticipant] PRIMARY KEY ([id]),

    -- FK → Engagement (NO ACTION: do not cascade-delete participant rows with the engagement)
    -- onDelete: NoAction, onUpdate: NoAction — Prisma cyclic-cascade avoidance (multi-path through User)
    CONSTRAINT [FK_EngagementParticipant_Engagement]
        FOREIGN KEY ([engagementId]) REFERENCES [dbo].[Engagement]([id])
        ON DELETE NO ACTION ON UPDATE NO ACTION,

    -- FK → User (NO ACTION: do not cascade-delete participant rows when the user is removed)
    -- onDelete: NoAction, onUpdate: NoAction — Prisma cyclic-cascade avoidance
    CONSTRAINT [FK_EngagementParticipant_User]
        FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id])
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- @@unique([engagementId, userId]): each user linked at most once per engagement
-- Mirrors the Prisma @@unique constraint defined in schema.prisma.
CREATE UNIQUE INDEX [UQ_EngagementParticipant_engagementId_userId]
    ON [dbo].[EngagementParticipant] ([engagementId], [userId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

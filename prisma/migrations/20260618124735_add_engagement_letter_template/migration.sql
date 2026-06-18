-- TASK-005-001: EPIC-005 engagement + letter-template schema migration
-- ADR-002: SQL Server 2022; NEWSEQUENTIALID() PKs; DATETIMEOFFSET timestamps
-- ADR-004: Prisma sole ORM (Track A migration)
-- ADR-005: Engagement RLS policy is applied in Track B (db/policies/0005-engagement-policy.sql)
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations in this migration.
--   - Creates Engagement table with 1:1 FK → EngagementRequest (NOT NULL, UNIQUE) and
--     nullable FK → User (clientUserId — DECISION-A: back-filled on sign-up, EPIC-004).
--   - Creates LetterTemplate table — accountant-owned, no RLS required.
--   - Onboarding state columns are on Engagement (DECISION-B: no separate OnboardingState table).
--   - NEWSEQUENTIALID() PKs per ADR-002 § Primary key convention.
--   - DATETIMEOFFSET for all timestamps per ADR-002 § Timestamp convention.
--
-- Acceptance criteria satisfied (DB layer):
--   AC-ONBD-002-04 — Engagement carries letterSignedAt + evidence + snapshot for e-sign gate
--   AC-IDNT-007-01 — LetterTemplate entity ready for the system-default seed
--
-- DECISION-A: clientUserId is nullable on Engagement — created at accept-time before the
--             prospect signs up; back-filled at sign-up (EPIC-004 back-fills this column).
-- DECISION-B: Onboarding state (letterSignedAt, letterSignatureEvidence,
--             letterTemplateSnapshot) stored as columns on Engagement, not a separate table.
-- DECISION-C: letterTemplateSnapshot captures template content at sign-time so later edits
--             never retroactively change a signed letter.
-- DECISION-D: LetterTemplate uses a single-current-row pattern — one row managed in place;
--             the system seeds one default row with isSystemDefault = 1.
--
-- Applied via: pnpm db:migrate (Track A: prisma migrate deploy via scripts/db-migrate.ts)
-- Workaround note: prisma migrate dev fails with P3019 in this environment (provider name
-- mismatch in schema-engine wasm vs migration_lock.toml). Migration is handcrafted and
-- applied via 'prisma migrate deploy' (same pattern as prior migrations).

BEGIN TRY

BEGIN TRAN;

-- ─── CreateTable: LetterTemplate ──────────────────────────────────────────────
-- AC-IDNT-007-01: accountant-managed engagement letter template entity.
-- DECISION-D: single-current-row pattern; seeded with one default row in Track B.
-- Not covered by RLS — accountant + admin reads; client never reads the template directly.
CREATE TABLE [dbo].[LetterTemplate] (
    [id]              UNIQUEIDENTIFIER NOT NULL CONSTRAINT [LetterTemplate_id_df] DEFAULT NEWSEQUENTIALID(),
    [content]         NVARCHAR(max)    NOT NULL,
    -- isSystemDefault: 1 = seeded system default, 0 = accountant-edited
    [isSystemDefault] BIT              NOT NULL CONSTRAINT [LetterTemplate_isSystemDefault_df] DEFAULT 0,
    -- updatedBy: accountant clerkId on edit (AC-IDNT-007-02 audit trail)
    [updatedBy]       NVARCHAR(64)     NULL,
    [createdAt]       DATETIMEOFFSET   NOT NULL CONSTRAINT [LetterTemplate_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [updatedAt]       DATETIMEOFFSET   NOT NULL,
    CONSTRAINT [LetterTemplate_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- ─── CreateTable: Engagement ──────────────────────────────────────────────────
-- AC-ONBD-002-04: Engagement entity with onboarding-state columns.
-- RLS policy sec.pol_Engagement applied separately in Track B.
-- 1:1 FK → EngagementRequest (NOT NULL, UNIQUE — one request → at most one Engagement).
-- Nullable FK → User (clientUserId — DECISION-A: back-filled when prospect signs up).
CREATE TABLE [dbo].[Engagement] (
    [id]                      UNIQUEIDENTIFIER NOT NULL CONSTRAINT [Engagement_id_df] DEFAULT NEWSEQUENTIALID(),
    -- 1:1 FK → EngagementRequest: NOT NULL, UNIQUE
    [engagementRequestId]     UNIQUEIDENTIFIER NOT NULL,
    -- DECISION-A: nullable until back-filled on sign-up
    [clientUserId]            UNIQUEIDENTIFIER NULL,
    -- Status: 'New' (default) | 'In Progress' — full transitions in EPIC-008
    [status]                  NVARCHAR(20)     NOT NULL CONSTRAINT [Engagement_status_df] DEFAULT N'New',
    -- Onboarding state (DECISION-B): NULL = gate closed; non-null = gate open
    [letterSignedAt]          DATETIMEOFFSET   NULL,
    -- DECISION-C: mock provider's deterministic signed-evidence JSON (AC-ONBD-002-04)
    [letterSignatureEvidence] NVARCHAR(max)    NULL,
    -- DECISION-C: template content captured at sign time — later edits don't change signed letter
    [letterTemplateSnapshot]  NVARCHAR(max)    NULL,
    [createdAt]               DATETIMEOFFSET   NOT NULL CONSTRAINT [Engagement_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [updatedAt]               DATETIMEOFFSET   NOT NULL,
    CONSTRAINT [Engagement_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- UNIQUE constraint: one EngagementRequest → at most one Engagement (1:1)
ALTER TABLE [dbo].[Engagement]
    ADD CONSTRAINT [Engagement_engagementRequestId_key] UNIQUE ([engagementRequestId]);

-- AddForeignKey: Engagement → EngagementRequest (1:1, NOT NULL, ON DELETE NO ACTION)
ALTER TABLE [dbo].[Engagement]
    ADD CONSTRAINT [Engagement_engagementRequestId_fkey]
    FOREIGN KEY ([engagementRequestId])
    REFERENCES [dbo].[EngagementRequest]([id])
    ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey: Engagement → User (nullable, DECISION-A, ON DELETE NO ACTION)
ALTER TABLE [dbo].[Engagement]
    ADD CONSTRAINT [Engagement_clientUserId_fkey]
    FOREIGN KEY ([clientUserId])
    REFERENCES [dbo].[User]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

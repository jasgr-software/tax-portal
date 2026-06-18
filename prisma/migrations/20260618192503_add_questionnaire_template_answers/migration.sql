-- TASK-006-001: EPIC-006 questionnaire schema migration
-- ADR-002: SQL Server 2022; NEWSEQUENTIALID() PKs; DATETIMEOFFSET timestamps
-- ADR-004: Prisma sole ORM (Track A migration)
-- ADR-005: QuestionnaireAnswer RLS policy applied in Track B (db/policies/0006-questionnaire-policy.sql)
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations in this migration.
--   - Creates QuestionnaireTemplate table: per-service-type template (AC-ONBD-003-02 / AC-DASH-012-02).
--     Unique constraint on serviceId: at most one template per service type.
--     FK → Service onDelete: NO ACTION (never hard-delete a Service a template references).
--   - Creates QuestionnaireAnswer table: client-owned answer rows (SECOND client-owned-row family).
--     Unique constraint on engagementId: one submission per engagement in v1 (AC-ONBD-003-04).
--     FK → Engagement onDelete: NO ACTION; FK → QuestionnaireTemplate onDelete: NO ACTION.
--   - Adds Engagement.questionnaireSubmittedAt column: NULL = step-2 not satisfied (DECISION-I).
--   - NEWSEQUENTIALID() PKs per ADR-002 § Primary key convention.
--   - DATETIMEOFFSET for all timestamps per ADR-002 § Timestamp convention.
--
-- Acceptance criteria satisfied (DB layer):
--   AC-ONBD-003-02 / AC-DASH-012-02 — QuestionnaireTemplate entity with per-service-type binding
--   AC-ONBD-003-04                   — QuestionnaireAnswer entity records answers against engagement
--   AC-ONBD-003-03                   — questionnaireSubmittedAt column is the step-satisfaction marker
--
-- DECISION-G (EPIC-006): serialized-JSON `questions` blob over structured rows (mirrors LetterTemplate).
-- DECISION-H (EPIC-006): serialized-JSON `answers` blob keyed by question id.
-- DECISION-I (EPIC-006): questionnaireSubmittedAt is onboarding-state column on Engagement (DECISION-B family).
--
-- Applied via: pnpm db:migrate (Track A: prisma migrate deploy via scripts/db-migrate.ts)
-- Note: prisma migrate dev fails with P3019 in this environment (provider name mismatch in
-- schema-engine wasm vs migration_lock.toml). Migration is handcrafted and applied via
-- 'prisma migrate deploy' (same pattern as prior migrations).

BEGIN TRY

BEGIN TRAN;

-- ─── CreateTable: QuestionnaireTemplate ───────────────────────────────────────
-- AC-ONBD-003-02 / AC-DASH-012-02: accountant-managed template, keyed per Service type.
-- DECISION-G: serialized-JSON `questions` blob — v1 questionnaires are static.
-- Unique on serviceId: at most one template per service type.
-- FK → Service onDelete: NO ACTION (reversible-deactivate posture from EPIC-002).
-- Write boundary: accountant-only (RLS BLOCK via sec.pol_QuestionnaireTemplate, Track B).
CREATE TABLE [dbo].[QuestionnaireTemplate] (
    [id]        UNIQUEIDENTIFIER NOT NULL CONSTRAINT [QuestionnaireTemplate_id_df] DEFAULT NEWSEQUENTIALID(),
    -- FK → Service (unique: one template per service type)
    [serviceId] UNIQUEIDENTIFIER NOT NULL,
    -- Serialized JSON array of question definitions (DECISION-G):
    -- [{ id: string, prompt: string, type: 'text' | 'textarea', required: boolean }, ...]
    [questions] NVARCHAR(max)    NOT NULL,
    -- Accountant clerkId on create/edit (mirrors LetterTemplate.updatedBy)
    [updatedBy] NVARCHAR(64)     NULL,
    [createdAt] DATETIMEOFFSET   NOT NULL CONSTRAINT [QuestionnaireTemplate_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [updatedAt] DATETIMEOFFSET   NOT NULL,
    CONSTRAINT [QuestionnaireTemplate_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- UNIQUE constraint: at most one template per service type (AC-ONBD-003-02 / AC-DASH-012-02)
ALTER TABLE [dbo].[QuestionnaireTemplate]
    ADD CONSTRAINT [QuestionnaireTemplate_serviceId_key] UNIQUE ([serviceId]);

-- AddForeignKey: QuestionnaireTemplate → Service (unique, ON DELETE NO ACTION)
ALTER TABLE [dbo].[QuestionnaireTemplate]
    ADD CONSTRAINT [QuestionnaireTemplate_serviceId_fkey]
    FOREIGN KEY ([serviceId])
    REFERENCES [dbo].[Service]([id])
    ON DELETE NO ACTION ON UPDATE CASCADE;

-- ─── CreateTable: QuestionnaireAnswer ─────────────────────────────────────────
-- AC-ONBD-003-04: client-owned answers recorded against the engagement.
-- SECOND client-owned-row family (after Engagement, EPIC-005).
-- DECISION-H: serialized-JSON `answers` blob: { [questionId]: string }.
-- Unique on engagementId: one submission per engagement in v1.
-- FK → Engagement onDelete: NO ACTION; FK → QuestionnaireTemplate onDelete: NO ACTION.
-- Client-isolation RLS: sec.pol_QuestionnaireAnswer (Track B, 0006-questionnaire-policy.sql).
CREATE TABLE [dbo].[QuestionnaireAnswer] (
    [id]           UNIQUEIDENTIFIER NOT NULL CONSTRAINT [QuestionnaireAnswer_id_df] DEFAULT NEWSEQUENTIALID(),
    -- FK → Engagement (unique: one answer row per engagement in v1)
    [engagementId] UNIQUEIDENTIFIER NOT NULL,
    -- FK → QuestionnaireTemplate (captures which template version was answered)
    [templateId]   UNIQUEIDENTIFIER NOT NULL,
    -- Serialized JSON: { [questionId: string]: string } (DECISION-H)
    [answers]      NVARCHAR(max)    NOT NULL,
    [submittedAt]  DATETIMEOFFSET   NOT NULL CONSTRAINT [QuestionnaireAnswer_submittedAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [createdAt]    DATETIMEOFFSET   NOT NULL CONSTRAINT [QuestionnaireAnswer_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [updatedAt]    DATETIMEOFFSET   NOT NULL,
    CONSTRAINT [QuestionnaireAnswer_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- UNIQUE constraint: one submission per engagement in v1 (AC-ONBD-003-04)
ALTER TABLE [dbo].[QuestionnaireAnswer]
    ADD CONSTRAINT [QuestionnaireAnswer_engagementId_key] UNIQUE ([engagementId]);

-- AddForeignKey: QuestionnaireAnswer → Engagement (ON DELETE NO ACTION)
ALTER TABLE [dbo].[QuestionnaireAnswer]
    ADD CONSTRAINT [QuestionnaireAnswer_engagementId_fkey]
    FOREIGN KEY ([engagementId])
    REFERENCES [dbo].[Engagement]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey: QuestionnaireAnswer → QuestionnaireTemplate (ON DELETE NO ACTION)
ALTER TABLE [dbo].[QuestionnaireAnswer]
    ADD CONSTRAINT [QuestionnaireAnswer_templateId_fkey]
    FOREIGN KEY ([templateId])
    REFERENCES [dbo].[QuestionnaireTemplate]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ─── AlterTable: Engagement — add questionnaireSubmittedAt column ──────────────
-- DECISION-I: questionnaire-step satisfaction marker (DECISION-B family on Engagement).
-- NULL = step-2 not satisfied; non-null = questionnaire submitted (AC-ONBD-003-03/-04).
-- Set atomically with the QuestionnaireAnswer INSERT in submitQuestionnaireAsClient.
ALTER TABLE [dbo].[Engagement]
    ADD [questionnaireSubmittedAt] DATETIMEOFFSET NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

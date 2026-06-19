-- TASK-007-003: EPIC-007 document models migration
-- ADR-002: SQL Server 2022; NEWSEQUENTIALID() PKs; DATETIMEOFFSET timestamps
-- ADR-004: Prisma sole ORM (Track A migration)
-- ADR-005: Document RLS policy applied in Track B (db/policies/0007-document-policy.sql)
-- ADR-009: Storage key + status ('pending'|'active'|'infected') columns on Document
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations in this migration.
--   - Creates DocumentRequest table: accountant-authored checklist items per engagement.
--     FK → Engagement onDelete: NO ACTION; no CASCADE from Engagement to requests.
--   - Creates Document table: stored-file metadata rows (THIRD client-owned-row family).
--     FK → Engagement onDelete: NO ACTION (isolation column — the FILTER predicate keys on engagementId).
--     FK → DocumentRequest (nullable) onDelete: NO ACTION; fulfillment link.
--     BOTH FKs use ON UPDATE NO ACTION (Prisma cyclic-cascade validation: multi-path through Engagement).
--     CHECK constraint on status: 'pending'|'active'|'infected' (ADR-009) lives in Track B (0007-document-policy.sql).
--   - NEWSEQUENTIALID() PKs per ADR-002 § Primary key convention.
--   - DATETIMEOFFSET for all timestamps per ADR-002 § Timestamp convention.
--   - @db.BigInt for sizeBytes per ADR-009.
--
-- Note: prisma migrate dev fails with P3019 in this environment (provider name mismatch in
-- schema-engine wasm vs migration_lock.toml). Migration is handcrafted and applied via
-- 'prisma migrate deploy' (same pattern as prior migrations: 0006, 0005, etc.).
--
-- Acceptance criteria satisfied (DB layer):
--   AC-FILE-008-01 — DocumentRequest entity with engagementId FK (checklist relationship)
--   AC-FILE-001-05 — Document.engagementId is the isolation column for the RLS FILTER predicate
--   AC-FILE-003-02 — Document RLS FILTER is the data-layer authorization gate (Track B wires it)
--   AC-FILE-007-01 — DocumentRequest.label is the free-text description column
--
-- DECISION-TASK-007-003: Fulfillment is a nullable FK Document.documentRequestId (not a join table).
-- DECISION-TASK-007-003: No stored satisfaction marker — derived in the read model (TASK-007-004).
-- DECISION-TASK-007-003: status CHECK constraint in Track B (Prisma can't express DB-level CHECK).

BEGIN TRY

BEGIN TRAN;

-- ─── CreateTable: DocumentRequest ──────────────────────────────────────────────
-- Accountant-authored checklist item per engagement.
-- RLS write boundary: accountant-only (sec.pol_DocumentRequest BLOCK, Track B).
-- RLS read: CLIENT reads own engagement's requests (sec.pol_DocumentRequest FILTER, Track B).
-- FK → Engagement onDelete: NO ACTION — never cascade-delete requests on engagement delete.
CREATE TABLE [dbo].[DocumentRequest] (
    [id]           UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DocumentRequest_id_df] DEFAULT NEWSEQUENTIALID(),
    -- FK → Engagement (one engagement can have many requests — AC-FILE-008-01)
    [engagementId] UNIQUEIDENTIFIER NOT NULL,
    -- Free-text label describing what the client should upload (AC-FILE-007-01)
    [label]        NVARCHAR(500)    NOT NULL,
    -- Accountant clerkId at creation (audit — mirrors LetterTemplate.updatedBy)
    [createdBy]    NVARCHAR(64)     NULL,
    [createdAt]    DATETIMEOFFSET   NOT NULL CONSTRAINT [DocumentRequest_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [updatedAt]    DATETIMEOFFSET   NOT NULL,
    CONSTRAINT [DocumentRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey: DocumentRequest → Engagement (ON DELETE NO ACTION)
ALTER TABLE [dbo].[DocumentRequest]
    ADD CONSTRAINT [DocumentRequest_engagementId_fkey]
    FOREIGN KEY ([engagementId])
    REFERENCES [dbo].[Engagement]([id])
    ON DELETE NO ACTION ON UPDATE CASCADE;

-- ─── CreateTable: Document ─────────────────────────────────────────────────────
-- Stored-file metadata row — THIRD client-owned-row family (after Engagement + QuestionnaireAnswer).
-- RLS: FILTER + BLOCK via sec.pol_Document (Track B: db/policies/0007-document-policy.sql).
-- ADR-009 storage-key shape: engagements/{engagementId}/documents/{id}/v1/{urlencoded-filename}.
-- ADR-009 status: 'pending'|'active'|'infected' — CHECK constraint in Track B.
-- FK → Engagement: the isolation column the FILTER predicate keys on (AC-FILE-001-05).
-- FK → DocumentRequest (nullable): fulfillment link (DECISION-TASK-007-003).
-- Both FKs: ON UPDATE NO ACTION (Prisma cyclic-cascade validation — multi-path through Engagement).
CREATE TABLE [dbo].[Document] (
    [id]                UNIQUEIDENTIFIER NOT NULL CONSTRAINT [Document_id_df] DEFAULT NEWSEQUENTIALID(),
    -- FK → Engagement: isolation column for FILTER predicate (AC-FILE-001-05 / AC-FILE-003-02)
    [engagementId]      UNIQUEIDENTIFIER NOT NULL,
    -- FK → DocumentRequest: nullable fulfillment link (DECISION-TASK-007-003: FK not join table)
    [documentRequestId] UNIQUEIDENTIFIER NULL,
    -- ADR-009 storage key: engagements/{engagementId}/documents/{id}/v1/{urlencoded-filename}
    [storageKey]        NVARCHAR(1024)   NOT NULL,
    -- Authoritative original filename as uploaded (ADR-009)
    [originalFilename]  NVARCHAR(500)    NOT NULL,
    -- Declared content-type (e.g. 'application/pdf')
    [contentType]       NVARCHAR(255)    NOT NULL,
    -- Claimed/verified file size in bytes — BIGINT per ADR-009 / @db.BigInt
    [sizeBytes]         BIGINT           NOT NULL,
    -- ADR-009 status: 'pending'|'active'|'infected' (default 'pending')
    -- CHECK constraint enforcing the 3-value enum is added in Track B (0007-document-policy.sql).
    [status]            NVARCHAR(16)     NOT NULL CONSTRAINT [Document_status_df] DEFAULT 'pending',
    -- Version counter — v1 only (no replace/history in this slice)
    [version]           INT              NOT NULL CONSTRAINT [Document_version_df] DEFAULT 1,
    -- Optional threat label when status='infected' (AV scan result — TASK-007-004)
    [scanThreat]        NVARCHAR(500)    NULL,
    -- Uploader clerkId (audit trail)
    [uploadedBy]        NVARCHAR(64)     NULL,
    [createdAt]         DATETIMEOFFSET   NOT NULL CONSTRAINT [Document_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [updatedAt]         DATETIMEOFFSET   NOT NULL,
    CONSTRAINT [Document_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey: Document → Engagement (ON DELETE NO ACTION, ON UPDATE NO ACTION)
-- ON UPDATE NO ACTION required: Prisma cyclic-cascade — multi-path through Engagement → User.
ALTER TABLE [dbo].[Document]
    ADD CONSTRAINT [Document_engagementId_fkey]
    FOREIGN KEY ([engagementId])
    REFERENCES [dbo].[Engagement]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey: Document → DocumentRequest (nullable, ON DELETE NO ACTION, ON UPDATE NO ACTION)
-- NULL = not tied to a specific request; non-NULL = uploaded in response to this request.
-- ON UPDATE NO ACTION required: Prisma cyclic-cascade — DocumentRequest → Engagement.
ALTER TABLE [dbo].[Document]
    ADD CONSTRAINT [Document_documentRequestId_fkey]
    FOREIGN KEY ([documentRequestId])
    REFERENCES [dbo].[DocumentRequest]([id])
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

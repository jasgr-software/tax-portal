-- TASK-013-001: Folder + DocumentVersion tables + Document.folderId column
-- ADR-002: SQL Server 2022; NEWSEQUENTIALID() PKs; DATETIMEOFFSET timestamps; Track A Prisma migration
-- ADR-004: Prisma sole ORM (Track A migration)
-- ADR-005: Folder and DocumentVersion are covered by sec.pol_Folder and sec.pol_DocumentVersion (Track B: 0010/0011)
--          fn_document_access extended (Track B: 0007-document-policy.sql) for participant read (AC-FILE-001-04)
-- ADR-009: DocumentVersion storage key: engagements/{engagementId}/documents/{documentId}/v{version}/...
--          No folder segment in the key — folder membership is the DB Document.folderId relationship
-- BRIEF-013: secure file exchange — folders, version history, participant download
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations in this migration. (CS-GEN-002)
--   - Creates Folder table (DECISION-013-A):
--       Engagement-scoped; nullable parentFolderId self-reference for nesting (AC-FILE-010-02).
--       UNIQUEIDENTIFIER PK NEWSEQUENTIALID(). DATETIMEOFFSET timestamps.
--       onDelete/onUpdate NoAction on all FKs (Prisma cyclic-cascade avoidance).
--   - Adds Document.folderId (nullable FK → Folder):
--       NULL = document sits at engagement root. Non-null = in a folder (AC-FILE-010-03).
--       onDelete NoAction — documents not deleted when a folder is removed.
--   - Creates DocumentVersion table (DECISION-013-B):
--       Child of Document; each row = one version of the file (ADR-009 retained-version model).
--       @@unique([documentId, version]): one row per version per document.
--       supersededAt: NULL = current; non-NULL = superseded (AC-FILE-009-03 substrate).
--       onDelete NoAction — version rows not cascade-deleted.
--
-- Acceptance criteria (DB layer):
--   AC-FILE-001-04 — participant download enabled via fn_document_access extension (Track B / 0007)
--   AC-FILE-009-03 — prior versions retained in DocumentVersion; readable after replacement
--   AC-FILE-010-01 — files organize into folders (Folder table + Document.folderId)
--   AC-FILE-010-03 — a file placed in a folder (Document.folderId FK)
--   AC-FILE-010-04 — folder management accountant-only (sec.fn_folder_write_access — Track B / 0010)
--
-- CS-SQL-001: Folder ships sec.pol_Folder + folder.client-isolation.rls.test.ts (HARD GATE)
--             DocumentVersion ships sec.pol_DocumentVersion + document-version.client-isolation.rls.test.ts
-- CS-GEN-002: additive — no existing table/column modified destructively. // CS-GEN-002
-- CS-GEN-003: governing keys cited throughout. // CS-GEN-003
-- DECISION-013-A: nullable parentFolderId for folder nesting.
-- DECISION-013-B: versions as a child table (ADR-009 permits "a DocumentVersion child table").
--
-- Applied via: pnpm db:migrate (Track A: prisma migrate deploy via scripts/db-migrate.ts)
-- Note: prisma migrate dev fails with P3019 in this environment (provider name mismatch in
-- schema-engine wasm vs migration_lock.toml). Migration is handcrafted and applied via
-- 'prisma migrate deploy' (same pattern as 20260623161354_engagement-participant-and-tax-year).

BEGIN TRY

BEGIN TRAN;

-- ─── CreateTable: Folder (DECISION-013-A / AC-FILE-010-01 / AC-FILE-010-02) ─────────
-- Engagement-scoped folder for organizing documents (BRIEF-013).
-- CLIENT-SCOPED: a client reads only their own engagement's folders via sec.pol_Folder.
-- Accountant-only write (no CLIENT branch in fn_folder_write_access — AC-FILE-010-04).
-- UNIQUEIDENTIFIER PK with NEWSEQUENTIALID() per ADR-002 § PK convention.
-- DATETIMEOFFSET for createdAt/updatedAt per ADR-002 § Timestamp convention.
-- parentFolderId: nullable self-reference for nesting (DECISION-013-A / AC-FILE-010-02).
CREATE TABLE [dbo].[Folder] (
    [id]             UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_Folder_id] DEFAULT (NEWSEQUENTIALID()),
    [engagementId]   UNIQUEIDENTIFIER NOT NULL,
    [name]           NVARCHAR(255) NOT NULL,
    -- Nullable self-reference: NULL = root-level folder; non-null = nested under parent (AC-FILE-010-02)
    -- DECISION-013-A: bounded nesting — re-parenting stays within the same engagement (RLS-enforced)
    [parentFolderId] UNIQUEIDENTIFIER NULL,
    [createdBy]      NVARCHAR(64) NULL,
    [createdAt]      DATETIMEOFFSET NOT NULL CONSTRAINT [DF_Folder_createdAt] DEFAULT (SYSDATETIMEOFFSET()),
    [updatedAt]      DATETIMEOFFSET NOT NULL,

    CONSTRAINT [PK_Folder] PRIMARY KEY ([id]),

    -- FK → Engagement (isolation column for RLS FILTER predicate — AC-FILE-010-01)
    -- onDelete: NoAction, onUpdate: NoAction — Prisma cyclic-cascade avoidance (multi-path through EngagementRequest → User)
    CONSTRAINT [FK_Folder_Engagement]
        FOREIGN KEY ([engagementId]) REFERENCES [dbo].[Engagement]([id])
        ON DELETE NO ACTION ON UPDATE NO ACTION,

    -- Self-referential FK for folder nesting (DECISION-013-A)
    -- onDelete: NoAction — child folders not removed when parent is deleted
    -- onUpdate: NoAction — Prisma cyclic-cascade avoidance
    CONSTRAINT [FK_Folder_ParentFolder]
        FOREIGN KEY ([parentFolderId]) REFERENCES [dbo].[Folder]([id])
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- ─── AlterTable: Document — add folderId column (CS-GEN-002 additive) ─────────────
-- folderId: nullable FK → Folder. NULL = at engagement root. Non-null = in a folder.
-- AC-FILE-010-03: a file placed in a folder.
-- onDelete: NoAction — documents not cascade-deleted when their folder is removed.
-- CS-GEN-002: purely additive column — does not alter or remove any existing column.
ALTER TABLE [dbo].[Document]
    ADD [folderId] UNIQUEIDENTIFIER NULL
    CONSTRAINT [FK_Document_Folder] FOREIGN KEY ([folderId]) REFERENCES [dbo].[Folder]([id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ─── CreateTable: DocumentVersion (DECISION-013-B / AC-FILE-009-03) ─────────────────
-- Version history for a Document (BRIEF-013 / ADR-009).
-- CLIENT-SCOPED: engagement-scoped via parent Document → Engagement.
-- UNIQUEIDENTIFIER PK with NEWSEQUENTIALID() per ADR-002 § PK convention.
-- DATETIMEOFFSET timestamps per ADR-002 § Timestamp convention.
-- version: monotonically increasing per document (one row per version number).
-- supersededAt: NULL = current version; non-NULL = superseded at this timestamp.
--   Set when a replacement upload creates a new row (TASK-013-002).
--   Prior rows remain SELECT-able (AC-FILE-009-03 substrate).
-- storageKey: versioned storage key (ADR-009: engagements/{engId}/documents/{docId}/v{ver}/...)
--   No folder segment in key — folder membership is the DB Document.folderId relationship.
CREATE TABLE [dbo].[DocumentVersion] (
    [id]           UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_DocumentVersion_id] DEFAULT (NEWSEQUENTIALID()),
    [documentId]   UNIQUEIDENTIFIER NOT NULL,
    -- Monotonically increasing version number per document (AC-FILE-009-03)
    [version]      INT NOT NULL,
    -- ADR-009 versioned storage key: engagements/{engagementId}/documents/{documentId}/v{version}/...
    [storageKey]   NVARCHAR(1024) NOT NULL,
    -- NULL = current version; non-NULL = superseded at this timestamp (AC-FILE-009-03 substrate)
    [supersededAt] DATETIMEOFFSET NULL,
    [uploadedBy]   NVARCHAR(64) NULL,
    [createdAt]    DATETIMEOFFSET NOT NULL CONSTRAINT [DF_DocumentVersion_createdAt] DEFAULT (SYSDATETIMEOFFSET()),
    [updatedAt]    DATETIMEOFFSET NOT NULL,

    CONSTRAINT [PK_DocumentVersion] PRIMARY KEY ([id]),

    -- FK → Document (NO ACTION: do not cascade-delete version rows when the parent document is removed)
    -- onDelete: NoAction, onUpdate: NoAction — Prisma cyclic-cascade avoidance
    CONSTRAINT [FK_DocumentVersion_Document]
        FOREIGN KEY ([documentId]) REFERENCES [dbo].[Document]([id])
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- @@unique([documentId, version]): one row per version number per document
-- Mirrors the Prisma @@unique constraint defined in schema.prisma.
CREATE UNIQUE INDEX [UQ_DocumentVersion_documentId_version]
    ON [dbo].[DocumentVersion] ([documentId], [version]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

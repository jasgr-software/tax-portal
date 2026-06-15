-- TASK-003: Initial entity schema migration
-- ADR-002: SQL Server 2022; NEWSEQUENTIALID() PKs; DATETIMEOFFSET timestamps
-- ADR-004: Prisma sole ORM (Track A migration)
-- ADR-005: Security policies (RLS) for EngagementRequest and Service are applied in Track B (db/policies/)
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations (DROP TABLE, DROP COLUMN, ALTER COLUMN narrowing) in this migration.
--   - All tables created fresh; no existing data at risk.
--   - FKs use ON DELETE CASCADE for EngagementRequestService (orphan cleanup) — safe for a join table.
--   - NEWSEQUENTIALID() avoids index fragmentation (ADR-002 § Primary key convention).
--   - DATETIMEOFFSET used for all timestamps (ADR-002 § Timestamp convention).
--   - Email stored as NVARCHAR(254) with normalization enforced at app layer (ADR-002 § CITEXT equivalent).
--
-- Applied via: mssql track (workaround for Prisma 5.22.0 sqlserver port-param limitation)
-- See Work Log in TASK-003 for details of the limitation and workaround.

BEGIN TRY

BEGIN TRAN;

-- CreateTable: Service (the accountant-managed service catalog)
CREATE TABLE [dbo].[Service] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [Service_id_df] DEFAULT NEWSEQUENTIALID(),
    [name] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(max),
    [active] BIT NOT NULL CONSTRAINT [Service_active_df] DEFAULT 1,
    [sortOrder] INT NOT NULL CONSTRAINT [Service_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [Service_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [Service_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable: EngagementRequest (anonymous prospect submission — RLS: accountant-only-read)
CREATE TABLE [dbo].[EngagementRequest] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [EngagementRequest_id_df] DEFAULT NEWSEQUENTIALID(),
    [firstName] NVARCHAR(100) NOT NULL,
    [lastName] NVARCHAR(100) NOT NULL,
    -- email normalized at app layer (.trim().toLowerCase()) per ADR-002
    [email] NVARCHAR(254) NOT NULL,
    [phone] NVARCHAR(30),
    [message] NVARCHAR(max),
    -- Status: 'pending' | 'awaiting_review' | 'accepted' | 'declined'
    -- Initial state is always 'pending' (AC-DOOR-004-03)
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [EngagementRequest_status_df] DEFAULT 'pending',
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [EngagementRequest_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [EngagementRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable: EngagementRequestService (join table for multi-service selection)
-- SQL Server has no native array type — ADR-002 § Known rough edges
CREATE TABLE [dbo].[EngagementRequestService] (
    [engagementRequestId] UNIQUEIDENTIFIER NOT NULL,
    [serviceId] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [EngagementRequestService_pkey] PRIMARY KEY CLUSTERED ([engagementRequestId],[serviceId])
);

-- CreateTable: User (minimal — full auth/User modeling deferred to EPIC-004)
-- Included here because ADR-005 predicate skeletons join via User.clerkId
CREATE TABLE [dbo].[User] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [User_id_df] DEFAULT NEWSEQUENTIALID(),
    [clerkId] NVARCHAR(64) NOT NULL,
    -- email normalized at app layer (.trim().toLowerCase()) per ADR-002
    [email] NVARCHAR(254) NOT NULL,
    -- role: 'ACCOUNTANT' | 'CLIENT' — matches SESSION_CONTEXT 'role' key (ADR-003 §2)
    [role] NVARCHAR(16) NOT NULL,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_clerkId_key] UNIQUE NONCLUSTERED ([clerkId]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

-- AddForeignKey: EngagementRequestService → EngagementRequest (cascade delete)
ALTER TABLE [dbo].[EngagementRequestService] ADD CONSTRAINT [EngagementRequestService_engagementRequestId_fkey] FOREIGN KEY ([engagementRequestId]) REFERENCES [dbo].[EngagementRequest]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: EngagementRequestService → Service (no action on delete)
ALTER TABLE [dbo].[EngagementRequestService] ADD CONSTRAINT [EngagementRequestService_serviceId_fkey] FOREIGN KEY ([serviceId]) REFERENCES [dbo].[Service]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

-- TASK-017-001: Thread / Message / MessageAttachment / ThreadReadState schema (Track A Prisma migration)
-- BRIEF-017: Per-engagement general messaging — schema spine
-- ADR-002: SQL Server 2022; UNIQUEIDENTIFIER PK NEWSEQUENTIALID(); DATETIMEOFFSET timestamps; Track A Prisma migration
-- ADR-005: newly scoped tables → ship RLS policies + isolation tests (CS-SQL-001)
-- ADR-003: SESSION_CONTEXT('clerk_user_id') identity key for all RLS predicates
-- CS-GEN-002: additive — new tables only; no existing table modified destructively
-- CS-GEN-003: governing keys cited above and in the policy SQL + tests
-- CS-SQL-001: all four tables ship RLS policies + isolation tests (HARD GATE)
-- CS-SQL-002: entity schema on Prisma track; security-policy predicates on raw-SQL track (0014–0017)
--
-- DECISION-017-A (binding spec):
--   Thread.kind: 'engagement' | 'general' — CHECK constraint in Track B (0014).
--   Exactly one of {engagementId, clientUserId} is non-null per Thread row (CHECK in Track B).
--   Thread.@@unique([engagementId]) — one engagement thread per engagement (AC-MSG-001-01).
--   Thread.status: 'active' | 'archived' — CHECK in Track B (0014).
--   ThreadReadState.@@unique([threadId, userId]) — per-viewer last-read watermark.
--
-- Note: prisma migrate dev fails with P3019 in this environment (provider name mismatch in
-- schema-engine wasm vs migration_lock.toml). Migration is handcrafted and applied via
-- `pnpm db:migrate` (Track A: `prisma migrate deploy`; Track B: raw-SQL policies runner).
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations. (CS-GEN-002)
--   - Creates four new tables: Thread, Message, MessageAttachment, ThreadReadState
--   - RLS policies ride Track B: db/policies/0014..0017
--   - Security policies (Track B) will apply FILTER + BLOCK after these tables exist

-- ─────────────────────────────────────────────────────────────────────────────
-- Thread table
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION-017-A: kind-column discriminator ('engagement' | 'general') per IO Design.
-- One-thread-per-engagement enforced by @@unique([engagementId]) (AC-MSG-001-01).
-- status: 'active' | 'archived' — archivedAt records timestamp of archive.
-- FK → Engagement (engagementId): set when kind='engagement', NULL when kind='general'.
-- FK → User (clientUserId): set when kind='general', NULL when kind='engagement'.
-- CS-GEN-002: additive — new table.
-- AC-MSG-001-01: @@unique([engagementId]) enforces one-thread-per-engagement.
-- AC-MSG-006-01: general thread per client↔accountant (kind='general').

CREATE TABLE [dbo].[Thread] (
    -- PK: NEWSEQUENTIALID() per ADR-002 convention
    [id]            UNIQUEIDENTIFIER NOT NULL DEFAULT (NEWSEQUENTIALID()),
    -- Kind discriminator: 'engagement' | 'general' — CHECK constraint applied in Track B (0014)
    -- DECISION-017-A: kind-column over separate tables (bounded IO discretion)
    [kind]          NVARCHAR(20) NOT NULL,
    -- FK → Engagement — set when kind='engagement'; NULL when kind='general'
    -- @@unique([engagementId]) enforces one-thread-per-engagement (AC-MSG-001-01)
    [engagementId]  UNIQUEIDENTIFIER NULL,
    -- FK → User — the CLIENT this general thread is with (set when kind='general'; NULL otherwise)
    -- DECISION-017-A: general thread is identified by the associated client user
    [clientUserId]  UNIQUEIDENTIFIER NULL,
    -- Status: 'active' | 'archived' — CHECK constraint applied in Track B (0014)
    [status]        NVARCHAR(20) NOT NULL DEFAULT (N'active'),
    -- archivedAt: NULL = active; non-NULL = timestamp when thread was archived
    [archivedAt]    DATETIMEOFFSET NULL,
    -- Standard timestamps (ADR-002)
    [createdAt]     DATETIMEOFFSET NOT NULL DEFAULT (SYSDATETIMEOFFSET()),
    [updatedAt]     DATETIMEOFFSET NOT NULL DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT [PK_Thread] PRIMARY KEY CLUSTERED ([id])
);
GO

-- @@unique([engagementId]): one Thread per Engagement (AC-MSG-001-01)
-- NULL values excluded from unique index (SQL Server NULL != NULL convention)
-- so this safely enforces uniqueness only for non-null engagementId values.
CREATE UNIQUE INDEX [UQ_Thread_engagementId]
    ON [dbo].[Thread] ([engagementId])
    WHERE [engagementId] IS NOT NULL;
GO

-- FK → Engagement (engagementId — engagement-scoped thread)
-- onDelete: NoAction, onUpdate: NoAction (Prisma cyclic-cascade guard — multi-path through Engagement)
ALTER TABLE [dbo].[Thread]
    ADD CONSTRAINT [FK_Thread_Engagement]
    FOREIGN KEY ([engagementId])
    REFERENCES [dbo].[Engagement] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;
GO

-- FK → User (clientUserId — general thread's associated client)
-- onDelete: NoAction — never cascade-delete a thread when the user is removed
-- onUpdate: NoAction — Prisma cyclic-cascade guard
ALTER TABLE [dbo].[Thread]
    ADD CONSTRAINT [FK_Thread_User_clientUserId]
    FOREIGN KEY ([clientUserId])
    REFERENCES [dbo].[User] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;
GO

-- Index on engagementId for fast thread lookup by engagement
-- ADR-005 §5: index supports RLS predicate evaluation
CREATE INDEX [IX_Thread_engagementId]
    ON [dbo].[Thread] ([engagementId])
    WHERE [engagementId] IS NOT NULL;
GO

-- Index on clientUserId for general thread lookup by client
-- ADR-005 §5: index supports RLS predicate evaluation (general thread CLIENT branch)
CREATE INDEX [IX_Thread_clientUserId]
    ON [dbo].[Thread] ([clientUserId])
    WHERE [clientUserId] IS NOT NULL;
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- Message table
-- ─────────────────────────────────────────────────────────────────────────────
-- Plain-text message within a Thread. CLIENT-scoped and CLIENT-isolated via parent Thread.
-- senderClerkId: Clerk ID of the sender (CLIENT or ACCOUNTANT). Audit trail.
-- body: plain-text message body. NVarChar(Max).
-- FK → Thread: onDelete NoAction — never cascade-delete messages when thread is removed.
-- CS-GEN-002: additive — new table.
-- AC-MSG-002-02: messages visible only to thread participants (policy substrate — Track B 0015).

CREATE TABLE [dbo].[Message] (
    -- PK: NEWSEQUENTIALID() per ADR-002 convention
    [id]            UNIQUEIDENTIFIER NOT NULL DEFAULT (NEWSEQUENTIALID()),
    -- FK → Thread — the thread this message belongs to
    [threadId]      UNIQUEIDENTIFIER NOT NULL,
    -- Sender identity: the clerkId of the sender (CLIENT or ACCOUNTANT). Audit trail.
    [senderClerkId] NVARCHAR(64) NOT NULL,
    -- Plain-text message body (AC-MSG-002: plain text threading)
    [body]          NVARCHAR(MAX) NOT NULL,
    -- Standard timestamps (ADR-002)
    [createdAt]     DATETIMEOFFSET NOT NULL DEFAULT (SYSDATETIMEOFFSET()),
    [updatedAt]     DATETIMEOFFSET NOT NULL DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT [PK_Message] PRIMARY KEY CLUSTERED ([id])
);
GO

-- FK → Thread (threadId)
-- onDelete: NoAction — never cascade-delete messages when thread is removed
ALTER TABLE [dbo].[Message]
    ADD CONSTRAINT [FK_Message_Thread]
    FOREIGN KEY ([threadId])
    REFERENCES [dbo].[Thread] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;
GO

-- Index on threadId for efficient message listing (primary access pattern)
-- ADR-005 §5: index supports RLS predicate evaluation via threadId
CREATE INDEX [IX_Message_threadId]
    ON [dbo].[Message] ([threadId]);
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- MessageAttachment table
-- ─────────────────────────────────────────────────────────────────────────────
-- File attachment metadata for a Message. CLIENT-scoped and CLIENT-isolated via Message → Thread.
-- Mirrors Document.status three-value enum (ADR-009 AV scan posture).
-- status: 'pending' | 'active' | 'infected' — CHECK constraint applied in Track B (0016).
-- FK → Message: onDelete NoAction — never cascade-delete attachment metadata.
-- CS-GEN-002: additive — new table.

CREATE TABLE [dbo].[MessageAttachment] (
    -- PK: NEWSEQUENTIALID() per ADR-002 convention
    [id]               UNIQUEIDENTIFIER NOT NULL DEFAULT (NEWSEQUENTIALID()),
    -- FK → Message — the message this attachment belongs to
    [messageId]        UNIQUEIDENTIFIER NOT NULL,
    -- ADR-009 storage key for this attachment
    -- Shape: threads/{threadId}/messages/{messageId}/{filename}
    [storageKey]       NVARCHAR(1024) NOT NULL,
    -- Original filename as uploaded (ADR-009)
    [originalFilename] NVARCHAR(500) NOT NULL,
    -- Declared content-type (e.g. 'application/pdf')
    [contentType]      NVARCHAR(255) NOT NULL,
    -- File size in bytes (ADR-009)
    [sizeBytes]        BIGINT NOT NULL,
    -- ADR-009 status: 'pending' | 'active' | 'infected' — CHECK constraint in Track B (0016)
    -- Default 'pending'; transitions via AV scan result (mirrors Document.status)
    [status]           NVARCHAR(16) NOT NULL DEFAULT (N'pending'),
    -- Uploader clerkId (audit trail — mirrors Document.uploadedBy)
    [uploadedBy]       NVARCHAR(64) NULL,
    -- Standard timestamps (ADR-002)
    [createdAt]        DATETIMEOFFSET NOT NULL DEFAULT (SYSDATETIMEOFFSET()),
    [updatedAt]        DATETIMEOFFSET NOT NULL DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT [PK_MessageAttachment] PRIMARY KEY CLUSTERED ([id])
);
GO

-- FK → Message (messageId)
-- onDelete: NoAction — never cascade-delete attachment metadata when message is removed
ALTER TABLE [dbo].[MessageAttachment]
    ADD CONSTRAINT [FK_MessageAttachment_Message]
    FOREIGN KEY ([messageId])
    REFERENCES [dbo].[Message] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;
GO

-- Index on messageId for efficient attachment listing per message
-- ADR-005 §5: index supports RLS predicate evaluation via messageId → threadId
CREATE INDEX [IX_MessageAttachment_messageId]
    ON [dbo].[MessageAttachment] ([messageId]);
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- ThreadReadState table
-- ─────────────────────────────────────────────────────────────────────────────
-- Per-viewer last-read watermark (DECISION-017-A).
-- Own-row scoped: a viewer reads only their own (thread, userId) row.
-- lastReadAt: timestamp of the last read event for this viewer.
-- Unread is derived: message.createdAt > lastReadAt (TASK-017-005 will query this).
-- @@unique([threadId, userId]): at most one watermark per (thread, viewer) pair.
-- FK → Thread: onDelete NoAction.
-- FK → User (userId): the viewer. onDelete NoAction, onUpdate NoAction (Prisma cyclic-cascade guard).
-- CS-GEN-002: additive — new table.

CREATE TABLE [dbo].[ThreadReadState] (
    -- PK: NEWSEQUENTIALID() per ADR-002 convention
    [id]          UNIQUEIDENTIFIER NOT NULL DEFAULT (NEWSEQUENTIALID()),
    -- FK → Thread — the thread this read state tracks
    [threadId]    UNIQUEIDENTIFIER NOT NULL,
    -- FK → User — the viewer whose read state this row represents (CLIENT or ACCOUNTANT)
    [userId]      UNIQUEIDENTIFIER NOT NULL,
    -- DECISION-017-A: last-read timestamp watermark
    -- Unread derivation: message.createdAt > lastReadAt (TASK-017-005)
    [lastReadAt]  DATETIMEOFFSET NOT NULL,
    -- Standard timestamps (ADR-002)
    [createdAt]   DATETIMEOFFSET NOT NULL DEFAULT (SYSDATETIMEOFFSET()),
    [updatedAt]   DATETIMEOFFSET NOT NULL DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT [PK_ThreadReadState] PRIMARY KEY CLUSTERED ([id])
);
GO

-- @@unique([threadId, userId]): each (thread, viewer) pair has at most one watermark row
-- DECISION-017-A: uniqueness enforced at DB level
CREATE UNIQUE INDEX [UQ_ThreadReadState_threadId_userId]
    ON [dbo].[ThreadReadState] ([threadId], [userId]);
GO

-- FK → Thread (threadId)
-- onDelete: NoAction — never cascade-delete read state when thread is removed
ALTER TABLE [dbo].[ThreadReadState]
    ADD CONSTRAINT [FK_ThreadReadState_Thread]
    FOREIGN KEY ([threadId])
    REFERENCES [dbo].[Thread] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;
GO

-- FK → User (userId — the viewer)
-- onDelete: NoAction — never cascade-delete read state when user is removed
-- onUpdate: NoAction — Prisma cyclic-cascade guard
ALTER TABLE [dbo].[ThreadReadState]
    ADD CONSTRAINT [FK_ThreadReadState_User]
    FOREIGN KEY ([userId])
    REFERENCES [dbo].[User] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;
GO

-- Index on threadId + userId for fast watermark lookup (primary access pattern)
-- Covered by UQ_ThreadReadState_threadId_userId above — no extra index needed.
-- Index on userId alone for RLS predicate evaluation (own-row scoped — predicate keys on userId)
CREATE INDEX [IX_ThreadReadState_userId]
    ON [dbo].[ThreadReadState] ([userId]);
GO

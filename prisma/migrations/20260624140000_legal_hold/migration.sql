-- TASK-015-001: LegalHold entity — legal-hold marker table (purge blocker, ADR-018 §6)
-- ADR-002: SQL Server 2022; UNIQUEIDENTIFIER PK NEWSEQUENTIALID(); DATETIMEOFFSET timestamps; Track A Prisma migration
-- ADR-018 §6: legal hold suspends purge indefinitely (engagement-scoped + client-scoped); no auto-expire
-- ADR-005: newly scoped table → ships RLS policy + isolation test (CS-SQL-001); accountant-only access
-- BRIEF-015: Post-retention purge & legal hold — legal-hold entity + accountant-only RLS
-- CS-GEN-002: additive — new table only; no existing table modified
-- CS-GEN-003: governing ADR-018/ADR-005/ADR-002/ADR-019/DECISION-015-A cited above
-- DECISION (TASK-015-001 / IO Design): One table with a `scope` discriminator ('engagement' | 'client').
--   Exactly one of {engagementId, clientUserId} is non-null per row (CHECK in Track B policy).
--   Active hold = liftedAt IS NULL (no TTL column; holds do not auto-expire — AC-FILE-014-04).
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations in this migration. (CS-GEN-002)
--   - Creates the LegalHold table with:
--       id: UNIQUEIDENTIFIER PK NEWSEQUENTIALID() (ADR-002 PK convention)
--       scope: NVARCHAR(20) — 'engagement' | 'client' (CHECK constraint in Track B)
--       engagementId: UNIQUEIDENTIFIER NULL FK → Engagement (set when scope='engagement')
--       clientUserId: UNIQUEIDENTIFIER NULL FK → User (set when scope='client')
--       placedByClerkId: NVARCHAR(128) — accountant clerkId who placed the hold (ADR-019 §2)
--       placedAt: DATETIMEOFFSET default SYSDATETIMEOFFSET() (ADR-002)
--       liftedByClerkId: NVARCHAR(128) NULL — accountant who lifted (NULL=active)
--       liftedAt: DATETIMEOFFSET NULL — NULL=active hold (no auto-expire, AC-FILE-014-04)
--       reason: NVARCHAR(1024) NULL — optional context (CS-GEN-001: never log PII here)
--       createdAt/updatedAt: DATETIMEOFFSET (ADR-002)
--   - FKs use NoAction (no cascade-delete — legal hold records are auditable history)
--   - RLS policy (accountant-only) ships in Track B: db/policies/0013-legal-hold-policy.sql
--   - Engagement.legalHolds reverse relation added to prisma/schema.prisma (additive — CS-GEN-002)
--   - User.legalHolds reverse relation added to prisma/schema.prisma (additive — CS-GEN-002)

-- Create LegalHold table
-- ADR-002: UNIQUEIDENTIFIER PK with NEWSEQUENTIALID() for sequential insert performance
-- ADR-018 §6: legal hold entity — engagement-scoped and client-scoped holds
CREATE TABLE [dbo].[LegalHold] (
    -- PK: NEWSEQUENTIALID() per ADR-002 convention
    [id]               UNIQUEIDENTIFIER NOT NULL DEFAULT (NEWSEQUENTIALID()),
    -- Scope discriminator: 'engagement' or 'client' (CHECK constraint applied in Track B)
    -- ADR-018 §6: engagement-scoped (AC-FILE-014-01) + client-scoped (AC-FILE-014-02)
    [scope]            NVARCHAR(20) NOT NULL,
    -- FK → Engagement — non-null when scope='engagement'
    -- DECISION (TASK-015-001): exactly one of {engagementId, clientUserId} is non-null per row
    [engagementId]     UNIQUEIDENTIFIER NULL,
    -- FK → User — non-null when scope='client'
    -- DECISION: the User is the CLIENT whose engagements are all held (not the accountant)
    [clientUserId]     UNIQUEIDENTIFIER NULL,
    -- Accountant clerkId who placed the hold (server-verified identity — ADR-019 §2)
    -- AC-FILE-014-06: audit requires who placed the hold
    -- CS-GEN-001: clerkId is an identity token, not direct PII (acceptable in audit)
    [placedByClerkId]  NVARCHAR(128) NOT NULL,
    -- Placement timestamp — SYSDATETIMEOFFSET() default (ADR-002)
    -- AC-FILE-014-06: audit requires when the hold was placed
    [placedAt]         DATETIMEOFFSET NOT NULL DEFAULT (SYSDATETIMEOFFSET()),
    -- Accountant clerkId who lifted the hold (NULL = hold is still active)
    -- AC-FILE-014-07: audit requires who lifted the hold
    [liftedByClerkId]  NVARCHAR(128) NULL,
    -- Lifted timestamp — NULL = hold is still active (active hold = liftedAt IS NULL)
    -- ADR-018 §6: hold does not auto-expire; liftedAt is only set when accountant explicitly lifts
    -- AC-FILE-014-04: no auto-expire — there is NO TTL column on this table
    [liftedAt]         DATETIMEOFFSET NULL,
    -- Optional free-text reason for the hold (e.g. litigation context)
    -- CS-GEN-001: never log client PII here — reason is context note, not identity
    [reason]           NVARCHAR(1024) NULL,
    -- Standard timestamps (ADR-002)
    [createdAt]        DATETIMEOFFSET NOT NULL DEFAULT (SYSDATETIMEOFFSET()),
    [updatedAt]        DATETIMEOFFSET NOT NULL DEFAULT (SYSDATETIMEOFFSET()),

    CONSTRAINT [PK_LegalHold] PRIMARY KEY CLUSTERED ([id])
);
GO

-- FK → Engagement (engagementId — engagement-scoped hold, NoAction per DECISION)
-- onDelete: NoAction — legal hold records are auditable history, never cascade-deleted
ALTER TABLE [dbo].[LegalHold]
    ADD CONSTRAINT [FK_LegalHold_Engagement]
    FOREIGN KEY ([engagementId])
    REFERENCES [dbo].[Engagement] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;
GO

-- FK → User (clientUserId — client-scoped hold, NoAction per DECISION)
-- onDelete: NoAction — never cascade-delete a hold when the user is removed
ALTER TABLE [dbo].[LegalHold]
    ADD CONSTRAINT [FK_LegalHold_User]
    FOREIGN KEY ([clientUserId])
    REFERENCES [dbo].[User] ([id])
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;
GO

-- Index on engagementId for activeHoldsFor query performance (AC-FILE-014-01)
-- ADR-005 §5: index supports fast predicate evaluation
CREATE INDEX [IX_LegalHold_engagementId]
    ON [dbo].[LegalHold] ([engagementId])
    WHERE [engagementId] IS NOT NULL;
GO

-- Index on clientUserId for client-scoped hold lookup (AC-FILE-014-02)
-- Supports activeHoldsFor(engagementId) resolution via engagement.clientUserId
CREATE INDEX [IX_LegalHold_clientUserId]
    ON [dbo].[LegalHold] ([clientUserId])
    WHERE [clientUserId] IS NOT NULL;
GO

-- Index on liftedAt IS NULL for active-hold filtering (ADR-018 §6)
-- activeHoldsFor() filters to liftedAt IS NULL — this index speeds the purge-eligibility check
CREATE INDEX [IX_LegalHold_liftedAt_active]
    ON [dbo].[LegalHold] ([liftedAt])
    WHERE [liftedAt] IS NULL;
GO

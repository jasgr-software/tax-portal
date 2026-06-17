-- TASK-003-001: EPIC-003 inbox schema migration
-- ADR-002: SQL Server 2022; NEWSEQUENTIALID() PKs; DATETIMEOFFSET timestamps
-- ADR-004: Prisma sole ORM (Track A migration)
-- ADR-005: Notification RLS policy is applied in Track B (db/policies/0004-notification-policy.sql)
--
-- REVIEW NOTES (ADR-002 § Migration discipline — review before apply):
--   - No destructive operations in this migration.
--   - ALTER TABLE adds nullable columns to EngagementRequest — additive, no data at risk.
--   - Creates new Notification table with FK → EngagementRequest (ON DELETE SET NULL).
--   - ON DELETE SET NULL chosen so deleting a request does not cascade-delete notifications;
--     the accountant retains the notification even if the request is later pruned.
--   - NEWSEQUENTIALID() PKs per ADR-002 § Primary key convention.
--   - DATETIMEOFFSET for all timestamps per ADR-002 § Timestamp convention.
--
-- Acceptance criteria satisfied (DB layer):
--   AC-DOOR-008-04 — declineReason column retained on declined request record
--   AC-DOOR-007-04 — invitationTicket ties accepted request to the invitation
--   AC-DOOR-005-03 — Notification entity created (RLS policy applied separately in Track B)
--   AC-MSG-013-01  — Notification entity ready for population by TASK-003-003
--
-- Applied via: pnpm db:migrate (Track A: prisma migrate deploy via scripts/db-migrate.ts)
-- Workaround note: prisma migrate dev fails with P3019 in this environment (provider name
-- mismatch in schema-engine wasm vs migration_lock.toml). Migration is handcrafted and
-- applied via 'prisma migrate deploy' (same pattern as 20260615000000_init migration).

BEGIN TRY

BEGIN TRAN;

-- ─── AlterTable: EngagementRequest — add EPIC-003 decision fields ─────────────
-- AC-DOOR-008-04: declineReason — free-text reason retained on the declined request
-- AC-DOOR-007-04: invitationTicket — ties the acceptance invitation back to the request
-- decidedAt      — timestamp of the accept/decline decision
ALTER TABLE [dbo].[EngagementRequest]
    ADD [declineReason]    NVARCHAR(max)    NULL,
        [invitationTicket] NVARCHAR(200)    NULL,
        [decidedAt]        DATETIMEOFFSET   NULL;

-- ─── CreateTable: Notification ────────────────────────────────────────────────
-- AC-DOOR-005-03, AC-MSG-013-01: accountant-scoped notification entity.
-- RLS policy (sec.pol_Notification) applied separately in Track B.
-- Nullable FK → EngagementRequest (ON DELETE SET NULL — retain notification when request deleted).
CREATE TABLE [dbo].[Notification] (
    [id]                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT [Notification_id_df] DEFAULT NEWSEQUENTIALID(),
    -- type: discriminator e.g. 'new_engagement_request' (AC-MSG-013-01)
    [type]                NVARCHAR(50)     NOT NULL,
    -- title: short display title shown in the accountant notification feed
    [title]               NVARCHAR(200)    NOT NULL,
    -- body: optional richer detail text
    [body]                NVARCHAR(max)    NULL,
    -- readAt: NULL = unread; non-null = timestamp when accountant marked it read
    [readAt]              DATETIMEOFFSET   NULL,
    -- FK → EngagementRequest (nullable; ON DELETE SET NULL)
    [engagementRequestId] UNIQUEIDENTIFIER NULL,
    [createdAt]           DATETIMEOFFSET   NOT NULL CONSTRAINT [Notification_createdAt_df] DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT [Notification_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey: Notification → EngagementRequest (ON DELETE SET NULL)
ALTER TABLE [dbo].[Notification]
    ADD CONSTRAINT [Notification_engagementRequestId_fkey]
    FOREIGN KEY ([engagementRequestId])
    REFERENCES [dbo].[EngagementRequest]([id])
    ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

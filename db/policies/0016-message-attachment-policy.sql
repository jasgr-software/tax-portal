-- db/policies/0016-message-attachment-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the MessageAttachment client-isolation security policy (BRIEF-017 / TASK-017-001).
-- CS-SQL-001: every client-scoped table ships a SECURITY POLICY + RLS integration test.
-- CS-SQL-002: entity schema on Prisma track; security policies on raw-SQL track (this file).
-- CS-SQL-003: predicate is an inline TVF, shallow, admin/accountant-first, fail-closed.
-- CS-GEN-002: additive — new policy and table; no existing policy or model modified.
-- CS-GEN-003: governing keys cited throughout.
--
-- ADR-005 § Tables-in-scope:
--   "MessageAttachment — CLIENT-scoped and CLIENT-isolated via Message → Thread.
--    A CLIENT can read attachments in messages they have access to.
--    ACCOUNTANT reads all; admin pool is always RLS-exempt."
--
-- Predicate shape:
--   Reaches participation via Message → Thread (two JOINs from MessageAttachment).
--   ADR-005 §5 Mitigation C: shallow — MessageAttachment → Message → Thread → (Engagement/EP/User).
--   Total JOINs per branch: ≤4 (MessageAttachment→Message, Message→Thread, Thread→{Engagement,EP,User}).
--   This is the maximum permitted depth for derived isolation chains (ADR-005 §5).
--
-- ADR-003 §5: Null SESSION_CONTEXT → all branches fail → ZERO rows (fail-closed).
--
-- Also adds the status CHECK constraint for MessageAttachment ('pending'|'active'|'infected').
-- Mirrors 0007-document-policy.sql PART 0 (same three-value AV scan lifecycle — ADR-009).
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
--
-- Referenced by: packages/db/src/message-attachment.client-isolation.rls.test.ts
--                (HARD GATE, ADR-005 §6). // CS-SQL-001

-- ─── CHECK constraint: MessageAttachment.status ───────────────────────────────
-- Mirrors Document.status three-value enum (ADR-009 AV scan lifecycle).
-- Track A (Prisma) cannot express DB-level CHECK constraints — therefore it lives here (Track B).
-- Idempotent: only add if not already present.
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'MessageAttachment_status_chk'
      AND parent_object_id = OBJECT_ID('dbo.MessageAttachment')
)
BEGIN
    ALTER TABLE [dbo].[MessageAttachment]
        ADD CONSTRAINT [MessageAttachment_status_chk]
        CHECK ([status] IN (N'pending', N'active', N'infected'));
END
GO

-- ─── Drop live security policy before altering the function ──────────────────
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_MessageAttachment' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_MessageAttachment];
GO

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_message_attachment_access: returns (1 AS allowed) when the caller can access
-- the MessageAttachment row, empty otherwise.
-- @attachmentMessageId: the messageId column of the MessageAttachment row.
--   The isolation boundary is the parent Thread (reached via Message).
--
-- Four branches (ADR-005 §2 skeleton, reaching Message → Thread):
--   1. Admin principal always passes.
--   2. ACCOUNTANT role always passes.
--   3a-owner. CLIENT engagement-thread owner branch (via Message → Thread → Engagement).
--   3a-participant. CLIENT engagement-thread participant branch (via Message → Thread → EngagementParticipant).
--   3b. CLIENT general-thread branch (via Message → Thread.clientUserId → User).
--
-- CS-SQL-003: shallow, ITVF, admin/accountant-first, fail-closed. // CS-SQL-003
-- ADR-005 §5: each branch uses at most 4 JOINs (MessageAttachment→Message→Thread→{source}).
-- ADR-005 // ADR-003 // DECISION-017-A // CS-SQL-001 // CS-GEN-002 // CS-GEN-003
CREATE OR ALTER FUNCTION [sec].[fn_message_attachment_access](
    @attachmentMessageId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (RLS-exempt — ADR-005 §2). // CS-SQL-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role always passes — full attachment visibility. // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3a-owner. CLIENT engagement-thread owner branch.
        --   MessageAttachment.messageId → Message.threadId → Thread.engagementId
        --   → Engagement.clientUserId → User.clerkId.
        --   Mirrors fn_message_access 3a-owner shape. CS-SQL-003: reuse participant logic.
        --   ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 (fail-closed).
        --   // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-017-A
        OR EXISTS (
            SELECT 1 FROM [dbo].[Message] m
            JOIN [dbo].[Thread] t ON t.[id] = m.[threadId]
            JOIN [dbo].[Engagement] e ON e.[id] = t.[engagementId]
            JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
            WHERE m.[id] = @attachmentMessageId
              AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
        )

        -- 3a-participant. CLIENT engagement-thread participant branch.
        --   MessageAttachment.messageId → Message.threadId → Thread.engagementId
        --   → EngagementParticipant.userId → User.clerkId.
        --   Mirrors fn_message_access 3a-participant shape. CS-SQL-003.
        --   ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 (fail-closed).
        --   // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-017-A
        OR EXISTS (
            SELECT 1 FROM [dbo].[Message] m
            JOIN [dbo].[Thread] t ON t.[id] = m.[threadId]
            JOIN [dbo].[EngagementParticipant] ep ON ep.[engagementId] = t.[engagementId]
            JOIN [dbo].[User] u ON u.[id] = ep.[userId]
            WHERE m.[id] = @attachmentMessageId
              AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
        )

        -- 3b. CLIENT general-thread branch.
        --   MessageAttachment.messageId → Message.threadId → Thread.clientUserId → User.clerkId.
        --   Mirrors fn_message_access 3b shape. DECISION-017-A.
        --   ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0.
        --   // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-017-A
        OR EXISTS (
            SELECT 1 FROM [dbo].[Message] m
            JOIN [dbo].[Thread] t ON t.[id] = m.[threadId]
            JOIN [dbo].[User] u ON u.[id] = t.[clientUserId]
            WHERE m.[id] = @attachmentMessageId
              AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
        )
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
-- FILTER PREDICATE: CLIENT sees only attachments in messages they have access to.
-- BLOCK predicates: defence-in-depth for request pool write attempts.
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3.
-- // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
CREATE SECURITY POLICY [sec].[pol_MessageAttachment]
    ADD FILTER PREDICATE [sec].[fn_message_attachment_access]([messageId])
        ON [dbo].[MessageAttachment]
    , ADD BLOCK PREDICATE [sec].[fn_message_attachment_access]([messageId])
        ON [dbo].[MessageAttachment] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_message_attachment_access]([messageId])
        ON [dbo].[MessageAttachment] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_message_attachment_access]([messageId])
        ON [dbo].[MessageAttachment] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_message_attachment_access]([messageId])
        ON [dbo].[MessageAttachment] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

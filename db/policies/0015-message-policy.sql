-- db/policies/0015-message-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the Message client-isolation security policy (BRIEF-017 / TASK-017-001).
-- CS-SQL-001: every client-scoped table ships a SECURITY POLICY + RLS integration test.
-- CS-SQL-002: entity schema on Prisma track; security policies on raw-SQL track (this file).
-- CS-SQL-003: predicate is an inline TVF, shallow, admin/accountant-first, fail-closed.
-- CS-GEN-002: additive — new policy and table; no existing policy or model modified.
-- CS-GEN-003: governing keys cited throughout.
--
-- ADR-005 § Tables-in-scope:
--   "Message — CLIENT-scoped and CLIENT-isolated via parent Thread.
--    A CLIENT (owner or participant of the parent engagement thread, or the associated client
--    of the parent general thread) can read messages in their thread.
--    ACCOUNTANT reads all; admin pool is always RLS-exempt."
--
-- Predicate shape:
--   Reaches participation through the parent Thread (one JOIN to Thread, then same
--   fn_thread_access logic — keep shallow per ADR-005 §5).
--   The Thread carries engagementId and clientUserId; the Message predicate joins Message → Thread
--   and applies the same four-branch logic as fn_thread_access.
--   ADR-005 §5 Mitigation C: shallow — ≤3 JOINs (Message → Thread → User → Engagement/EP).
--
-- ADR-003 §5: Null SESSION_CONTEXT → all branches fail → empty result → ZERO rows
-- (fail-closed, no error).
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
--
-- Referenced by: packages/db/src/message.client-isolation.rls.test.ts
--                (HARD GATE, ADR-005 §6). // CS-SQL-001

-- ─── Drop live security policy before altering the function ──────────────────
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_Message' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_Message];
GO

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_message_access: returns (1 AS allowed) when the caller can access
-- the Message row, empty otherwise.
-- @messageThreadId: the threadId column of the Message row.
--   The isolation boundary is the parent Thread (not a self-join on the message id).
--   The predicate joins to Thread to get engagementId + clientUserId, then applies
--   the same four-branch logic as fn_thread_access.
--
-- Four branches (ADR-005 §2 skeleton, reaching Thread):
--   1. Admin principal always passes.
--   2. ACCOUNTANT role always passes.
--   3a-owner. CLIENT engagement-thread owner branch (via Thread → Engagement).
--   3a-participant. CLIENT engagement-thread participant branch (via Thread → EngagementParticipant).
--   3b. CLIENT general-thread branch (via Thread.clientUserId → User).
--
-- ADR-005 §5 Mitigation C: each branch touches ≤2 JOINs beyond the Thread join.
-- CS-SQL-003: shallow, ITVF, admin/accountant-first, fail-closed. // CS-SQL-003
-- AC-MSG-002-02: messages visible only to thread participants (substrate). // AC-MSG-002-02
-- ADR-005 // ADR-003 // DECISION-017-A // CS-SQL-001 // CS-GEN-002 // CS-GEN-003
CREATE OR ALTER FUNCTION [sec].[fn_message_access](
    @messageThreadId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron — RLS-exempt)
        --    IS_MEMBER('app_admin_role') = 1 — ADR-005 §2. // CS-SQL-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full message visibility
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3a-owner. CLIENT engagement-thread owner branch.
        --   Message.threadId → Thread.engagementId → Engagement.clientUserId → User.clerkId.
        --   Mirrors fn_thread_access 3a-owner EXISTS shape. CS-SQL-003: reuse participant logic.
        --   When Thread.engagementId IS NULL (general thread), EXISTS returns false → falls to 3a-participant.
        --   ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 (fail-closed).
        --   // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-017-A // AC-MSG-002-02
        OR EXISTS (
            SELECT 1 FROM [dbo].[Thread] t
            JOIN [dbo].[Engagement] e ON e.[id] = t.[engagementId]
            JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
            WHERE t.[id] = @messageThreadId
              AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
        )

        -- 3a-participant. CLIENT engagement-thread participant branch.
        --   Message.threadId → Thread.engagementId → EngagementParticipant.userId → User.clerkId.
        --   Mirrors fn_thread_access 3a-participant EXISTS shape. CS-SQL-003.
        --   When Thread.engagementId IS NULL (general thread), EXISTS returns false → falls to 3b.
        --   ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 (fail-closed).
        --   // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-017-A // AC-MSG-002-02
        OR EXISTS (
            SELECT 1 FROM [dbo].[Thread] t
            JOIN [dbo].[EngagementParticipant] ep ON ep.[engagementId] = t.[engagementId]
            JOIN [dbo].[User] u ON u.[id] = ep.[userId]
            WHERE t.[id] = @messageThreadId
              AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
        )

        -- 3b. CLIENT general-thread branch.
        --   Message.threadId → Thread.clientUserId → User.clerkId.
        --   Mirrors fn_thread_access 3b EXISTS shape. DECISION-017-A.
        --   When Thread.clientUserId IS NULL (engagement thread), EXISTS returns false → 0.
        --   ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0.
        --   // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-017-A // AC-MSG-002-02
        OR EXISTS (
            SELECT 1 FROM [dbo].[Thread] t
            JOIN [dbo].[User] u ON u.[id] = t.[clientUserId]
            WHERE t.[id] = @messageThreadId
              AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
        )
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
-- FILTER PREDICATE: read paths via request pool (app_user_role) are filtered per-row.
--   CLIENT sees only messages in their threads. ACCOUNTANT sees all; admin sees all.
-- BLOCK predicates: defence-in-depth for request pool write attempts.
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3.
-- // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A // AC-MSG-002-02
CREATE SECURITY POLICY [sec].[pol_Message]
    ADD FILTER PREDICATE [sec].[fn_message_access]([threadId])
        ON [dbo].[Message]
    , ADD BLOCK PREDICATE [sec].[fn_message_access]([threadId])
        ON [dbo].[Message] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_message_access]([threadId])
        ON [dbo].[Message] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_message_access]([threadId])
        ON [dbo].[Message] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_message_access]([threadId])
        ON [dbo].[Message] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

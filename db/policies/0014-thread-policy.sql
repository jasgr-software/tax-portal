-- db/policies/0014-thread-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the Thread client-isolation security policy (BRIEF-017 / TASK-017-001).
-- CS-SQL-001: every client-scoped table ships a SECURITY POLICY + RLS integration test.
-- CS-SQL-002: entity schema on Prisma track; security policies on raw-SQL track (this file).
-- CS-SQL-003: predicate is an inline TVF, shallow, admin/accountant-first, fail-closed.
-- CS-GEN-002: additive — new policy and table; no existing policy or model modified.
-- CS-GEN-003: governing keys cited throughout.
--
-- ADR-005 § Tables-in-scope:
--   "Thread — engagement threads: participant (owner or EngagementParticipant) can read;
--             general threads: the associated client (Thread.clientUserId → User.clerkId) can read.
--             ACCOUNTANT reads all; admin pool is always RLS-exempt."
--
-- DECISION-017-A (binding spec):
--   Thread.kind: 'engagement' | 'general' — CHECK constraint below.
--   Exactly one of {engagementId, clientUserId} is non-null (CHECK constraint below).
--   Thread.status: 'active' | 'archived' — CHECK constraint below.
--   One-thread-per-engagement: @@unique([engagementId]) is in Track A (Prisma @@unique index).
--
-- Predicate shape (four branches, extending the ADR-005 §2 skeleton):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--   3a. CLIENT engagement-thread branch:
--         Reuses fn_engagement_access participant logic (CS-SQL-003 — do NOT re-derive):
--         SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId
--         AND Engagement.id = Thread.engagementId
--         OR SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id → EngagementParticipant.userId
--         WHERE ep.engagementId = Thread.engagementId.
--         Mirror the 0005/0007/0009 EXISTS shape — NOT a call to fn_engagement_access directly
--         (TVF-within-ITVF is blocked by SCHEMABINDING — both must be schema-bound or neither,
--          and cross-ITVF inline expansion is not available at SECURITY POLICY predicate scope).
--         The business logic is identical to fn_engagement_access — owner OR participant EXISTS.
--   3b. CLIENT general-thread branch:
--         Thread.clientUserId → User.clerkId = SESSION_CONTEXT('clerk_user_id').
--         The associated-client branch: the user whose User.id = Thread.clientUserId can read it.
--         ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed).
--         NULL Thread.clientUserId → JOIN fails → EXISTS empty → 0 rows.
--
-- ADR-003 §5: Null SESSION_CONTEXT → all branches fail → empty result → ZERO rows
-- (fail-closed, no error).
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines it (Mitigation B).
--   - Predicate is shallow: parallel EXISTS branches; each touches ≤2 JOINs (Mitigation C).
--
-- CHECK constraints for Thread.kind, Thread.status, and the XOR (engagementId/clientUserId):
--   These live here (Track B) because Prisma cannot express DB-level CHECK constraints (ADR-002).
--   Applied idempotently before the FILTER/BLOCK policies.
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
--
-- Referenced by: packages/db/src/thread.client-isolation.rls.test.ts
--                (HARD GATE, ADR-005 §6). // CS-SQL-001

-- ─── CHECK constraints (Track B — Prisma cannot express DB-level CHECKs) ──────

-- Thread.kind: must be 'engagement' or 'general' (DECISION-017-A)
-- Idempotent: only add if not already present.
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'Thread_kind_chk'
      AND parent_object_id = OBJECT_ID('dbo.Thread')
)
BEGIN
    ALTER TABLE [dbo].[Thread]
        ADD CONSTRAINT [Thread_kind_chk]
        CHECK ([kind] IN (N'engagement', N'general'));
END
GO

-- Thread.status: must be 'active' or 'archived' (DECISION-017-A)
-- Idempotent: only add if not already present.
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'Thread_status_chk'
      AND parent_object_id = OBJECT_ID('dbo.Thread')
)
BEGIN
    ALTER TABLE [dbo].[Thread]
        ADD CONSTRAINT [Thread_status_chk]
        CHECK ([status] IN (N'active', N'archived'));
END
GO

-- Thread XOR constraint: exactly one of {engagementId, clientUserId} is non-null (DECISION-017-A)
-- Ensures engagement threads have engagementId and general threads have clientUserId.
-- Idempotent: only add if not already present.
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'Thread_engagement_or_client_chk'
      AND parent_object_id = OBJECT_ID('dbo.Thread')
)
BEGIN
    ALTER TABLE [dbo].[Thread]
        ADD CONSTRAINT [Thread_engagement_or_client_chk]
        CHECK (
            ([engagementId] IS NOT NULL AND [clientUserId] IS NULL)
            OR ([engagementId] IS NULL AND [clientUserId] IS NOT NULL)
        );
END
GO

-- ─── Drop live security policy before altering the function ──────────────────
-- SQL Server prevents CREATE OR ALTER of a function referenced by a live SECURITY POLICY.
-- Drop the policy first (idempotent), alter/create the function, then recreate in the next batch.
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_Thread' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_Thread];
GO

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_thread_access: returns (1 AS allowed) when the caller can access
-- the Thread row, empty otherwise.
-- @threadEngagementId: the engagementId column of the Thread row (NULL for general threads).
-- @threadClientUserId: the clientUserId column of the Thread row (NULL for engagement threads).
--
-- Four branches (ADR-005 §2 skeleton extended for two Thread kinds):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes. // CS-SQL-003
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes. // CS-SQL-003
--   3a. CLIENT engagement-thread branch — reuses fn_engagement_access participant logic (CS-SQL-003):
--         Owner branch: SESSION_CONTEXT → User.clerkId → User.id = Engagement.clientUserId
--           AND Engagement.id = @threadEngagementId.
--         Participant branch: SESSION_CONTEXT → User.clerkId → User.id → EngagementParticipant.userId
--           WHERE ep.engagementId = @threadEngagementId.
--         When @threadEngagementId IS NULL (general thread) → EXISTS returns false → 0 (correct).
--         ADR-003 §5: null SESSION_CONTEXT → CAST(NULL...) = no match → EXISTS empty → 0.
--         DECISION-A (Engagement): NULL Engagement.clientUserId → EXISTS 3a-owner false → 3a-participant checked.
--   3b. CLIENT general-thread branch:
--         Thread.clientUserId → User.clerkId = SESSION_CONTEXT('clerk_user_id').
--         When @threadClientUserId IS NULL (engagement thread) → EXISTS false → 0 (correct).
--         ADR-003 §5: null SESSION_CONTEXT → no match → EXISTS empty → 0.
--
-- CS-SQL-003: inline TVF, SCHEMABINDING, admin/accountant-first, fail-closed. // CS-SQL-003
-- CS-SQL-003: engagement-thread CLIENT branch mirrors fn_engagement_access EXISTS shape
--   (CS-SQL-003 mandate: reuse the participant logic, do not re-derive). // CS-SQL-003
-- AC-MSG-001-02: engagement thread visible only to participants (substrate). // AC-MSG-001-02
-- AC-MSG-006-02: general thread visible only to associated client + accountant. // AC-MSG-006-02
-- ADR-005 // ADR-003 // DECISION-017-A // CS-SQL-001 // CS-GEN-002 // CS-GEN-003
CREATE OR ALTER FUNCTION [sec].[fn_thread_access](
    @threadEngagementId UNIQUEIDENTIFIER,
    @threadClientUserId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron — RLS-exempt)
        --    IS_MEMBER('app_admin_role') = 1 — ADR-005 §2. // CS-SQL-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full thread visibility
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3a-owner. CLIENT engagement-thread owner branch (mirrors fn_engagement_access 3a).
        --   CS-SQL-003: reuse the fn_engagement_access participant logic — do NOT re-derive.
        --   SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId
        --   AND Engagement.id = @threadEngagementId (the engagementId of the Thread row).
        --   When @threadEngagementId IS NULL (general thread), EXISTS returns false → falls to 3a-participant.
        --   DECISION-A: NULL Engagement.clientUserId → EXISTS false → checked against 3a-participant.
        --   ADR-003 §5: null SESSION_CONTEXT → CAST(NULL...) matches no clerkId → EXISTS empty → 0.
        --   // CS-SQL-003 // ADR-005 // ADR-003 // AC-MSG-001-02
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND e.[id] = @threadEngagementId
        )

        -- 3a-participant. CLIENT engagement-thread participant branch (mirrors fn_engagement_access 3b).
        --   CS-SQL-003: mirror the 0005 fn_engagement_access participant EXISTS shape exactly.
        --   SESSION_CONTEXT → User.clerkId → User.id → EngagementParticipant.userId
        --   WHERE ep.engagementId = @threadEngagementId (scoped to THIS engagement only).
        --   When @threadEngagementId IS NULL (general thread), EXISTS returns false → falls to 3b.
        --   ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 (fail-closed).
        --   // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-017-A // AC-MSG-001-02
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND ep.[engagementId] = @threadEngagementId
        )

        -- 3b. CLIENT general-thread branch — the associated client reads their own general thread.
        --   Thread.clientUserId → User.id = @threadClientUserId
        --   → User.clerkId = SESSION_CONTEXT('clerk_user_id').
        --   When @threadClientUserId IS NULL (engagement thread), EXISTS returns false → 0 (correct).
        --   ADR-003 §5: null SESSION_CONTEXT → no match → EXISTS empty → 0.
        --   DECISION-017-A: general thread is identified by Thread.clientUserId (not engagementId).
        --   // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-017-A // AC-MSG-006-02
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND u.[id] = @threadClientUserId
        )
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
-- Policy was already dropped in the first batch (required to allow fn create/alter).
-- This batch simply creates it against the predicate function.
-- FILTER PREDICATE: read paths via request pool (app_user_role) are filtered per-row.
--   CLIENT sees only their own threads (engagement: owner+participant; general: associated client).
--   ACCOUNTANT sees all; admin sees all.
-- BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE):
--   Defence-in-depth — request pool cannot insert/update/delete thread rows outside predicate scope.
--   Thread creation runs via the admin pool (no direct client write path).
--
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3.
-- // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A // AC-MSG-001-02 // AC-MSG-006-02
CREATE SECURITY POLICY [sec].[pol_Thread]
    -- FILTER predicate: controls SELECT visibility (fail-closed for null SESSION_CONTEXT)
    ADD FILTER PREDICATE [sec].[fn_thread_access]([engagementId], [clientUserId])
        ON [dbo].[Thread]
    -- BLOCK predicates: defence-in-depth — request pool cannot insert/update/delete
    -- thread rows outside the predicate's scope.
    , ADD BLOCK PREDICATE [sec].[fn_thread_access]([engagementId], [clientUserId])
        ON [dbo].[Thread] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_thread_access]([engagementId], [clientUserId])
        ON [dbo].[Thread] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_thread_access]([engagementId], [clientUserId])
        ON [dbo].[Thread] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_thread_access]([engagementId], [clientUserId])
        ON [dbo].[Thread] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

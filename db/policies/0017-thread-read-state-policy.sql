-- db/policies/0017-thread-read-state-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the ThreadReadState per-viewer own-row isolation security policy
-- (BRIEF-017 / TASK-017-001).
-- CS-SQL-001: every client-scoped table ships a SECURITY POLICY + RLS integration test.
-- CS-SQL-002: entity schema on Prisma track; security policies on raw-SQL track (this file).
-- CS-SQL-003: predicate is an inline TVF, shallow, admin/accountant-first, fail-closed.
-- CS-GEN-002: additive — new policy and table; no existing policy or model modified.
-- CS-GEN-003: governing keys cited throughout.
--
-- ADR-005 § Tables-in-scope:
--   "ThreadReadState — per-(thread,viewer) own-row scoped.
--    A viewer reads only their own read-state row for a thread.
--    ACCOUNTANT reads all; admin pool is always RLS-exempt."
--
-- DECISION-017-A (binding spec): per-viewer last-read watermark.
--   Each viewer has at most one row per thread (@@unique([threadId, userId])).
--   The predicate keys on ThreadReadState.userId → User.clerkId = SESSION_CONTEXT.
--   Own-row scoped: viewer A cannot read viewer B's ThreadReadState row for the same thread.
--   This prevents read-state leakage across viewers (e.g. CLIENT-A cannot see CLIENT-B's
--   last-read timestamp, which could leak activity patterns).
--
-- Predicate shape (three branches):
--   1. Admin principal always passes.
--   2. ACCOUNTANT role always passes.
--   3. CLIENT own-row branch: ThreadReadState.userId → User.clerkId = SESSION_CONTEXT.
--      Only the viewer whose userId is in the row can read it.
--      ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 (fail-closed).
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines it (Mitigation B).
--   - Predicate is shallow: one JOIN (User table only). Matches EngagementParticipant precedent.
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
--
-- Referenced by: packages/db/src/thread-read-state.client-isolation.rls.test.ts
--                (HARD GATE, ADR-005 §6). // CS-SQL-001

-- ─── Drop live security policy before altering the function ──────────────────
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_ThreadReadState' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_ThreadReadState];
GO

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_thread_read_state_access: returns (1 AS allowed) when the caller can access
-- the ThreadReadState row, empty otherwise.
-- @readStateUserId: the userId column of the ThreadReadState row.
--   The isolation boundary is the viewer's own row (not the thread — any participant can
--   have a read state, but each viewer's row is private to them).
--
-- Three branches (ADR-005 §2 skeleton, own-row scoped):
--   1. Admin principal always passes.
--   2. ACCOUNTANT role always passes — ACCOUNTANT may need to see read-state for admin queries.
--   3. CLIENT own-row branch:
--        SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = @readStateUserId.
--        A viewer reads only rows where their User.id = ThreadReadState.userId.
--        ADR-003 §5: null SESSION_CONTEXT → CAST(NULL...) matches no clerkId → EXISTS empty → 0.
--
-- CS-SQL-003: shallow (one JOIN only), ITVF, admin/accountant-first, fail-closed. // CS-SQL-003
-- DECISION-017-A: per-viewer own-row scoping (no cross-viewer leakage). // DECISION-017-A
-- ADR-005 // ADR-003 // CS-SQL-001 // CS-GEN-002 // CS-GEN-003
CREATE OR ALTER FUNCTION [sec].[fn_thread_read_state_access](
    @readStateUserId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron — RLS-exempt)
        --    IS_MEMBER('app_admin_role') = 1 — ADR-005 §2. // CS-SQL-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full read-state visibility
        --    (needed for admin queries / unread counts across threads).
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT own-row branch — a viewer reads only their own read-state row.
        --    SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = @readStateUserId
        --    (the userId of the ThreadReadState row being evaluated).
        --    A CLIENT whose User.id ≠ @readStateUserId sees ZERO rows for that row.
        --    ADR-005 §2: CLIENT branch joins via User.clerkId (stable Clerk user ID string).
        --    ADR-005 §5 Mitigation C: shallow — one JOIN only (User table).
        --    ADR-003 §5: null SESSION_CONTEXT('clerk_user_id') → CAST(NULL ...) = any non-null
        --    string is false → EXISTS empty → 0 rows (fail-closed).
        --    DECISION-017-A: per-viewer own-row scoping prevents cross-viewer read-state leakage.
        --    // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-017-A
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND u.[id] = @readStateUserId
        )
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
-- FILTER PREDICATE: a viewer reads only their own (thread, viewer) read-state row.
-- BLOCK predicates: defence-in-depth for request pool write attempts.
--   Read-state writes will go via the request pool (own-row update when a viewer marks read).
--   The BLOCK predicate allows a viewer to INSERT/UPDATE their own row (predicate passes for
--   the viewer's userId). Another viewer's row fails the predicate — BLOCK fires (error 33504).
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3.
-- // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
CREATE SECURITY POLICY [sec].[pol_ThreadReadState]
    -- FILTER predicate: controls SELECT visibility — viewer reads only their own rows
    ADD FILTER PREDICATE [sec].[fn_thread_read_state_access]([userId])
        ON [dbo].[ThreadReadState]
    -- BLOCK predicates: defence-in-depth
    , ADD BLOCK PREDICATE [sec].[fn_thread_read_state_access]([userId])
        ON [dbo].[ThreadReadState] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_thread_read_state_access]([userId])
        ON [dbo].[ThreadReadState] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_thread_read_state_access]([userId])
        ON [dbo].[ThreadReadState] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_thread_read_state_access]([userId])
        ON [dbo].[ThreadReadState] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

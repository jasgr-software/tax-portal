-- db/policies/0009-engagement-participant-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the EngagementParticipant client-isolation security policy (BRIEF-012 / TASK-012-001).
-- CS-SQL-001: every client-scoped table ships a SECURITY POLICY + RLS integration test.
-- CS-SQL-003: predicate is an inline TVF, shallow, admin/accountant-first, fail-closed.
-- CS-GEN-002: additive — new policy and table; no existing policy or model modified.
-- CS-GEN-003: governing keys cited throughout.
--
-- ADR-005 § Tables-in-scope:
--   "EngagementParticipant — CLIENT sees only their own participant rows (rows where they are the participant);
--    ACCOUNTANT sees all; admin pool is always RLS-exempt."
--
-- Predicate shape (three branches, matching ADR-005 §2 skeleton):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--   3. CLIENT participant branch:
--        SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = EngagementParticipant.userId
--        The join must reference @participantId (the row under evaluation).
--        Per ADR-005 §2 + ADR-005 §5 Mitigation B: ITVF + SCHEMABINDING so the optimizer inlines.
--
-- ADR-003 §5: Null SESSION_CONTEXT → all three branches fail → empty result → ZERO rows
-- (fail-closed, no error).
--
-- KEY POINTS:
--   - FILTER predicate: read paths via request pool (app_user_role) are filtered per-row.
--     CLIENT sees only their own participant rows; ACCOUNTANT sees all; admin sees all.
--   - BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE):
--     Participant linking runs through the admin pool (TASK-012-003 accountant-initiated path).
--     The BLOCK predicate is defence-in-depth for any request-pool write attempts.
--   - ADR-003 §5: null SESSION_CONTEXT('clerk_user_id') → u.clerkId comparison yields
--     no match (CAST(NULL ...) = any non-null string is false) → EXISTS empty → 0 rows.
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines it (Mitigation B).
--   - Predicate is shallow: one JOIN (User table only) to reach the ownership boundary (Mitigation C).
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
--
-- Referenced by: packages/db/src/engagement-participant.client-isolation.rls.test.ts
--                (HARD GATE, ADR-005 §6). // CS-SQL-001

-- ─── Drop live security policy before altering the function ──────────────────
-- SQL Server prevents CREATE OR ALTER of a function referenced by a live SECURITY POLICY.
-- Drop the policy first (idempotent), alter the function, then recreate in the next batch.
-- This ensures idempotent re-apply (pnpm db:policies:apply) works correctly.
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_EngagementParticipant' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_EngagementParticipant];
GO

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_engagement_participant_access: returns (1 AS allowed) when the caller can access
-- the EngagementParticipant row, empty otherwise.
-- @participantId: the id of the EngagementParticipant row being evaluated by the FILTER predicate.
CREATE OR ALTER FUNCTION [sec].[fn_engagement_participant_access](
    @participantId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron, admin pool writes)
        --    IS_MEMBER('app_admin_role') = 1 — RLS-exempt (ADR-005 §2). // CS-SQL-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full participant visibility
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT participant branch — a CLIENT reads only their own participant rows.
        --    SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = ep.userId
        --    ADR-005 §2: CLIENT branch joins via User.clerkId (stable Clerk user ID string).
        --    ADR-005 §5 Mitigation C: shallow — one JOIN only (User table).
        --    ADR-003 §5: null SESSION_CONTEXT('clerk_user_id') → CAST(NULL ...) = any non-null
        --    string is false → EXISTS empty → 0 rows (fail-closed).
        --    // CS-SQL-003 // ADR-005 // ADR-003
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND ep.[id] = @participantId
        )
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
-- Policy was already dropped in the first batch (required to allow fn alter/create).
-- This batch simply creates it against the predicate function.
CREATE SECURITY POLICY [sec].[pol_EngagementParticipant]
    -- FILTER predicate: controls SELECT visibility (fail-closed for null SESSION_CONTEXT)
    -- A CLIENT sees only their own participant rows (userId = their User.id).
    ADD FILTER PREDICATE [sec].[fn_engagement_participant_access]([id])
        ON [dbo].[EngagementParticipant]
    -- BLOCK predicates: defence-in-depth — request pool cannot insert/update/delete
    -- participant rows outside the predicate's scope.
    -- Participant linking runs through the admin pool (TASK-012-003) — admin bypasses BLOCK.
    , ADD BLOCK PREDICATE [sec].[fn_engagement_participant_access]([id])
        ON [dbo].[EngagementParticipant] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_engagement_participant_access]([id])
        ON [dbo].[EngagementParticipant] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_engagement_participant_access]([id])
        ON [dbo].[EngagementParticipant] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_engagement_participant_access]([id])
        ON [dbo].[EngagementParticipant] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

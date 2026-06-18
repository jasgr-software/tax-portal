-- db/policies/0005-engagement-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the Engagement client-ownership security policy (EPIC-005 / TASK-005-001).
-- This is the FIRST client-owned-rows policy — it adds the live CLIENT-ownership branch
-- that 0001 (EngagementRequest) and 0004 (Notification) stubbed out.
--
-- ADR-005 § Tables-in-scope:
--   "Engagement — CLIENT sees engagements they own or participate in."
--
-- Predicate shape (three branches, matching ADR-005 §2 skeleton):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--   3. CLIENT ownership branch (FIRST LIVE CLIENT-OWNERSHIP BRANCH IN THE SYSTEM):
--        SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId
--        The ownership join must reference @engagementId (the row under evaluation).
--        Per ADR-005 §2 + ADR-005 §5 Mitigation B: ITVF + SCHEMABINDING so the optimizer inlines.
--
-- ADR-003 §5: Null SESSION_CONTEXT → all three branches fail → empty result → ZERO rows
-- (fail-closed, no error).
--
-- KEY POINTS:
--   - FILTER predicate: read paths via request pool (app_user_role) are filtered per-row.
--     CLIENT sees only their own engagement; ACCOUNTANT sees all; admin sees all.
--   - BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE):
--     Engagement creation runs through the admin pool inside withAuditTransaction (TASK-005-003).
--     The BLOCK predicate is defence-in-depth for any request-pool write attempts.
--   - DECISION-A: clientUserId is nullable (Engagement created before the prospect signs up).
--     When clientUserId IS NULL, the CLIENT branch's EXISTS returns false → 0 rows (correct:
--     an unassigned engagement is invisible to all CLIENTs until back-fill).
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines it (Mitigation B).
--   - Predicate is shallow: one JOIN (User table only) to reach the ownership boundary (Mitigation C).
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_engagement_access: returns (1 AS allowed) when the caller can access
-- the engagement row, empty otherwise.
-- @engagementId: the id of the Engagement row being evaluated by the FILTER predicate.
CREATE OR ALTER FUNCTION [sec].[fn_engagement_access](
    @engagementId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron, accept-time create via adminDb)
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full engagement visibility
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT ownership branch — FIRST LIVE CLIENT-OWNERSHIP BRANCH IN THE SYSTEM (EPIC-005)
        --    SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId
        --    ADR-005 §2: CLIENT branch joins via User.clerkId (stable Clerk user ID string).
        --    ADR-005 §5 Mitigation C: shallow — one JOIN only (User table).
        --    DECISION-A: when clientUserId IS NULL, EXISTS returns false → 0 rows (correct:
        --    unassigned engagement is invisible to all CLIENTs until back-fill).
        --    ADR-003 §5: null SESSION_CONTEXT('clerk_user_id') → u.clerkId comparison yields
        --    no match (CAST(NULL ...) = any non-null string is false) → EXISTS empty → 0 rows.
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND e.[id] = @engagementId
        )
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_Engagement' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_Engagement];

CREATE SECURITY POLICY [sec].[pol_Engagement]
    -- FILTER predicate: controls SELECT visibility (fail-closed for null SESSION_CONTEXT)
    ADD FILTER PREDICATE [sec].[fn_engagement_access]([id])
        ON [dbo].[Engagement]
    -- BLOCK predicates: defence-in-depth — request pool cannot insert/update/delete
    -- engagement rows outside the predicate's scope.
    -- Accept-time creation runs through admin pool (TASK-005-003) — admin bypasses BLOCK.
    , ADD BLOCK PREDICATE [sec].[fn_engagement_access]([id])
        ON [dbo].[Engagement] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_engagement_access]([id])
        ON [dbo].[Engagement] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_engagement_access]([id])
        ON [dbo].[Engagement] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_engagement_access]([id])
        ON [dbo].[Engagement] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

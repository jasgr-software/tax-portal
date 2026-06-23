-- db/policies/0005-engagement-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the Engagement client-ownership security policy (EPIC-005 / TASK-005-001).
-- This is the FIRST client-owned-rows policy — it adds the live CLIENT-ownership branch
-- that 0001 (EngagementRequest) and 0004 (Notification) stubbed out.
--
-- EPIC-012 / TASK-012-001 update (DECISION-D, BRIEF-012):
--   The CLIENT branch is EXTENDED (additive, CS-GEN-002) to allow multi-participant access.
--   New form: e.clientUserId = me OR EXISTS(EngagementParticipant ep WHERE ep.userId = me)
--   The primary clientUserId owner branch is BYTE-IDENTICAL — no regression to AC-AUTH-003.
--   An unrelated CLIENT (neither owner nor participant) still sees ZERO rows.
--
-- ADR-005 § Tables-in-scope:
--   "Engagement — CLIENT sees engagements they own (clientUserId) or participate in (EngagementParticipant)."
--
-- Predicate shape (three branches, matching ADR-005 §2 skeleton):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--   3. CLIENT ownership/participant branch:
--        a. Original owner path: User.clerkId → User.id = Engagement.clientUserId (AC-AUTH-003 preserved)
--        b. New participant path: User.clerkId → User.id → EngagementParticipant.userId WHERE engagementId = @engagementId
--        The OR is purely additive — no existing client can be inadvertently excluded.
--        Per ADR-005 §2 + ADR-005 §5 Mitigation B: ITVF + SCHEMABINDING so the optimizer inlines.
--
-- ADR-003 §5: Null SESSION_CONTEXT → all three branches fail → empty result → ZERO rows
-- (fail-closed, no error).
--
-- KEY POINTS:
--   - FILTER predicate: read paths via request pool (app_user_role) are filtered per-row.
--     CLIENT sees only engagements they own or are a participant in; ACCOUNTANT sees all; admin sees all.
--   - BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE):
--     Engagement creation runs through the admin pool inside withAuditTransaction (TASK-005-003).
--     The BLOCK predicate is defence-in-depth for any request-pool write attempts.
--   - DECISION-A: clientUserId is nullable (Engagement created before the prospect signs up).
--     When clientUserId IS NULL, the owner EXISTS returns false → participant path checked.
--     If no participant row exists either → 0 rows (correct: unassigned engagement invisible).
--   - DECISION-D (BRIEF-012): participant EXISTS checks ep.engagementId = @engagementId
--     so only the specific engagement is considered (no cross-engagement widening).
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines it (Mitigation B).
--   - Predicate is shallow: two parallel EXISTS branches; each touches one JOIN (User table).
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).

-- ─── Drop live security policy before altering the function ──────────────────
-- SQL Server prevents CREATE OR ALTER of a function that is referenced by a live
-- SECURITY POLICY (even when the function body is changing). Drop the policy first,
-- alter the function, then recreate the policy (next batch). The drop+recreate is
-- still idempotent — this batch handles both the first-apply and re-apply cases.
-- EPIC-012 (DECISION-D / BRIEF-012): required because fn_engagement_access is being
-- extended to add the participant EXISTS branch.
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_Engagement' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_Engagement];
GO

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_engagement_access: returns (1 AS allowed) when the caller can access
-- the engagement row, empty otherwise.
-- @engagementId: the id of the Engagement row being evaluated by the FILTER predicate.
--
-- EPIC-012 / TASK-012-001 (DECISION-D, BRIEF-012):
--   CLIENT branch extended from owner-only to owner-OR-participant (CS-GEN-002 additive).
--   Owner EXISTS is BYTE-IDENTICAL to the EPIC-005 original (no regression to AC-AUTH-003).
--   Participant EXISTS is NEW: checks EngagementParticipant for the caller's userId + @engagementId.
CREATE OR ALTER FUNCTION [sec].[fn_engagement_access](
    @engagementId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron, accept-time create via adminDb)
        --    IS_MEMBER('app_admin_role') = 1 — RLS-exempt (ADR-005 §2). // CS-SQL-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full engagement visibility
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3a. CLIENT owner branch (ORIGINAL — EPIC-005, byte-identical, AC-AUTH-003 preserved)
        --     SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId
        --     ADR-005 §2: CLIENT branch joins via User.clerkId (stable Clerk user ID string).
        --     ADR-005 §5 Mitigation C: shallow — one JOIN only (User table).
        --     DECISION-A: when clientUserId IS NULL, EXISTS returns false → checked against 3b.
        --     ADR-003 §5: null SESSION_CONTEXT('clerk_user_id') → CAST(NULL ...) = any non-null
        --     string is false → EXISTS empty → falls through to 3b (also empty) → 0 rows.
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND e.[id] = @engagementId
        )

        -- 3b. CLIENT participant branch (NEW — EPIC-012 / DECISION-D / BRIEF-012)
        --     SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id → EngagementParticipant.userId
        --     WHERE ep.engagementId = @engagementId (scoped to THIS engagement only).
        --     This branch is additive to 3a — an unrelated CLIENT (neither owner nor participant)
        --     sees ZERO rows (both EXISTS are empty). Owner access is unchanged (3a still passes).
        --     ADR-003 §5: null SESSION_CONTEXT → no match → EXISTS empty → 0 rows (fail-closed).
        --     CS-GEN-002: purely additive OR — no existing branch removed or altered.
        --     // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-D
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND ep.[engagementId] = @engagementId
        )
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
-- Policy was already dropped in the first batch (required to allow fn alter).
-- This batch simply recreates it against the updated predicate function.
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

-- db/policies/0001-engagement-request-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the EngagementRequest accountant-only-read security policy.
--
-- ADR-005 § Tables-in-scope:
--   "EngagementRequest — CLIENT sees their own pending/accepted/declined requests;
--    public/anon submits run under admin principal."
--
-- For TASK-003 / Epic-001, the policy is accountant-only-read:
--   - The one accountant (ACCOUNTANT role) can read ALL engagement requests.
--   - The admin principal (app_admin_role) bypasses RLS (migration/webhook/cron exemption).
--   - Anonymous (null SESSION_CONTEXT) reads ZERO rows — fail-closed (ADR-003 §5).
--   - CLIENT role reads ZERO rows at this stage.
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP/CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE) — optimizer inlines it (Mitigation B).
--   - Predicate is shallow (no deep join chain — Mitigation C).

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_engagement_request_access: returns (1 AS allowed) when the caller can access
-- the row, empty otherwise.
-- @engagementRequestId: included to match ADR-005 skeleton signature and allow
-- Epic-003 to add client ownership join without policy re-creation.
CREATE OR ALTER FUNCTION [sec].[fn_engagement_request_access](
    @engagementRequestId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron, anon submit via adminDb)
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — one accountant, full visibility
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT branch: zero rows at this stage (Epic-003 extends this).
        --    When SESSION_CONTEXT is null, both branches above fail → empty result (fail-closed).
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_EngagementRequest' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_EngagementRequest];

CREATE SECURITY POLICY [sec].[pol_EngagementRequest]
    ADD FILTER PREDICATE [sec].[fn_engagement_request_access]([id])
        ON [dbo].[EngagementRequest]
    , ADD BLOCK PREDICATE [sec].[fn_engagement_request_access]([id])
        ON [dbo].[EngagementRequest] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_engagement_request_access]([id])
        ON [dbo].[EngagementRequest] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_engagement_request_access]([id])
        ON [dbo].[EngagementRequest] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_engagement_request_access]([id])
        ON [dbo].[EngagementRequest] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

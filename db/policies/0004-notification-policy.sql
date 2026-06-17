-- db/policies/0004-notification-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the Notification accountant-only-read security policy (AC-DOOR-005-03).
--
-- ADR-005 § Tables-in-scope:
--   "Notification — accountant-scoped; accountant reads all; client/anon reads ZERO."
--
-- Predicate shape mirrors sec.fn_engagement_request_access (0001-engagement-request-policy.sql):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--   3. CLIENT / null SESSION_CONTEXT → predicate returns empty → zero rows (fail-closed).
--      ADR-003 §5: null SESSION_CONTEXT → both branches fail → empty result → 0 rows.
--
-- KEY POINTS:
--   - In the MVP, all notifications are accountant-scoped (AC-DOOR-005-03). There is no
--     CLIENT branch at this stage. When SESSION_CONTEXT is null or role = 'CLIENT', both
--     branches above fail → predicate returns empty table → FILTER removes all rows → 0 rows.
--   - The @notificationId arg is included to match the ADR-005 ITVF skeleton signature.
--     Future phases can add a client-ownership branch here without re-creating the policy.
--   - BLOCK predicates (AFTER INSERT + BEFORE/AFTER UPDATE + BEFORE DELETE) ensure the
--     request pool cannot modify notifications that fall outside the predicate's scope
--     (defence-in-depth; in practice the request pool has no INSERT/UPDATE/DELETE grants
--     on Notification — the admin pool owns those writes in TASK-003-003).
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines it (Mitigation B).
--   - Predicate is shallow (no deep join chain) — Mitigation C.

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_notification_access: returns (1 AS allowed) when the caller can access
-- the notification row, empty otherwise.
-- @notificationId: matches ADR-005 skeleton signature; reserved for future Phase-4
-- client-ownership extension without policy recreation.
CREATE OR ALTER FUNCTION [sec].[fn_notification_access](
    @notificationId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron, notification inserts via adminDb)
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full notification visibility
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT branch: ABSENT in MVP — no client-scoped notification visibility at this stage.
        --    Phase-4 will add a client-ownership join here (without re-creating the policy).
        --    When SESSION_CONTEXT is null or role = 'CLIENT', both branches above fail
        --    → predicate returns empty table → FILTER removes all rows → 0 rows (fail-closed).
        --    ADR-003 §5: null identity → empty result → 0 rows, no error.
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_Notification' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_Notification];

CREATE SECURITY POLICY [sec].[pol_Notification]
    -- FILTER predicate: controls SELECT visibility (fail-closed for null SESSION_CONTEXT)
    ADD FILTER PREDICATE [sec].[fn_notification_access]([id])
        ON [dbo].[Notification]
    -- BLOCK predicates: defence-in-depth — request pool cannot insert/update/delete
    -- notifications outside the predicate's scope.
    , ADD BLOCK PREDICATE [sec].[fn_notification_access]([id])
        ON [dbo].[Notification] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_notification_access]([id])
        ON [dbo].[Notification] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_notification_access]([id])
        ON [dbo].[Notification] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_notification_access]([id])
        ON [dbo].[Notification] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

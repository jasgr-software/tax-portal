-- db/policies/0018-reminder-setting-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the ReminderSetting accountant-only security policy (TASK-019-001 / BRIEF-019).
-- EPIC-019: cadence-config isolation gate (extra_gate #7 in BRIEF-019).
--
-- ADR-005 § Tables-in-scope:
--   "ReminderSetting — accountant-only; no client-scoped rows; CLIENT principal reads ZERO."
--
-- DECISION-019-B (TASK-019-001): global cadence config is a net-new singleton table.
--   Net-new request-scoped table → its own RLS policy + isolation test (CS-SQL-001).
--   Isolation test: packages/db/src/reminder-setting.rls.test.ts.
--
-- Predicate shape (two branches — NO CLIENT branch, matching accountant-only ADR-005 skeleton):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--   3. CLIENT / null SESSION_CONTEXT → ABSENT — no client-scoped visibility at all.
--      When SESSION_CONTEXT is null or role = 'CLIENT', both branches above fail
--      → predicate returns empty table → FILTER removes all rows → 0 rows returned.
--      This is the intended fail-closed behavior (ADR-003 §5).
--
-- KEY DIFFERENCE from client-owned policies (e.g. 0005-engagement-policy.sql):
--   There is NO CLIENT branch in this predicate.
--   A CLIENT sees ZERO rows (including attempts to read cadence config).
--   This is intentional per DECISION-019-B and the BRIEF-019 cadence-config isolation gate.
--
-- FILTER vs BLOCK predicates:
--   FILTER:         controls SELECT read visibility (fail-closed for null SESSION_CONTEXT).
--   BLOCK predicates (AFTER INSERT, BEFORE UPDATE, AFTER UPDATE, BEFORE DELETE):
--     Defence-in-depth — the request pool (app_user_role) cannot insert/update/delete
--     cadence config rows. In practice writes go through the admin pool (TASK-019-002);
--     the BLOCK predicates prevent any request-pool bypass of the read-only posture.
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines it (Mitigation B). // CS-SQL-003
--   - Predicate is shallow (no join chain — no client-ownership lookup) — Mitigation C. // CS-SQL-003
--
-- Idempotent: DROP SECURITY POLICY (batch 1) + CREATE OR ALTER FUNCTION (batch 2) +
--             CREATE SECURITY POLICY (batch 3). GO-separated.
--   CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
--   Mirrors 0004-notification-policy.sql / 0005-engagement-policy.sql batch structure.
--
-- // ADR-005 // ADR-003 // CS-SQL-001 // CS-SQL-002 // CS-SQL-003 // DECISION-019-B // BRIEF-019

-- ─── Drop live security policy before altering the function ──────────────────
-- SQL Server prevents CREATE OR ALTER of a function that is referenced by a live
-- SECURITY POLICY (even when the function body is not changing). Drop the policy
-- first, alter the function, then recreate the policy (next batch). The drop+recreate
-- is still idempotent — this batch handles both the first-apply and re-apply cases.
-- Mirrors 0004-notification-policy.sql + 0005-engagement-policy.sql batch structure.
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_ReminderSetting' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_ReminderSetting];
GO

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_reminder_setting_access: returns (1 AS allowed) when the caller can access
-- the cadence configuration row. No CLIENT branch — CLIENT denied entirely.
-- @reminderSettingId: the id of the ReminderSetting row being evaluated by the FILTER predicate.
--
-- Accountant-only pattern (mirrors pol_EngagementNote / pol_LegalHold): two branches only.
-- ADR-003 §5: null SESSION_CONTEXT → both branches fail → empty result → 0 rows (fail-closed).
-- CS-SQL-003: ITVF WITH SCHEMABINDING; admin-first; accountant-second; no client branch. // CS-SQL-003
-- DECISION-019-B: this is the accountant-only cadence-config isolation policy. // DECISION-019-B
CREATE OR ALTER FUNCTION [sec].[fn_reminder_setting_access](
    @reminderSettingId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, cron, batch detection, admin pool).
        --    IS_MEMBER('app_admin_role') = 1 — RLS-exempt (ADR-005 §2). // CS-SQL-003
        --    ADR-005 // ADR-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full config visibility.
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        --    ADR-005 §2: ACCOUNTANT context always passes for accountant-owned tables.
        --    ADR-003 §5: null SESSION_CONTEXT → CAST(NULL…) != N'ACCOUNTANT' → branch fails.
        --    // ADR-005 // ADR-003 // CS-SQL-003 // DECISION-019-B
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT branch: ABSENT — no client-scoped visibility at all (DECISION-019-B).
        --    CLIENT role reads ZERO cadence-config rows (including their own engagements' cadence).
        --    When SESSION_CONTEXT is null or role = 'CLIENT', both branches above fail
        --    → predicate returns empty table → FILTER removes all rows → 0 rows (correct).
        --    This is the intended fail-closed behavior (ADR-003 §5, BRIEF-019 extra_gate #7).
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
-- Policy was already dropped in the first batch (required to allow fn alter).
-- This batch simply recreates it against the predicate function.
CREATE SECURITY POLICY [sec].[pol_ReminderSetting]
    -- FILTER predicate: controls SELECT visibility (fail-closed for null SESSION_CONTEXT).
    ADD FILTER PREDICATE [sec].[fn_reminder_setting_access]([id])
        ON [dbo].[ReminderSetting]
    -- BLOCK predicates: defence-in-depth — request pool cannot insert/update/delete
    -- cadence config outside the predicate's scope.
    -- TASK-019-002 reads/writes via admin pool (bypasses BLOCK); BLOCK is defence-in-depth.
    , ADD BLOCK PREDICATE [sec].[fn_reminder_setting_access]([id])
        ON [dbo].[ReminderSetting] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_reminder_setting_access]([id])
        ON [dbo].[ReminderSetting] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_reminder_setting_access]([id])
        ON [dbo].[ReminderSetting] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_reminder_setting_access]([id])
        ON [dbo].[ReminderSetting] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

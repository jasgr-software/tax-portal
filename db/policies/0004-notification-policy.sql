-- db/policies/0004-notification-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the Notification dual-role security policy (AC-DOOR-005-03 + AC-MSG-014-07).
-- EPIC-016 / TASK-016-001: generalizes the EPIC-003 accountant-only policy by adding the
-- CLIENT-ownership branch keyed on recipientUserId (CS-GEN-002 additive — admin + ACCOUNTANT
-- branches are BYTE-IDENTICAL to the EPIC-003 original; the CLIENT branch is new).
--
-- ADR-005 § Tables-in-scope:
--   "Notification — dual-role; ACCOUNTANT reads all accountant-scoped; CLIENT reads only
--    notifications scoped to them (recipientUserId = their User.id)."
--
-- DECISION (TASK-016-001): recipient model —
--   Accountant notifications: recipientType='ACCOUNTANT', recipientUserId=NULL.
--   Client notifications:     recipientType='CLIENT', recipientUserId=<User.id>.
--   The CLIENT branch keys on recipientUserId via:
--     SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Notification.recipientUserId
--   This is the same pattern as 0005-engagement-policy.sql (clientUserId ownership branch).
--
-- Predicate shape (three branches, matching ADR-005 §2 skeleton):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--   3. CLIENT-ownership branch (NEW — EPIC-016 / TASK-016-001, additive):
--      SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Notification.recipientUserId
--      If recipientUserId IS NULL (accountant-scoped row) → EXISTS is false → 0 rows (correct).
--      ADR-003 §5: null SESSION_CONTEXT → CAST(NULL …) != any non-null → EXISTS empty → 0 rows.
--
-- ADR-003 §5: Null SESSION_CONTEXT → all three branches fail → empty result → ZERO rows
-- (fail-closed, no error).
--
-- KEY POINTS:
--   - FILTER predicate: read paths via request pool (app_user_role) are filtered per-row.
--     CLIENT sees only their own notifications; ACCOUNTANT sees all accountant-scoped; admin sees all.
--   - BLOCK predicates (AFTER INSERT + BEFORE/AFTER UPDATE + BEFORE DELETE): defence-in-depth.
--     In practice the request pool has no INSERT/UPDATE/DELETE grants on Notification
--     (admin pool owns those writes — TASK-003-003 + TASK-016-004 emitNotification).
--   - DECISION-A (TASK-016-001): when recipientUserId IS NULL (ACCOUNTANT-scoped row), the
--     CLIENT EXISTS branch returns false — accountant-scoped rows are invisible to CLIENTs even
--     if their SESSION_CONTEXT is set (correct cross-type isolation, AC-MSG-014-07).
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines it (Mitigation B).
--   - Predicate is shallow (one JOIN, User table only) — Mitigation C.
--
-- Idempotent: DROP SECURITY POLICY (batch 1) + CREATE OR ALTER FUNCTION (batch 2) + CREATE policy (batch 3).
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).

-- ─── Drop live security policy before altering the function ──────────────────
-- SQL Server prevents CREATE OR ALTER of a function that is referenced by a live
-- SECURITY POLICY (even when the function body is changing). Drop the policy first,
-- alter the function, then recreate the policy (next batch). The drop+recreate is
-- still idempotent — this batch handles both the first-apply and re-apply cases.
-- EPIC-016 (TASK-016-001): required because fn_notification_access is being
-- extended to add the CLIENT-ownership EXISTS branch.
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_Notification' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_Notification];
GO

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_notification_access: returns (1 AS allowed) when the caller can access
-- the notification row, empty otherwise.
-- @notificationId: the id of the Notification row being evaluated by the FILTER predicate.
--
-- EPIC-016 / TASK-016-001: CLIENT branch added (CS-GEN-002 additive).
-- Admin + ACCOUNTANT branches are BYTE-IDENTICAL to the EPIC-003 original (no regression).
-- The CLIENT branch is a purely-additive OR EXISTS(…) below the ACCOUNTANT branch.
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

        -- 3. CLIENT-ownership branch (NEW — EPIC-016 / TASK-016-001, additive, CS-GEN-002)
        --    SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Notification.recipientUserId
        --    ADR-005 §2: CLIENT branch joins via User.clerkId (stable Clerk user ID string).
        --    ADR-005 §5 Mitigation C: shallow — one JOIN only (User table).
        --    DECISION-A (TASK-016-001): when recipientUserId IS NULL (ACCOUNTANT-scoped row),
        --    the JOIN condition fails (NULL != any value) → EXISTS empty → 0 rows (correct).
        --    ADR-003 §5: null SESSION_CONTEXT → CAST(NULL …) != any non-null string → EXISTS
        --    empty → 0 rows (fail-closed, no error). // CS-SQL-003 // ADR-005 // ADR-003 // CS-GEN-002
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[Notification] n ON n.[recipientUserId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND n.[id] = @notificationId
        )
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
-- Policy was already dropped in the first batch (required to allow fn alter).
-- This batch simply recreates it against the updated predicate function.
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

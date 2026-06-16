-- db/policies/0003-audit-event-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the AuditEvent accountant/admin-only-read security policy (ADR-019 §4).
--
-- ADR-019 §4: "Reading the audit log is a privileged operation restricted to the
--   accountant/admin role only (REQ-NFR-010 AC-05); a client cannot read any part of
--   the audit trail, including the portion about their own engagements. This is enforced
--   by the same RLS trust boundary (ADR-005) — the audit tables carry an RLS predicate
--   that admits only the ACCOUNTANT/admin principal and denies the CLIENT branch outright
--   (no client-scoped row visibility at all, unlike client-data tables)."
--
-- KEY DIFFERENCE from other policies (e.g. 0001-engagement-request-policy.sql):
--   There is NO CLIENT branch in this predicate. A CLIENT sees ZERO audit rows,
--   including rows about their own auth events. This is intentional per ADR-019 §4
--   and REQ-NFR-010 AC-05.
--
-- Predicate branches:
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--   3. CLIENT / null SESSION_CONTEXT → predicate returns empty → zero rows (fail-closed).
--      ADR-003 §5: null SESSION_CONTEXT → both branches fail → empty result → 0 rows.
--
-- FILTER vs BLOCK predicates:
--   Since AuditEvent is an APPEND_ONLY ledger table, UPDATE and DELETE are impossible
--   at the engine level. However, we add the FILTER predicate (controls SELECT/read)
--   and an AFTER INSERT BLOCK predicate so the request pool cannot insert a row that
--   would be invisible to the ACCOUNTANT (defence-in-depth; in practice, the
--   grant-INSERT-to-app_user_role in the migration is already scoped correctly).
--
--   BEFORE UPDATE, BEFORE DELETE, AFTER UPDATE block predicates are OMITTED because
--   the ledger engine prevents UPDATE/DELETE on APPEND_ONLY tables anyway.
--   Adding them would either no-op or conflict with the ledger constraint.
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE) — optimizer inlines it (Mitigation B).
--   - Predicate is shallow (no join chain needed — no client-ownership lookup) — Mitigation C.
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_audit_event_access: returns (1 AS allowed) when the caller can read audit rows.
-- No CLIENT branch — CLIENT denied entirely (ADR-019 §4, REQ-NFR-010 AC-05).

CREATE OR ALTER FUNCTION [sec].[fn_audit_event_access](
    @auditEventId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron, admin pool)
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full audit visibility
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT branch: ABSENT — no client-scoped visibility at all (ADR-019 §4).
        --    CLIENT role reads ZERO audit rows (including their own auth events).
        --    When SESSION_CONTEXT is null or role = 'CLIENT', both branches above fail
        --    → predicate returns empty table → FILTER removes all rows → 0 rows returned.
        --    This is the intended fail-closed behavior (ADR-003 §5).
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_AuditEvent' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_AuditEvent];

CREATE SECURITY POLICY [sec].[pol_AuditEvent]
    -- FILTER predicate: controls SELECT visibility (fail-closed for null SESSION_CONTEXT)
    ADD FILTER PREDICATE [sec].[fn_audit_event_access]([id])
        ON [dbo].[AuditEvent]
    -- BLOCK AFTER INSERT: prevents request-pool inserting rows that pass FILTER
    -- (defence-in-depth; app_user_role only has INSERT grant, predicate is consistent)
    , ADD BLOCK PREDICATE [sec].[fn_audit_event_access]([id])
        ON [dbo].[AuditEvent] AFTER INSERT
    -- NOTE: BEFORE UPDATE, AFTER UPDATE, BEFORE DELETE predicates are NOT added.
    -- The APPEND_ONLY ledger constraint prevents UPDATE/DELETE at the engine level.
    -- Adding UPDATE/DELETE block predicates on an APPEND_ONLY ledger table would
    -- conflict with the ledger constraint. They are omitted intentionally.
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

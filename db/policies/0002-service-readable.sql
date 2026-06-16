-- db/policies/0002-service-readable.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the Service table security policy.
--
-- ADR-005 § Tables-in-scope:
--   "Service-catalog tables (Service, IntakeTemplate) are accountant-managed, client-readable —
--    policies allow all CLIENTs to SELECT active rows; only ACCOUNTANT / admin can mutate."
--
-- Policy design (read/write split):
--   READ  (FILTER predicate — fn_service_access):
--     - Admin principal bypasses (IS_MEMBER('app_admin_role') = 1).
--     - ACCOUNTANT role sees all Service rows (can manage inactive services).
--     - CLIENT role sees all Service rows (app-layer active=true filter for public page).
--     - Anonymous (null SESSION_CONTEXT) via request pool: ZERO rows (fail-closed).
--       Public pages use adminDb (admin pool) for anonymous reads — no request pool.
--
--   WRITE (BLOCK predicates — fn_service_write_access):
--     - Admin principal passes (IS_MEMBER('app_admin_role') = 1).
--     - ACCOUNTANT role passes (SESSION_CONTEXT 'role' = 'ACCOUNTANT').
--     - CLIENT role: NO BRANCH — fails closed (error 33504 on INSERT/UPDATE/DELETE).
--     - Anonymous (null SESSION_CONTEXT): fails closed (no branch matches).
--
-- // DECISION: a separate write-predicate function (fn_service_write_access) is required rather
-- //   than a flag on the shared fn_service_access because read and write authorization diverge
-- //   for the CLIENT role: CLIENTs must keep SELECT access to active services (for the public
-- //   services page) but must be completely blocked from INSERT/UPDATE/DELETE. A single shared
-- //   predicate cannot express both semantics — using it for BLOCK predicates while it has a
-- //   CLIENT branch means CLIENTs pass the write block. The write predicate intentionally has
-- //   no CLIENT branch so that null/CLIENT SESSION_CONTEXT fails closed at the DB trust boundary.
-- //   Record: AC-DOOR-002-05; ADR-005 §2/§3; TASK-002-001.
--
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
-- Idempotent: CREATE OR ALTER FUNCTION + DROP IF EXISTS + CREATE for the policy.

-- ─── READ predicate (FILTER) — CLIENT allowed ─────────────────────────────────

CREATE OR ALTER FUNCTION [sec].[fn_service_access](
    @serviceId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT sees all services
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT can read services (app layer filters by active=true for public page)
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'CLIENT'
        -- When SESSION_CONTEXT is null, all branches fail → zero rows returned (fail-closed)
);
GO

-- ─── WRITE predicate (BLOCK) — CLIENT NOT granted; fail-closed ────────────────

CREATE OR ALTER FUNCTION [sec].[fn_service_write_access](
    @serviceId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT can mutate services
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- NO CLIENT branch: CLIENT INSERT/UPDATE/DELETE fails closed (error 33504).
        -- NO anonymous branch: null SESSION_CONTEXT fails closed.
        -- This is intentional per the read/write authorization split for the Service table.
        -- See DECISION comment in file header and AC-DOOR-002-05.
);
GO

-- ─── Security policy (drop + recreate for idempotency) ────────────────────────

IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_Service' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_Service];

CREATE SECURITY POLICY [sec].[pol_Service]
    -- READ: FILTER predicate uses fn_service_access (CLIENT allowed for public page)
    ADD FILTER PREDICATE [sec].[fn_service_access]([id])
        ON [dbo].[Service]
    -- WRITE: BLOCK predicates use fn_service_write_access (no CLIENT branch — fail-closed)
    , ADD BLOCK PREDICATE [sec].[fn_service_write_access]([id])
        ON [dbo].[Service] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_service_write_access]([id])
        ON [dbo].[Service] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_service_write_access]([id])
        ON [dbo].[Service] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_service_write_access]([id])
        ON [dbo].[Service] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

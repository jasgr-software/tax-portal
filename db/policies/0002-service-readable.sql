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
-- Policy design:
--   - Admin principal bypasses (IS_MEMBER('app_admin_role') = 1).
--   - ACCOUNTANT role sees all Service rows (can manage inactive services).
--   - CLIENT role sees all Service rows (app-layer active=true filter for public page).
--   - Anonymous (null SESSION_CONTEXT) via request pool: ZERO rows (fail-closed).
--     Public pages use adminDb (admin pool) for anonymous reads — no request pool.
--
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
-- Idempotent: DROP IF EXISTS + CREATE.

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

IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_Service' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_Service];

CREATE SECURITY POLICY [sec].[pol_Service]
    ADD FILTER PREDICATE [sec].[fn_service_access]([id])
        ON [dbo].[Service]
    , ADD BLOCK PREDICATE [sec].[fn_service_access]([id])
        ON [dbo].[Service] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_service_access]([id])
        ON [dbo].[Service] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_service_access]([id])
        ON [dbo].[Service] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_service_access]([id])
        ON [dbo].[Service] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

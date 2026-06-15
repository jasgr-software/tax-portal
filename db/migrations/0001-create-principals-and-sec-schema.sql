-- db/migrations/0001-create-principals-and-sec-schema.sql
-- Track B: raw SQL migration — ADR-002 § Migration tracks (Track B)
-- Applied by: scripts/db-migrate.ts (after prisma migrate deploy)
--
-- Creates the sec schema, application database roles, SQL Server logins, database users,
-- and grants required for the two-pool model (ADR-003 §1).
--
-- Note: This file uses a single batch (no GO separator) because the mssql driver's
-- batch() method sends SQL directly to the engine; GO is a client-side separator only.
-- Each DDL statement is guarded with IF NOT EXISTS for idempotency.
--
-- Principals (ADR-003 §1, ADR-005 §1):
--   app_admin_role — elevated, RLS-exempt; used by migrations/cron/webhooks/seed
--   app_user_role  — low privilege, filtered by all RLS policies; used by request pool
--   app_admin      — SQL Server login mapped to app_admin_role
--   app_user       — SQL Server login mapped to app_user_role

-- sec schema (home for predicate functions and security policies — ADR-005 §2)
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sec')
    EXEC('CREATE SCHEMA [sec]');

-- Database roles
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'app_admin_role' AND type = 'R')
    EXEC('CREATE ROLE [app_admin_role]');

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'app_user_role' AND type = 'R')
    EXEC('CREATE ROLE [app_user_role]');

-- SQL Server logins (server-level); passwords overridden in prod via env (ADR-007)
-- app_admin / app_user: logins with special-char passwords (for environments that need them)
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'app_admin')
    EXEC('CREATE LOGIN [app_admin] WITH PASSWORD = ''AppAdmin_Dev1!''');

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'app_user')
    EXEC('CREATE LOGIN [app_user] WITH PASSWORD = ''AppUser_Dev1!''');

-- taxportal_admin / taxportal_user: logins with passwords safe for Prisma URL parser
-- Used by integration tests and environments where Prisma's sqlserver connector is used
-- (passwords without ! avoid the Prisma 5.22.0 P1013 URL parsing issue with special chars)
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'taxportal_admin')
    EXEC('CREATE LOGIN [taxportal_admin] WITH PASSWORD = ''TaxPortalAdmin2024''');

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'taxportal_user')
    EXEC('CREATE LOGIN [taxportal_user] WITH PASSWORD = ''TaxPortalUser2024''');

-- Database users
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'app_admin' AND type = 'S')
    EXEC('CREATE USER [app_admin] FOR LOGIN [app_admin]');

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'app_user' AND type = 'S')
    EXEC('CREATE USER [app_user] FOR LOGIN [app_user]');

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'taxportal_admin' AND type = 'S')
    EXEC('CREATE USER [taxportal_admin] FOR LOGIN [taxportal_admin]');

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'taxportal_user' AND type = 'S')
    EXEC('CREATE USER [taxportal_user] FOR LOGIN [taxportal_user]');

-- Role membership: app_admin → app_admin_role + db_owner
IF NOT EXISTS (
    SELECT 1 FROM sys.database_role_members rm
    JOIN sys.database_principals rp ON rm.role_principal_id = rp.principal_id
    JOIN sys.database_principals mp ON rm.member_principal_id = mp.principal_id
    WHERE rp.name = 'app_admin_role' AND mp.name = 'app_admin'
)
    ALTER ROLE [app_admin_role] ADD MEMBER [app_admin];

IF NOT EXISTS (
    SELECT 1 FROM sys.database_role_members rm
    JOIN sys.database_principals rp ON rm.role_principal_id = rp.principal_id
    JOIN sys.database_principals mp ON rm.member_principal_id = mp.principal_id
    WHERE rp.name = 'db_owner' AND mp.name = 'app_admin'
)
    ALTER ROLE [db_owner] ADD MEMBER [app_admin];

-- Role membership: taxportal_admin → app_admin_role + db_owner (Prisma-URL-safe alternative)
IF NOT EXISTS (
    SELECT 1 FROM sys.database_role_members rm
    JOIN sys.database_principals rp ON rm.role_principal_id = rp.principal_id
    JOIN sys.database_principals mp ON rm.member_principal_id = mp.principal_id
    WHERE rp.name = 'app_admin_role' AND mp.name = 'taxportal_admin'
)
    ALTER ROLE [app_admin_role] ADD MEMBER [taxportal_admin];

IF NOT EXISTS (
    SELECT 1 FROM sys.database_role_members rm
    JOIN sys.database_principals rp ON rm.role_principal_id = rp.principal_id
    JOIN sys.database_principals mp ON rm.member_principal_id = mp.principal_id
    WHERE rp.name = 'db_owner' AND mp.name = 'taxportal_admin'
)
    ALTER ROLE [db_owner] ADD MEMBER [taxportal_admin];

-- Role membership: app_user → app_user_role
IF NOT EXISTS (
    SELECT 1 FROM sys.database_role_members rm
    JOIN sys.database_principals rp ON rm.role_principal_id = rp.principal_id
    JOIN sys.database_principals mp ON rm.member_principal_id = mp.principal_id
    WHERE rp.name = 'app_user_role' AND mp.name = 'app_user'
)
    ALTER ROLE [app_user_role] ADD MEMBER [app_user];

-- Role membership: taxportal_user → app_user_role (Prisma-URL-safe alternative)
IF NOT EXISTS (
    SELECT 1 FROM sys.database_role_members rm
    JOIN sys.database_principals rp ON rm.role_principal_id = rp.principal_id
    JOIN sys.database_principals mp ON rm.member_principal_id = mp.principal_id
    WHERE rp.name = 'app_user_role' AND mp.name = 'taxportal_user'
)
    ALTER ROLE [app_user_role] ADD MEMBER [taxportal_user];

-- Permissions: app_user_role can read/write on dbo schema (filtered by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [app_user_role];

-- app_user_role can select from sec schema (for access-set table reads, if any)
GRANT SELECT ON SCHEMA::sec TO [app_user_role];

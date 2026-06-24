-- db/policies/0013-legal-hold-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the LegalHold accountant-only security policy (AC-FILE-013-02 / AC-FILE-014-01/-02).
-- CS-SQL-001: every newly-scoped table ships a SECURITY POLICY + RLS integration test. // CS-SQL-001
-- CS-SQL-002: raw-SQL track only for what Prisma cannot express (security policy DDL). // CS-SQL-002
-- CS-SQL-003: predicate is an inline TVF, shallow, admin/accountant-first, fail-closed. // CS-SQL-003
-- CS-GEN-002: additive — new policy and table; no existing policy or model modified. // CS-GEN-002
-- CS-GEN-003: governing keys cited throughout. // CS-GEN-003
--
-- ADR-005 § Tables-in-scope:
--   "LegalHold — accountant-scoped; accountant reads all; client/anon reads ZERO."
-- ADR-018 §6: legal hold suspends purge indefinitely; no auto-expire; accountant-only place/lift.
--
-- THIS IS AN ACCOUNTANT-ONLY BLOCK/FILTER POLICY — NOT the client-isolation pol_Engagement family.
-- CRITICAL DISTINCTION:
--   pol_Engagement (0005): CLIENT can read rows they OWN (their own engagement). A client-isolation policy.
--   pol_LegalHold (this file): CLIENT reads ZERO — no client can read, insert, update, or delete a hold.
--   This is the legal-hold confidentiality + integrity boundary:
--     - A CLIENT cannot read which holds exist on their engagement.
--     - A CLIENT cannot place or lift a hold on any engagement (BLOCK prevents INSERT/UPDATE/DELETE).
--   AC-FILE-013-02: purge is accountant/admin-only — CLIENT has no path to legal-hold management.
--
-- Predicate shape mirrors sec.fn_engagement_note_access (0008-engagement-note-policy.sql):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--   3. CLIENT / null SESSION_CONTEXT → predicate returns empty → ZERO rows (fail-closed).
--      ADR-003 §5: null SESSION_CONTEXT → both branches fail → empty result → 0 rows, no error.
--
-- KEY POINTS:
--   - No CLIENT branch exists in this predicate — BY DESIGN (AC-FILE-013-02, ADR-018 §6).
--     A CLIENT principal reads ZERO legal hold rows regardless of engagement ownership.
--     DO NOT add a CLIENT branch to this predicate — legal holds are permanently accountant-only.
--   - BLOCK predicates (AFTER INSERT + BEFORE/AFTER UPDATE + BEFORE DELETE) ensure the
--     request pool (app_user_role) cannot insert, update, or delete holds as a CLIENT.
--     Place/lift operations go through the admin pool (TASK-015-001 repository).
--     BLOCK is defence-in-depth for any accidental request-pool write attempts.
--   - The scope CHECK constraint ('engagement' | 'client') is enforced in this file (Track B only,
--     Prisma cannot express multi-value CHECKs natively). See CHECK constraint section below.
--   - The mutual-exclusivity constraint (exactly one of {engagementId, clientUserId} non-null)
--     is also enforced here as a CHECK constraint.
--
-- Idempotent pattern (mirrors 0008-engagement-note-policy.sql pattern):
--   DROP pol_LegalHold first → CREATE OR ALTER fn_legal_hold_access → CREATE pol_LegalHold.
--   SQL Server forbids CREATE OR ALTER on a function referenced by a live policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines it (Mitigation B). // CS-SQL-003
--   - Predicate is shallow (no JOIN required — admin/accountant branches only). // CS-SQL-003
--
-- Referenced by: packages/db/src/legal-hold.rls.test.ts (HARD GATE, ADR-005 §6). // CS-SQL-001

-- ─── PART 0: Drop the security policy first (idempotent) ─────────────────────
-- Must drop pol_LegalHold before CREATE OR ALTER on fn_legal_hold_access (SCHEMABINDING).
-- Pattern mirrors 0012-document-soft-delete-filter.sql (PART 0B pattern).
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_LegalHold' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_LegalHold];
GO

-- ─── Scope / mutual-exclusivity CHECK constraints ─────────────────────────────
-- These cannot be expressed in Prisma schema — Track B only (CS-SQL-002).
-- CHECK 1: scope must be 'engagement' or 'client'
-- CHECK 2: mutual exclusivity — exactly one of {engagementId, clientUserId} is non-null
-- Both are idempotent (DROP IF EXISTS + ADD CONSTRAINT).

-- Drop and recreate scope CHECK constraint (idempotent)
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_LegalHold_scope' AND parent_object_id = OBJECT_ID('dbo.LegalHold')
)
    ALTER TABLE [dbo].[LegalHold] DROP CONSTRAINT [CK_LegalHold_scope];
GO

ALTER TABLE [dbo].[LegalHold]
    ADD CONSTRAINT [CK_LegalHold_scope]
    CHECK ([scope] IN ('engagement', 'client'));
GO

-- Drop and recreate mutual-exclusivity CHECK constraint (idempotent)
-- ADR-018 §6: engagement-scoped → engagementId non-null, clientUserId null
--             client-scoped → clientUserId non-null, engagementId null
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_LegalHold_exclusivity' AND parent_object_id = OBJECT_ID('dbo.LegalHold')
)
    ALTER TABLE [dbo].[LegalHold] DROP CONSTRAINT [CK_LegalHold_exclusivity];
GO

ALTER TABLE [dbo].[LegalHold]
    ADD CONSTRAINT [CK_LegalHold_exclusivity]
    CHECK (
        -- Exactly one of {engagementId, clientUserId} must be non-null
        ([scope] = 'engagement' AND [engagementId] IS NOT NULL AND [clientUserId] IS NULL)
        OR
        ([scope] = 'client' AND [clientUserId] IS NOT NULL AND [engagementId] IS NULL)
    );
GO

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_legal_hold_access: returns (1 AS allowed) when the caller can access
-- the LegalHold row, empty otherwise.
-- @legalHoldId: matches ADR-005 skeleton signature; reserved for future use.
--   No CLIENT ownership branch will be added — holds are permanently accountant-only (AC-FILE-013-02).
CREATE OR ALTER FUNCTION [sec].[fn_legal_hold_access](
    @legalHoldId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (admin pool migrations, cron, admin pool writes for holds)
        --    IS_MEMBER('app_admin_role') = 1 — RLS-exempt (ADR-005 §2). // CS-SQL-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full legal-hold visibility
        --    ADR-018 §6: accountant can place and lift holds on any engagement or client.
        --    AC-FILE-014-01/-02: accountant reads and manages all holds.
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT branch: ABSENT BY DESIGN — holds are PERMANENTLY accountant-only (AC-FILE-013-02).
        --    A CLIENT principal (even one who OWNS the held engagement) reads ZERO hold rows.
        --    This is NOT a client-isolation policy (pol_Engagement family). DO NOT add a CLIENT branch.
        --    When SESSION_CONTEXT is null or role = 'CLIENT', both branches above fail
        --    → predicate returns empty table → FILTER removes all rows → 0 rows (fail-closed).
        --    ADR-003 §5: null identity → empty result → 0 rows, no error. // CS-SQL-003
        --    ADR-018 §6: no client path to legal hold management. // ADR-018
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
-- (pol_LegalHold was dropped at PART 0 above before ALTER on fn_legal_hold_access)
CREATE SECURITY POLICY [sec].[pol_LegalHold]
    -- FILTER predicate: controls SELECT visibility (fail-closed for null SESSION_CONTEXT)
    -- AC-FILE-013-02: CLIENT principal reads ZERO holds regardless of engagement ownership.
    -- ADR-018 §6: only ACCOUNTANT/admin can see and manage legal holds.
    ADD FILTER PREDICATE [sec].[fn_legal_hold_access]([id])
        ON [dbo].[LegalHold]
    -- BLOCK predicates: defence-in-depth — request pool cannot insert/update/delete
    -- holds outside the predicate's scope (CLIENT principals / null context are blocked).
    -- Hold place/lift operations go through the admin pool (TASK-015-001 repository).
    -- ADR-005 §3: BLOCK on INSERT/UPDATE/DELETE for accountant-only tables.
    , ADD BLOCK PREDICATE [sec].[fn_legal_hold_access]([id])
        ON [dbo].[LegalHold] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_legal_hold_access]([id])
        ON [dbo].[LegalHold] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_legal_hold_access]([id])
        ON [dbo].[LegalHold] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_legal_hold_access]([id])
        ON [dbo].[LegalHold] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

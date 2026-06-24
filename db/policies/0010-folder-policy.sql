-- db/policies/0010-folder-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements security policies for EPIC-013 / BRIEF-013 / TASK-013-001 folder entities:
--   1. Folder — FILTER (owner-or-participant read) + BLOCK (accountant-only write — AC-FILE-010-04)
--
-- This is the FIFTH client-scoped policy in the system (after 0005/0006/0007/0009).
--
-- ADR-005 § Tables-in-scope:
--   "Folder — CLIENT reads engagement folders they own or participate in;
--    ACCOUNTANT reads and writes all; admin pool is always RLS-exempt."
--
-- ADR-005 § Decision:
--   "Every table containing client-scoped data is covered by a SQL Server SECURITY POLICY
--    keyed off SESSION_CONTEXT(N'clerk_user_id')."
--
-- Folder read predicate (sec.fn_folder_access):
--   Mirrors fn_document_access (0007) extended with the EPIC-012 participant branch.
--   The read boundary is the owning Engagement (ownership join: Folder.engagementId
--   → Engagement.clientUserId → User.clerkId + participant EXISTS branch).
--   Three branches (ADR-005 §2 skeleton):
--     1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--     2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--     3a. CLIENT owner branch: User.clerkId → User.id = Engagement.clientUserId
--         → Engagement.id = @folderEngagementId.
--     3b. CLIENT participant branch (DECISION-013-A / EPIC-012 mirror):
--         User.clerkId → User.id → EngagementParticipant.userId
--         WHERE ep.engagementId = @folderEngagementId.
--     NULL SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed).
--
-- Folder write predicate (sec.fn_folder_write_access):
--   Accountant-only write — NO CLIENT branch (AC-FILE-010-04).
--   Mirrors fn_document_request_write_access (0007 PART 2) and fn_service_write_access (0002).
--   Two branches:
--     1. Admin principal always passes.
--     2. ACCOUNTANT role always passes.
--     NO CLIENT branch — CLIENT INSERT/UPDATE/DELETE fails closed (BLOCK error 33504).
--     NULL SESSION_CONTEXT fails closed.
--
-- Policy: sec.pol_Folder
--   FILTER predicate: fn_folder_access (read — includes participant branch) on Folder.engagementId.
--   BLOCK predicates: fn_folder_write_access (write — accountant-only) on all DML paths.
--   This ensures: CLIENTs read their engagement's folders but CANNOT write them (AC-FILE-010-04).
--
-- ADR-003 §5: Null SESSION_CONTEXT → all branches fail → empty result → ZERO rows (fail-closed).
-- ADR-005 §5 Performance rules:
--   - ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines (Mitigation B).
--   - Predicate is shallow: two parallel EXISTS branches; each touches one JOIN.
--     Matches 0005/0007 pattern.
--
-- CS-SQL-001: new scoped table ships SECURITY POLICY + .rls.test.ts (HARD GATE).
-- CS-SQL-002: Track B only — not expressible via Track A (Prisma cannot define SECURITY POLICY).
-- CS-SQL-003: predicate is ITVF, admin/accountant-first, shallow, fail-closed on null identity.
-- CS-GEN-002: additive — new table and new policy; no existing policy or model modified.
-- CS-GEN-003: governing keys cited throughout. // CS-GEN-003
-- DECISION-013-A: participant access mirrors 0005 EPIC-012 extension exactly.
--
-- Idempotent: CREATE OR ALTER FUNCTION + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1: Folder — CLIENT read (owner+participant) + accountant-only write
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Predicate function: fn_folder_access (own batch) ────────────────────────
-- Returns (1 AS allowed) when the caller can READ a Folder row.
-- @folderEngagementId: the engagementId column of the Folder row.
--   The isolation boundary is the owning Engagement (not a self-join on the folder id).
--
-- Three branches (ADR-005 §2 skeleton + EPIC-012 participant extension):
--   1. Admin principal always passes (IS_MEMBER('app_admin_role') = 1 — ADR-005 §2).
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') always passes.
--   3a. CLIENT owner branch: User.clerkId → User.id = Engagement.clientUserId
--       AND Engagement.id = @folderEngagementId (the engagementId of the folder row).
--       Mirrors the CLIENT-ownership branch in fn_document_access (0007 PART 1).
--       ADR-003 §5: null SESSION_CONTEXT → CAST(NULL...) matches no clerkId → EXISTS empty → 0 rows.
--       DECISION-A: NULL Engagement.clientUserId → EXISTS returns false → checked against 3b.
--   3b. CLIENT participant branch (DECISION-013-A / EPIC-012 extension mirror):
--       User.clerkId → User.id → EngagementParticipant.userId WHERE ep.engagementId = @folderEngagementId.
--       Mirrors 0005 participant branch (fn_engagement_access 3b — BYTE-IDENTICAL EXISTS shape).
--       CS-GEN-002: purely additive — no existing branch removed or altered.
--       ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed).
--
-- Named code path for Gate Authoring evidence (ENGINE.md § Gate Authoring Rules):
--   3a. CLIENT-owner EXISTS branch:
--     OR EXISTS (
--         SELECT 1 FROM [dbo].[User] u
--         JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
--         WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
--           AND e.[id] = @folderEngagementId
--     )
--   3b. CLIENT-participant EXISTS branch:
--     OR EXISTS (
--         SELECT 1 FROM [dbo].[User] u
--         JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
--         WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
--           AND ep.[engagementId] = @folderEngagementId
--     )
--   Removing 3a reds the positive-owner test (folder owner reads ZERO instead of 1).
--   Removing 3b reds the positive-participant test (AC-FILE-001-04 analogue — participant reads ZERO).
--   Removing the FILTER reds the isolation test (CLIENT-B sees CLIENT-A's folders).
-- // CS-SQL-001 // CS-SQL-002 // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-013-A
CREATE OR ALTER FUNCTION [sec].[fn_folder_access](
    @folderEngagementId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron — RLS-exempt)
        --    IS_MEMBER('app_admin_role') = 1 — ADR-005 §2. // CS-SQL-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full folder visibility + write
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3a. CLIENT owner branch — mirrors fn_document_access 0007 owner EXISTS (byte-identical)
        --     SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId
        --     → Engagement.id = @folderEngagementId (the engagementId of the folder row)
        --     ADR-005 §2: CLIENT branch joins via User.clerkId (stable Clerk user ID string).
        --     ADR-005 §5 Mitigation C: shallow — two JOINs (Engagement + User).
        --     DECISION-A: when clientUserId IS NULL, EXISTS returns false → checked against 3b.
        --     ADR-003 §5: null SESSION_CONTEXT → CAST(NULL...) matches no clerkId → 0 rows.
        --     // CS-SQL-003 // ADR-005 // ADR-003
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND e.[id] = @folderEngagementId
        )

        -- 3b. CLIENT participant branch (NEW — DECISION-013-A / EPIC-012 extension mirror)
        --     SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id → EngagementParticipant.userId
        --     WHERE ep.engagementId = @folderEngagementId (scoped to THIS engagement only).
        --     Mirrors 0005 fn_engagement_access 3b participant branch BYTE-IDENTICAL.
        --     CS-GEN-002: purely additive OR — no existing branch removed or altered.
        --     ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed).
        --     // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-013-A // CS-GEN-002
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND ep.[engagementId] = @folderEngagementId
        )
);
GO

-- ─── Predicate function: fn_folder_write_access (own batch) ──────────────────
-- Returns (1 AS allowed) when the caller can WRITE a Folder row.
-- @folderEngagementId: the engagementId column of the Folder row.
--
-- Accountant-only write — NO CLIENT branch (AC-FILE-010-04).
-- Mirrors sec.fn_document_request_write_access (0007 PART 2) and sec.fn_service_write_access (0002):
--   - Admin principal passes (IS_MEMBER('app_admin_role') = 1).
--   - ACCOUNTANT role passes (SESSION_CONTEXT 'role' = 'ACCOUNTANT').
--   - NO CLIENT branch — CLIENT INSERT/UPDATE/DELETE fails closed (BLOCK error 33504).
--   - NULL SESSION_CONTEXT → no branch matches → fails closed.
--
-- AC-FILE-010-04: Folder management (create/rename/arrange) is accountant-only.
-- // CS-SQL-001 // CS-SQL-003 // ADR-005 // ADR-003 // AC-FILE-010-04
CREATE OR ALTER FUNCTION [sec].[fn_folder_write_access](
    @folderEngagementId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, accountant actions via admin pool)
        --    IS_MEMBER('app_admin_role') = 1 — RLS-exempt (ADR-005 §2). // CS-SQL-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT can write folders (create/rename/arrange via admin actions)
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- NO CLIENT branch: CLIENT INSERT/UPDATE/DELETE fails closed.
        -- NO anonymous branch: null SESSION_CONTEXT fails closed.
        -- This is intentional — folder management is accountant-only (AC-FILE-010-04).
        -- CLIENTs NEVER write folders (create/rename/arrange).
        -- Mirrors fn_document_request_write_access (0007 PART 2) and fn_service_write_access (0002).
        -- // AC-FILE-010-04
);
GO

-- ─── Security policy: pol_Folder (FILTER + BLOCK) ────────────────────────────
-- FILTER PREDICATE: read paths via request pool (app_user_role) are filtered per-row.
--   CLIENT sees only their own engagement's folders (owner + participant — fn_folder_access).
--   ACCOUNTANT sees all; admin sees all.
-- BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE):
--   Prevents any request-pool write operations from CLIENTs (fn_folder_write_access — accountant-only).
--   Accountant folder operations run through server actions (which set SESSION_CONTEXT role=ACCOUNTANT).
--   The BLOCK predicate is defence-in-depth — CLIENTs cannot create/rename/arrange folders.
--
-- NOTE: The FILTER uses fn_folder_access (read predicate — 3 branches including CLIENT).
--       The BLOCK uses fn_folder_write_access (write predicate — 2 branches, NO CLIENT).
--       This is the same pattern as pol_DocumentRequest (0007 PART 2):
--         FILTER = read-permissive (CLIENT can read), BLOCK = write-restrictive (accountant-only).
--
-- AC-FILE-010-04: Folder management is accountant-only. // AC-FILE-010-04
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3. // CS-SQL-001 // CS-SQL-003 // ADR-005
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_Folder' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_Folder];

CREATE SECURITY POLICY [sec].[pol_Folder]
    -- FILTER predicate: CLIENT reads own engagement's folders (owner or participant); ACCOUNTANT/admin read all.
    ADD FILTER PREDICATE [sec].[fn_folder_access]([engagementId])
        ON [dbo].[Folder]
    -- BLOCK predicates: accountant-only writes — NO CLIENT branch in write predicate (AC-FILE-010-04).
    -- Any request-pool INSERT/UPDATE/DELETE from a CLIENT fails closed.
    , ADD BLOCK PREDICATE [sec].[fn_folder_write_access]([engagementId])
        ON [dbo].[Folder] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_folder_write_access]([engagementId])
        ON [dbo].[Folder] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_folder_write_access]([engagementId])
        ON [dbo].[Folder] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_folder_write_access]([engagementId])
        ON [dbo].[Folder] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

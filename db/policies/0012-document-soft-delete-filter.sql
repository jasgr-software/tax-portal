-- db/policies/0012-document-soft-delete-filter.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the EPIC-014 soft-delete RLS change (BRIEF-014 / TASK-014-001):
--   1. fn_document_access — signature gains a second parameter @documentDeletedAt DATETIMEOFFSET.
--      CLIENT branches (3a owner, 3b participant) each additionally require
--      AND @documentDeletedAt IS NULL — a soft-deleted doc falls out of the CLIENT result.
--      Admin (branch 1) and ACCOUNTANT (branch 2) branches are UNCHANGED (byte-identical).
--      pol_Document FILTER predicate: fn_document_access([engagementId],[deletedAt]).
--      pol_Document BLOCK predicates: fn_document_access([engagementId],[deletedAt]) — also updated.
--      DECISION-014-B: FILTER uses the two-param form. BLOCK also uses the two-param form.
--        For a new INSERT, deletedAt=NULL → NULL IS NULL = TRUE → CLIENT EXISTS check runs normally.
--        Client uploads (INSERT of active doc with deletedAt=NULL) continue to work. ✓
--        BEFORE UPDATE on active doc: deletedAt=NULL (existing row) → passes. ✓
--        BEFORE UPDATE on soft-deleted doc: deletedAt≠NULL → CLIENT blocked (defense-in-depth). ✓
--        Accountant: branch 2 always passes regardless of deletedAt. ✓
--
--   2. fn_document_version_access — CLIENT branches (3a/3b) gain AND d.[deletedAt] IS NULL
--      read from the existing JOIN [dbo].[Document] d. No new parameter needed.
--      Admin (branch 1) and ACCOUNTANT (branch 2) branches are UNCHANGED (byte-identical).
--      pol_DocumentVersion predicates unchanged in signature.
--      DECISION-014-C: parent-doc join already exists; filter added only to CLIENT EXISTS blocks.
--
-- ADR-005 § Decision:
--   "Every table containing client-scoped data is covered by a SQL Server SECURITY POLICY
--    keyed off SESSION_CONTEXT(N'clerk_user_id')."
--
-- ADR-018 §1: soft-delete-first — deletedAt tombstone removes a doc from the CLIENT/working
--   view without issuing a physical DELETE. This RLS change is the enforcement mechanism.
--
-- ADR-009: Document.deletedAt per the signed-URL doc soft-delete definition.
--
-- ADR-005 §2 predicate shape (fn_document_access — updated two-param form):
--   Branch 1: IS_MEMBER('app_admin_role') = 1 → always passes (admin pool) — UNCHANGED.
--   Branch 2: SESSION_CONTEXT('role') = 'ACCOUNTANT' → always passes — UNCHANGED.
--   Branch 3a (owner): AND @documentDeletedAt IS NULL AND CLIENT EXISTS (owner) — active docs only.
--   Branch 3b (participant): AND @documentDeletedAt IS NULL AND CLIENT EXISTS (participant) — same.
--   Admin/accountant see all rows INCLUDING soft-deleted (for recovery, AC-FILE-006-03).
--   Null SESSION_CONTEXT → CLIENT EXISTS empty → 0 rows (fail-closed — ADR-003 §5). UNCHANGED.
--
-- ADR-005 §5 Performance rules:
--   - ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines (Mitigation B).
--   - Predicate is shallow: two parallel EXISTS branches; each touches ≤2 JOINs. UNCHANGED.
--
-- ADR-003 Amendment 1: sp_set_session_context SET must NOT use @read_only = 1 anywhere.
--   This policy file does not call sp_set_session_context — caller responsibility. UNCHANGED.
--
-- CS-SQL-001: changed predicate → isolation test required (HARD GATE).
--   Proof: packages/db/src/document.soft-delete-isolation.rls.test.ts (TASK-014-001).
-- CS-SQL-002: Track B only — not expressible via Track A (Prisma cannot express RLS predicates).
-- CS-SQL-003: predicate shape conventions — ITVF, admin/accountant-first, fail-closed.
-- CS-GEN-002: additive — admin/accountant branches BYTE-IDENTICAL; only CLIENT branches gain
--   the deletedAt IS NULL condition. No existing branch removed or altered.
-- CS-GEN-003: governing keys cited throughout. // CS-GEN-003
--
-- Prerequisite: Document.deletedAt column must exist (Track A migration 20260624111211).
--   pnpm db:migrate runs Track A → Track B in order, so this holds.
--
-- Idempotent: DROP-before-alter preamble (Part 0) + CREATE OR ALTER FUNCTION.
--   Re-applying this policy (pnpm db:policies:apply) is safe.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 0: Drop live policies before altering predicate functions
-- ─────────────────────────────────────────────────────────────────────────────
-- SQL Server prevents CREATE OR ALTER of a function that is referenced by a live
-- SECURITY POLICY (even when the function body changes — function signature change here).
-- Drop the policies first, alter the functions, then recreate in later batches.
-- Pattern mirrors 0007 PART 0B (EPIC-013 extension) and 0005 preamble (EPIC-012 extension).
--
-- fn_document_access signature change (DECISION-014-B): adding @documentDeletedAt param.
--   pol_Document references fn_document_access → must drop before CREATE OR ALTER.
-- fn_document_version_access body change (DECISION-014-C): CLIENT branches gain AND d.deletedAt IS NULL.
--   pol_DocumentVersion references fn_document_version_access → must drop before CREATE OR ALTER.
--
-- pol_DocumentRequest: NOT dropped here — it references fn_document_request_access and
--   fn_document_request_write_access, neither of which is changed in this file. ✓
--
-- // CS-GEN-002 // ADR-005 // DECISION-014-B // DECISION-014-C

-- Drop pol_Document (references fn_document_access — signature changing in PART 1 below):
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_Document' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_Document];
GO

-- Drop pol_DocumentVersion (references fn_document_version_access — body changing in PART 2 below):
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_DocumentVersion' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_DocumentVersion];
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1: fn_document_access — add @documentDeletedAt param; CLIENT branches gain IS NULL check
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Predicate function: fn_document_access (own batch) ──────────────────────
-- Returns (1 AS allowed) when the caller can access the Document row.
--
-- EPIC-014 signature change (DECISION-014-B): second parameter @documentDeletedAt added.
--
-- Parameters:
--   @documentEngagementId UNIQUEIDENTIFIER — the engagementId column (isolation boundary).
--   @documentDeletedAt    DATETIMEOFFSET   — the deletedAt column (soft-delete tombstone).
--
-- FILTER predicate form: fn_document_access([engagementId],[deletedAt])
--   The second column ([deletedAt]) is passed positionally from the Document table row.
--   SQL Server evaluates this function for every row the FILTER applies to.
--
-- BLOCK predicate form: fn_document_access([engagementId],[deletedAt]) — same two-param fn.
--   For BLOCK AFTER INSERT: [deletedAt] from the newly inserted row.
--     New uploads have deletedAt=NULL → NULL IS NULL = TRUE → CLIENT EXISTS check runs. ✓
--     Client upload (INSERT of active doc) continues to work. DECISION-014-B requirement met.
--   For BLOCK BEFORE UPDATE: [deletedAt] from the existing row (before the update).
--     Active doc (deletedAt=NULL): NULL IS NULL = TRUE → CLIENT can update own active doc. ✓
--     Soft-deleted doc (deletedAt IS NOT NULL): FALSE → CLIENT blocked from updating. ✓ (defense-in-depth)
--   For BLOCK BEFORE DELETE: [deletedAt] from the existing row.
--     Physical DELETE is never issued on the request path (ADR-018 §1 soft-delete-first).
--     This BLOCK is defense-in-depth only.
--   Accountant: branch 2 always passes regardless of deletedAt. ✓
--
-- Four branches (ADR-005 §2 skeleton + EPIC-013/TASK-013-001 participant extension + EPIC-014 soft-delete filter):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes. UNCHANGED.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes. UNCHANGED.
--      ACCOUNTANT sees ALL rows INCLUDING soft-deleted (for recovery — AC-FILE-006-03).
--   3a. CLIENT owner branch (UPDATED — EPIC-014 / DECISION-014-B):
--      EXISTS (owner via Engagement.clientUserId) AND @documentDeletedAt IS NULL.
--      The AND @documentDeletedAt IS NULL is the only change from 0007 3a (CS-GEN-002 additive).
--      NULL SESSION_CONTEXT → EXISTS empty → 0 rows (ADR-003 §5, fail-closed). UNCHANGED.
--   3b. CLIENT participant branch (UPDATED — EPIC-014 / DECISION-014-B):
--      EXISTS (participant via EngagementParticipant) AND @documentDeletedAt IS NULL.
--      The AND @documentDeletedAt IS NULL is the only change from 0007 3b (CS-GEN-002 additive).
--      ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed). UNCHANGED.
--
-- Named code path for Gate Authoring evidence:
--   3a. CLIENT-owner branch (updated — AND @documentDeletedAt IS NULL added):
--     OR (
--         @documentDeletedAt IS NULL
--         AND EXISTS (
--             SELECT 1 FROM [dbo].[User] u
--             JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
--             WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
--               AND e.[id] = @documentEngagementId
--         )
--     )
--   3b. CLIENT-participant branch (updated — AND @documentDeletedAt IS NULL added):
--     OR (
--         @documentDeletedAt IS NULL
--         AND EXISTS (
--             SELECT 1 FROM [dbo].[User] u
--             JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
--             WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
--               AND ep.[engagementId] = @documentEngagementId
--         )
--     )
--   Removing IS NULL from 3a/3b reds the soft-delete invisibility tests (deleted doc visible to CLIENT).
--   Removing 3a reds the positive-owner test (owner reads ZERO for active doc).
--   Removing 3b reds the positive-participant test (participant reads ZERO for active doc).
--   Removing the FILTER reds the isolation test (CLIENT-B sees CLIENT-A's documents).
--
-- // CS-SQL-001 // CS-SQL-003 // ADR-005 // ADR-003 // ADR-018 // ADR-009 // DECISION-014-B // CS-GEN-002 // CS-GEN-003
CREATE OR ALTER FUNCTION [sec].[fn_document_access](
    @documentEngagementId UNIQUEIDENTIFIER,
    @documentDeletedAt    DATETIMEOFFSET
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron — RLS-exempt)
        --    IS_MEMBER('app_admin_role') = 1 — ADR-005 §2. // CS-SQL-003
        --    UNCHANGED from 0007 — admin sees ALL rows including soft-deleted. // CS-GEN-002
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full document visibility
        --    including soft-deleted documents (for recovery — AC-FILE-006-03, TASK-014-003).
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        --    UNCHANGED from 0007 — ACCOUNTANT sees ALL rows including soft-deleted. // CS-GEN-002
        --    // ADR-018 // ADR-005
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3a. CLIENT owner branch (UPDATED — EPIC-007 original + EPIC-013 + EPIC-014 soft-delete filter)
        --     AND @documentDeletedAt IS NULL: soft-deleted docs fall out of CLIENT result. AC-FILE-006-01.
        --     EXISTS logic BYTE-IDENTICAL to 0007 3a — owner ownership via User.clerkId + Engagement.
        --     Only the outer AND @documentDeletedAt IS NULL condition is new (CS-GEN-002 additive).
        --     ADR-005 §2: CLIENT branch joins via User.clerkId (stable Clerk user ID string).
        --     DECISION-A: when clientUserId IS NULL, EXISTS returns false → checked against 3b.
        --     ADR-003 §5: null SESSION_CONTEXT → CAST(NULL...) matches no clerkId → EXISTS empty → 0 rows.
        --     // CS-SQL-003 // ADR-005 // ADR-003 // CS-GEN-002 // DECISION-014-B // AC-FILE-006-01
        OR (
            @documentDeletedAt IS NULL
            AND EXISTS (
                SELECT 1 FROM [dbo].[User] u
                JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
                WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
                  AND e.[id] = @documentEngagementId
            )
        )

        -- 3b. CLIENT participant branch (UPDATED — EPIC-013/TASK-013-001 + EPIC-014 soft-delete filter)
        --     AND @documentDeletedAt IS NULL: soft-deleted docs fall out of participant CLIENT result.
        --     EXISTS logic BYTE-IDENTICAL to 0007 3b — participant via EngagementParticipant.
        --     Only the outer AND @documentDeletedAt IS NULL condition is new (CS-GEN-002 additive).
        --     CS-GEN-002: purely additive — no existing branch removed or altered.
        --     ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed).
        --     // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-013-A // CS-GEN-002 // DECISION-014-B // AC-FILE-006-01
        OR (
            @documentDeletedAt IS NULL
            AND EXISTS (
                SELECT 1 FROM [dbo].[User] u
                JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
                WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
                  AND ep.[engagementId] = @documentEngagementId
            )
        )
);
GO

-- ─── Security policy: pol_Document (FILTER + BLOCK) ──────────────────────────
-- Policy was dropped in the preamble batch (Part 0 — required to allow fn signature change).
-- This batch recreates it against the updated two-param predicate function.
--
-- FILTER PREDICATE: fn_document_access([engagementId],[deletedAt]) — TWO columns (EPIC-014 change).
--   CLIENT sees only active (deletedAt IS NULL) documents in their engagement. AC-FILE-006-01.
--   ACCOUNTANT/admin see ALL documents including soft-deleted (for recovery). AC-FILE-004-02/-03. ✓
--
-- BLOCK predicates: fn_document_access([engagementId],[deletedAt]) — TWO columns.
--   For INSERT: new row deletedAt=NULL → NULL IS NULL = TRUE → CLIENT EXISTS check runs normally. ✓
--   Client uploads (new active documents) continue to work. DECISION-014-B.
--   For BEFORE UPDATE: existing row's deletedAt drives the guard.
--     Active docs (deletedAt=NULL): CLIENT can update own docs. ✓
--     Soft-deleted docs (deletedAt IS NOT NULL): CLIENT blocked (defense-in-depth). ✓
--   Accountant: branch 2 always passes regardless. ✓
--
-- No new client write path is opened:
--   The BLOCK predicates do not add any CLIENT write capability.
--   INSERT of new docs (deletedAt=NULL) worked before and continues to work.
--   The accountant-only delete (set deletedAt) is enforced at the application layer (TASK-014-003).
--   This is DECISION-014-B: the BLOCK correctly allows client upload while preventing client
--   interaction with soft-deleted documents at the DB layer (defense-in-depth).
--
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3.
-- // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-014-B // AC-FILE-006-01 // AC-FILE-004-02 // AC-FILE-004-03
CREATE SECURITY POLICY [sec].[pol_Document]
    -- FILTER predicate: two-param form — CLIENT sees only active (non-deleted) documents
    ADD FILTER PREDICATE [sec].[fn_document_access]([engagementId], [deletedAt])
        ON [dbo].[Document]
    -- BLOCK predicates: two-param form (new doc INSERT has deletedAt=NULL → CLIENT can insert)
    , ADD BLOCK PREDICATE [sec].[fn_document_access]([engagementId], [deletedAt])
        ON [dbo].[Document] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_document_access]([engagementId], [deletedAt])
        ON [dbo].[Document] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_document_access]([engagementId], [deletedAt])
        ON [dbo].[Document] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_document_access]([engagementId], [deletedAt])
        ON [dbo].[Document] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2: fn_document_version_access — CLIENT branches gain AND d.[deletedAt] IS NULL
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Predicate function: fn_document_version_access (own batch) ──────────────
-- Returns (1 AS allowed) when the caller can access a DocumentVersion row.
--
-- EPIC-014 change (DECISION-014-C):
--   CLIENT branches (3a/3b) gain AND d.[deletedAt] IS NULL.
--   The existing JOIN [dbo].[Document] d on documentId is already present — no new JOIN.
--   A soft-deleted Document's versions leave the CLIENT view (AC-FILE-006-01).
--   Admin (branch 1) and ACCOUNTANT (branch 2) branches are UNCHANGED (byte-identical).
--   CS-GEN-002: the only change is adding AND d.[deletedAt] IS NULL inside the two CLIENT EXISTS.
--   An accountant can still read ALL version rows including those of a soft-deleted doc (recovery path).
--
-- No new parameter: @documentVersionDocumentId remains the single param.
--   The deletedAt value is read from d.[deletedAt] in the existing JOIN.
--
-- Four branches (ADR-005 §2 skeleton + EPIC-012 participant extension + EPIC-014 deletedAt filter):
--   1. Admin principal always passes. UNCHANGED. // CS-GEN-002
--   2. ACCOUNTANT role always passes. UNCHANGED. // CS-GEN-002
--   3a. CLIENT owner branch: dv.documentId → Document.engagementId → Engagement.clientUserId
--       → User.clerkId = SESSION_CONTEXT AND d.[deletedAt] IS NULL (NEW — DECISION-014-C).
--   3b. CLIENT participant branch: dv.documentId → Document.engagementId
--       → EngagementParticipant → User.clerkId = SESSION_CONTEXT AND d.[deletedAt] IS NULL (NEW).
--   NULL SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed — ADR-003 §5). UNCHANGED.
--
-- Named code path for Gate Authoring evidence:
--   3a. CLIENT-owner EXISTS branch (updated — AND d.[deletedAt] IS NULL added):
--     OR EXISTS (
--         SELECT 1 FROM [dbo].[Document] d
--         JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
--         JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
--         WHERE d.[id] = @documentVersionDocumentId
--           AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
--           AND d.[deletedAt] IS NULL
--     )
--   3b. CLIENT-participant EXISTS branch (updated — AND d.[deletedAt] IS NULL added):
--     OR EXISTS (
--         SELECT 1 FROM [dbo].[Document] d
--         JOIN [dbo].[EngagementParticipant] ep ON ep.[engagementId] = d.[engagementId]
--         JOIN [dbo].[User] u ON u.[id] = ep.[userId]
--         WHERE d.[id] = @documentVersionDocumentId
--           AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
--           AND d.[deletedAt] IS NULL
--     )
--   Removing d.[deletedAt] IS NULL from 3a/3b reds the soft-delete invisibility tests.
--   Removing 3a reds the positive-owner test (owner reads version ZERO instead of 1+).
--   Removing 3b reds the positive-participant test (participant reads version ZERO instead of 1+).
--   Removing the FILTER reds the isolation test (CLIENT-B sees CLIENT-A's version rows).
--
-- // CS-SQL-001 // CS-SQL-002 // CS-SQL-003 // ADR-005 // ADR-003 // ADR-018 // ADR-009
-- // DECISION-013-B // DECISION-013-A // DECISION-014-C // CS-GEN-002 // CS-GEN-003
CREATE OR ALTER FUNCTION [sec].[fn_document_version_access](
    @documentVersionDocumentId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron — RLS-exempt)
        --    IS_MEMBER('app_admin_role') = 1 — ADR-005 §2. // CS-SQL-003
        --    UNCHANGED from 0011 — admin sees version rows of ALL docs including soft-deleted. // CS-GEN-002
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full version visibility
        --    including versions of soft-deleted documents (for recovery — AC-FILE-006-03).
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        --    UNCHANGED from 0011 — ACCOUNTANT sees version rows of ALL docs including soft-deleted. // CS-GEN-002
        --    // ADR-018 // ADR-005
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3a. CLIENT owner branch (UPDATED — EPIC-014: AND d.[deletedAt] IS NULL added)
        --     Two-JOIN path: DocumentVersion.documentId → Document (d) → Engagement → User
        --     AND d.[deletedAt] IS NULL: if parent doc is soft-deleted, versions leave CLIENT view.
        --     EXISTS logic BYTE-IDENTICAL to 0011 3a, plus the deletedAt guard (CS-GEN-002 additive).
        --     ADR-003 §5: null SESSION_CONTEXT → CAST(NULL...) matches no clerkId → EXISTS empty → 0 rows.
        --     DECISION-A: NULL clientUserId → EXISTS returns false → checked against 3b.
        --     // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-014-C // CS-GEN-002 // AC-FILE-006-01
        OR EXISTS (
            SELECT 1 FROM [dbo].[Document] d
            JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
            JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
            WHERE d.[id] = @documentVersionDocumentId
              AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND d.[deletedAt] IS NULL
        )

        -- 3b. CLIENT participant branch (UPDATED — EPIC-014: AND d.[deletedAt] IS NULL added)
        --     Two-JOIN path: DocumentVersion.documentId → Document (d) → EngagementParticipant + User
        --     AND d.[deletedAt] IS NULL: if parent doc is soft-deleted, versions leave CLIENT view.
        --     EXISTS logic BYTE-IDENTICAL to 0011 3b, plus the deletedAt guard (CS-GEN-002 additive).
        --     WHERE ep.engagementId = doc's engagementId (scoped to THIS engagement only).
        --     ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed).
        --     // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-013-A // DECISION-014-C // CS-GEN-002 // AC-FILE-006-01
        OR EXISTS (
            SELECT 1 FROM [dbo].[Document] d
            JOIN [dbo].[EngagementParticipant] ep ON ep.[engagementId] = d.[engagementId]
            JOIN [dbo].[User] u ON u.[id] = ep.[userId]
            WHERE d.[id] = @documentVersionDocumentId
              AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND d.[deletedAt] IS NULL
        )
);
GO

-- ─── Security policy: pol_DocumentVersion (FILTER + BLOCK) ───────────────────
-- Policy was dropped in the preamble batch (Part 0 — required to allow fn body change).
-- This batch recreates it against the updated predicate function.
--
-- FILTER PREDICATE: fn_document_version_access([documentId]) — signature UNCHANGED.
--   CLIENT sees version rows only for active (non-deleted) parent documents.
--   ACCOUNTANT/admin see ALL version rows including those of soft-deleted docs (recovery). ✓
--   AC-FILE-009-03: prior (superseded) version rows remain SELECT-able for eligible callers. ✓
--
-- BLOCK predicates: fn_document_version_access([documentId]) — signature UNCHANGED.
--   Defense-in-depth for request-pool write attempts outside the predicate's scope.
--   Version creation (TASK-013-002) runs via admin pool or accountant SESSION_CONTEXT.
--   A CLIENT cannot insert/update/delete version rows of a soft-deleted parent document.
--   (The deletedAt IS NULL guard in the CLIENT EXISTS prevents this.) ✓
--
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3.
-- // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-014-C // AC-FILE-006-01 // AC-FILE-009-03
CREATE SECURITY POLICY [sec].[pol_DocumentVersion]
    -- FILTER predicate: CLIENT reads version rows for active (non-deleted) parent documents
    ADD FILTER PREDICATE [sec].[fn_document_version_access]([documentId])
        ON [dbo].[DocumentVersion]
    -- BLOCK predicates: defence-in-depth — request pool cannot insert/update/delete
    -- version rows outside the predicate's scope (owner + participant + accountant + admin,
    -- restricted to active parent documents for CLIENT access).
    , ADD BLOCK PREDICATE [sec].[fn_document_version_access]([documentId])
        ON [dbo].[DocumentVersion] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_document_version_access]([documentId])
        ON [dbo].[DocumentVersion] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_document_version_access]([documentId])
        ON [dbo].[DocumentVersion] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_document_version_access]([documentId])
        ON [dbo].[DocumentVersion] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

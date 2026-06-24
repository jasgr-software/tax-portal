-- db/policies/0007-document-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements security policies for EPIC-007 document entities:
--   1. Document — FILTER + BLOCK (CLIENT-owned and CLIENT-isolated — THIRD client-owned family)
--   2. DocumentRequest — FILTER (client reads own engagement's requests) + BLOCK (accountant-only write)
--
-- This is the THIRD client-owned-rows policy in the system (first: 0005-engagement-policy.sql,
-- second: 0006-questionnaire-policy.sql).
--
-- EPIC-013 / BRIEF-013 / TASK-013-001 update (DECISION-013-A, AC-FILE-001-04):
--   fn_document_access CLIENT branch EXTENDED (additive, CS-GEN-002) to allow participant access.
--   New form: owner EXISTS OR participant EXISTS (mirror of 0005 EPIC-012 extension).
--   Owner branch is BYTE-IDENTICAL to the EPIC-007 original — no regression (AC-FILE-001-03/AC-FILE-001-05).
--   An unrelated CLIENT (neither owner nor participant) still sees ZERO documents.
--   pol_Document is DROPPED and RECREATED (same pattern as 0005 preamble / 0009) to allow
--   CREATE OR ALTER of fn_document_access which is referenced by the live policy.
--
-- ADR-005 § Decision:
--   "Every table containing client-scoped data is covered by a SQL Server SECURITY POLICY
--    keyed off SESSION_CONTEXT(N'clerk_user_id')."
--
-- Document design (ADR-009, TASK-007-003):
--   The file metadata rows are CLIENT-OWNED AND CLIENT-ISOLATED.
--   Isolation column: Document.engagementId → the FILTER predicate keys on this.
--   Ownership join: Document.engagementId → Engagement.clientUserId → User.clerkId
--   → SESSION_CONTEXT('clerk_user_id').
--   Participant join (new — TASK-013-001): Document.engagementId → EngagementParticipant.engagementId
--   → User.clerkId → SESSION_CONTEXT('clerk_user_id').
--   Mirrors the 0005 engagement-policy.sql EPIC-012 extension pattern exactly.
--
-- DocumentRequest design (TASK-007-003):
--   The request rows are ACCOUNTANT-AUTHORED but CLIENT-READABLE (clients can read their own
--   engagement's requests to know what to upload — AC-FILE-007-02).
--
--   This DIFFERS from QuestionnaireTemplate (0006 PART 2) which had NO client FILTER because
--   clients read templates via the ADMIN pool.
--
--   Here clients read DocumentRequests via the REQUEST POOL, so DocumentRequest DOES get a
--   client-read FILTER: the owning client can READ their own engagement's requests.
--   The BLOCK is accountant-only write — NO CLIENT branch (mirrors fn_service_write_access
--   from 0002-service-readable.sql and fn_questionnaire_template_write_access from 0006).
--
-- ADR-005 §2 predicate shape:
--   Branch 1: IS_MEMBER('app_admin_role') = 1 → always passes (admin pool).
--   Branch 2: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT' → passes.
--   Branch 3a (owner — ORIGINAL EPIC-007): CLIENT EXISTS — ownership via User.clerkId + Engagement.
--   Branch 3b (participant — NEW EPIC-013/TASK-013-001): CLIENT EXISTS — via EngagementParticipant.
--
-- ADR-003 §5: Null SESSION_CONTEXT → all branches fail → empty result → ZERO rows (fail-closed).
-- DECISION-A (carried from 0005): NULL Engagement.clientUserId → EXISTS returns false → 0 rows.
--   An unassigned engagement's documents/requests are invisible to all CLIENTs until back-fill.
--   When clientUserId IS NULL, the owner EXISTS returns false → participant path checked (3b).
--   If no participant row exists either → 0 rows (correct: unassigned engagement invisible).
--
-- ADR-005 §5 Performance rules:
--   - ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines (Mitigation B).
--   - Predicate is shallow: two parallel EXISTS branches; each touches ≤2 JOINs.
--     Matches 0005 (fn_engagement_access EPIC-012 form) parallel-EXISTS precedent.
--
-- ADR-003 Amendment 1: sp_set_session_context SET must NOT use @read_only = 1 anywhere.
--   This policy file does not call sp_set_session_context — caller responsibility.
--
-- Track B: status CHECK constraint on Document — added here because Prisma cannot express
--   DB-level CHECK constraints. ADR-009: status must be 'pending', 'active', or 'infected'.
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 0 (preamble): Document.status CHECK constraint (ADR-009)
-- ─────────────────────────────────────────────────────────────────────────────
-- This CHECK constraint enforces the three-value enum ('pending'|'active'|'infected').
-- Track A (Prisma) cannot express DB-level CHECK constraints — therefore it lives here (Track B).
-- Applied before the FILTER/BLOCK policies since the constraint is on the table itself.
-- Idempotent: only add if not already present.
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'Document_status_chk'
      AND parent_object_id = OBJECT_ID('dbo.Document')
)
BEGIN
    ALTER TABLE [dbo].[Document]
        ADD CONSTRAINT [Document_status_chk]
        CHECK ([status] IN (N'pending', N'active', N'infected'));
END
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 0B (preamble): Drop live policies before altering predicate functions
-- ─────────────────────────────────────────────────────────────────────────────
-- SQL Server prevents CREATE OR ALTER of a function that is referenced by a live
-- SECURITY POLICY (even when the function body is changing). Drop the policies first,
-- alter the functions, then recreate the policies in later batches. The drop+recreate is
-- still idempotent — this batch handles both the first-apply and re-apply cases.
-- EPIC-013 / TASK-013-001 (DECISION-013-A / BRIEF-013): required because fn_document_access is
-- being extended to add the participant EXISTS branch (AC-FILE-001-04).
-- Pattern mirrors 0005 preamble (EPIC-012 extension of fn_engagement_access)
-- and 0009 preamble (DROP before function alter).
-- // CS-GEN-002 (additive extension — owner branch byte-preserved)
--
-- Drop pol_Document (references fn_document_access — being extended in PART 1 below):
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_Document' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_Document];
GO

-- Drop pol_DocumentRequest (references fn_document_request_access and fn_document_request_write_access
-- — these functions are also in this file and must be dropped before CREATE OR ALTER in PART 2):
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_DocumentRequest' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_DocumentRequest];
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1: Document — CLIENT-owned rows (FILTER + BLOCK)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Predicate function: fn_document_access (own batch) ──────────────────────
-- Returns (1 AS allowed) when the caller can access the Document row.
-- @documentEngagementId: the engagementId column of the Document row.
--   The isolation boundary is the owning Engagement (not a self-join on the document id).
--   This is the column value that the FILTER predicate passes when evaluating each row.
--
-- EPIC-013 / TASK-013-001 (DECISION-013-A / AC-FILE-001-04):
--   CLIENT branch EXTENDED (additive, CS-GEN-002) to allow participant access.
--   New form: owner EXISTS (3a, ORIGINAL — BYTE-IDENTICAL) OR participant EXISTS (3b, NEW).
--   An unrelated CLIENT (neither owner nor participant) still sees ZERO documents.
--   Owner access is unchanged (3a still passes — no regression to AC-FILE-001-03/AC-FILE-001-05).
--
-- Four branches (ADR-005 §2 skeleton + EPIC-013/TASK-013-001 participant extension):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--      Accountant-readable for file review (required by ADR-005 — all client-owned rows must be
--      accountant-readable).
--   3a. CLIENT owner branch (ORIGINAL — EPIC-007, byte-identical, AC-FILE-001-05 preserved):
--      SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId
--      AND Engagement.id = @documentEngagementId.
--      NULL SESSION_CONTEXT → CAST(NULL...) matches no clerkId → EXISTS empty → 0 rows.
--      DECISION-A: NULL Engagement.clientUserId → JOIN returns false → EXISTS empty → 0 rows.
--   3b. CLIENT participant branch (NEW — EPIC-013/TASK-013-001 / DECISION-013-A / AC-FILE-001-04):
--      SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id → EngagementParticipant.userId
--      WHERE ep.engagementId = @documentEngagementId (scoped to THIS engagement only).
--      Mirrors 0005 fn_engagement_access 3b participant branch BYTE-IDENTICAL.
--      ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed).
--
-- Named code path for Gate Authoring evidence (ENGINE.md § Gate Authoring Rules):
--   3a. CLIENT-owner EXISTS branch (ORIGINAL — EPIC-007):
--     OR EXISTS (
--         SELECT 1 FROM [dbo].[User] u
--         JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
--         WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
--           AND e.[id] = @documentEngagementId
--     )
--   3b. CLIENT-participant EXISTS branch (NEW — EPIC-013 / TASK-013-001):
--     OR EXISTS (
--         SELECT 1 FROM [dbo].[User] u
--         JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
--         WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
--           AND ep.[engagementId] = @documentEngagementId
--     )
--   Removing 3a reds the positive owner test (owner reads ZERO instead of 1).
--   Removing 3b reds the positive participant test (AC-FILE-001-04: participant reads ZERO instead of 1).
--   Removing the FILTER reds the isolation test (CLIENT-B sees CLIENT-A's documents).
-- // CS-SQL-001 // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-013-A // CS-GEN-002
CREATE OR ALTER FUNCTION [sec].[fn_document_access](
    @documentEngagementId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron — RLS-exempt)
        --    IS_MEMBER('app_admin_role') = 1 — ADR-005 §2. // CS-SQL-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full document visibility
        --    Required by ADR-005 for all client-owned-row families.
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3a. CLIENT owner branch (ORIGINAL — EPIC-007, byte-identical, AC-FILE-001-05 preserved)
        --     SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId
        --     → Engagement.id = @documentEngagementId (the engagementId of the document row)
        --     ADR-005 §2: CLIENT branch joins via User.clerkId (stable Clerk user ID string).
        --     ADR-005 §5 Mitigation C: two JOINs (Engagement + User) — matches 0005/0006 pattern.
        --     DECISION-A: when clientUserId IS NULL, EXISTS returns false → checked against 3b.
        --     ADR-003 §5: null SESSION_CONTEXT('clerk_user_id') → CAST(NULL...) matches no
        --     clerkId → no match → EXISTS empty → falls through to 3b (also empty) → 0 rows.
        --     // CS-SQL-003 // ADR-005 // ADR-003
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND e.[id] = @documentEngagementId
        )

        -- 3b. CLIENT participant branch (NEW — EPIC-013 / TASK-013-001 / DECISION-013-A / AC-FILE-001-04)
        --     SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id → EngagementParticipant.userId
        --     WHERE ep.engagementId = @documentEngagementId (scoped to THIS engagement only).
        --     Mirrors 0005 fn_engagement_access 3b participant branch BYTE-IDENTICAL EXISTS shape.
        --     CS-GEN-002: purely additive OR — no existing branch removed or altered.
        --     Owner access is unchanged (3a still passes — no regression to AC-FILE-001-03/AC-FILE-001-05).
        --     An unrelated CLIENT (neither owner nor participant) sees ZERO (both EXISTS empty).
        --     ADR-003 §5: null SESSION_CONTEXT → no match → EXISTS empty → 0 rows (fail-closed).
        --     // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-013-A // CS-GEN-002 // AC-FILE-001-04
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND ep.[engagementId] = @documentEngagementId
        )
);
GO

-- ─── Security policy: pol_Document (FILTER + BLOCK) ──────────────────────────
-- Policy was already dropped in the preamble batch (Part 0B — required to allow fn alter).
-- This batch simply recreates it against the updated predicate function.
-- FILTER PREDICATE: read paths via request pool (app_user_role) are filtered per-row.
--   CLIENT sees only their own engagement's documents (owner + participant); ACCOUNTANT sees all; admin sees all.
-- BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE):
--   Defence-in-depth for any request-pool write attempts outside the predicate's scope.
--   TASK-007-004 wires upload to use SESSION_CONTEXT; the BLOCK predicate allows
--   the owning client (and now participant — AC-FILE-001-04) to insert/update their own documents.
--
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3.
-- // CS-SQL-001 // CS-SQL-003 // ADR-005 // AC-FILE-001-04 // DECISION-013-A
CREATE SECURITY POLICY [sec].[pol_Document]
    -- FILTER predicate: controls SELECT visibility (fail-closed for null SESSION_CONTEXT)
    ADD FILTER PREDICATE [sec].[fn_document_access]([engagementId])
        ON [dbo].[Document]
    -- BLOCK predicates: defence-in-depth — request pool cannot insert/update/delete
    -- document rows outside the predicate's scope (owner + participant + accountant + admin).
    , ADD BLOCK PREDICATE [sec].[fn_document_access]([engagementId])
        ON [dbo].[Document] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_document_access]([engagementId])
        ON [dbo].[Document] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_document_access]([engagementId])
        ON [dbo].[Document] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_document_access]([engagementId])
        ON [dbo].[Document] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2: DocumentRequest — CLIENT-readable, accountant-owned write (FILTER + BLOCK)
-- ─────────────────────────────────────────────────────────────────────────────
-- DocumentRequest differs from QuestionnaireTemplate (0006 PART 2):
--   QuestionnaireTemplate: NO FILTER (clients read via ADMIN pool).
--   DocumentRequest: HAS a FILTER (clients read own engagement's requests via REQUEST pool).
--
-- The BLOCK predicate for writes is accountant-only — NO CLIENT branch (mirrors
-- fn_service_write_access from 0002 and fn_questionnaire_template_write_access from 0006).

-- ─── Predicate function: fn_document_request_access (own batch) ─────────────
-- Returns (1 AS allowed) when the caller can READ a DocumentRequest row.
-- @requestEngagementId: the engagementId column of the DocumentRequest row.
--   The read boundary is the owning Engagement (ownership join: DocumentRequest.engagementId
--   → Engagement.clientUserId → User.clerkId).
--
-- Three branches (ADR-005 §2 skeleton):
--   1. Admin principal always passes.
--   2. ACCOUNTANT role always passes.
--   3. CLIENT reads their own engagement's requests (ownership EXISTS via Engagement).
--      NULL SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed).
--      NULL Engagement.clientUserId → EXISTS empty → 0 rows (DECISION-A).
CREATE OR ALTER FUNCTION [sec].[fn_document_request_access](
    @requestEngagementId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full request visibility
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT read branch — CLIENT can READ their own engagement's requests (AC-FILE-007-02)
        --    SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId
        --    → Engagement.id = @requestEngagementId (the engagementId of the DocumentRequest row)
        --    ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed).
        --    DECISION-A: NULL clientUserId → EXISTS empty → 0 rows.
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND e.[id] = @requestEngagementId
        )
);
GO

-- ─── Predicate function: fn_document_request_write_access (own batch) ────────
-- Returns (1 AS allowed) when the caller can WRITE a DocumentRequest row.
-- @requestEngagementId: the engagementId column of the DocumentRequest row.
--
-- Mirrors sec.fn_service_write_access (0002-service-readable.sql) and
-- sec.fn_questionnaire_template_write_access (0006-questionnaire-policy.sql) exactly:
--   - Admin principal passes (IS_MEMBER('app_admin_role') = 1).
--   - ACCOUNTANT role passes (SESSION_CONTEXT 'role' = 'ACCOUNTANT').
--   - NO CLIENT branch — CLIENT INSERT/UPDATE/DELETE fails closed (error 33504).
--   - NULL SESSION_CONTEXT → no branch matches → fails closed.
--
-- // DECISION: Accountant creates document requests via admin pool (like QuestionnaireTemplate
-- //   write actions). The write boundary is accountant-only. CLIENTs can only READ requests —
-- //   they cannot create, modify, or delete them. This mirrors the fn_service_write_access
-- //   pattern (0002) and fn_questionnaire_template_write_access pattern (0006).
CREATE OR ALTER FUNCTION [sec].[fn_document_request_write_access](
    @requestEngagementId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT can write document requests (create/edit via admin actions)
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- NO CLIENT branch: CLIENT INSERT/UPDATE/DELETE fails closed (error 33504 for AFTER INSERT).
        -- NO anonymous branch: null SESSION_CONTEXT fails closed.
        -- This is intentional — DocumentRequests are accountant-managed.
        -- CLIENTs NEVER write requests; they read them and upload documents in response.
        -- See DECISION comment above and AC-FILE-007-02 (read) vs (no AC for client write).
);
GO

-- ─── Security policy: pol_DocumentRequest (FILTER + BLOCK) ───────────────────
-- FILTER PREDICATE: read paths via request pool (app_user_role) are filtered per-row.
--   CLIENT sees only their own engagement's requests (fn_document_request_access).
--   ACCOUNTANT sees all; admin sees all.
-- BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE):
--   Prevents any request-pool writes outside ACCOUNTANT/admin.
--   Accountant document-request creation runs through admin pool actions.
--   The BLOCK predicate is defence-in-depth for any request-pool write attempts.
--
-- NOTE: The FILTER uses fn_document_request_access (read predicate, 3 branches including CLIENT).
--       The BLOCK uses fn_document_request_write_access (write predicate, 2 branches — NO CLIENT).
--       This is the key distinction from pol_Document (which uses the same predicate for both).
--
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3.
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_DocumentRequest' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_DocumentRequest];

CREATE SECURITY POLICY [sec].[pol_DocumentRequest]
    -- FILTER predicate: CLIENT reads own engagement's requests; ACCOUNTANT/admin read all.
    ADD FILTER PREDICATE [sec].[fn_document_request_access]([engagementId])
        ON [dbo].[DocumentRequest]
    -- BLOCK predicates: accountant-only writes — NO CLIENT branch in write predicate.
    -- Any request-pool INSERT/UPDATE/DELETE from a CLIENT fails closed (error 33504 / 0 rows).
    , ADD BLOCK PREDICATE [sec].[fn_document_request_write_access]([engagementId])
        ON [dbo].[DocumentRequest] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_document_request_write_access]([engagementId])
        ON [dbo].[DocumentRequest] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_document_request_write_access]([engagementId])
        ON [dbo].[DocumentRequest] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_document_request_write_access]([engagementId])
        ON [dbo].[DocumentRequest] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

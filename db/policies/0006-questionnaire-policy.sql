-- db/policies/0006-questionnaire-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements security policies for EPIC-006 questionnaire entities:
--   1. QuestionnaireAnswer — FILTER + BLOCK (client-owned and client-isolated)
--   2. QuestionnaireTemplate — BLOCK only (accountant-owned; admin-pool-read; no client FILTER)
--
-- This is the SECOND client-owned-rows policy in the system (first: 0005-engagement-policy.sql).
--
-- ADR-005 § Decision:
--   "Every table containing client-scoped data is covered by a SQL Server SECURITY POLICY
--    keyed off SESSION_CONTEXT(N'clerk_user_id')."
--
-- QuestionnaireAnswer design (DECISION-H, EPIC-006):
--   The client's submitted answers are CLIENT-OWNED AND CLIENT-ISOLATED.
--   Ownership join: QuestionnaireAnswer.engagementId → Engagement.clientUserId → User.clerkId
--   → SESSION_CONTEXT('clerk_user_id').
--   Mirrors the 0005 engagement-policy.sql ownership join pattern exactly.
--
-- QuestionnaireTemplate design (DECISION-G, EPIC-006):
--   The template is ACCOUNTANT-MANAGED — NOT client-owned.
--   Clients read template content via the admin pool at step 2 (like LetterTemplate).
--   BLOCK predicates only (no FILTER): mirrors fn_service_write_access (0002-service-readable.sql).
--   NO CLIENT branch in the write predicate — fails closed.
--
-- ADR-005 §2 predicate shape:
--   Branch 1: IS_MEMBER('app_admin_role') = 1 → always passes (admin pool).
--   Branch 2: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT' → passes.
--   Branch 3 (answer FILTER only): CLIENT EXISTS — ownership via User.clerkId + Engagement.
--
-- ADR-003 §5: Null SESSION_CONTEXT → all branches fail → empty result → ZERO rows (fail-closed).
-- DECISION-A (carried from 0005): NULL Engagement.clientUserId → EXISTS returns false → 0 rows.
--   An unassigned engagement's answers are invisible to all CLIENTs until back-fill.
--
-- ADR-005 §5 Performance rules:
--   - ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines (Mitigation B).
--   - Predicate is shallow: two JOINs (Engagement + User) to reach the ownership boundary.
--     Follows Mitigation C rule: "each predicate reaches the boundary in one JOIN at most".
--     Here we need TWO tables (Engagement → User) because the ownership is on the parent row.
--     This matches the 0005 engagement-policy.sql precedent exactly.
--
-- ADR-003 Amendment 1: sp_set_session_context SET must NOT use @read_only = 1 anywhere.
--   This policy file does not call sp_set_session_context — caller responsibility.
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1: QuestionnaireAnswer — client-owned rows (FILTER + BLOCK)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Predicate function: fn_questionnaire_answer_access (own batch) ──────────
-- Returns (1 AS allowed) when the caller can access the QuestionnaireAnswer row.
-- @answerEngagementId: the engagementId column of the QuestionnaireAnswer row.
--   The ownership boundary is the owning Engagement (not a self-join on the answer id).
--   This is the column value that the FILTER predicate passes when evaluating each row.
--
-- Three branches (ADR-005 §2 skeleton):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--      Accountant-readable for Phase-4 answer review (AC out-of-scope here but read
--      boundary required by ADR-005 — all client-owned rows must be accountant-readable).
--   3. CLIENT ownership branch: EXISTS join via User.clerkId → Engagement.clientUserId.
--      SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId
--      AND Engagement.id = @answerEngagementId.
--      NULL SESSION_CONTEXT → CAST(NULL...) matches no clerkId → EXISTS empty → 0 rows.
--      NULL Engagement.clientUserId → JOIN returns false → EXISTS empty → 0 rows (DECISION-A).
--
-- Named code path for Gate Authoring evidence (ENGINE.md § Gate Authoring Rules):
--   The CLIENT-ownership EXISTS branch:
--     OR EXISTS (
--         SELECT 1 FROM [dbo].[User] u
--         JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
--         WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
--           AND e.[id] = @answerEngagementId
--     )
--   Removing this branch reds the positive test (CLIENT-A reads own answers → 0 rows instead of 1).
--   Removing the FILTER predicate reds the isolation test (CLIENT-B sees CLIENT-A's rows).
CREATE OR ALTER FUNCTION [sec].[fn_questionnaire_answer_access](
    @answerEngagementId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron — RLS-exempt)
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full answer visibility
        --    Required by ADR-005 for all client-owned-row families.
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT ownership branch — SECOND LIVE CLIENT-OWNERSHIP BRANCH IN THE SYSTEM (EPIC-006)
        --    SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId
        --    → Engagement.id = @answerEngagementId (the engagementId of the answer row)
        --    ADR-005 §2: CLIENT branch joins via User.clerkId (stable Clerk user ID string).
        --    ADR-005 §5 Mitigation C: two JOINs (Engagement + User) — matches 0005 pattern.
        --    DECISION-A: when clientUserId IS NULL, EXISTS returns false → 0 rows (correct:
        --    unassigned engagement's answers are invisible to all CLIENTs until back-fill).
        --    ADR-003 §5: null SESSION_CONTEXT('clerk_user_id') → CAST(NULL...) matches no
        --    clerkId → no match → EXISTS empty → 0 rows (fail-closed).
        OR EXISTS (
            SELECT 1 FROM [dbo].[User] u
            JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
              AND e.[id] = @answerEngagementId
        )
);
GO

-- ─── Security policy: pol_QuestionnaireAnswer (FILTER + BLOCK) ───────────────
-- FILTER PREDICATE: read paths via request pool (app_user_role) are filtered per-row.
--   CLIENT sees only their own engagement's answers; ACCOUNTANT sees all; admin sees all.
-- BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE):
--   Defence-in-depth for any request-pool write attempts outside the predicate's scope.
--   submitQuestionnaireAsClient runs through the request pool (SESSION_CONTEXT in-batch)
--   and the BLOCK predicate allows the owning client to insert/update their own answers.
--
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3.
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_QuestionnaireAnswer' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_QuestionnaireAnswer];

CREATE SECURITY POLICY [sec].[pol_QuestionnaireAnswer]
    -- FILTER predicate: controls SELECT visibility (fail-closed for null SESSION_CONTEXT)
    ADD FILTER PREDICATE [sec].[fn_questionnaire_answer_access]([engagementId])
        ON [dbo].[QuestionnaireAnswer]
    -- BLOCK predicates: defence-in-depth — request pool cannot insert/update/delete
    -- answer rows outside the predicate's scope.
    , ADD BLOCK PREDICATE [sec].[fn_questionnaire_answer_access]([engagementId])
        ON [dbo].[QuestionnaireAnswer] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_questionnaire_answer_access]([engagementId])
        ON [dbo].[QuestionnaireAnswer] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_questionnaire_answer_access]([engagementId])
        ON [dbo].[QuestionnaireAnswer] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_questionnaire_answer_access]([engagementId])
        ON [dbo].[QuestionnaireAnswer] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2: QuestionnaireTemplate — accountant-owned (BLOCK only, no client FILTER)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Predicate function: fn_questionnaire_template_write_access (own batch) ──
-- Returns (1 AS allowed) when the caller can WRITE a QuestionnaireTemplate row.
-- @serviceId: the serviceId column of the QuestionnaireTemplate row.
--
-- Mirrors sec.fn_service_write_access (0002-service-readable.sql) exactly:
--   - Admin principal passes (IS_MEMBER('app_admin_role') = 1).
--   - ACCOUNTANT role passes (SESSION_CONTEXT 'role' = 'ACCOUNTANT').
--   - NO CLIENT branch — CLIENT INSERT/UPDATE/DELETE fails closed (error 33504).
--   - NULL SESSION_CONTEXT → no branch matches → fails closed.
--
-- // DECISION: A separate write-predicate (not a shared read/write function) is used
-- //   because the QuestionnaireTemplate is accountant-managed and NOT client-readable via
-- //   the request pool. Clients read template content via the admin pool (DECISION-G,
-- //   like getCurrentLetterTemplate). So there is NO FILTER predicate on this table —
-- //   the template is not client-isolated; the write boundary is accountant-only.
-- //   This mirrors the exact fn_service_write_access pattern from 0002-service-readable.sql.
CREATE OR ALTER FUNCTION [sec].[fn_questionnaire_template_write_access](
    @serviceId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT can write templates (create/edit via admin actions)
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- NO CLIENT branch: CLIENT INSERT/UPDATE/DELETE fails closed (error 33504).
        -- NO anonymous branch: null SESSION_CONTEXT fails closed.
        -- This is intentional — the QuestionnaireTemplate is accountant-managed.
        -- Clients NEVER write templates; they read template CONTENT via admin pool.
        -- See DECISION comment above and AC-ONBD-003-02 / AC-DASH-012-02.
);
GO

-- ─── Security policy: pol_QuestionnaireTemplate (BLOCK only, NO FILTER) ──────
-- NO FILTER PREDICATE: the template is accountant-managed, not client-owned.
--   Clients read template content via the admin pool at step 2 (DECISION-G).
--   The admin pool (IS_MEMBER('app_admin_role')=1) is RLS-exempt — reads all rows.
--
-- BLOCK predicates only (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE):
--   Prevents any request-pool writes outside ACCOUNTANT/admin.
--   CLI/accountant template creates and edits run through admin actions (admin pool).
--   The BLOCK predicate is defence-in-depth for any request-pool write attempts.
--
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3.
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_QuestionnaireTemplate' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_QuestionnaireTemplate];

CREATE SECURITY POLICY [sec].[pol_QuestionnaireTemplate]
    -- BLOCK predicates only — no FILTER (template is not client-isolated)
    -- Accountant template writes run through admin pool (DECISION-G).
    -- Any request-pool INSERT/UPDATE/DELETE is blocked unless ACCOUNTANT/admin.
    ADD BLOCK PREDICATE [sec].[fn_questionnaire_template_write_access]([serviceId])
        ON [dbo].[QuestionnaireTemplate] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_questionnaire_template_write_access]([serviceId])
        ON [dbo].[QuestionnaireTemplate] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_questionnaire_template_write_access]([serviceId])
        ON [dbo].[QuestionnaireTemplate] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_questionnaire_template_write_access]([serviceId])
        ON [dbo].[QuestionnaireTemplate] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

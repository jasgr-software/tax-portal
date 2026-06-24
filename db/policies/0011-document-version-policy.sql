-- db/policies/0011-document-version-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements security policies for EPIC-013 / BRIEF-013 / TASK-013-001 document version entities:
--   1. DocumentVersion — FILTER + BLOCK (engagement-scoped via parent Document → Engagement,
--      owner-or-participant — mirrors fn_document_access 0007 extended form)
--
-- This is the SIXTH client-scoped policy in the system (after 0005/0006/0007/0009/0010).
--
-- ADR-005 § Tables-in-scope:
--   "DocumentVersion — CLIENT reads version rows for documents in their own engagement
--    (owner or participant); ACCOUNTANT reads all; admin pool is always RLS-exempt."
--
-- ADR-005 § Decision:
--   "Every table containing client-scoped data is covered by a SQL Server SECURITY POLICY
--    keyed off SESSION_CONTEXT(N'clerk_user_id')."
--
-- DocumentVersion read predicate (sec.fn_document_version_access):
--   Isolation is engagement-scoped via the parent Document.engagementId join.
--   The predicate joins DocumentVersion → Document → Engagement to reach the ownership boundary.
--   This is intentionally one JOIN deeper than 0005 (Engagement) and 0007 (Document), but
--   still shallow per ADR-005 §5 Mitigation C (two JOINs to reach the ownership boundary).
--
--   Three branches (ADR-005 §2 skeleton + EPIC-012 participant extension):
--     1. Admin principal always passes (IS_MEMBER('app_admin_role') = 1).
--     2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') always passes.
--     3a. CLIENT owner branch: dv.documentId → Document.engagementId → Engagement.clientUserId
--         → User.clerkId = SESSION_CONTEXT('clerk_user_id').
--     3b. CLIENT participant branch (DECISION-013-A / EPIC-012 mirror):
--         dv.documentId → Document.engagementId → EngagementParticipant.engagementId
--         → User.clerkId = SESSION_CONTEXT('clerk_user_id').
--     NULL SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed — ADR-003 §5).
--
-- BLOCK predicate: reuses fn_document_version_access (same predicate for both FILTER and BLOCK).
--   This mirrors pol_Document (0007 PART 1): same predicate for read + write defence-in-depth.
--   The version replacement operation (TASK-013-002) runs via admin pool or accountant SESSION_CONTEXT.
--
-- AC-FILE-009-03: prior versions retained + accessible after replacement.
--   A superseded DocumentVersion row remains SELECT-able (supersededAt IS NOT NULL, row kept).
--   The FILTER predicate allows the owner+participant to see ALL version rows for their engagement's
--   documents — both current (supersededAt IS NULL) and superseded (supersededAt IS NOT NULL).
--
-- ADR-003 §5: Null SESSION_CONTEXT → all branches fail → empty result → ZERO rows (fail-closed).
-- ADR-005 §5 Performance rules:
--   - ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines (Mitigation B).
--   - Predicate is shallow: two JOINs (Document + Engagement) to reach ownership boundary.
--     The additional Document join is required because DocumentVersion keyed on documentId,
--     not directly on engagementId.
--
-- CS-SQL-001: new scoped table ships SECURITY POLICY + .rls.test.ts (HARD GATE).
-- CS-SQL-002: Track B only — not expressible via Track A.
-- CS-SQL-003: predicate is ITVF, admin/accountant-first, shallow, fail-closed on null identity.
-- CS-GEN-002: additive — new table and new policy; no existing policy or model modified.
-- CS-GEN-003: governing keys cited throughout. // CS-GEN-003
-- DECISION-013-B: DocumentVersion child table (ADR-009 permits child table).
--
-- Idempotent: CREATE OR ALTER FUNCTION + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1: DocumentVersion — engagement-scoped CLIENT read (owner+participant) + BLOCK
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Predicate function: fn_document_version_access (own batch) ──────────────
-- Returns (1 AS allowed) when the caller can access a DocumentVersion row.
-- @documentVersionDocumentId: the documentId column of the DocumentVersion row.
--   The isolation boundary is the owning Engagement, reached via the parent Document.
--   This is the column value the FILTER predicate passes when evaluating each row.
--
-- Three branches (ADR-005 §2 skeleton + EPIC-012 participant extension):
--   1. Admin principal always passes.
--   2. ACCOUNTANT role (from SESSION_CONTEXT) always passes.
--   3a. CLIENT owner branch: DocumentVersion.documentId → Document.engagementId
--       → Engagement.clientUserId → User.id → User.clerkId = SESSION_CONTEXT('clerk_user_id').
--       Two JOINs: Document (to get engagementId) + Engagement + User.
--       DECISION-A: NULL Engagement.clientUserId → EXISTS returns false → checked against 3b.
--       ADR-003 §5: null SESSION_CONTEXT → CAST(NULL...) matches no clerkId → EXISTS empty → 0 rows.
--   3b. CLIENT participant branch (DECISION-013-A / EPIC-012 mirror):
--       DocumentVersion.documentId → Document.engagementId → EngagementParticipant.engagementId
--       → User.id → User.clerkId = SESSION_CONTEXT('clerk_user_id').
--       WHERE ep.engagementId = the doc's engagementId (scoped to THIS engagement only).
--       Mirrors 0005 fn_engagement_access 3b participant branch.
--       ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed).
--
-- Named code path for Gate Authoring evidence (ENGINE.md § Gate Authoring Rules):
--   3a. CLIENT-owner EXISTS branch (two-JOIN path through Document + Engagement):
--     OR EXISTS (
--         SELECT 1 FROM [dbo].[Document] d
--         JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
--         JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
--         WHERE d.[id] = @documentVersionDocumentId
--           AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
--     )
--   3b. CLIENT-participant EXISTS branch:
--     OR EXISTS (
--         SELECT 1 FROM [dbo].[Document] d
--         JOIN [dbo].[EngagementParticipant] ep ON ep.[engagementId] = d.[engagementId]
--         JOIN [dbo].[User] u ON u.[id] = ep.[userId]
--         WHERE d.[id] = @documentVersionDocumentId
--           AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
--     )
--   Removing 3a reds the positive-owner test (owner reads version ZERO instead of 1+).
--   Removing 3b reds the positive-participant test (participant reads version ZERO instead of 1+).
--   Removing the FILTER reds the isolation test (CLIENT-B sees CLIENT-A's version rows).
-- // CS-SQL-001 // CS-SQL-002 // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-013-B
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
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full version visibility
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3a. CLIENT owner branch — engagement-scoped via Document.engagementId → Engagement.clientUserId
        --     Two-JOIN path: DocumentVersion.documentId → Document → Engagement → User
        --     ADR-005 §5 Mitigation C: two JOINs to reach the ownership boundary.
        --     DECISION-A: NULL clientUserId → EXISTS returns false → checked against 3b.
        --     ADR-003 §5: null SESSION_CONTEXT → CAST(NULL...) matches no clerkId → EXISTS empty → 0 rows.
        --     // CS-SQL-003 // ADR-005 // ADR-003
        OR EXISTS (
            SELECT 1 FROM [dbo].[Document] d
            JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
            JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
            WHERE d.[id] = @documentVersionDocumentId
              AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
        )

        -- 3b. CLIENT participant branch (DECISION-013-A / EPIC-012 extension mirror)
        --     Two-JOIN path: DocumentVersion.documentId → Document → EngagementParticipant + User
        --     WHERE ep.engagementId = doc's engagementId (scoped to THIS engagement only).
        --     CS-GEN-002: purely additive OR — no existing branch removed or altered.
        --     ADR-003 §5: null SESSION_CONTEXT → EXISTS empty → 0 rows (fail-closed).
        --     // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-013-A // CS-GEN-002
        OR EXISTS (
            SELECT 1 FROM [dbo].[Document] d
            JOIN [dbo].[EngagementParticipant] ep ON ep.[engagementId] = d.[engagementId]
            JOIN [dbo].[User] u ON u.[id] = ep.[userId]
            WHERE d.[id] = @documentVersionDocumentId
              AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
        )
);
GO

-- ─── Security policy: pol_DocumentVersion (FILTER + BLOCK) ───────────────────
-- FILTER PREDICATE: read paths via request pool (app_user_role) are filtered per-row.
--   CLIENT sees only version rows for documents in their own engagement (owner + participant).
--   ACCOUNTANT sees all; admin sees all.
-- BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE):
--   Defence-in-depth for any request-pool write attempts outside the predicate's scope.
--   Version creation (TASK-013-002) runs via admin pool or accountant SESSION_CONTEXT.
--   The BLOCK predicate allows the same scope as the FILTER (owner + participant + accountant + admin).
--
-- NOTE: Uses fn_document_version_access for BOTH FILTER and BLOCK predicates.
--       This mirrors pol_Document (0007 PART 1) pattern — same predicate for read + write defence.
--
-- AC-FILE-009-03: superseded rows remain SELECT-able (FILTER includes all rows for the engagement). // AC-FILE-009-03
-- STATE=ON, SCHEMABINDING=ON per ADR-005 §3. // CS-SQL-001 // CS-SQL-003 // ADR-005
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_DocumentVersion' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_DocumentVersion];

CREATE SECURITY POLICY [sec].[pol_DocumentVersion]
    -- FILTER predicate: CLIENT reads own engagement's document versions (owner or participant)
    ADD FILTER PREDICATE [sec].[fn_document_version_access]([documentId])
        ON [dbo].[DocumentVersion]
    -- BLOCK predicates: defence-in-depth — request pool cannot insert/update/delete
    -- version rows outside the predicate's scope (owner + participant + accountant + admin).
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

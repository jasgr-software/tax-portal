-- db/policies/0008-engagement-note-policy.sql
-- Track B: raw SQL security policy — ADR-005 §2/§3
-- Applied by: scripts/db-migrate.ts (after Track A Prisma migrations + db/migrations/)
--
-- Implements the EngagementNote accountant-only security policy (AC-LIFE-008-02 / AC-LIFE-008-03).
-- CS-SQL-001: every client-scoped table ships a SECURITY POLICY + RLS integration test.
-- CS-SQL-003: predicate is an inline TVF, shallow, admin/accountant-first, fail-closed.
-- CS-GEN-002: additive — new policy and table; no existing policy or model modified.
-- CS-GEN-003: governing keys cited throughout.
--
-- ADR-005 § Tables-in-scope:
--   "EngagementNote — accountant-scoped; accountant reads all; client/anon reads ZERO."
--
-- THIS IS AN ACCOUNTANT-ONLY BLOCK/OWN-ROW POLICY FAMILY — NOT the client-isolation pol_Engagement family.
-- CRITICAL DISTINCTION:
--   pol_Engagement (0005): CLIENT can read rows they OWN (their own engagement). A client-isolation policy.
--   pol_EngagementNote (this file): CLIENT reads ZERO — even the CLIENT who OWNS the parent engagement.
--   Internal accountant notes are NEVER surfaced to clients. AC-LIFE-008-03 is the hard requirement.
--
-- Predicate shape mirrors sec.fn_notification_access (0004-notification-policy.sql):
--   1. Admin principal (IS_MEMBER('app_admin_role') = 1) → always passes.
--   2. ACCOUNTANT role (SESSION_CONTEXT 'role' = 'ACCOUNTANT') → always passes.
--   3. CLIENT / null SESSION_CONTEXT → predicate returns empty → ZERO rows (fail-closed).
--      ADR-003 §5: null SESSION_CONTEXT → both branches fail → empty result → 0 rows, no error.
--
-- KEY POINTS:
--   - This is the notes confidentiality boundary. A CLIENT who OWNS the parent Engagement STILL
--     reads ZERO notes. The ownership join from pol_Engagement is intentionally ABSENT here.
--     The @engagementNoteId arg matches the ADR-005 ITVF skeleton signature (reserved; a future
--     phase may add accountant-to-accountant sharing here without re-creating the policy, but
--     NO CLIENT branch is ever added — notes are permanently accountant-only by AC-LIFE-008-03).
--   - BLOCK predicates (AFTER INSERT + BEFORE/AFTER UPDATE + BEFORE DELETE) ensure the
--     request pool (app_user_role) cannot insert, update, or delete notes when acting as a CLIENT.
--     In practice, the write path goes through the admin pool (TASK-011-002) — BLOCK is
--     defence-in-depth for any accidental request-pool write attempts.
--
-- Idempotent: CREATE OR ALTER FUNCTION (predicate) + DROP IF EXISTS / CREATE policy.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.
-- CREATE OR ALTER FUNCTION must be the sole statement in its batch (SQL Server requirement).
--
-- ADR-005 §5 Performance rules:
--   - Uses ITVF (RETURNS TABLE WITH SCHEMABINDING) — optimizer inlines it (Mitigation B). // CS-SQL-003
--   - Predicate is shallow (no JOIN required — admin/accountant branches only). // CS-SQL-003
--
-- Referenced by: packages/db/src/engagement-note.rls.test.ts (HARD GATE, ADR-005 §6). // CS-SQL-001

-- ─── Predicate function (own batch — required by SQL Server) ─────────────────
-- sec.fn_engagement_note_access: returns (1 AS allowed) when the caller can access
-- the EngagementNote row, empty otherwise.
-- @engagementNoteId: matches ADR-005 skeleton signature; reserved for future use.
--   No CLIENT ownership branch will be added — notes are permanently accountant-only (AC-LIFE-008-03).
CREATE OR ALTER FUNCTION [sec].[fn_engagement_note_access](
    @engagementNoteId UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN (
    SELECT 1 AS [allowed]
    WHERE
        -- 1. Admin principal always passes (migrations, webhooks, cron, admin pool writes for notes)
        --    IS_MEMBER('app_admin_role') = 1 — RLS-exempt (ADR-005 §2). // CS-SQL-003
        IS_MEMBER('app_admin_role') = 1

        -- 2. ACCOUNTANT role (from SESSION_CONTEXT) always passes — full note visibility
        --    AC-LIFE-008-02: accountant can create and read internal notes on any engagement.
        --    CAST to NVARCHAR(16) matches the role column width (ADR-003 §2). // CS-SQL-003
        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'

        -- 3. CLIENT branch: ABSENT BY DESIGN — notes are PERMANENTLY accountant-only (AC-LIFE-008-03).
        --    A CLIENT principal (even one who OWNS the parent Engagement) reads ZERO notes.
        --    This is NOT a client-isolation policy (pol_Engagement family). DO NOT add a CLIENT branch.
        --    When SESSION_CONTEXT is null or role = 'CLIENT', both branches above fail
        --    → predicate returns empty table → FILTER removes all rows → 0 rows (fail-closed).
        --    ADR-003 §5: null identity → empty result → 0 rows, no error. // CS-SQL-003
);
GO

-- ─── Security policy ──────────────────────────────────────────────────────────
IF EXISTS (
    SELECT 1 FROM sys.security_policies
    WHERE name = 'pol_EngagementNote' AND schema_id = SCHEMA_ID('sec')
)
    DROP SECURITY POLICY [sec].[pol_EngagementNote];

CREATE SECURITY POLICY [sec].[pol_EngagementNote]
    -- FILTER predicate: controls SELECT visibility (fail-closed for null SESSION_CONTEXT)
    -- AC-LIFE-008-03: CLIENT principal reads ZERO notes regardless of engagement ownership.
    ADD FILTER PREDICATE [sec].[fn_engagement_note_access]([id])
        ON [dbo].[EngagementNote]
    -- BLOCK predicates: defence-in-depth — request pool cannot insert/update/delete
    -- notes outside the predicate's scope (CLIENT principals / null context are blocked).
    -- Note writes go through the admin pool in practice (TASK-011-002).
    , ADD BLOCK PREDICATE [sec].[fn_engagement_note_access]([id])
        ON [dbo].[EngagementNote] AFTER INSERT
    , ADD BLOCK PREDICATE [sec].[fn_engagement_note_access]([id])
        ON [dbo].[EngagementNote] BEFORE UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_engagement_note_access]([id])
        ON [dbo].[EngagementNote] AFTER UPDATE
    , ADD BLOCK PREDICATE [sec].[fn_engagement_note_access]([id])
        ON [dbo].[EngagementNote] BEFORE DELETE
    WITH (STATE = ON, SCHEMABINDING = ON);
GO

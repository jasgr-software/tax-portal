-- db/migrations/0002-create-audit-ledger.sql
-- Track B: raw SQL migration — ADR-002 § Migration tracks (Track B)
-- Applied by: scripts/db-migrate.ts (after prisma migrate deploy + db/migrations/0001-*)
--
-- Creates the AuditEvent ledger table for the tamper-evident audit trail (ADR-019).
--
-- ADR-019 §1: A dedicated audit store on SQL Server 2022 append-only ledger tables.
-- ADR-019 §2: Record shape REQUIRES identity (the inverse-of-telemetry rule) —
--             raw actor principal id + role + action + target + timestamp + source surface.
-- ADR-019 §5: Retention ≥7 years, excluded from the ADR-018 purge job. This migration
--             does NOT install any purge or sweep logic. A future purge job must explicitly
--             EXCLUDE the AuditEvent table (DEFERRED — ADR-019 §5, no purge job exists yet).
--
-- ADR-002 §: DATETIMEOFFSET for timestamps.
--
-- Schema choice: dbo.AuditEvent (not sec.*) — the sec schema is reserved for predicate
-- functions and security policies (ADR-005 §2). AuditEvent is an application table
-- in the dbo schema, covered by the sec.pol_AuditEvent security policy (0003-*).
--
-- LEDGER NOTE (ADR-019 §1):
--   The target engine is SQL Server 2022 Developer Edition
--   (mcr.microsoft.com/mssql/server:2022-latest). SQL Server 2022 supports ledger tables.
--   This migration attempts LEDGER = ON (APPEND_ONLY = ON). If the local engine edition
--   does not support it (e.g. SQL Server Express, Azure SQL, or older CU), the CREATE TABLE
--   statement will fail with error 37366 ("Ledger feature is not supported in the current
--   database configuration") or similar. In that case, record the exact error in the Work Log
--   and use the non-ledger fallback (see DECISION below).
--
-- DECISION (TASK-004-010): Append-only ledger is the INTENDED tamper-evidence mechanism
--   (ADR-019 §1, REQ-NFR-011). If the local SQL Server 2022 Developer Edition image supports
--   LEDGER = ON (APPEND_ONLY = ON), that form is used and the table gains native
--   cryptographic tamper-evidence (Merkle-tree digest chain verifiable via
--   sys.database_ledger_transactions). If it is NOT supported (exact engine error recorded
--   in TASK-004-010 Work Log), a non-ledger INSERT-only table is created and a NOTE is added
--   in this file — append-only-by-app-convention is documented as the fallback, NOT a
--   silent substitute. The tamper-evidence intent is explicitly noted and a follow-up
--   to enable ledger when the engine supports it is tracked in the Work Log.
--
-- Grants (ADR-003 §1, ADR-005 §1):
--   app_user_role  — INSERT only (writes ride the request path; reads are RLS-filtered)
--                    No SELECT, UPDATE, DELETE at the DB level — the RLS FILTER predicate
--                    controls read access; app code never UPDATEs or DELETEs audit rows.
--   app_admin_role — full access via db_owner role membership (granted in 0001-*).
--
-- Idempotent: IF NOT EXISTS guard on table creation.
-- GO separators: scripts/db-migrate.ts splits on GO and executes each batch separately.

-- ─── AuditEvent table ─────────────────────────────────────────────────────────
-- Attempt to create with LEDGER = ON (APPEND_ONLY = ON).
-- SQL Server 2022 Developer Edition supports this. See DECISION above.

IF NOT EXISTS (
    SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AuditEvent]') AND type = 'U'
)
BEGIN
    -- DECISION (TASK-004-010): Ledger creation attempt.
    -- If this batch fails, re-run after adding a fallback CREATE TABLE (non-ledger form)
    -- and record the engine error in the Work Log. Do NOT silently downgrade.
    CREATE TABLE [dbo].[AuditEvent] (
        -- Primary key — NEWSEQUENTIALID() for insert-ordered clustering
        [id]            UNIQUEIDENTIFIER NOT NULL
                            CONSTRAINT [DF_AuditEvent_id] DEFAULT NEWSEQUENTIALID(),

        -- Actor identity (ADR-019 §2 — REQUIRES raw identity, inverse of telemetry)
        -- The Clerk user id from SESSION_CONTEXT / request context (ADR-003).
        -- Stored raw, not hashed — the audit trail's ENTIRE PURPOSE is to identify the actor.
        [clerkUserId]   NVARCHAR(128)    NOT NULL,
        [actorRole]     NVARCHAR(16)     NOT NULL,  -- 'ACCOUNTANT' | 'CLIENT'

        -- Action (e.g. 'auth.signin', 'auth.account_created')
        -- Constrained to 128 chars; later slices extend with new values — no schema change needed.
        [action]        NVARCHAR(128)    NOT NULL,

        -- Target entity (nullable — sign-in has no specific target entity)
        [targetType]    NVARCHAR(64)     NULL,
        [targetId]      NVARCHAR(256)    NULL,

        -- Source surface ('portal' | 'admin')
        [sourceSurface] NVARCHAR(32)     NOT NULL,

        -- Outcome ('success' | 'denied')
        [outcome]       NVARCHAR(16)     NOT NULL
                            CONSTRAINT [DF_AuditEvent_outcome] DEFAULT N'success',

        -- Timestamp (ADR-002 § DATETIMEOFFSET storage)
        -- Server-side timestamp — not client-supplied.
        [occurredAt]    DATETIMEOFFSET   NOT NULL
                            CONSTRAINT [DF_AuditEvent_occurredAt] DEFAULT SYSDATETIMEOFFSET(),

        CONSTRAINT [PK_AuditEvent] PRIMARY KEY CLUSTERED ([id])
    )
    WITH (
        LEDGER = ON (APPEND_ONLY = ON)
        -- APPEND_ONLY = ON: app code performs INSERT only; the engine cryptographically
        -- prevents UPDATE and DELETE on existing rows.
        -- Tamper-evidence: rows are hashed into a Merkle tree; digests stored in
        -- sys.database_ledger_transactions (verifiable with sp_verify_database_ledger).
        -- This satisfies REQ-NFR-011 (tamper-evident, complete audit trail).
    );
END
GO

-- ─── Grants ───────────────────────────────────────────────────────────────────
-- app_user_role: INSERT only — reads are RLS-controlled, no UPDATE/DELETE from app code.
-- This matches ADR-019 §1 "append-only by design".
-- app_admin_role gets full access via db_owner membership (0001-*); no extra grant needed.

GRANT INSERT ON [dbo].[AuditEvent] TO [app_user_role];
GO

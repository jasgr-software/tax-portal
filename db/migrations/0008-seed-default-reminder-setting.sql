-- db/migrations/0008-seed-default-reminder-setting.sql
-- TASK-019-001: EPIC-019 — seed the system-default ReminderSetting singleton row (DECISION-019-B).
--
-- IDEMPOTENT: Only inserts if no row exists in ReminderSetting (singleton pattern).
-- Applied by: scripts/db-migrate.ts (Track B — after Track A Prisma migrations + policies).
--
-- ADR-002: Runs under admin pool (taxportal_admin login, app_admin_role member).
-- DECISION-019-B: Singleton row pattern — there is always exactly one logical row;
--                 the data layer (TASK-019-002) reads "the" row.
--                 Seeded defaults chosen to be sensible for a solo accountant practice:
--                   reminderFrequencyDays    = 7  (weekly overdue reminders)
--                   approachingDueWindowDays = 7  (warn 7 days before engagement due date)
--                   defaultRequestDueDays    = NULL (no fallback — requests must have explicit due dates;
--                                                   the accountant can configure this via TASK-019-002)
-- CS-GEN-002: additive seed — no existing data modified. // CS-GEN-002
-- CS-GEN-003: // DECISION-019-B // ADR-002 // AC-MSG-018-03 // AC-DASH-008-01
--
-- Security note: this row is inserted via admin pool (RLS-exempt);
--   the RLS policy (0018-reminder-setting-policy.sql) gates REQUEST POOL reads/writes.
--   ADR-003: admin pool bypasses SESSION_CONTEXT checks — correct for seed/cron paths.

IF NOT EXISTS (
    SELECT 1 FROM [dbo].[ReminderSetting]
)
BEGIN
    INSERT INTO [dbo].[ReminderSetting]
        ([reminderFrequencyDays], [approachingDueWindowDays], [defaultRequestDueDays], [updatedAt])
    VALUES (
        7,      -- reminderFrequencyDays:    weekly by default (AC-MSG-018-03, AC-DASH-008-01)
        7,      -- approachingDueWindowDays: warn 7 days before engagement due date (AC-MSG-013-06)
        NULL,   -- defaultRequestDueDays:    NULL = accountant must set explicit due dates (DECISION-019-C)
        SYSDATETIMEOFFSET()
    );
END

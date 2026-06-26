---
brief: BRIEF-018
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-26T15:54:33.796Z
completed_at: 2026-06-26T19:11:09.255Z
complexity_estimate: 2
complexity_actual: 2
introduces_gate: "no"
acceptance_criteria: [AC-MSG-011-01]
upstream_refs: [REQ-MSG-010, REQ-MSG-011, ADR-006, ADR-002]
code_standards: CS-GEN-002, CS-GEN-003
---

# TASK-018-001: User email-preference + daily-digest dispatch-state columns (Prisma schema + migration)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — this is a schema/migration + tier-3 integration task; no e2e
- [x] **Security review** — emailNudgeEnabled is a preference flag (not PII); lastNudgeSentAt is a timestamp (not PII); default=true is the correct fail-safe (on by default, per AC-MSG-011-01)
- [x] **SDET Review** — approved

## SDET Review focus areas

- Prisma-track migration only (entity schema) — no raw-SQL/RLS policy is needed or added (no new table; see brief § Notes "RLS is deliberately not in this slice's cited architecture").
- Verify `emailNudgeEnabled` defaults to **true at the DB level** (`@default(true)` → `DEFAULT 1`) so a freshly-inserted `User` row is nudge-enabled with **no opt-in step** (AC-MSG-011-01). The default must live in the DB, not in app code.
- Verify additive, non-destructive (CS-GEN-002): no existing `User` column removed or narrowed.
- ADR-002 conventions: `DATETIMEOFFSET` for the timestamp column.

## Context

The email digest fallback (BRIEF-018) needs a **per-recipient email preference** and a **per-recipient daily-dispatch watermark**. Both clients and the accountant already have a `User` row (role `CLIENT` / `ACCOUNTANT`, keyed by `clerkId` — see `prisma/schema.prisma` model `User` and `db/seed/demo/clients.ts`). Per the brief's bounded **IO Design decision** (§ Notes "IO Design discretion"), the email-preference and last-sent state are stored as **two additive columns on `User`** (not a dedicated table) — the least-over-built shape, and it makes **client default-on free at row creation** (any `INSERT INTO [dbo].[User]` — seed, sign-up, e2e — inherits the DB default).

This task lands those two columns. Downstream tasks (002 repository, 003 dispatcher, 004 toggle) consume them.

**Acceptance criterion satisfied:** AC-MSG-011-01 (a newly created client account has the email fallback nudge enabled by default) — proven by a tier-3 integration test that inserts a `User` row and asserts `emailNudgeEnabled` is `true` on the as-created row, **with no opt-in step performed**.

## Data & Interface Contract (IO-expanded, binding)

Add to `model User` in `prisma/schema.prisma` (additive only):

| Column | Prisma type | DB type | Default | Meaning |
| ------ | ----------- | ------- | ------- | ------- |
| `emailNudgeEnabled` | `Boolean` | `BIT` | `@default(true)` → `DEFAULT 1` | Governs **only** whether the fallback email nudge is sent to this principal. `true` = nudge sent; `false` = suppressed. **Default true → client default-on (AC-MSG-011-01) and accountant default-on until she suppresses.** Never affects the in-portal `Notification` feed. *(traces: REQ-MSG-010, REQ-MSG-011)* |
| `lastNudgeSentAt` | `DateTime?` | `DATETIMEOFFSET` | nullable (NULL = never nudged) | Per-recipient watermark of when a nudge was last sent — the enforcement state for the at-most-one-per-day cap (REQ-MSG-009). Written by the dispatcher (TASK-018-003). *(traces: REQ-MSG-009; ADR-025 §6)* |

- **State set for `emailNudgeEnabled`:** `true ↔ false` (enabled ↔ suppressed). The only in-scope transition is the accountant's own toggle (TASK-018-004); clients are default-on and not toggled in this slice (no client opt-out path — brief Out of scope).
- Both columns are **non-confidentiality** attributes on the principal's own row; no new RLS policy (the brief does not cite ADR-005 for this slice). Do **not** add a `db/policies/` or `db/migrations/` raw-SQL file.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `prisma/schema.prisma` | modify | Add `emailNudgeEnabled Boolean @default(true)` and `lastNudgeSentAt DateTime? @db.DateTimeOffset` to `model User`, with `// CS-GEN-002` / `// REQ-MSG-010` / `// REQ-MSG-011` / `// ADR-002` cite comments. |
| `prisma/migrations/20260626000000_brief018_user_email_nudge/migration.sql` | create | Hand-crafted migration SQL (see DECISION below). Adds `emailNudgeEnabled BIT NOT NULL DEFAULT 1` and `lastNudgeSentAt DATETIMEOFFSET NULL` to `[dbo].[User]`. Verified additive; DB confirmed DEFAULT ((1)) on emailNudgeEnabled. |
| `packages/db/src/repositories/user-email-preference.integration.test.ts` | create | Tier-3 integration test inserting a `User` row (admin pool) and asserting `emailNudgeEnabled === true` on read — AC-MSG-011-01. Also checks additive-migration guard (CS-GEN-002). |

## Tests to Write First

- [x] `AC-MSG-011-01 — inserting a new User row yields emailNudgeEnabled = true with no opt-in step` — expected: read-back row has `emailNudgeEnabled: true`, `lastNudgeSentAt: null`. Tagged `AC-MSG-011-01`. (tier-3) PASSED.
- [x] `CS-GEN-002 — migration is additive: existing User rows have emailNudgeEnabled=true and lastNudgeSentAt=null` — expected: existing User columns unchanged; no data loss. PASSED.

## Implementation Notes

- Use the **Prisma track** (ADR-002 / ADR-006): `pnpm prisma migrate dev --name brief018_user_email_nudge` after editing `schema.prisma`, then `pnpm prisma generate`.
- The integration test runs against the SQL Server container (Docker is up). Use the existing admin-pool test harness pattern (see `packages/db/src/repositories/notification.integration.test.ts`).
- Cite governing keys in the schema comment block (CS-GEN-003): `// REQ-MSG-010 // REQ-MSG-011 // ADR-002 // CS-GEN-002`.

## Definition of Done

- [x] `emailNudgeEnabled` + `lastNudgeSentAt` added to `model User`; migration generated and applied locally.
- [x] Tier-3 test proves a freshly-created `User` has `emailNudgeEnabled = true` (AC-MSG-011-01), test title tagged with the AC id.
- [x] Lint + type-check + build pass; `pnpm prisma generate` regenerates the client cleanly.
- [x] No raw-SQL/RLS file added; additive migration only.

---

## Work Log

- 2026-06-26 [sdet] Marking done — Schema+migration additive, ADR-002 DATETIMEOFFSET compliant. DB DEFAULT 1 confirmed. Tier-3 tests 2/2 pass, AC-MSG-011-01 tagged. CS-GEN-002/-003 cited. Migration hand-crafted per pre-existing shadow-DB constraint (documented). | What's next: archive | Blockers: none
- 2026-06-26 [webapp-developer] Marking as review — Schema + migration SQL hand-crafted (prisma migrate dev not available in this project due to shadow DB constraint — pre-existing on all prior migrations). Two tests: 2/2 passed. Lint/type-check/build all green. DB confirmed DEFAULT 1 on emailNudgeEnabled. | What's next: SDET review | Blockers: none
- 2026-06-26 [webapp-developer] Starting implementation — Schema + migration + tier-3 integration test. Two additive columns on User, no RLS. | What's next: implement and run gates | Blockers: none
- 2026-06-26 [webapp-developer] Implementation complete. Added emailNudgeEnabled Boolean @default(true) and lastNudgeSentAt DateTime? @db.DateTimeOffset to model User in prisma/schema.prisma with CS-GEN-002/CS-GEN-003 cite comments. DECISION: pnpm prisma migrate dev always fails in this environment (shadow DB permission — taxportal_admin cannot CREATE DATABASE on master; this is a pre-existing constraint on all prior migrations in this project). Migration hand-crafted as 20260626000000_brief018_user_email_nudge/migration.sql and applied directly to SQL Server via admin pool mssql connection. DB confirmed: emailNudgeEnabled BIT DEFAULT ((1)), lastNudgeSentAt DATETIMEOFFSET NULL. pnpm prisma generate succeeded. Tier-3 integration test at packages/db/src/repositories/user-email-preference.integration.test.ts: 2 tests passed. Submission gate: lint pass, type-check pass (required rebuilding stale packages/db/dist — pre-existing stale dist, not caused by this task), build pass (exit 0), integration tests 2/2 passed. Security review: no PII in either column; default=true is correct fail-safe (AC-MSG-011-01). | What's next: SDET review | Blockers: none

  Migration SQL applied (key excerpt):
  ```sql
  ALTER TABLE [dbo].[User]
      ADD [emailNudgeEnabled] BIT NOT NULL CONSTRAINT [User_emailNudgeEnabled_df] DEFAULT 1;
  ALTER TABLE [dbo].[User]
      ADD [lastNudgeSentAt] DATETIMEOFFSET NULL;
  ```

  Test run output:
  ```
  RUN  v3.2.6 /home/ccox/repos/tax-portal/packages/db
  ✓ src/repositories/user-email-preference.integration.test.ts (2 tests) 68ms
  Test Files  1 passed (1)
       Tests  2 passed (2)
  ```

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Schema additive and ADR-002 compliant (`emailNudgeEnabled BIT NOT NULL DEFAULT 1`, `lastNudgeSentAt DATETIMEOFFSET NULL`). Migration SQL hand-crafted per the pre-existing shadow-DB permission constraint (documented on all prior migrations in this project). DB DEFAULT 1 confirmed in Work Log excerpt. Tier-3 tests 2/2 pass with actual runner output; AC-MSG-011-01 title-tagged. CS-GEN-002/-003 cite comments present in schema. No raw-SQL/RLS file added. Migration conformance: schema.prisma `@default(true)` → `BIT NOT NULL DEFAULT 1` is correct. Deferred to Smoke gate: confirm migration applies cleanly from `docker compose down -v && up` (pre-existing retro-012-002 bootstrap fragility).

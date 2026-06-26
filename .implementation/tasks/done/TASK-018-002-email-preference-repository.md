---
brief: BRIEF-018
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-018-001
impl: developer
e2e_required: "no"
started_at: 2026-06-26T16:09:41.070Z
completed_at: 2026-06-26T19:11:14.108Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: [AC-MSG-010-03, AC-MSG-011-01]
upstream_refs: [REQ-MSG-009, REQ-MSG-010, REQ-MSG-011, ADR-003, ADR-005, ADR-006]
code_standards: CS-TS-001, CS-TS-002, CS-TS-003, CS-GEN-001, CS-GEN-002, CS-GEN-003
---

# TASK-018-002: Email-preference + daily-dispatch repository (packages/db)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — data-layer task with tier-3 integration tests; no e2e
- [x] **Security review** — admin-pool reads stay inside packages/db (CS-TS-002); request-scoped write scoped to the caller's own row; no PII in logs (CS-GEN-001)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **CS-TS-001 (required):** the accountant's own preference read/write goes through the `packages/db` request wrapper (`withRequestContext` → SESSION_CONTEXT set before the query, ADR-003). **CS-TS-002 (required):** the system-batch candidate query + watermark write use the admin pool **only inside `packages/db`** (the `getAdminPool()` boundary — same pattern as `emitNotification`). Never import raw pools outside `packages/db`.
- The candidate query must **not** read or mutate the `Notification` feed beyond a read of unread rows — it never writes `Notification` (AC-MSG-010-03: feed left intact).
- Verify the cap predicate is enforced on **dispatch state** (`lastNudgeSentAt`), not by event coincidence.
- Verify the suppression filter: a recipient with `emailNudgeEnabled = false` is **excluded** from the candidate set.
- CS-GEN-001: no recipient activity detail / client identity / email body in any log line.

## Context

The dispatcher (TASK-018-003) and the accountant toggle (TASK-018-004) need a data-access layer over the two `User` columns added in TASK-018-001 plus the existing `Notification` feed. This task adds those functions to `packages/db` (the home of `emitNotification` and the notification repository). No new table; no new RLS policy.

**Acceptance criteria touched:** AC-MSG-010-03 (suppression leaves the feed intact — proven here by the candidate query never writing `Notification`) and AC-MSG-011-01 (default-on read). The hard end-to-end suppression/cap/content-free proofs live in TASK-018-003 which composes these functions.

## Data & Interface Contract (IO-expanded, binding)

Add to `packages/db` (suggested module `src/repositories/email-digest.ts`, exported via the barrel):

1. **`getDigestRecipients(now: Date): Promise<DigestRecipient[]>`** — *admin pool, system batch (CS-TS-002).*
   Returns the set of recipients eligible for a nudge **for the window containing `now`**: principals who
   (a) have **≥1 unread** in-portal `Notification` (`readAt IS NULL`) addressed to them, AND
   (b) have `emailNudgeEnabled = true`, AND
   (c) have **not yet been nudged in the current day-window** (`lastNudgeSentAt IS NULL OR CAST(lastNudgeSentAt AS DATE) < CAST(@now AS DATE)`).
   Each `DigestRecipient` = `{ userId: string; email: string; role: 'ACCOUNTANT' | 'CLIENT' }`.
   - **Recipient mapping (binding):** a CLIENT recipient = the `User` whose `id = Notification.recipientUserId` for unread `recipientType='CLIENT'` rows. The ACCOUNTANT recipient = the `User` with `role='ACCOUNTANT'` when there are unread `recipientType='ACCOUNTANT'` rows (recipientUserId is NULL on those rows; map via the accountant `User` row).
   - The query joins `Notification` → `User` and applies (b)+(c) on the `User` row. Returns **at most one row per recipient** (DISTINCT/GROUP BY userId).
   - Reads `Notification` only; **never writes it** (AC-MSG-010-03).
   - // DECISION: day-window boundary — **calendar day in UTC** (bounded IO discretion; documented). A rolling-24h variant is acceptable if the developer prefers, but it must be deterministic and the cap tests must pin it. Record the choice as a `// DECISION:`.

2. **`recordNudgeSent(userId: string, sentAt: Date): Promise<void>`** — *admin pool (CS-TS-002).*
   Sets `lastNudgeSentAt = @sentAt` for the recipient. Called by the dispatcher after a successful send. Idempotent for the day (re-running with a same-day `sentAt` keeps the recipient out of the next candidate set).

3. **`getEmailNudgePreferenceForCurrentUser(): Promise<boolean>`** — *request pool (CS-TS-001).*
   Reads `emailNudgeEnabled` for the `User` whose `clerkId = SESSION_CONTEXT('clerk_user_id')` (the caller's own row). Used by the accountant settings page (TASK-018-004) to render current state.

4. **`setEmailNudgePreferenceForCurrentUser(enabled: boolean): Promise<void>`** — *request pool (CS-TS-001).*
   Writes `emailNudgeEnabled = @enabled` for the caller's own `User` row (WHERE `clerkId = SESSION_CONTEXT`). The accountant-only **role guard** lives in the server action (TASK-018-004, CS-TS-004); this function is the data primitive. Scoped to the caller's own row only — never a different principal's.

Export all four from `packages/db/src/index.ts` (additive — CS-GEN-002).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/email-digest.ts` | create | The four functions above. Admin-pool functions use `getAdminPool()` (CS-TS-002); request-pool functions use the `db` wrapper (CS-TS-001). |
| `packages/db/src/index.ts` | modify | Barrel-export the four functions (additive, CS-GEN-002). |
| `packages/db/src/repositories/email-digest.integration.test.ts` | create | Tier-3 integration tests (below) against the SQL Server container. |

## Tests to Write First

- [x] `getDigestRecipients excludes suppressed recipients` — a recipient with `emailNudgeEnabled=false` and unread notifications is **not** returned. (tier-3)
- [x] `getDigestRecipients excludes already-nudged-today recipients` — a recipient with `lastNudgeSentAt` = same day as `now` is **not** returned; one with `lastNudgeSentAt` = a prior day **is** returned (given unread activity). (tier-3) — tag `AC-MSG-009-01`.
- [x] `getDigestRecipients includes a default-on client with unread activity` — a freshly-created CLIENT (default `emailNudgeEnabled=true`, `lastNudgeSentAt=null`) with an unread CLIENT notification **is** returned. (tier-3) — tag `AC-MSG-011-01`.
- [x] `the candidate query never writes the Notification feed` — assert unread `Notification` rows for a suppressed recipient are unchanged after `getDigestRecipients` runs. (tier-3) — tag `AC-MSG-010-03`.
- [x] `setEmailNudgePreferenceForCurrentUser flips only the caller's own row` — under accountant SESSION_CONTEXT, set false; assert the accountant row flips and a different `User` row is untouched. (tier-3)

## Implementation Notes

- Mirror the admin-pool patterns in `packages/db/src/repositories/notification.ts` (`emitNotification` uses `getAdminPool()` + `mssql.Request`). Mirror the request-pool read pattern (the `db` $extends wrapper) used by `listNotifications`/`countUnreadNotifications`.
- The accountant `User` row is `role='ACCOUNTANT'` (one principal — see `seedAccountant()`). The candidate mapping for ACCOUNTANT-scoped unread notifications resolves to that single row.
- CS-TS-003: keep the recipient/preference shape uniform so both surfaces (portal clients + admin accountant) flow through the same primitives.
- Cite governing keys in code comments (CS-GEN-003).

## Definition of Done

- [x] Four functions implemented + barrel-exported (additive).
- [x] Tier-3 integration tests pass against the container; suppression filter, daily-cap filter, default-on inclusion, feed-untouched, and own-row-only write all proven; AC ids tagged on the relevant test titles.
- [x] Lint + type-check + build pass.
- [x] CS-TS-001/-002/-003, CS-GEN-001/-002/-003 honored and cited.

---

## Work Log

- 2026-06-26 [sdet] Marking done — Four DB functions correct. CS-TS-001/-002 honored + tagged. Candidate query SELECT-only on Notification (AC-MSG-010-03). Own-row isolation via ctx.clerkUserId from SESSION_CONTEXT (never from args). 6 tier-3 integration tests pass per Work Log. | What's next: archive | Blockers: none
- 2026-06-26 [webapp-developer] Marking as review — Implemented four functions in packages/db/src/repositories/email-digest.ts (getDigestRecipients admin-pool SQL, recordNudgeSent admin-pool UPDATE, getEmailNudgePreferenceForCurrentUser request-pool read, setEmailNudgePreferenceForCurrentUser request-pool update). Barrel-exported all four from src/index.ts. 6 tier-3 integration tests (email-digest.integration.test.ts) all pass: suppression filter, daily-cap today/yesterday split (AC-MSG-009-01), default-on client (AC-MSG-011-01), feed-untouched (AC-MSG-010-03), own-row-only write, plus recordNudgeSent watermark. Lint+type-check+build all green. DECISION-018-002-A recorded: calendar-day UTC boundary for cap predicate. DECISION-018-002-B: use Prisma update (not updateMany) for clerkId @unique filter. | What's next: SDET review | Blockers: none
- 2026-06-26 [webapp-developer] Starting implementation — task TASK-018-002-email-preference-repository | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Four functions verified in `packages/db/src/repositories/email-digest.ts`. CS-TS-001 (required): request-pool path (`db.user.findFirst`/`update` via `currentRequestContext()` clerkUserId — never from args) honored and tagged. CS-TS-002 (required): `getAdminPool()` called only inside `packages/db`; raw pools not exported from barrel. Candidate query is SELECT-only on Notification (confirmed in SQL, no INSERT/UPDATE/DELETE — AC-MSG-010-03). Own-row isolation for `setEmailNudgePreferenceForCurrentUser`: `WHERE clerkId = ctx.clerkUserId` where ctx comes from SESSION_CONTEXT, not function arguments. 6 tier-3 integration tests covering suppression filter, daily-cap today/yesterday, default-on inclusion, feed-untouched, own-row write, watermark. CS-GEN-001: no PII in logs confirmed. DECISION-018-002-A (calendar-day UTC boundary) documented.

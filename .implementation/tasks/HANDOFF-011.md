# HANDOFF-011 — BRIEF-011 / EPIC-011 (Engagement attributes: due date, internal notes, priority flag)

**Slice:** the **second Phase-3 slice** — hangs the accountant's **working metadata** off each engagement: a
**due date** she sets and updates, **accountant-only internal notes** only she can read, and a **priority/flag**
marker she can set and clear. Built on the EPIC-010 engagement workspace (`apps/admin`). The
**confidentiality of internal notes** is the security-sensitive property of the slice. **Reuses, does not fork:**
the `Engagement` entity (extended additively — two new columns), the accountant-only policy pattern
(`pol_Notification` / `0004`) as the model for the new notes policy, the EPIC-003/004 audit seam
(`packages/db/src/audit.ts`), the `packages/db` `withRequestContext` request-scoped wrapper (ADR-003), and the
EPIC-010 engagement workspace in `apps/admin`.

**Branch:** `brief-011-engagement-attributes` → **PR (pending — `state.json` `awaitingMerge`).**
**Brief-type:** feature · **Brief-deploys:** no (gate 9 staging smoke N/A).
**Scope:** application code only (`prisma/schema`, `db/policies`, `packages/db`, `apps/admin`, `apps/portal`
e2e, `docs/demos`) — **no engine/role/workflow files** → **reviewed lane** (MERGE-POLICY Lane B); **no
workflow-file LGTM gate** applies.

## AC satisfied (9/9) + validation basis

All 9 in-scope AC validated by the SDET acceptance-validation gate (PASS), each mapped to an AC-id-tagged test
at its prescribed ADR-012 tier. Gherkin acceptance format: the 9 epic scenarios
(`.planning/EPIC-011-engagement-attributes.md` § Acceptance scenarios) are the behavior contract, bound to
executable Playwright/integration steps and a human-readable `.feature` file (Cucumber tooling not yet landed —
bound in prose per CLAUDE.md § Executable gherkin tooling).

### REQ-LIFE-007 — per-engagement due date
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-007-01 — accountant can set a due date | tier-6 e2e + tier-3 | `apps/admin/e2e/specs/engagement-attributes.spec.ts`; `packages/db/src/engagement-attributes.test.ts` (`setEngagementDueDate`) |
| AC-LIFE-007-02 — accountant can update a due date after it is set | tier-6 e2e + tier-3 | `apps/admin/e2e/specs/engagement-attributes.spec.ts`; `engagement-attributes.test.ts` (first-set + update through the same seam) |
| AC-LIFE-007-03 — due date is a per-engagement attribute | tier-3 | `engagement-attributes.test.ts` (distinct-engagement isolation: setting on A leaves B unaffected) |

### REQ-LIFE-008 — accountant-only internal notes
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-008-01 — accountant can record internal notes | tier-6 e2e + tier-3 | `apps/admin/e2e/specs/engagement-attributes.spec.ts`; `engagement-attributes.test.ts` (`recordEngagementNote`) |
| AC-LIFE-008-02 — internal notes visible only to the accountant | **HARD tier-3 RLS** | `packages/db/src/engagement-note.rls.test.ts` — `pol_EngagementNote` against the real SQL Server: ACCOUNTANT reads; **CLIENT reads ZERO**; **null/anonymous SESSION_CONTEXT reads ZERO** (fail-closed) |
| AC-LIFE-008-03 — notes never shown to a client through any portal path | **HARD tier-3 + tier-6** | `engagement-note.rls.test.ts` (server-side negative: a CLIENT principal — even the owning client — reads ZERO on a direct path) **AND** `apps/portal/e2e/specs/engagement-note-confidentiality.spec.ts` (a client participant viewing the engagement in `apps/portal` never sees the note text) |

### REQ-LIFE-009 — engagement flagging / prioritization
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-009-01 — accountant can flag/mark an engagement as prioritized | tier-6 e2e + tier-3 | `apps/admin/e2e/specs/engagement-attributes.spec.ts`; `engagement-attributes.test.ts` (`setEngagementPriority` true) |
| AC-LIFE-009-02 — accountant can remove the flag/priority marker | tier-6 e2e + tier-3 | `apps/admin/e2e/specs/engagement-attributes.spec.ts`; `engagement-attributes.test.ts` (`setEngagementPriority` false) |
| AC-LIFE-009-03 — flag/priority marker is per individual engagement | tier-3 | `engagement-attributes.test.ts` (distinct-engagement isolation: flagging A leaves B unaffected) |

## Gate evidence (the four slice gates — all PASS)

- **Container smoke (gate 5): PASS** — Docker pre-flight clean; portal `:3000` + admin `:13001` health/ready
  endpoints green; SQL Server operational via app principals (`taxportal_user`/`taxportal_admin`); the known
  SA-healthcheck cosmetic quirk (`retro-012-010`) is non-blocking and unrelated to this slice; BRIEF-011 e2e
  green against the container stack.
- **SDET acceptance-validation (gate 6): PASS** — all 9 AC independently verified with AC-id-tagged passing
  tests at the prescribed tiers; the notes-confidentiality boundary proven **both ways** (tier-3 accountant-only
  `pol_EngagementNote` RLS — CLIENT / owning-client / null all read ZERO, ACCOUNTANT reads — **and** the tier-6
  portal negative).
- **SDET CI gate (gate 7): PASS** — `pnpm lint` + `pnpm type-check` + `pnpm build` clean; `pnpm --filter portal
  test` 231/231, `pnpm --filter admin test` 345/345, scripts 293/293; 14 tier-3 integration + 5 RLS tests green
  against the real SQL Server.
- **SDET quality audit: PASS** — scope discipline (no creep beyond the 9 AC + the non-gating demo; **no
  dashboard / notification / reminder added** — correctly deferred to Phase 4; no fork of the Engagement entity;
  no weakened upstream gate); both surfaces covered; demo gallery `docs/demos/EPIC-011/` captured (6 AC-tagged
  PNGs + DEMO.md).

**Pre-existing (non-regression) e2e failures — confirmed NOT in the BRIEF-011 changeset:** admin 11
(request-accept/decline Mailhog `fetch failed`, sign-in-lane EPIC-009) + portal 10 (document-upload
BUG-008-001, onboarding-completion EPIC-008, sign-in-lane EPIC-009).

## What was built (the integrated diff)

- **`prisma/schema.prisma`** — additively (CS-GEN-002): `Engagement.dueDate` (`DateTime? @db.Date`, nullable,
  client-readable, no confidentiality AC) + `Engagement.isPriority` (`Boolean @default(false)`, client-readable);
  new **`EngagementNote`** model (one-to-many, `onDelete: NoAction`, `body NVarChar(Max)`, `createdBy`) —
  accountant-only, never client-readable.
- **`prisma/migrations/20260622233359_engagement-attributes/migration.sql`** — Track A schema migration.
- **`db/policies/0008-engagement-note-policy.sql`** — Track B raw-SQL security policy `sec.pol_EngagementNote`
  modeled on the **accountant-only** `pol_Notification`/`0004` family (NOT the client-isolation `pol_Engagement`
  family): inline TVF `sec.fn_engagement_note_access`, shallow, admin/accountant-first, fail-closed, **no CLIENT
  branch by design**; FILTER + BLOCK (INSERT/UPDATE/DELETE) defence-in-depth (CS-SQL-001 / CS-SQL-003).
- **`packages/db/src/repositories/engagement.ts`** — four new seams: `setEngagementDueDate`,
  `setEngagementPriority`, `recordEngagementNote` (each admin-pool inside `withAuditTransaction`, atomic ADR-019
  audit event, note bodies never logged — CS-GEN-001), and `listEngagementNotes` (request-pool under
  `withRequestContext` so `pol_EngagementNote` is the access gate, not app filtering). `getEngagementForAdmin`
  extended additively to read `dueDate` + `isPriority`.
- **`packages/db/src/index.ts`** — barrel exports for the new seams/types.
- **`apps/admin/src/app/engagements/[engagementId]/attributes/actions.ts`** — server actions
  (`setDueDateAction` / `recordNoteAction` / `setPriorityAction`), each with the `getAccountantIdentity()`
  guard (CS-TS-004), actor built from the verified session only (ADR-019), `revalidatePath` on success.
- **`apps/admin/src/app/engagements/[engagementId]/_components/EngagementAttributesPanel.tsx`** (+ page wiring)
  — the accountant-facing attribute panel (due date / note / flag).
- **Tests:** `engagement-note.rls.test.ts` (HARD tier-3 RLS), `engagement-attributes.test.ts` (tier-3
  integration), `actions.test.ts` + `EngagementAttributesPanel.test.tsx` (tier-2/5), admin e2e
  `engagement-attributes.spec.ts` (tier-6), portal e2e `engagement-note-confidentiality.spec.ts` (tier-6
  negative), `engagement-attributes.feature` (gherkin behavior contract).
- **`docs/demos/EPIC-011/`** — non-gating `@demo` AC-tagged screenshot gallery (6 PNGs + DEMO.md).

## Design decisions recorded (cross-task implications)

- **DECISION-011-A** — due date is a nullable `@db.Date` (calendar date, not a timestamp) column on the
  client-readable `Engagement` (no confidentiality AC; write path accountant-only).
- **DECISION-011-B** — priority is a `Boolean @default(false)` column on `Engagement` (set/clear; no level enum).
- **DECISION-011-C** — internal notes are a separate one-to-many `EngagementNote` table behind the
  accountant-only `pol_EngagementNote` policy (NOT a column on the client-readable `Engagement`) — the
  confidentiality boundary depends on this separation.
- **DECISION-011-D** — every attribute write reuses the EPIC-010 pattern verbatim: admin pool inside
  `withAuditTransaction` → guarded write + `@@ROWCOUNT` → atomic audit event.
- **DECISION-011-E** — audit action strings: `engagement.due_date_set`, `engagement.priority_set`,
  `engagement.note_recorded`.

None of these is a genuinely-upstream/architectural decision; no `OPEN-QUESTIONS.md` entry was raised. The
brief's `## Data & Interface Contract` deferred exactly these field-level shape calls to IO Design, which is
where they were resolved.

## For the upstream producer (Conductor → `/planning` Validate write-back)

- **EPIC-011: all 9 AC satisfied** (AC-LIFE-007-01/-02/-03, AC-LIFE-008-01/-02/-03, AC-LIFE-009-01/-02/-03) —
  ready for `COVERAGE.md` sign-off once the PR merges.
- **Out-of-scope deferrals (correctly NOT built, per the brief):** dashboard / needs-action surfacing of due
  dates, notes, and priority (REQ-DASH-006/-007 → Phase 4); overdue-document-request reminders & cadence
  (REQ-FILE-012, REQ-DASH-008, REQ-MSG-018 → Phase 4); mandatory-due-date-at-creation + engagement creation
  (EPIC-012); multi-participant modeling (REQ-LIFE-012, REQ-AUTH-007 → EPIC-012). **EPIC-011 does not close
  Phase 3** (EPIC-012..015 remain `planned`) — no `phase_walkthrough` / `@video` obligation on this slice.
- **No infra/CI-authority change** — required checks unchanged; no docker-compose/env wiring change, so the
  DevOps inventory/runbook update (CS-INFRA-001) was not triggered (correct).

## Follow-ups carried (not slice-blocking)

- **BUG-008-001** (Azurite SAS-URL e2e-tier upload defect) — unrelated to this slice (no uploads); remains open.
- Pre-existing admin/portal e2e failures (EPIC-008/009 lanes + Mailhog `fetch failed`) — none in this changeset.
- Open `state.json` retro items (`retro-012-*`, `retro-013-*`) carried unchanged — none newly triggered by this
  slice (see RETRO-011 § Rule Sunset).

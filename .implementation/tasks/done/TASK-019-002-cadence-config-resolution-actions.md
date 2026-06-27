---
brief: BRIEF-019
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-019-001
impl: developer
e2e_required: "no"
started_at: 2026-06-27T15:47:08.781Z
completed_at: 2026-06-27T18:03:36.857Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: [AC-DASH-008-01, AC-DASH-008-02, AC-DASH-008-03, AC-MSG-018-03, AC-MSG-018-04]
upstream_refs: [ADR-005, ADR-003, ADR-006, REQ-DASH-008, REQ-MSG-018]
code_standards: CS-TS-001 (required), CS-TS-002 (required), CS-TS-003 (recommended), CS-TS-004 (experimental), CS-SQL-001 (required), CS-GEN-003 (recommended)
---

# TASK-019-002: Cadence configuration — data layer, precedence resolution, role-guarded server actions + admin UI

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _(N/A here — the tier-6 cadence-config journeys are TASK-019-005; this task is tier-3 + unit)_
- [x] **Security review** — role-guard (accountant-only) before every config write; identity from request cookie; cadence-config writes via the packages/db wrapper / admin path only
- [x] **SDET Review** — approved

## SDET Review focus areas

- **HARD tier-3 precedence proven BOTH ways (extra_gate #4 — AC-MSG-018-04 / AC-DASH-008-03).** `resolveReminderCadence(engagement)` must return the per-engagement override when present AND the global default when absent. A test that only checks the override path is INSUFFICIENT and a rejection. This is the slice's correctness trap.
- **CS-TS-004 role-guard** — the global-default and per-engagement server actions must resolve identity from the request cookie and verify `role === 'ACCOUNTANT'` BEFORE the write (mirror the dispatch-digest route / settings actions pattern). A CLIENT-role session must be rejected.
- **CS-TS-001/-002** — cadence-config reads/writes go through the `packages/db` wrapper (request pool under the accountant principal) or the sanctioned admin-pool path; never import raw `requestDb`/`adminDb` outside `packages/db`.
- **CS-SQL-001 isolation** — the `ReminderSetting` read/write path must respect the policy from TASK-019-001 (accountant-only). Do not add a belt-and-suspenders WHERE that masks a policy regression unless the table has no policy (it does — lean on the policy).

## Context

Delivers the accountant-facing cadence configuration: a **global default** reminder frequency (admin settings surface) and a **per-engagement override** (engagement page) that **takes precedence** for that engagement. Exposes `resolveReminderCadence()` — the precedence function the engine (TASK-019-003) consumes. Satisfies AC-DASH-008-01/-02/-03 + AC-MSG-018-03/-04.

## IO Design — binding contract

- **Global default** lives in the singleton `ReminderSetting` row (TASK-019-001 / DECISION-019-B). Data layer get-or-creates the row with the seeded default.
- **Per-engagement override** = `Engagement.reminderFrequencyDaysOverride` (DECISION-019-A). Null → no override.
- **`resolveReminderCadence(engagement)` (DECISION-019-G)** = `engagement.reminderFrequencyDaysOverride ?? globalDefault.reminderFrequencyDays`. Pure/deterministic; the precedence is the cadence engine's security-of-correctness property.
- **Server actions (apps/admin only, ADR-006, role-guarded CS-TS-004):**
  - `setGlobalDefaultCadence({ reminderFrequencyDays })` — accountant-only; writes `ReminderSetting`.
  - `setEngagementCadenceOverride({ engagementId, reminderFrequencyDays | null })` — accountant-only; writes `Engagement.reminderFrequencyDaysOverride` (null clears the override → back to global default).
- **Admin UI (apps/admin):** global default on a settings surface (extend `apps/admin/src/app/settings/notifications/` or add `settings/reminders`); per-engagement override on `apps/admin/src/app/engagements/[engagementId]/page.tsx`. UI copy is IO-discretionary.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/reminder-cadence.ts` | Create | `getGlobalDefaultCadence()`, `setGlobalDefaultCadence()`, `getEngagementCadenceOverride()`, `setEngagementCadenceOverride()`, `resolveReminderCadence()` |
| `packages/db/src/reminder-cadence.precedence.test.ts` | Create | HARD tier-3 precedence BOTH ways (AC-MSG-018-04 / AC-DASH-008-03) |
| `packages/db/src/reminder-cadence.config.test.ts` | Create | get/set global default + per-engagement override round-trips (AC-DASH-008-01/-02, AC-MSG-018-03) |
| `packages/db/src/index.ts` | Modify | Barrel-export cadence functions (CS-GEN-002 additive) |
| `apps/admin/src/app/settings/reminders/actions.ts` | Create | `setGlobalDefaultCadenceAction` + `getGlobalDefaultCadenceAction` server actions — role-guarded (CS-TS-004) |
| `apps/admin/src/app/settings/reminders/actions.test.ts` | Create | Unit tests for global default cadence actions (CS-TS-004 security gate) |
| `apps/admin/src/app/settings/reminders/page.tsx` | Create | Global default cadence settings page |
| `apps/admin/src/app/settings/reminders/_components/ReminderCadenceForm.tsx` | Create | Client form component for global default cadence |
| `apps/admin/src/app/engagements/[engagementId]/cadence-actions.ts` | Create | `setEngagementCadenceOverrideAction` + `getEngagementCadenceOverrideAction` — role-guarded (CS-TS-004) |
| `apps/admin/src/app/engagements/[engagementId]/cadence-actions.test.ts` | Create | Unit tests for per-engagement cadence override actions (CS-TS-004 security gate) |
| `apps/admin/src/app/engagements/[engagementId]/_components/ReminderOverridePanel.tsx` | Create | Client component for per-engagement override UI |
| `apps/admin/src/app/engagements/[engagementId]/page.tsx` | Modify | Add cadence override panel + load global default + engagement override (AC-DASH-008-02) |

Note: per-engagement actions placed in a dedicated `cadence-actions.ts` file (instead of modifying existing `actions.ts`) to avoid touching the existing `actions.test.ts` which has tight mock boundaries. This is a safe organizational choice consistent with CS-GEN-002 (additive).

## Tests to Write First

- [ ] `resolveReminderCadence — engagement WITH override → uses override (not global default)` — expected: override value
- [ ] `resolveReminderCadence — engagement WITHOUT override → uses global default` — expected: global value
- [ ] `setGlobalDefaultCadence then getGlobalDefaultCadence` — expected: round-trips the set value
- [ ] `setEngagementCadenceOverride then resolve` — expected: that engagement carries its own frequency
- [ ] `setEngagementCadenceOverride(null)` — expected: override cleared, resolve falls back to global default
- [ ] `server action with CLIENT-role session → rejected` — expected: unauthorized, no write (CS-TS-004)

## Implementation Notes

- Mirror the EPIC-018 settings-action pattern (`apps/admin/src/app/settings/notifications/` + its action) for the role-guard and the cookie→identity flow.
- `resolveReminderCadence` is the unit the engine imports — keep it a pure function over `{ overrideDays | null, globalDefaultDays }` so the precedence test does not need DB round-trips (DB round-trips covered separately).
- Cite governing keys: `// ADR-006`, `// CS-TS-001`, `// CS-TS-002`, `// CS-TS-004`, `// CS-SQL-001`, `// DECISION-019-A/-B/-G`, `// CS-GEN-003`.
- Cross-surface (CLAUDE.md): config is `apps/admin`-only here; the resulting client nudges (TASK-019-004) surface on `apps/portal`.

## Definition of Done

- [x] `resolveReminderCadence` precedence test passes BOTH ways
- [x] Global default + per-engagement override get/set round-trip; clearing override falls back to global
- [x] Server actions reject non-accountant sessions (CS-TS-004)
- [x] Lint + type-check + build pass; relevant `pnpm --filter admin test` + `pnpm --filter db test` green

---

## Work Log

- 2026-06-27 [sdet] Marking done — Approved. Precedence proven BOTH ways (override→override, null→global default) plus nullish-coalescing edge case. CS-TS-004 guard tested for both server actions (CLIENT and null identity rejected before any DB call). Tests-to-Write-First planning boxes unchecked (minor hygiene); DoD boxes ticked; Work Log evidence compensates. | What's next: archive | Blockers: none
- 2026-06-27 [webapp-developer] Marking as review — All gates pass. Precedence test both ways (4 unit tests), config round-trip (5 integration tests), server action CS-TS-004 role guard tested (7+9 unit tests). Lint+type-check+build clean. Pre-existing upload-pipeline RLS failures unrelated (confirmed pre-dates this task). | What's next: SDET review | Blockers: none
- 2026-06-27 [webapp-developer] Starting implementation — Starting cadence config layer: repository, precedence tests, server actions, admin UI | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved — 2026-06-27T18:03:36.857Z
**Notes**: All mandatory gate checks passed. HARD tier-3 precedence proven BOTH ways (extra_gate #4): direction 1 — engagement WITH override → override value returned, not global default; direction 2 — engagement WITHOUT override → global default returned. Additional edge-case: override=0 is treated as non-null by the `??` (nullish coalescing) operator, preventing a truthy-check regression. CS-TS-004 role guard verified in both server action files: CLIENT identity and null identity each rejected before any DB call (`mockSetGlobalDefaultCadence` and `mockSetEngagementCadenceOverride` never reached). CS-TS-001/-002: all cadence writes/reads go through `setGlobalDefaultCadence`, `getGlobalDefaultCadence`, `setEngagementCadenceOverride`, `getEngagementCadenceOverride` in `packages/db` — no raw pool imports in action files. Work Log: 4 precedence unit tests, 5 integration round-trip tests, 7+9 action unit tests. Tests-to-Write-First planning boxes left unchecked — minor hygiene observation; DoD boxes are ticked; gate evidence is present.

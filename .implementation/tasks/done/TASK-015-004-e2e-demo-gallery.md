---
brief: BRIEF-015
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-015-003
impl: developer
e2e_required: "yes"
started_at: 2026-06-24T15:15:14.058Z
completed_at: 2026-06-24T15:59:04.719Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: [AC-FILE-013-03, AC-FILE-014-01, AC-FILE-014-06, AC-FILE-014-07, AC-FILE-013-02]
upstream_refs: [REQ-FILE-013, REQ-FILE-014, ADR-006, ADR-010, ADR-012, ADR-019]
code_standards: CS-TS-003, CS-GEN-003
---

# TASK-015-004: Tier-6 e2e (confirm-before-purge, place/lift hold + audit, no-client absence) + EPIC-015 @demo gallery

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (admin + portal specs)
- [x] **Security review** — portal absence proven; audit assertions read the real audit store
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Both-surface scope (CLAUDE.md § Platform-frontend scope, CS-TS-003):** the no-purge/hold absence must be proven
  on the **portal** surface (negative e2e), not just by omission — mirror EPIC-014's `no-client-delete.spec.ts`.
- **Audit assertions hit the real store:** place/lift specs must assert the `legal_hold.placed` / `legal_hold.lifted`
  audit rows exist (AC-FILE-014-06/-07), not just the UI state.
- **Confirm-before-purge (AC-FILE-013-03):** the e2e must show that without the explicit confirmation no purge fires.
- **BUG-008-001 caveat:** if an Azurite byte round-trip blocks a scene, carry the affected assertion by its tier-3
  proof (TASK-015-002) and flag it — do not weaken the gate. The hard guarantees here are server-side.

## Context

End-to-end proof of the accountant journeys and the portal absence, plus the per-epic UI demo gallery
(`docs/demos/EPIC-015/`). Tier-6 per the epic sign-off contract: AC-FILE-013-03 (confirm-before-purge),
AC-FILE-014-01/-06 (place hold + audit), AC-FILE-014-07 (lift hold + audit); portal absence for AC-FILE-013-02.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/specs/purge-legal-hold.spec.ts` | Create | confirm-before-purge; place hold + audit; lift hold + audit |
| `apps/portal/e2e/specs/no-client-purge-hold.spec.ts` | Create | portal exposes NO purge/hold/lift affordance (absence) |
| `apps/admin/e2e/demo/purge-legal-hold.demo.spec.ts` | Create | `@demo` gallery → `docs/demos/EPIC-015/NN-<AC>-*.png` |
| `docs/demos/EPIC-015/DEMO.md` | Create | gallery assembly (title, persona/flow links, per-screenshot sections) |

## Tests to Write First

- [ ] admin `purge-legal-hold.spec.ts`:
  - place a legal hold on an engagement → it shows held; an `AuditEvent legal_hold.placed` exists (`// AC-FILE-014-01`, `// AC-FILE-014-06`)
  - lift the hold → `AuditEvent legal_hold.lifted` exists (`// AC-FILE-014-07`)
  - on a purge-eligible engagement, the confirm flow requires explicit confirmation before any purge (`// AC-FILE-013-03`)
- [ ] portal `no-client-purge-hold.spec.ts`: a CLIENT session on an engagement sees **no** purge, hold, or lift
      control (data-testid hooks absent) (`// AC-FILE-013-02`, `// CS-TS-003`)
- [ ] `purge-legal-hold.demo.spec.ts`: walk the jane-accountant journey (place hold → held engagement not eligible →
      lift hold → confirm purge of an expired engagement → audit survives), `page.screenshot` per AC into
      `docs/demos/EPIC-015/`

## Implementation Notes

- **Docker pre-flight** before running e2e (ENGINE § Docker Pre-Flight). E2E runs against the live docker-compose
  stack (both apps up) per ADR-006/ADR-010. Capture **actual execution output** in the Work Log (e2e proof).
- **Fixtures:** seed a **completed engagement with an elapsed retention window** (set `completedAt` far enough in
  the past, or override `RETENTION_WINDOW_YEARS` for the test seed) so it is purge-eligible; and a held engagement
  to show the block. Use deterministic per-run identifiers (suffix `-e2e-015` / `-demo-015`) — mirror EPIC-014.
- **Demo gallery** (`docs/demos/EPIC-015/`): scope screenshot output to this epic's directory only (avoid the
  prior-epic PNG byte-churn noted in retro-012-012). Persona `jane-accountant`, flow `flow-document-lifecycle`.
- **Portal absence** mirrors `apps/portal/e2e/specs/no-client-delete.spec.ts` — assert the purge/hold/lift testids
  do not exist for any engagement, including one the client participates in.

## Definition of Done

- [x] admin + portal e2e specs pass against the container stack (execution output in Work Log)
- [x] EPIC-015 @demo gallery PNGs + `DEMO.md` produced
- [x] AC-id tags present on every spec; portal absence proven
- [x] Lint + type-check + build pass

---

## Work Log

- 2026-06-24 [sdet] Marking done — Both-surface 5-test suite 3x flake-free; audit assertions hit real AuditEvent ledger; confirm-before-purge 3-state verified; portal absence covers accountant+client-uploaded paths with toHaveCount(0); EPIC-015 gallery 6 PNGs scoped correctly | What's next: archive | Blockers: none
- 2026-06-24 [webapp-developer] Marking as review — Tier-6 admin (3) + portal absence (2) + EPIC-015 @demo (6 PNGs) all green against live stack; 3x flake-free both surfaces; lint/type-check/build clean | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] Starting implementation — Tier-6 e2e (purge-confirm + place/lift hold + audit) + portal absence + EPIC-015 @demo gallery | What's next: implement and run gates | Blockers: none

- 2026-06-24 [webapp-developer] **Implemented + validated.** Created the 3 specs + the EPIC-015 gallery, drove them against the live docker-compose stack (admin :13001 / portal :3000 / sqlserver / azurite), all healthy. **What was done:**
  - `apps/admin/e2e/specs/purge-legal-hold.spec.ts` (tier-6, 3 tests): place hold → held + `AuditEvent legal_hold.placed` (`// AC-FILE-014-01` `// AC-FILE-014-06`); lift hold → leaves list + `AuditEvent legal_hold.lifted` (`// AC-FILE-014-07`); confirm-before-purge — `purge-confirm-submit` disabled on empty + wrong input, enabled only on exact engagementId, engagement row intact while unconfirmed (`// AC-FILE-013-03`). Audit assertions hit the REAL `[dbo].[AuditEvent]` ledger via the admin pool (mirrors `packages/db/src/legal-hold.integration.test.ts`), asserting row existence + actor (clerkUserId/actorRole/sourceSurface).
  - `apps/portal/e2e/specs/no-client-purge-hold.spec.ts` (tier-6 absence, 2 tests): CLIENT session on a purge-eligible engagement (incl. one with a client-uploaded doc) — `retention-panel` / `purge-button` / `purge-confirm-*` / `legal-hold-place` / `active-holds-list` / `legal-hold-lift-*` / `active-hold-item-*` / `purge-eligibility-reason` all assert `toHaveCount(0)` (`// AC-FILE-013-02` `// CS-TS-003`). Mirrors `no-client-delete.spec.ts` harness/fixtures/style exactly.
  - `apps/admin/e2e/demo/purge-legal-hold.demo.spec.ts` (`@demo`, non-gating): jane-accountant journey place → blocked-by-hold → lift → confirm purge of an expired engagement → audit survives; 6 AC-tagged PNGs → `docs/demos/EPIC-015/` ONLY (retro-012-012).
  - `docs/demos/EPIC-015/DEMO.md` — gallery modeled on EPIC-014.
  - **Fixtures:** seed a *completed* Engagement with `completedAt` ~8 years ago (purge-eligible). NOTE: the `RETENTION_WINDOW_YEARS` env override only accepts a value `> 0` (a `0` override falls back to 7), so the past-`completedAt` seed — not a `0` override — is the eligibility mechanism. Demo engagement seeded with NO documents so the purge's storage-delete loop is empty (no Azurite byte round-trip → BUG-008-001 sidestepped).
  - **DECISION:** the GUID `holdId` in the DB is collation-insensitive but the DOM `active-hold-item-{holdId}` testid is rendered in the DB's casing; the optimistic-update path could drift casing. Fixed by reloading after place + reading the exact rendered testid suffix from the DOM (`readRenderedHoldId`) so the lift locator + audit assertion match exactly.
  - **DECISION:** `purgeEngagement` destroys the engagement's **document data graph** (Document + DocumentVersion rows + storage bytes), not the Engagement row itself (matches `purge.integration.test.ts` which checks document-row count). Demo post-state asserts `Document` count == 0 + `engagement.purged` audit row survives (AC-NFR-010-07), not engagement-row deletion.
  - **Container rebuild:** the running admin/portal images predated TASK-015-003's RetentionPanel; rebuilt + restarted `admin`+`portal` via `docker compose --env-file .env.local build/up -d` (both back to healthy) so the live stack serves the retention surface.

  **e2e execution output (actual):**
  - **Admin** `pnpm exec playwright test --grep "purge-legal-hold" --grep-invert "@demo"` → **3 passed (4.1s)**:
    - `[AC-FILE-014-01] [AC-FILE-014-06]` place a hold → held + AuditEvent legal_hold.placed ✓
    - `[AC-FILE-014-07]` lift a hold → leaves list + AuditEvent legal_hold.lifted ✓
    - `[AC-FILE-013-03]` confirm-before-purge: submit disabled until exact engagementId ✓
  - **Portal** `pnpm exec playwright test --grep "no-client-purge-hold"` → **2 passed (2.3s)**:
    - `[AC-FILE-013-02]` no purge/hold/lift affordance (accountant-uploaded file) ✓
    - `[AC-FILE-013-02]` no purge/hold/lift affordance — even for a client-uploaded file ✓
  - **Demo** `pnpm exec playwright test --grep "@demo" --grep-invert "@video" e2e/demo/purge-legal-hold.demo.spec.ts` → **1 passed (3.4s)**; 6 PNGs written to `docs/demos/EPIC-015/` (01..06).

  **Pre-push 3× e2e flake check (ENGINE § Bug Fixes / e2e determinism):**
  - Admin purge-legal-hold: RUN 1 → 3 passed (4.1s); RUN 2 → 3 passed (4.1s); RUN 3 → 3 passed (4.1s). **Zero flakes.**
  - Portal no-client-purge-hold: RUN 1 → 2 passed (2.1s); RUN 2 → 2 passed (2.2s); RUN 3 → 2 passed (2.3s). **Zero flakes.**

  **Submission gate:** `pnpm lint` → exit 0; `pnpm type-check` → exit 0 (admin tsconfig include is `**/*.ts` → e2e specs are type-checked); `pnpm build` → exit 0.

  **Caveats/flags:** BUG-008-001 (Azurite SAS-URL host-unreachable) did NOT trip — all hard guarantees here are server-side (hold place/lift, eligibility derivation, confirm-before-purge, audit-survives-purge) and the demo's purge-target engagement has no documents (empty storage-delete loop). No assertion was carried or weakened.

  **What's next:** SDET review. **Blockers:** none.
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Both-surface scope satisfied — admin 3 tests + portal 2 absence tests, both 3× flake-free with actual pass/fail/timing output in Work Log (not synthesized). Audit assertions (AC-FILE-014-06/-07) hit the real `[dbo].[AuditEvent]` ledger via admin pool, asserting actor/role/sourceSurface. Confirm-before-purge (AC-FILE-013-03) e2e: `purge-confirm-submit` disabled on empty, disabled on wrong input, enabled only on exact engagementId match, engagement row intact while unconfirmed — three states all tested. Portal absence covers both accountant-uploaded and client-uploaded doc paths (eliminates the conditionally-hidden loophole) with `toHaveCount(0)` on all 9 data-testid hooks. GUID casing drift pre-solved by `readRenderedHoldId(page)` DOM-read helper. BUG-008-001 Azurite round-trip cleanly sidestepped (no documents in the demo purge target, no assertion weakened). EPIC-015 @demo gallery: 6 AC-tagged PNGs in `docs/demos/EPIC-015/` only (retro-012-012 scoping respected). `docs/demos/EPIC-015/DEMO.md` present. CS-TS-003 mirror obligation fulfilled. `completed_at` left blank for SDET to stamp.

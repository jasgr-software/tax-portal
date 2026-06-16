# Coverage Ledger

> **Living document.** The acceptance mapping from the requirements source to the roadmap. **One row per
> acceptance criterion** — this is what lets a single requirement's AC fan out across multiple epics. The
> Planning Agent maintains it (see `AGENT.md`). The **validate** phase flips a row from `planned` to
> `verified` when a tagged automated test passes in CI; an AC is signed off **only** with passing-test
> evidence.

**Status legend** — per AC: `planned` (mapped to an epic, not yet built/verified) · `verified` (a test
tagged with the AC id passes in CI) · `deferred` (explicitly out of current scope, with rationale).
**Test tag** = the `AC-<DOMAIN>-NNN-NN` id the covering automated test(s) must carry; the roll-up reads
that tag. **Evidence** = the CI run / result the validate phase recorded.

## Summary

| Measure | Count |
|---|---|
| AC placed in an epic (all Phase 1) | 51 |
| — EPIC-001 (public front door) | 13 |
| — EPIC-004 (auth & two-role model) | 11 |
| — EPIC-002 (services-catalog management) | 7 |
| — EPIC-003 (accountant request inbox) | 20 |
| AC `verified` (signed off) | 24 — all of EPIC-001 (13, delivered 2026-06-15) + all of EPIC-004 (11, delivered 2026-06-16) |
| AC `deferred` | the 2FA set (AC-AUTH-004-01/-02/-03 + AC-AUTH-005-01) + IDNT hard-delete (v1) + the v2 requirement set — see Deferred |
| AC orphaned (source AC not yet decomposed into any epic) | remainder of the v1 corpus — see Orphans |

> **EPIC-001 (13 AC) signed off 2026-06-15** — the public front-door slice shipped (PR #35, merge `f7f6c9d`).
> **EPIC-004 (11 AC) signed off 2026-06-16** — the auth & two-role-model identity spine shipped (PR #38,
> squash merge `0444551`); see basis note [A]. The 4 2FA AC (AC-AUTH-004-01/-02/-03 + AC-AUTH-005-01) remain
> `deferred` to the future Phase-1 "2FA enablement" slice — see Deferred. The remaining placed AC
> (EPIC-002/003) are still `planned`. The roll-up reaches **full v1 acceptance** when no v1 source AC is
> orphaned and every non-deferred AC is `verified`.
>
> **[A] Evidence basis for the EPIC-001 sign-off (precedent — set by the user 2026-06-15); reused for EPIC-004
> 2026-06-16.** Each EPIC-001 AC
> has an automated test **tagged with its AC id** (the AC→test-tag→tier table is in
> `.implementation/tasks/RETRO-001.md`) that **passed** under the SDET's independent acceptance-validation
> against the real docker-compose stack — tier-3 RLS hard gate 4/4 (`engagement-request.rls.test.ts`, real SQL
> Server), e2e 12/12 (`apps/portal/e2e`, containers), and `pnpm -r test` 28/28 — corroborated by green
> **required** CI (run `27560403275` head `211175b`; post-merge run `27560948602` on `main`@`f7f6c9d`:
> `lint-and-typecheck` ✅ + `security-scan` ✅). **Caveat:** per-PR CI does **not** yet execute the tier-3 /
> e2e / component test tiers as required checks — tier-3 + e2e are not run per-PR by design (CLAUDE.md; e2e is
> a deploy-to-staging gate, deferred per ADR-007), and the `test-portal` component job is currently advisory
> (`continue-on-error`, red on a missing CI DB-seed). The SDET acceptance-validation gate is the independent
> verification for those tiers this slice. **Tracked follow-up:** wire the AC test tiers (component + tier-3
> + e2e) into a required CI check so future sign-offs rest on per-PR CI directly (RETRO-001 § carried
> follow-ups; ties to the `test-portal` graduation item).
>
> **[A] applied to the EPIC-004 sign-off (2026-06-16).** Same user-accepted CI-as-the-gate basis as EPIC-001:
> the env-blocked local container smoke is substituted by clean GitHub CI. The required checks
> `lint-and-typecheck` ✅ + `security-scan` ✅ — plus `test-admin` ✅ and `test-portal` ✅ — are green on the
> PR #38 head **and** on the post-merge `main` run at `0444551`. Each in-scope AC has automated test(s)
> tagged with its AC id exercised by the SDET at dev time (167+ auth unit/integration tests, RLS isolation
> tests, per-app + cross-app e2e). **Slice-specific caveat:** the auth provider was **mocked** for this slice
> (user-approved brief deviation); real Clerk + 2FA enforcement are a deferred future Phase-1 "2FA enablement"
> slice that re-validates the 4 deferred AC against the live provider. The same per-PR-CI-tier follow-up
> tracked for EPIC-001 applies here.

## Coverage by acceptance criterion

| REQ | AC | Epic | Phase | Test tag | Status | Evidence |
|---|---|---|---|---|---|---|
| REQ-DOOR-001 | AC-DOOR-001-01 | EPIC-001 | 1 | `AC-DOOR-001-01` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-001 | AC-DOOR-001-02 | EPIC-001 | 1 | `AC-DOOR-001-02` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-001 | AC-DOOR-001-03 | EPIC-001 | 1 | `AC-DOOR-001-03` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-04 | EPIC-001 | 1 | `AC-DOOR-002-04` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-01 | EPIC-002 | 1 | `AC-DOOR-002-01` | planned | — |
| REQ-DOOR-002 | AC-DOOR-002-02 | EPIC-002 | 1 | `AC-DOOR-002-02` | planned | — |
| REQ-DOOR-002 | AC-DOOR-002-03 | EPIC-002 | 1 | `AC-DOOR-002-03` | planned | — |
| REQ-DOOR-002 | AC-DOOR-002-05 | EPIC-002 | 1 | `AC-DOOR-002-05` | planned | — |
| REQ-DOOR-003 | AC-DOOR-003-01 | EPIC-001 | 1 | `AC-DOOR-003-01` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-003 | AC-DOOR-003-02 | EPIC-001 | 1 | `AC-DOOR-003-02` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-003 | AC-DOOR-003-03 | EPIC-001 | 1 | `AC-DOOR-003-03` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-003 | AC-DOOR-003-04 | EPIC-001 | 1 | `AC-DOOR-003-04` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-01 | EPIC-001 | 1 | `AC-DOOR-004-01` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-02 | EPIC-001 | 1 | `AC-DOOR-004-02` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-03 | EPIC-001 | 1 | `AC-DOOR-004-03` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-04 | EPIC-001 | 1 | `AC-DOOR-004-04` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-05 | EPIC-001 | 1 | `AC-DOOR-004-05` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-005 | AC-DOOR-005-01 | EPIC-003 | 1 | `AC-DOOR-005-01` | planned | — |
| REQ-DOOR-005 | AC-DOOR-005-02 | EPIC-003 | 1 | `AC-DOOR-005-02` | planned | — |
| REQ-DOOR-005 | AC-DOOR-005-03 | EPIC-003 | 1 | `AC-DOOR-005-03` | planned | — |
| REQ-DOOR-006 | AC-DOOR-006-01 | EPIC-003 | 1 | `AC-DOOR-006-01` | planned | — |
| REQ-DOOR-006 | AC-DOOR-006-02 | EPIC-003 | 1 | `AC-DOOR-006-02` | planned | — |
| REQ-DOOR-006 | AC-DOOR-006-03 | EPIC-003 | 1 | `AC-DOOR-006-03` | planned | — |
| REQ-DOOR-006 | AC-DOOR-006-04 | EPIC-003 | 1 | `AC-DOOR-006-04` | planned | — |
| REQ-DOOR-006 | AC-DOOR-006-05 | EPIC-003 | 1 | `AC-DOOR-006-05` | planned | — |
| REQ-DOOR-007 | AC-DOOR-007-01 | EPIC-003 | 1 | `AC-DOOR-007-01` | planned | — |
| REQ-DOOR-007 | AC-DOOR-007-02 | EPIC-003 | 1 | `AC-DOOR-007-02` | planned | — |
| REQ-DOOR-007 | AC-DOOR-007-03 | EPIC-003 | 1 | `AC-DOOR-007-03` | planned | — |
| REQ-DOOR-007 | AC-DOOR-007-04 | EPIC-003 | 1 | `AC-DOOR-007-04` | planned | — |
| REQ-DOOR-008 | AC-DOOR-008-01 | EPIC-003 | 1 | `AC-DOOR-008-01` | planned | — |
| REQ-DOOR-008 | AC-DOOR-008-02 | EPIC-003 | 1 | `AC-DOOR-008-02` | planned | — |
| REQ-DOOR-008 | AC-DOOR-008-03 | EPIC-003 | 1 | `AC-DOOR-008-03` | planned | — |
| REQ-DOOR-008 | AC-DOOR-008-04 | EPIC-003 | 1 | `AC-DOOR-008-04` | planned | — |
| REQ-DASH-010 | AC-DASH-010-01 | EPIC-002 | 1 | `AC-DASH-010-01` | planned | — |
| REQ-DASH-010 | AC-DASH-010-02 | EPIC-002 | 1 | `AC-DASH-010-02` | planned | — |
| REQ-DASH-010 | AC-DASH-010-03 | EPIC-002 | 1 | `AC-DASH-010-03` | planned | — |
| REQ-DASH-011 | AC-DASH-011-01 | EPIC-003 | 1 | `AC-DASH-011-01` | planned | — |
| REQ-DASH-011 | AC-DASH-011-02 | EPIC-003 | 1 | `AC-DASH-011-02` | planned | — |
| REQ-DASH-011 | AC-DASH-011-03 | EPIC-003 | 1 | `AC-DASH-011-03` | planned | — |
| REQ-AUTH-001 | AC-AUTH-001-01 | EPIC-004 | 1 | `AC-AUTH-001-01` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-001 | AC-AUTH-001-02 | EPIC-004 | 1 | `AC-AUTH-001-02` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-001 | AC-AUTH-001-03 | EPIC-004 | 1 | `AC-AUTH-001-03` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-004 | AC-AUTH-004-01 | (2FA-enablement, future Phase 1) | 1 | `AC-AUTH-004-01` | deferred | Deferred 2026-06-15 — 2FA not ready to deploy; see Deferred |
| REQ-AUTH-004 | AC-AUTH-004-02 | (2FA-enablement, future Phase 1) | 1 | `AC-AUTH-004-02` | deferred | Deferred 2026-06-15 — 2FA not ready to deploy; see Deferred |
| REQ-AUTH-004 | AC-AUTH-004-03 | (2FA-enablement, future Phase 1) | 1 | `AC-AUTH-004-03` | deferred | Deferred 2026-06-15 — 2FA not ready to deploy; see Deferred |
| REQ-AUTH-005 | AC-AUTH-005-01 | (2FA-enablement, future Phase 1) | 1 | `AC-AUTH-005-01` | deferred | Deferred 2026-06-15 — 2FA not ready to deploy; see Deferred |
| REQ-AUTH-005 | AC-AUTH-005-02 | EPIC-004 | 1 | `AC-AUTH-005-02` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-006 | AC-AUTH-006-01 | EPIC-004 | 1 | `AC-AUTH-006-01` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-006 | AC-AUTH-006-02 | EPIC-004 | 1 | `AC-AUTH-006-02` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-006 | AC-AUTH-006-03 | EPIC-004 | 1 | `AC-AUTH-006-03` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-009 | AC-AUTH-009-01 | EPIC-004 | 1 | `AC-AUTH-009-01` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-010 | AC-AUTH-010-01 | EPIC-004 | 1 | `AC-AUTH-010-01` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-010 | AC-AUTH-010-02 | EPIC-004 | 1 | `AC-AUTH-010-02` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-010 | AC-AUTH-010-03 | EPIC-004 | 1 | `AC-AUTH-010-03` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-MSG-013 | AC-MSG-013-01 | EPIC-003 | 1 | `AC-MSG-013-01` | planned | — |

## Split requirements

Requirements whose AC span more than one epic (or one epic + orphans/deferred) — the fan-out, at a glance.

- **REQ-DOOR-002 (services catalog)** — split across two epics:
  - **EPIC-001** owns **AC-DOOR-002-04** (a deactivated service does not appear on the public services page
    or request form) — testable from the public front door.
  - **EPIC-002** owns **AC-DOOR-002-01, -02, -03, -05** (accountant add/edit/deactivate + "only the
    accountant may change the catalog") — these need the authenticated accountant admin surface.
- **REQ-MSG-013 (accountant notification types)** — split between MVP and Phase 4:
  - **EPIC-003** owns **AC-MSG-013-01** (new service-request notification) — the only MSG-013 event that
    exists in the MVP.
  - **AC-MSG-013-02..06** (new message, document uploaded, onboarding completed, document-request overdue,
    due-date approaching) → **Orphans**, targeted at **Phase 4** (the notification feed), since those source
    events are not built until later phases.

## Orphans

Source AC not yet decomposed into any epic. This is the v1 work remaining — each becomes `planned` when a
Planning Agent run places it in an epic. (v2 AC are tracked separately under Deferred, not here.)

**MVP-adjacent (deferred for lack of an MVP home — reconciled this run, with target phase):**
- **REQ-DOOR-009** (returning client requests from inside the portal) — AC-DOOR-009-01..04 → **Phase 2–3**
  (needs a client portal home).
- **REQ-DOOR-010** (accountant initiates an engagement for an existing client) — AC-DOOR-010-01..04 →
  **Phase 3** (needs the engagement entity / lifecycle).
- **REQ-AUTH-002** (accountant full visibility) — AC-AUTH-002-01..03 → **Phase 3** (needs engagements + a
  client list to exercise).
- **REQ-AUTH-003** (client sees only their own data — RLS isolation) — AC-AUTH-003-01..03 → **Phase 3** (the
  per-policy CLIENT-A-vs-CLIENT-B test needs client-owned rows).
- **REQ-AUTH-007** (multiple participants per engagement) — AC-AUTH-007-01..03 → **Phase 3**.
- **REQ-AUTH-008** (indefinite access after completion) — AC-AUTH-008-01..02 → **Phase 3** (needs completed
  engagements).
- **REQ-MSG-013** remainder — AC-MSG-013-02..06 → **Phase 4**.
- **REQ-MSG-014** (all client notification types) — AC-MSG-014-01..07 → **Phase 4** (the client notification
  feed; in the MVP accept/decline reach the account-less prospect by email, not a feed).

**Whole domains pending decomposition** (each `AC-*` orphaned until a future run slices it into a phase —
see `ROADMAP.md` Phases 2–4):
- **ONBD** (Phase 2) — REQ-ONBD-001..007 (v1). *(REQ-ONBD-008 is v2 → Deferred.)*
- **LIFE** (Phase 3) — REQ-LIFE-001..012 (v1). *(REQ-LIFE-013/014 are v2 → Deferred.)*
- **FILE** (Phase 3) — REQ-FILE-001..015 (v1). *(REQ-FILE-016 is v2 → Deferred.)*
- **MSG** (Phase 4) — REQ-MSG-001..012, -015..018 (v1, plus the MSG-013/014 remainders above).
  *(REQ-MSG-019 is v2 → Deferred.)*
- **DASH** (Phase 4) — REQ-DASH-001..009, -012, -013 (DASH-010 in EPIC-002, DASH-011 in EPIC-003).
- **IDNT** (Phase 4) — REQ-IDNT-001..004, -006, -007 (IDNT-005 → Deferred).
- **NFR** (cross-cutting) — REQ-NFR-001..011 mapped onto the epic(s) whose slice must demonstrate each (e.g.
  RLS isolation on the first client-scoped read slice; malware scanning on the first upload slice). To be
  attached to epics as those slices are authored.

## Deferred

AC explicitly out of current scope, with rationale. Distinct from orphaned — deferred AC are a deliberate
decision, not pending v1 work.

- **2FA (AC-AUTH-004-01/-02/-03 + AC-AUTH-005-01)** — Deferred 2026-06-15 per user direction — 2FA is not
  ready to deploy; the auth spine (EPIC-004) ships without it. Targeted at a future Phase-1 "2FA enablement"
  slice that stands up real Clerk test-mode and re-validates these AC against the live provider (EPIC-004
  mocks the auth provider for e2e). REQ-AUTH-004 (mandatory accountant 2FA) leaves EPIC-004 entirely;
  REQ-AUTH-005 keeps only its no-2FA path (AC-AUTH-005-02) in EPIC-004, with the enrollment path
  (AC-AUTH-005-01) deferred to the same slice. The requirements (`.requirements/REQ-AUTH-004/005.md`) are
  unchanged — this is a planning-level deferral of the AC, not a requirement deletion.
- **REQ-IDNT-005 (permanent client hard-delete)** — descoped from v1 per requirements `OQ-004` (hard-delete
  vs. 7-year retention precedence; the wholesale-erasure deferral was **not** reversed by the 2026-06-14
  purge decision). To be carried as `deferred` when the IDNT domain is decomposed; recorded now so the
  decision is not lost.
- **v2 requirement set (above v1 acceptance — added 2026-06-14, not yet phased):**
  - **REQ-ONBD-008** — dynamic, conditional intake organizer.
  - **REQ-FILE-016** — prior-year-based expected-document detection.
  - **REQ-LIFE-013** — outstanding-question tracking.
  - **REQ-LIFE-014** — recurring engagements & year-over-year reminders.
  - **REQ-MSG-019** — proactive lifecycle accountability / automated follow-up engine.
  - **REQ-AUTH-011** — multiple accountant-side staff accounts within one firm.
  - **REQ-AUTH-012** — staff permissions gate actions; full firm-wide visibility.
  > These are `deferred` here only in the sense of "not part of the v1 roadmap phases." They will be sliced
  > into a v2 phase set in a later planning run. (Payments was considered and **deferred entirely** per
  > requirements OQ-012 — no requirement authored, nothing to track here.)

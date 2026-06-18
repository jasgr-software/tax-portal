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
| AC placed in an epic (Phase 1 + Phase 2) | 95 |
| — Phase 1 (EPIC-001/004/002/003) | 51 |
| &nbsp;&nbsp;— EPIC-001 (public front door) | 13 |
| &nbsp;&nbsp;— EPIC-004 (auth & two-role model) | 11 |
| &nbsp;&nbsp;— EPIC-002 (services-catalog management) | 7 |
| &nbsp;&nbsp;— EPIC-003 (accountant request inbox) | 20 |
| — Phase 2 (EPIC-005/006/007/008) | 44 |
| &nbsp;&nbsp;— EPIC-005 (onboarding spine + letter gate) | 10 |
| &nbsp;&nbsp;— EPIC-006 (intake questionnaire) | 7 |
| &nbsp;&nbsp;— EPIC-007 (initial document upload) | 19 |
| &nbsp;&nbsp;— EPIC-008 (onboarding completion → In Progress) | 8 |
| AC `verified` (signed off) | **61** — all 51 Phase-1 placed AC (EPIC-001 13, 2026-06-15 · EPIC-004 11, 2026-06-16 · EPIC-002 7, 2026-06-16 · EPIC-003 20, 2026-06-17; **Phase 1 / MVP complete**) **+ EPIC-005 (10, 2026-06-18)** — the first Phase-2 onboarding-gate slice. |
| AC still `planned` (placed, not yet verified) | **34 — the remaining Phase-2 onboarding-gate set** (EPIC-006/007/008); EPIC-005's 10 now `verified` |
| AC `deferred` | the 2FA set (AC-AUTH-004-01/-02/-03 + AC-AUTH-005-01) + IDNT hard-delete (v1) + the v2 requirement set — see Deferred |
| AC orphaned (source AC not yet decomposed into any epic) | remainder of the v1 corpus — see Orphans |

> **EPIC-001 (13 AC) signed off 2026-06-15** — the public front-door slice shipped (PR #35, merge `f7f6c9d`).
> **EPIC-004 (11 AC) signed off 2026-06-16** — the auth & two-role-model identity spine shipped (PR #38,
> squash merge `0444551`); see basis note [A]. The 4 2FA AC (AC-AUTH-004-01/-02/-03 + AC-AUTH-005-01) remain
> `deferred` to the future Phase-1 "2FA enablement" slice — see Deferred.
> **EPIC-002 (7 AC) signed off 2026-06-16** — the accountant services-catalog management slice shipped (PR #40,
> squash merge `70ea10e`); see basis note [A]. All 7 in-scope AC verified: AC-DOOR-002-01/-02/-03 (add/edit/
> deactivate persist), AC-DOOR-002-05 (accountant-only write boundary — the new `sec.fn_service_write_access`
> BLOCK predicate, which **closed EPIC-001's latent write-predicate gap**, with CLIENT + anonymous rejected at
> tier-3 RLS 10/10), and AC-DASH-010-01/-02/-03 (the same capability from the admin UI, dual-tagged with the
> DOOR journeys).
> **EPIC-003 (20 AC) signed off 2026-06-17** — the accountant request inbox slice shipped (PR #42, squash
> merge `ec151cb`); see basis note [A]. All 20 in-scope AC verified: AC-DOOR-005-01/-02/-03 (new-request
> accountant notification, leads-to-request, accountant-only), AC-DOOR-006-01/-02/-03/-04/-05 (view details,
> accept, decline, only-accountant-decides, decide-exactly-once), AC-DOOR-007-01/-02/-03/-04 (invitation sent /
> directs to client sign-up / no-account-before-sign-up / tied-to-request), AC-DOOR-008-01/-02/-03/-04 (reason
> captured / emailed / no-account-needed / retained), AC-DASH-011-01/-02/-03 (inbox view-all / states / pending
> identifiable), AC-MSG-013-01 (new-service-request notification). **This completes Phase 1 (the MVP front-door
> spine): EPIC-001/004/002/003 all delivered — 51/51 placed Phase-1 AC verified.** The roll-up reaches **full
> v1 acceptance** when no v1 source AC is orphaned and every non-deferred AC is `verified` (Phases 2–4 remain).
>
> **[A] applied to the EPIC-003 sign-off (2026-06-17).** Same user-accepted CI-as-the-gate basis as
> EPIC-001/002/004. The required checks `lint-and-typecheck` ✅ + `security-scan` ✅ are green on the PR #42
> pre-merge run `27696675400` **and** the post-merge `main` run at `ec151cb` (`CI` ✅ + `Code Quality` ✅;
> `test-admin`/`test-portal` advisory, also green). Each of the 20 in-scope AC has automated test(s) tagged
> with its AC id, exercised by the SDET at dev time against the real container stack (incl. **Mailhog** —
> EPIC-003 is the first email-sending slice): tier-3 RLS (`notification.rls.test.ts` accountant-only read 4/4;
> `engagement-request.decide-boundary.rls.test.ts` CLIENT decide-write BLOCK 3/3), tier-3 persistence
> (`engagement-request.persistence.test.ts` notification-atomic), tier-2 unit (`actions.test.ts` decision/audit/
> rate-limit/invitation invariants), and tier-6 admin e2e (`request-inbox`/`request-accept`/`request-decline`
> specs — accept→invitation-email & decline→reason-email captured via the Mailhog HTTP API; 30/30, 3× zero-flake).
> The cross-epic seam AC-DOOR-007-03 ↔ EPIC-004 AC-AUTH-006-01 (account exists only after sign-up) is intact.
> The AC→test-tag→tier table is in `.implementation/tasks/HANDOFF-003.md`. The same per-PR-CI-tier follow-up
> tracked for EPIC-001 applies here.
>
> **EPIC-005 (10 AC) signed off 2026-06-18** — the client onboarding spine + engagement-letter e-sign gate
> slice shipped (PR #48, squash merge `f879da2`); see basis note [A]. **First Phase-2 slice delivered.** All 10
> in-scope AC verified: AC-ONBD-001-01/-02/-03 (the three-step onboarding sequence surfaces for a newly accepted
> client and the letter is the hard gate), AC-ONBD-002-01/-02/-03/-04 (the engagement-letter e-sign flow —
> served, signed, recorded as audit evidence, gate satisfied), and AC-IDNT-007-01/-02/-03 (the accountant-editable
> letter template). Net-new platform capabilities: the **minimal Engagement entity** (created on accept → status
> New) — the first client-owned rows — and the **first client-isolation RLS policy** (CLIENT-A ≠ CLIENT-B,
> null=ZERO, ACCOUNTANT=all, with a cross-client BLOCK write proof), plus the **mocked e-sign provider seam**
> (real Docuseal deferred per the standing mock-integration directive — same pattern as EPIC-004's mocked auth).
> **This is the first delivered Phase-2 epic; EPIC-006 (intake questionnaire) and EPIC-007 (initial document
> upload) are now unblocked** (their `depends_on: EPIC-005` is satisfied) and EPIC-008 remains the capstone.
>
> **[A] applied to the EPIC-005 sign-off (2026-06-18).** Same user-accepted CI-as-the-gate basis as
> EPIC-001/002/003/004 — the same basis the prior four epics shipped on; per-PR CI tiers do not run the full AC
> test tiers by design (the ADR-007 staging gate does not exist). The required checks `lint-and-typecheck` ✅ +
> `security-scan` ✅ are green on the PR #48 head **and** on the post-merge `main` run at `f879da2` (`CI` ✅ +
> CodeQL ✅). Each of the 10 in-scope AC has automated test(s) tagged with its AC id, validated by the
> implementation engine's SDET acceptance-validation gate under the **mandated gherkin methodology** (prose-bind,
> each scenario text ↔ test assertion confirmed), exercised at dev time against the real container stack: tier-3
> integration against the real SQL Server container (incl. the **first client-isolation RLS policy** —
> CLIENT-A≠CLIENT-B, null=ZERO, ACCOUNTANT=all + a cross-client BLOCK write proof), and e2e on the full
> docker-compose stack (portal 33/33, admin 32/32, cross-app 10/10). The same per-PR-CI-tier follow-up tracked
> for EPIC-001 applies here.
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
>
> **[A] applied to the EPIC-002 sign-off (2026-06-16).** Same user-accepted CI-as-the-gate basis as
> EPIC-001/004: the env-blocked local container smoke is substituted by clean GitHub CI. The required checks
> `lint-and-typecheck` ✅ + `security-scan` ✅ + `test-admin` ✅ + `test-portal` ✅ + CodeQL ✅ are green on the
> PR #40 head **and** on the post-merge `main` run at `70ea10e`. Each of the 7 in-scope AC has automated
> test(s) tagged with its AC id, exercised by the SDET at dev time against the real SQL Server container:
> tier-3 persistence (`service.persistence.test.ts`) for AC-DOOR-002-01/-02/-03, tier-3 RLS
> (`service.rls.test.ts`, 10/10 — CLIENT + anonymous rejected at the `sec.fn_service_write_access` BLOCK
> predicate) for AC-DOOR-002-05, and tier-6 admin e2e (`services-catalog.spec.ts`) for the DASH-010 trio plus
> the UI-surface of the DOOR journeys. **Note:** AC-DOOR-002-05's RLS gate closed EPIC-001's latent
> write-predicate gap. The same per-PR-CI-tier follow-up tracked for EPIC-001 applies here.

## Coverage by acceptance criterion

| REQ | AC | Epic | Phase | Test tag | Status | Evidence |
|---|---|---|---|---|---|---|
| REQ-DOOR-001 | AC-DOOR-001-01 | EPIC-001 | 1 | `AC-DOOR-001-01` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-001 | AC-DOOR-001-02 | EPIC-001 | 1 | `AC-DOOR-001-02` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-001 | AC-DOOR-001-03 | EPIC-001 | 1 | `AC-DOOR-001-03` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-04 | EPIC-001 | 1 | `AC-DOOR-002-04` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-01 | EPIC-002 | 1 | `AC-DOOR-002-01` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-02 | EPIC-002 | 1 | `AC-DOOR-002-02` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-03 | EPIC-002 | 1 | `AC-DOOR-002-03` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-05 | EPIC-002 | 1 | `AC-DOOR-002-05` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DOOR-003 | AC-DOOR-003-01 | EPIC-001 | 1 | `AC-DOOR-003-01` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-003 | AC-DOOR-003-02 | EPIC-001 | 1 | `AC-DOOR-003-02` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-003 | AC-DOOR-003-03 | EPIC-001 | 1 | `AC-DOOR-003-03` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-003 | AC-DOOR-003-04 | EPIC-001 | 1 | `AC-DOOR-003-04` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-01 | EPIC-001 | 1 | `AC-DOOR-004-01` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-02 | EPIC-001 | 1 | `AC-DOOR-004-02` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-03 | EPIC-001 | 1 | `AC-DOOR-004-03` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-04 | EPIC-001 | 1 | `AC-DOOR-004-04` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-05 | EPIC-001 | 1 | `AC-DOOR-004-05` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-005 | AC-DOOR-005-01 | EPIC-003 | 1 | `AC-DOOR-005-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-005 | AC-DOOR-005-02 | EPIC-003 | 1 | `AC-DOOR-005-02` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-005 | AC-DOOR-005-03 | EPIC-003 | 1 | `AC-DOOR-005-03` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-006 | AC-DOOR-006-01 | EPIC-003 | 1 | `AC-DOOR-006-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-006 | AC-DOOR-006-02 | EPIC-003 | 1 | `AC-DOOR-006-02` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-006 | AC-DOOR-006-03 | EPIC-003 | 1 | `AC-DOOR-006-03` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-006 | AC-DOOR-006-04 | EPIC-003 | 1 | `AC-DOOR-006-04` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-006 | AC-DOOR-006-05 | EPIC-003 | 1 | `AC-DOOR-006-05` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-007 | AC-DOOR-007-01 | EPIC-003 | 1 | `AC-DOOR-007-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-007 | AC-DOOR-007-02 | EPIC-003 | 1 | `AC-DOOR-007-02` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-007 | AC-DOOR-007-03 | EPIC-003 | 1 | `AC-DOOR-007-03` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-007 | AC-DOOR-007-04 | EPIC-003 | 1 | `AC-DOOR-007-04` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-008 | AC-DOOR-008-01 | EPIC-003 | 1 | `AC-DOOR-008-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-008 | AC-DOOR-008-02 | EPIC-003 | 1 | `AC-DOOR-008-02` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-008 | AC-DOOR-008-03 | EPIC-003 | 1 | `AC-DOOR-008-03` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-008 | AC-DOOR-008-04 | EPIC-003 | 1 | `AC-DOOR-008-04` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DASH-010 | AC-DASH-010-01 | EPIC-002 | 1 | `AC-DASH-010-01` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DASH-010 | AC-DASH-010-02 | EPIC-002 | 1 | `AC-DASH-010-02` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DASH-010 | AC-DASH-010-03 | EPIC-002 | 1 | `AC-DASH-010-03` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DASH-011 | AC-DASH-011-01 | EPIC-003 | 1 | `AC-DASH-011-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DASH-011 | AC-DASH-011-02 | EPIC-003 | 1 | `AC-DASH-011-02` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DASH-011 | AC-DASH-011-03 | EPIC-003 | 1 | `AC-DASH-011-03` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
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
| REQ-MSG-013 | AC-MSG-013-01 | EPIC-003 | 1 | `AC-MSG-013-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-ONBD-001 | AC-ONBD-001-01 | EPIC-005 | 2 | `AC-ONBD-001-01` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-001 | AC-ONBD-001-02 | EPIC-005 | 2 | `AC-ONBD-001-02` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-001 | AC-ONBD-001-03 | EPIC-005 | 2 | `AC-ONBD-001-03` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-002 | AC-ONBD-002-01 | EPIC-005 | 2 | `AC-ONBD-002-01` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-002 | AC-ONBD-002-02 | EPIC-005 | 2 | `AC-ONBD-002-02` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-002 | AC-ONBD-002-03 | EPIC-005 | 2 | `AC-ONBD-002-03` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-002 | AC-ONBD-002-04 | EPIC-005 | 2 | `AC-ONBD-002-04` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-IDNT-007 | AC-IDNT-007-01 | EPIC-005 | 2 | `AC-IDNT-007-01` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-IDNT-007 | AC-IDNT-007-02 | EPIC-005 | 2 | `AC-IDNT-007-02` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-IDNT-007 | AC-IDNT-007-03 | EPIC-005 | 2 | `AC-IDNT-007-03` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-003 | AC-ONBD-003-01 | EPIC-006 | 2 | `AC-ONBD-003-01` | planned | — |
| REQ-ONBD-003 | AC-ONBD-003-02 | EPIC-006 | 2 | `AC-ONBD-003-02` | planned | — |
| REQ-ONBD-003 | AC-ONBD-003-03 | EPIC-006 | 2 | `AC-ONBD-003-03` | planned | — |
| REQ-ONBD-003 | AC-ONBD-003-04 | EPIC-006 | 2 | `AC-ONBD-003-04` | planned | — |
| REQ-DASH-012 | AC-DASH-012-01 | EPIC-006 | 2 | `AC-DASH-012-01` | planned | — |
| REQ-DASH-012 | AC-DASH-012-02 | EPIC-006 | 2 | `AC-DASH-012-02` | planned | — |
| REQ-DASH-012 | AC-DASH-012-03 | EPIC-006 | 2 | `AC-DASH-012-03` | planned | — |
| REQ-ONBD-004 | AC-ONBD-004-01 | EPIC-007 | 2 | `AC-ONBD-004-01` | planned | — |
| REQ-ONBD-004 | AC-ONBD-004-02 | EPIC-007 | 2 | `AC-ONBD-004-02` | planned | — |
| REQ-ONBD-004 | AC-ONBD-004-03 | EPIC-007 | 2 | `AC-ONBD-004-03` | planned | — |
| REQ-ONBD-004 | AC-ONBD-004-04 | EPIC-007 | 2 | `AC-ONBD-004-04` | planned | — |
| REQ-FILE-007 | AC-FILE-007-01 | EPIC-007 | 2 | `AC-FILE-007-01` | planned | — |
| REQ-FILE-007 | AC-FILE-007-02 | EPIC-007 | 2 | `AC-FILE-007-02` | planned | — |
| REQ-FILE-007 | AC-FILE-007-03 | EPIC-007 | 2 | `AC-FILE-007-03` | planned | — |
| REQ-FILE-008 | AC-FILE-008-01 | EPIC-007 | 2 | `AC-FILE-008-01` | planned | — |
| REQ-FILE-008 | AC-FILE-008-02 | EPIC-007 | 2 | `AC-FILE-008-02` | planned | — |
| REQ-FILE-008 | AC-FILE-008-03 | EPIC-007 | 2 | `AC-FILE-008-03` | planned | — |
| REQ-FILE-001 | AC-FILE-001-02 | EPIC-007 | 2 | `AC-FILE-001-02` | planned | — |
| REQ-FILE-001 | AC-FILE-001-05 | EPIC-007 | 2 | `AC-FILE-001-05` | planned | — |
| REQ-FILE-002 | AC-FILE-002-01 | EPIC-007 | 2 | `AC-FILE-002-01` | planned | — |
| REQ-FILE-003 | AC-FILE-003-01 | EPIC-007 | 2 | `AC-FILE-003-01` | planned | — |
| REQ-FILE-003 | AC-FILE-003-02 | EPIC-007 | 2 | `AC-FILE-003-02` | planned | — |
| REQ-FILE-003 | AC-FILE-003-03 | EPIC-007 | 2 | `AC-FILE-003-03` | planned | — |
| REQ-FILE-003 | AC-FILE-003-04 | EPIC-007 | 2 | `AC-FILE-003-04` | planned | — |
| REQ-NFR-009 | AC-NFR-009-01 | EPIC-007 | 2 | `AC-NFR-009-01` | planned | — |
| REQ-NFR-009 | AC-NFR-009-02 | EPIC-007 | 2 | `AC-NFR-009-02` | planned | — |
| REQ-ONBD-005 | AC-ONBD-005-01 | EPIC-008 | 2 | `AC-ONBD-005-01` | planned | — |
| REQ-ONBD-005 | AC-ONBD-005-02 | EPIC-008 | 2 | `AC-ONBD-005-02` | planned | — |
| REQ-ONBD-006 | AC-ONBD-006-01 | EPIC-008 | 2 | `AC-ONBD-006-01` | planned | — |
| REQ-ONBD-006 | AC-ONBD-006-02 | EPIC-008 | 2 | `AC-ONBD-006-02` | planned | — |
| REQ-ONBD-006 | AC-ONBD-006-03 | EPIC-008 | 2 | `AC-ONBD-006-03` | planned | — |
| REQ-ONBD-007 | AC-ONBD-007-01 | EPIC-008 | 2 | `AC-ONBD-007-01` | planned | — |
| REQ-ONBD-007 | AC-ONBD-007-02 | EPIC-008 | 2 | `AC-ONBD-007-02` | planned | — |
| REQ-MSG-013 | AC-MSG-013-04 | EPIC-008 | 2 | `AC-MSG-013-04` | planned | — |

## Split requirements

Requirements whose AC span more than one epic (or one epic + orphans/deferred) — the fan-out, at a glance.

- **REQ-DOOR-002 (services catalog)** — split across two epics:
  - **EPIC-001** owns **AC-DOOR-002-04** (a deactivated service does not appear on the public services page
    or request form) — testable from the public front door.
  - **EPIC-002** owns **AC-DOOR-002-01, -02, -03, -05** (accountant add/edit/deactivate + "only the
    accountant may change the catalog") — these need the authenticated accountant admin surface.
- **REQ-MSG-013 (accountant notification types)** — split across two phases plus a Phase-4 remainder:
  - **EPIC-003** (Phase 1) owns **AC-MSG-013-01** (new service-request notification).
  - **EPIC-008** (Phase 2) owns **AC-MSG-013-04** (onboarding completed) — the ONBD-007 notification is the
    MSG-013-04 event; pulled forward from Phase 4 because onboarding completion is built in Phase 2 (same
    pattern as EPIC-003 owning -01).
  - **AC-MSG-013-02/-03/-05/-06** (new message, document uploaded, document-request overdue, due-date
    approaching) → **Orphans**, targeted at **Phase 4** (the notification feed), since those source events
    are not built until later phases.
- **REQ-FILE-001 (file exchange within an engagement)** — split between Phase 2 (onboarding upload) and
  Phase 3 (full exchange):
  - **EPIC-007** (Phase 2) owns **AC-FILE-001-02** (client uploads to their engagement) and
    **AC-FILE-001-05** (engagement isolation) — the client-upload path the onboarding document step needs.
  - **AC-FILE-001-01** (accountant upload) and **AC-FILE-001-03/-04** (both-party download) → **Orphans**,
    targeted at **Phase 3** (the file-exchange epic) — accountant upload and download are the broader
    exchange surface, not onboarding's "client provides documents" step.

## Orphans

Source AC not yet decomposed into any epic. This is the v1 work remaining — each becomes `planned` when a
Planning Agent run places it in an epic. (v2 AC are tracked separately under Deferred, not here.)

**MVP-adjacent (deferred for lack of an MVP home — reconciled this run, with target phase):**
- **REQ-DOOR-009** (returning client requests from inside the portal) — AC-DOOR-009-01..04 → **Phase 3**.
  *(Now newly buildable: Phase 2 introduces an authenticated client portal home. Kept Phase 3 because it is
  a distinct feature, not part of the onboarding gate — to be placed when Phase 3 is decomposed.)*
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
see `ROADMAP.md` Phases 3–4):
- **ONBD** — ✅ **fully placed in Phase 2** (EPIC-005/006/007/008): REQ-ONBD-001..007. No ONBD orphans
  remain. *(REQ-ONBD-008 is v2 → Deferred.)*
- **LIFE** (Phase 3) — REQ-LIFE-001..012 (v1). The *minimal* Engagement substrate (New / In Progress) is
  introduced in Phase 2, but no LIFE AC are claimed there — the full pipeline AC are Phase 3.
  *(REQ-LIFE-013/014 are v2 → Deferred.)*
- **FILE** (Phase 3) — REQ-FILE-004/005/006/009..015 (v1), plus the **REQ-FILE-001 remainder**
  (AC-FILE-001-01/-03/-04 — see Split requirements). **Placed in Phase 2 (EPIC-007):** FILE-002, FILE-003,
  FILE-007, FILE-008 in full, and the FILE-001 client-upload/isolation subset. *(REQ-FILE-016 is v2 →
  Deferred.)*
- **MSG** (Phase 4) — REQ-MSG-001..012, -015..018 (v1), plus the MSG-013 remainder (**-02/-03/-05/-06** —
  -01 in EPIC-003, **-04 in EPIC-008**) and the MSG-014 remainder above. *(REQ-MSG-019 is v2 → Deferred.)*
- **DASH** (Phase 4) — REQ-DASH-001..009, -013 (DASH-010 in EPIC-002, DASH-011 in EPIC-003, **DASH-012 in
  EPIC-006**).
- **IDNT** (Phase 4) — REQ-IDNT-001..004, -006 (**IDNT-007 in EPIC-005**; IDNT-005 → Deferred).
- **NFR** (cross-cutting) — REQ-NFR-001..008, -010, -011 mapped onto the epic(s) whose slice must
  demonstrate each (e.g. RLS isolation on the first client-scoped read slice; malware scanning on the first
  upload slice). **AC-NFR-009 (malware scan) placed in Phase 2 (EPIC-007)** — the first upload slice. The
  rest are attached to epics as those slices are authored.

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

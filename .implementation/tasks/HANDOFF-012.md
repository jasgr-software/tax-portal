# HANDOFF-012 — BRIEF-012 / EPIC-012 (Engagement creation paths & multi-participant engagements)

**Slice:** the **third Phase-3 slice** — opens **how engagements come into being** beyond the Phase-1 anonymous
front door, and adds the **multi-participant** model. A signed-in **returning client** requests a new engagement
from inside the Client Portal; the **accountant initiates** one directly for an existing client (no
accept/decline); a **duplicate guard** per (client, service type, tax year) warns + shows the existing
engagement + offers navigate-or-override; a client may hold **multiple concurrent** engagements; and an
engagement may have **more than one participant**, each their own account, sharing one engagement. Introduces
the engagement **tax-year** attribute. **Reuses, does not fork:** the `EngagementRequest` + `withAuditTransaction`
machinery (both creation paths ride it — DECISION-A), the `packages/db` request-scoped wrapper (ADR-003), the
client-isolation RLS pattern from `pol_Engagement`/EPIC-010 (extended additively), and the mock auth seam
(ADR-023).

**Branch:** `brief-012-engagement-creation-participants` → **PR (pending — `state.json` `awaitingMerge`).**
**Brief-type:** feature · **Brief-deploys:** no (gate 9 staging smoke N/A).
**Scope:** application code only (`prisma/schema`, `db/policies` + `db/migrations`, `packages/db`, `apps/admin`,
`apps/portal`, `apps/*/e2e`, `docs/demos`, `scripts/e2e-cross-app.sh`) — **no engine/role/workflow files** →
**reviewed lane** (MERGE-POLICY Lane B); **no workflow-file LGTM gate** applies.

## AC satisfied (20/20) + validation basis

All 20 in-scope AC validated by the SDET acceptance-validation gate (APPROVE), each mapped to an AC-id-tagged
test at its prescribed ADR-012 tier. Gherkin acceptance format: the 20 epic scenarios
(`.planning/EPIC-012-engagement-creation-participants.md` § Acceptance scenarios) are the behavior contract,
bound to executable Playwright/integration steps + `.feature` files (Cucumber tooling not yet landed — bound in
prose per CLAUDE.md § Executable gherkin tooling; the portal participant-access scenarios are embedded verbatim
in the spec header).

### REQ-DOOR-009 — returning client requests from inside the portal
| AC | Tier | Validating test |
|---|---|---|
| AC-DOOR-009-01 | tier-6 e2e | `apps/portal/e2e/specs/returning-client-request.spec.ts` (navigates to `/engagements/new`; unauth redirected) |
| AC-DOOR-009-02 | tier-6 e2e | same (active-services checklist; zero-service blocked) |
| AC-DOOR-009-03 | tier-3 + tier-6 | `packages/db/src/engagement-creation.test.ts` (contact reused from on-file, not args); portal spec (no contact fields) |
| AC-DOOR-009-04 | tier-6 e2e (cross-app) | portal spec Step 5 — request surfaces in the admin inbox like a front-door request |

### REQ-DOOR-010 — accountant initiates an engagement
| AC | Tier | Validating test |
|---|---|---|
| AC-DOOR-010-01/-02 | tier-6 e2e | `apps/admin/e2e/specs/accountant-initiated-engagement.spec.ts` (initiate for existing client; select services) |
| AC-DOOR-010-03 | tier-3 (`-dl`) + tier-6 | `engagement-creation.test.ts` (request pre-`accepted`, no accept/decline); admin spec |
| AC-DOOR-010-04 | tier-3 + tier-6 | `engagement-creation.test.ts` (`clientUserId` set + participant link); admin spec |

### REQ-LIFE-010 — multiple concurrent engagements
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-010-01 | tier-3 + tier-6 | `engagement-creation.test.ts` (second engagement persists); admin spec (second concurrent for a different service) |
| AC-LIFE-010-02 | **HARD tier-3 RLS** | `packages/db/src/engagement-participant.client-isolation.rls.test.ts` (concurrent engagement isolated; owner sees both) |

### REQ-LIFE-011 — one per (client, service, tax year): warn + override
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-011-01 | tier-3 + tier-6 | `engagement-creation.test.ts` (`findDuplicateEngagements` match + negatives); admin spec (different tax year ≠ duplicate) |
| AC-LIFE-011-02 | tier-3 + tier-6 | `engagement-creation.test.ts`; admin spec (warning + existing shown, no creation yet) |
| AC-LIFE-011-03 | tier-3 (`-dl`) + tier-6 | `engagement-creation.test.ts` (override creates); admin spec (navigate path AND override-creates-second) |
| AC-LIFE-011-04 | tier-6 e2e | admin spec (never silent — warn payload on first submit; cancel returns to form, no creation) |

### REQ-LIFE-012 / REQ-AUTH-007 — multiple participants, separate accounts
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-012-01 | tier-3 + tier-3 RLS | `engagement-creation.test.ts` (`addEngagementParticipant`); RLS test (engagement links >1 participant) |
| AC-LIFE-012-02 | tier-6 e2e (both surfaces) | `apps/admin/e2e/specs/engagement-participants.spec.ts`; `apps/portal/e2e/specs/participant-shared-access.spec.ts` (distinct accounts, no shared login) |
| AC-LIFE-012-03 | tier-3 RLS + tier-6 (both) | RLS test (all associate to same engagement); admin + portal specs |
| AC-AUTH-007-01 | tier-3 RLS + tier-6 | RLS test (two participants both reach the one engagement); admin spec (invite second) |
| AC-AUTH-007-02 | tier-6 e2e (both) | admin + portal specs (own distinct account/credentials, never shared) |
| AC-AUTH-007-03 | **HARD tier-3 RLS (both ways)** + tier-6 | `engagement-participant.client-isolation.rls.test.ts` (participant reads shared engagement; **unrelated client sees ZERO**; null fail-closed; ACCOUNTANT all; owner no-regression); portal spec (participant reaches engagement; unrelated client → 404) |

## Gate evidence (the four slice gates — all PASS)

- **Container smoke (gate 5): PASS** — Docker pre-flight clean; portal `:3000` + admin `:13001` healthy + load;
  SQL Server + Azurite healthy; all 19 BRIEF-012 e2e (6 portal returning-client + 3 portal participant + 7 admin
  initiated + 3 admin participants) green against the container stack.
- **SDET acceptance-validation (gate 6): APPROVE** — all 20 AC independently verified with AC-id-tagged passing
  tests at the prescribed tiers; the participant isolation proven **both ways** (HARD tier-3 RLS — linked
  participant reaches the shared engagement, unrelated client + null + owner-no-regression) **and** the tier-6
  surface negative (unrelated client → 404). All 4 brief `extra_gates` proven (RLS both-ways, concurrent
  independence, cross-app request→inbox, duplicate warn/navigate/override-never-silent).
- **SDET CI gate (gate 7): PASS** — `pnpm lint` + `pnpm type-check` + `pnpm build` clean; `pnpm --filter @tax-portal/db test`
  the 17 creation-integration + 15 participant-RLS tests green; `pnpm --filter portal test` 231/231; `pnpm --filter admin test` 348/348.
- **SDET quality audit: PASS (2 advisory)** — scope discipline (no creep beyond the 20 AC + non-gating demo; no
  onboarding/file-upload/real-Clerk wiring; no Engagement fork); AC-id tag contract honored; demo gallery
  `docs/demos/EPIC-012/` (12 AC-tagged PNGs + DEMO.md). Advisory: DECISION-E multi-hop contact resolution
  (tested); `parseSqlServerUrl` helper duplicated across e2e specs (cosmetic).

**Pre-existing (non-regression) failures — confirmed NOT in the BRIEF-012 changeset:** `@tax-portal/db`
2 (`document.upload-pipeline.rls.test.ts`, EPIC-013/file territory); admin 11 (request-accept/decline Mailhog
`ECONNREFUSED 18025`, sign-in-lane EPIC-009 port-remap) + portal 9 (document-upload BUG-008-001, onboarding
EPIC-008, sign-in-lane EPIC-009) at e2e-suite level — all infra-constrained, none in BRIEF-012 scope.

## What was built (the integrated change)

- **`prisma/schema.prisma`** — additively (CS-GEN-002): `Engagement.taxYear Int?` (DECISION-B); new
  **`EngagementParticipant`** model (`engagementId` FK, `userId` FK, `role` default `CLIENT`, `createdAt`;
  `@@unique([engagementId, userId])`) + reverse relations.
- **`prisma/migrations/20260623161354_engagement-participant-and-tax-year/migration.sql`** — Track A (handcrafted
  per the project P3019 workaround, consistent with EPIC-010/011).
- **`db/policies/0005-engagement-policy.sql`** — Track B: the CLIENT branch of `sec.fn_engagement_access`
  **extended** owner→(owner OR participant-link) — owner branch byte-identical (AC-AUTH-003 no-regression);
  participant EXISTS scoped to `@engagementId` (no cross-engagement widening); drop-policy-before-alter handled
  idempotently (DECISION-D, CS-SQL-003).
- **`db/policies/0009-engagement-participant-policy.sql`** + **`db/migrations/0005-engagement-participant-rls.sql`** —
  new scoped-table policy `sec.pol_EngagementParticipant` (a participant reads only their own link rows;
  ACCOUNTANT/admin all; fail-closed) — the CS-SQL-001 policy-per-scoped-table requirement.
- **`packages/db/src/repositories/engagement-creation.ts`** — four seams: `createReturningClientRequest`
  (reuses on-file contact via the User→Engagement→EngagementRequest JOIN — DECISION-E),
  `createAccountantInitiatedEngagement` (pre-accepted request + engagement + primary participant link, one audit
  tx — DECISION-A), `findDuplicateEngagements` (query, not a constraint — DECISION-C), `addEngagementParticipant`
  (idempotent link + audit). Audit rows carry ids + action only (CS-GEN-001).
- **`packages/db/src/repositories/engagement.ts`** + **`index.ts`** — `taxYear` threaded through read types; barrel exports.
- **`apps/portal/src/app/engagements/new/`** — returning-client request UI + server action (CLIENT identity guard
  CS-TS-004; rate-limited ADR-022; no contact fields).
- **`apps/admin/src/app/engagements/new/`** — accountant-initiate UI + action + `DuplicateWarning` (warn→navigate/
  override state machine; ACCOUNTANT guard).
- **`apps/admin/src/app/engagements/[engagementId]/participants/`** — invite UI + action (mock-seam own-account
  invite ADR-023/ADR-001 → `addEngagementParticipant`).
- **`apps/portal/.../engagements/[engagementId]/page.tsx`** — participant access via the participant-aware RLS
  branch (comment-documented; no app-layer filtering — the RLS FILTER carries it).
- **Tests:** `engagement-participant.client-isolation.rls.test.ts` (15, HARD tier-3 RLS),
  `engagement-creation.test.ts` (17, tier-3 integration), 4 e2e specs (returning-client, accountant-initiated,
  engagement-participants, participant-shared-access) + `.feature` files, 2 `@demo` specs.
- **`docs/demos/EPIC-012/`** — non-gating `@demo` AC-tagged gallery (12 PNGs + DEMO.md).

## Design decisions recorded (cross-task implications)

- **DECISION-A** — both creation paths reuse the `EngagementRequest` envelope (returning-client → `pending`;
  accountant-initiated → pre-`accepted` + engagement in one audit tx). Keeps `engagementRequestId` non-null.
- **DECISION-B** — `taxYear` is a nullable `Int` on `Engagement`, set at creation; existing engagements remain null.
- **DECISION-C** — the duplicate guard is an application-level query (`findDuplicateEngagements`), **not** a unique
  DB constraint — the sanctioned override (AC-LIFE-011-03) must be able to create the second engagement.
- **DECISION-D** — the engagement RLS CLIENT branch is **extended** to owner-OR-participant; the primary
  `clientUserId` stays as the back-compat owner path; a new `EngagementParticipant` scoped table + policy carries
  participant access. Owner branch byte-identical (AC-AUTH-003 preserved).
- **DECISION-E** — the `User` model has no name fields (minimal deferred-auth design); `createReturningClientRequest`
  resolves on-file contact by JOINing through the client's prior engagement's originating request. **Raised to
  `OPEN-QUESTIONS.md`** as a tracked question (multi-hop contact-resolution dependency) — see below.

## Raised upstream

- **OQ-012-01** (`.implementation/OPEN-QUESTIONS.md`, `raised-upstream`) — DECISION-E's contact resolution depends
  on every client having a prior `EngagementRequest` carrying contact fields. Reasonable for the PoC (a "returning"
  client by definition has prior history), but a durable design (a user-profile contact attribute decoupled from
  engagement history) is a product/architecture call for Phase 5 (real Clerk profile attributes). Not slice-blocking.

## For the upstream producer (Conductor → `/planning` Validate write-back)

- **EPIC-012: all 20 AC satisfied** (AC-DOOR-009-01..04, AC-DOOR-010-01..04, AC-LIFE-010-01/-02,
  AC-LIFE-011-01..04, AC-LIFE-012-01..03, AC-AUTH-007-01..03) — ready for `COVERAGE.md` sign-off once the PR merges.
- **Out-of-scope deferrals (correctly NOT built, per the brief):** the anonymous front-door path (Phase 1);
  real Clerk invitations (Phase 5); per-participant differentiated permissions (v1 scope note); onboarding of the
  created engagement (Phase 2 epics); the status lifecycle/attributes (EPIC-010/011, delivered).
- **EPIC-012 does not close Phase 3** (EPIC-013/014/015 remain `planned`; EPIC-013 depends on this slice's
  tax-year attribute) — **no `phase_walkthrough` / `@video` obligation** on this slice.
- **No infra/CI-authority change** — required checks unchanged; no docker-compose/env wiring change, so the DevOps
  inventory/runbook update (CS-INFRA-001) was not triggered (correct).

## Follow-ups carried (not slice-blocking)

- **OQ-012-01** (DECISION-E multi-hop contact resolution) — raised upstream; revisit at Phase-5 real-auth wiring.
- **`parseSqlServerUrl` duplication** across the 4 BRIEF-012 e2e specs — candidate for an `e2e/utils/` extraction
  on the next e2e-touching task (advisory, RETRO-012).
- **BUG-008-001** (Azurite SAS-URL e2e upload defect) — unrelated (no uploads here); remains open.
- Open `state.json` retro items (`retro-012-*`, `retro-013-*`) carried unchanged — none newly triggered.

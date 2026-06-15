# HANDOFF-001 — BRIEF-001 completion / handoff report

> For the upstream producer (Conductor → `.planning/` COVERAGE write-back). States which acceptance criteria
> were satisfied, under which methodology, with which evidence. The AC→test-tag→tier table in `RETRO-001.md`
> is the machine-readable companion the planning validate phase flips `COVERAGE.md` rows from.

## Slice

- **Brief:** BRIEF-001 — Public front door (anonymous browse active services + submit engagement request).
- **Epic source:** `.planning/EPIC-001-public-front-door.md`.
- **Branch:** `brief-001-public-front-door`. **Deploys:** no (ADR-007).
- **Methodology honored:** `acceptance_format: gherkin` (13 scenarios mirrored in
  `apps/portal/e2e/features/public-front-door.feature`, bound to AC-id-tagged Playwright specs); `e2e: required`
  (green vs docker-compose containers); `tdd: optional`; `coverage_target: none`; extra gates — tier-3
  accountant-only-read RLS (ADR-005, hard) + container smoke (both PASS).

## Acceptance criteria — all 13 SATISFIED

| AC | Verdict | Tier evidence |
| -- | ------- | ------------- |
| AC-DOOR-001-01 | SATISFIED | e2e tier-6 |
| AC-DOOR-001-02 | SATISFIED | e2e tier-6 + svc-int tier-3 |
| AC-DOOR-001-03 | SATISFIED | e2e tier-6 |
| AC-DOOR-002-04 | SATISFIED | svc-int tier-3 + component + e2e tier-6 |
| AC-DOOR-003-01 | SATISFIED | e2e tier-6 + component |
| AC-DOOR-003-02 | SATISFIED | e2e tier-6 + component |
| AC-DOOR-003-03 | SATISFIED | e2e tier-6 + component |
| AC-DOOR-003-04 | SATISFIED | e2e tier-6 + svc-int tier-3 |
| AC-DOOR-004-01 | SATISFIED | e2e tier-6 + component |
| AC-DOOR-004-02 | SATISFIED | e2e tier-6 + component |
| AC-DOOR-004-03 | SATISFIED | svc-int tier-3 + e2e tier-6 |
| AC-DOOR-004-04 | SATISFIED | svc-int tier-3 + gherkin mirror |
| AC-DOOR-004-05 | SATISFIED | e2e tier-6 + component |

Full per-AC test-tag mapping: `RETRO-001.md` § AC → test-tag → tier traceability.

## Implementation-level decisions (slice-local, recorded — not architectural)

- **Lazy memoized Prisma client factories behind `Proxy`** (`packages/db/src/client.ts`, TASK-006) — importing
  the barrel constructs no `PrismaClient`; removes the eager-construction landmine. A construction-timing
  wrapper, not a second client → ADR-004 (Prisma sole ORM) holds.
- **Container-internal vs host-side DB-URL split** (`docker-compose.yml` `PORTAL_DATABASE_URL*` →
  `sqlserver:1433` vs host `DATABASE_URL*` → `localhost:14330`) — the portal container resolves the compose
  service name; host tooling uses the published port.
- **Single sanctioned identity-less write** — anonymous engagement-request submission goes through
  `createEngagementRequest` (admin pool, insert-only, returns `{id,status}`, no read-back), per ADR-003/-005.
  Documented in code; no `SESSION_CONTEXT` identity on this path.
- **Contact field set** — `firstName`/`lastName`/`email` (routine product detail per brief).

## Raised upstream

None. The brief's architecture flag (sanctioned anonymous write) was **resolved within cited ADRs** (ADR-003
§1/§6 + ADR-005 §Tables-in-scope already document the admin-pool insert-only anonymous path) — no upstream
raise was needed. No `OPEN-QUESTIONS.md` entry created.

## Follow-ups for downstream epics (carried, not blocking)

- **EPIC-004:** add a regression test for the `client.ts` `$extends` SESSION_CONTEXT wrapper (Prisma 5.22
  workaround left it unexercised by the RLS test).
- **EPIC-002:** accountant catalog CRUD extends `service`; the active/inactive state is already modeled and
  consumed read-only here.
- **EPIC-003:** request inbox / accept-decline extends `engagement_request` and the pending-state model.
- **Gated-path candidate:** extend the ESLint import boundary to also restrict `adminDb`.
- **Infra:** revisit the Track-A Prisma 5.22 sqlcmd-bootstrap workaround when Prisma resolves the non-default-port limitation.

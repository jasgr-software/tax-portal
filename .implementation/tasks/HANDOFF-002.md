# HANDOFF-002 — BRIEF-002 completion / handoff report

> For the upstream producer (Conductor → `.planning/` COVERAGE write-back). States which acceptance criteria
> were satisfied, under which methodology, with which evidence. The AC→test-tag→tier table below is the
> machine-readable companion the planning validate phase flips `COVERAGE.md` rows from. `RETRO-002.md` carries
> the 9-gate scorecard and the retro classification.

## Slice

- **Brief:** BRIEF-002 — Accountant manages the services catalog: admin CRUD (add / edit / deactivate) +
  accountant-only write boundary. Closes the *authoring* loop behind EPIC-001's public *read* catalog.
- **Epic source:** `.planning/EPIC-002-services-catalog-management.md`; requirements `REQ-DOOR-002` +
  `REQ-DASH-010`; architecture ADR-002/-003/-004/-005/-006/-012.
- **Branch:** `brief-002-services-catalog-management` (cut from `main`@`c87b5bd`; 9 commits
  `c500053`→`b87cd95`). **PR:** opened by the main session at Close-prep (title+body in PROGRESS.md handoff).
  **Deploys:** no (ADR-007 — production platform deferred; gate 9 N/A).
- **Methodology honored:** `acceptance_format: gherkin` (7 scenarios mirrored verbatim in
  `apps/admin/e2e/features/services-catalog.feature`, each tagged with its AC id, bound prose-to-spec until the
  Cucumber binder lands per CLAUDE.md); `e2e: required` (green vs the docker-compose stack against the mocked
  auth provider — real middleware/route/role-gate/request-scoped DB path exercised end-to-end); `tdd: optional`;
  `coverage_target: none`. Extra gates: **accountant-only write boundary** (ADR-005) tier-3 RLS HARD gate;
  **persistence integration** (ADR-002/-004) tier-3; **cross-surface authoring→public-door loop**
  (AC-DOOR-002-03 paired with EPIC-001's AC-DOOR-002-04); **SESSION_CONTEXT propagation on the admin write
  path** (ADR-003 request-scoped `$extends` wrapper); container smoke before Validate. Single-surface scope
  (`apps/admin`) is the documented ADR-006 exception — catalog management is admin-only; the only `apps/portal`
  changes are the BUG-002-002 Prisma-engine Dockerfile/next.config parity (no new portal route or write path).

## Acceptance criteria — all 7 in-scope SATISFIED

| AC | Verdict | Tier evidence |
| -- | ------- | ------------- |
| AC-DOOR-002-01 (accountant adds a service) | SATISFIED | tier-3 persistence + tier-6 e2e |
| AC-DOOR-002-02 (accountant edits a service) | SATISFIED | tier-3 persistence + tier-6 e2e |
| AC-DOOR-002-03 (accountant deactivates a service) | SATISFIED | tier-3 persistence + tier-6 e2e + cross-surface loop |
| AC-DOOR-002-05 (only the accountant may change the catalog) | SATISFIED | tier-3 RLS write boundary (10/10) + tier-6 UI surface |
| AC-DASH-010-01 (add from admin UI) | SATISFIED | tier-6 e2e (dual-tagged with AC-DOOR-002-01) |
| AC-DASH-010-02 (edit from admin UI) | SATISFIED | tier-6 e2e (dual-tagged with AC-DOOR-002-02) |
| AC-DASH-010-03 (deactivate from admin UI) | SATISFIED | tier-6 e2e (dual-tagged with AC-DOOR-002-03) |

**AC-DOOR-002-04 — NOT a BRIEF-002 row.** It is owned by EPIC-001 (the public services page / request form
hides deactivated services). BRIEF-002 verifies it **only as a cross-surface loop**: a service the accountant
deactivates in `apps/admin` no longer appears as a selectable option on the `apps/portal` public page. The loop
test is tagged `[AC-DOOR-002-03]` (the deactivate AC under test here), **not** `[AC-DOOR-002-04]` — the team
does not claim sign-off on an AC it does not own. The loop result is **evidence** that AC-DOOR-002-03's
deactivation propagates to the front door; the planning layer decides whether to flip AC-DOOR-002-04.

## AC → test-tag → tier → owning-task → evidence (COVERAGE write-back source)

> Reproduced from the SDET Validate gate-6 report. This is the table the Conductor's `/planning` validate phase
> flips `COVERAGE.md` rows from. Every in-scope AC id appears in a test title at both the tier-3 and the tier-6
> level where applicable; dual-tagging (DOOR + DASH on a journey that evidences both) is consistent.

| AC | Test tag | Tier | Owning task | Evidence file / result |
| -- | -------- | ---- | ----------- | ---------------------- |
| AC-DOOR-002-05 | `[AC-DOOR-002-05]` | tier-3 write boundary | TASK-002-001 | `packages/db/src/service.rls.test.ts` 10/10 — CLIENT INSERT/UPDATE/DELETE each rejected by `fn_service_write_access` block predicate (error 33504); null-SESSION_CONTEXT INSERT rejected; ACCOUNTANT INSERT/UPDATE/DELETE succeed; admin pool RLS-exempt. Counterfactual inline (adding `OR role='CLIENT'` reds the 3 CLIENT-negative tests). `Introduces-gate: yes` — three-item gate-authoring evidence in the task Work Log. |
| AC-DOOR-002-01 | `[AC-DOOR-002-01]` | tier-3 persistence | TASK-002-002 | `packages/db/src/service.persistence.test.ts` 4/4 — createService writes a new active row, re-readable via admin pool. |
| AC-DOOR-002-02 | `[AC-DOOR-002-02]` | tier-3 persistence | TASK-002-002 | same file — updateService name/description change survives re-read. |
| AC-DOOR-002-03 | `[AC-DOOR-002-03]` | tier-3 persistence | TASK-002-002 | same file — deactivateService sets active=false (NOT DELETE — REQ-DOOR-002 reversible); listAllServices returns active+inactive. |
| AC-DOOR-002-01 + AC-DASH-010-01 | `[AC-DOOR-002-01][AC-DASH-010-01]` | tier-6 e2e | TASK-002-004 | `apps/admin/e2e/specs/services-catalog.spec.ts` test 13 — add journey, new row visible Active. |
| AC-DOOR-002-02 + AC-DASH-010-02 | `[AC-DOOR-002-02][AC-DASH-010-02]` | tier-6 e2e | TASK-002-004 | same file test 14 — edit journey, updated row visible. |
| AC-DOOR-002-03 + AC-DASH-010-03 | `[AC-DOOR-002-03][AC-DASH-010-03]` | tier-6 e2e | TASK-002-004 | same file test 15 — deactivate journey, inactive badge visible. |
| AC-DOOR-002-05 (UI surface) | `[AC-DOOR-002-05]` | tier-6 e2e | TASK-002-004 | same file tests 16–17 — CLIENT redirected; anonymous redirected to sign-in (the write path exists only on the authenticated admin surface). |
| AC-DOOR-002-03 (cross-surface loop) | `[AC-DOOR-002-03]` | tier-6 e2e | TASK-002-004 | `apps/admin/e2e/specs/services-catalog-cross-surface.spec.ts` test 12 — a service deactivated in admin is absent from the portal public page. **Tagged AC-DOOR-002-03, NOT AC-DOOR-002-04** (loop evidence, not an EPIC-001 sign-off). |

**Tier totals (re-executed by SDET against the running stack):** tier-3 16/16 (RLS 10 + persistence 4 +
pooled-reuse 2); tier-6 admin e2e 17/17 (3 sequential runs in TASK-002-004, zero flakes). Gherkin `.feature`
mirror present, 7 scenarios, no drift.

## Bugs fixed (3 + 1) — all ride BRIEF-002's PR

EPIC-002 is the **first slice to run the request-scoped Prisma path in a real container**, and its first real
container e2e surfaced a chain of 4 latent EPIC-001/004 defects, all previously hidden by the env-blocked
container smoke in EPIC-001/004. Full root-cause analysis in `RETRO-002.md`.

1. **BUG-002-001** — auth fail-closed guard blocked the mock provider in any prod-built container. Fix: gate
   `getSecret()` on `ALLOW_MOCK_AUTH=true`, not `NODE_ENV`. SDET APPROVED; `@tax-portal/auth` 124/124. Commit
   `fc32fdd`.
2. **BUG-002-002** — Prisma query-engine binary target missing for the Alpine/OpenSSL-3 runner. Three-layer fix
   (`binaryTargets = ["native","linux-musl-openssl-3.0.x"]` + `outputFileTracingIncludes` +
   `PRISMA_QUERY_ENGINE_LIBRARY` override, both Dockerfiles). SDET APPROVED; in-container `/services` 200,
   logs clean of `libssl.so.1.1`. Commit `c83bd90`.
3. **BUG-002-003** — `sp_set_session_context @read_only=1` is architecturally incompatible with Prisma
   connection pooling (error 15664 on the first cross-request reuse of a pooled connection → the post-write
   `revalidatePath('/services')` RSC re-render 500s). Architecture verdict B: drop `@read_only` from both
   `sp_set_session_context` calls. **→ ADR-003 Amendment 1** (authored upstream, read-only to the team): §3
   `@read_only=1` removed; §4 reset-on-release retired as undeliverable on Prisma 5.22's quaint sqlserver pool.
   Within-request immutability preserved structurally (once-per-request guard + verified-identity-only value +
   single `$extends` writer via the ESLint `requestDb` boundary). HARD DoD: new tier-3 pooled-reuse
   re-settability regression test (cross-request reuse WITHOUT `$disconnect`; red-on-old-15664 /
   green-on-new) — the never-implemented §4 leak guard, now satisfied by overwrite. SDET APPROVED;
   `@tax-portal/db` 41/41. Commit `550a556`.
4. **BUG-002-004** — stale portal rate-limit test (`apps/portal/.../sign-in-rate-limit.integration.test.ts`)
   broke by BUG-002-001's guard change (a **blast-radius miss** — the guard change's submission gate was scoped
   to one package and missed the apps/portal consumer). Fix: 2-line test-lifecycle change adding
   `ALLOW_MOCK_AUTH=true` in `beforeEach`/`afterEach` (mirror of `session-expiry.test.ts`); all 7 throttle
   assertions intact. SDET APPROVED; `portal` 23/23; `pnpm -r test` 229/229. Commit `b87cd95`.

## Cross-surface loop result (evidence for AC-DOOR-002-03, NOT an AC-DOOR-002-04 sign-off)

The deactivate journey was validated end-to-end across both surfaces: deactivating a service in `apps/admin`
removes it as a selectable option on the `apps/portal` public services page / request form
(`services-catalog-cross-surface.spec.ts` test 12, green vs the running stack). This confirms the supply→
front-door loop fires. The planning layer owns AC-DOOR-002-04 and decides whether this loop evidence is
sufficient to flip its COVERAGE row; the team reports it as evidence only.

## Implementation-level decisions (slice-local, recorded — not architectural)

- **Separate write predicate `fn_service_write_access` (no CLIENT branch)** distinct from the read predicate
  `fn_service_access` — realizes ADR-005's *existing* mandate (the UI is not the boundary; the policy is) and
  closes EPIC-001's latent write-gap where CLIENT passed the BLOCK predicate. Not a new architectural choice;
  no upstream raise.
- **Deactivate = UPDATE active=false, never DELETE** (REQ-DOOR-002 reversibility). Enforced at the repository
  and asserted at tier-3.
- **Reactivation intentionally absent** from the admin UI this slice (out of brief scope; the data model
  supports it).
- **Single-surface (`apps/admin`) scope** is the documented ADR-006 exception; the only portal changes are the
  BUG-002-002 Prisma-engine parity (Dockerfile + next.config.mjs), no new portal route/write path.

## Raised upstream

None authored by the team. BUG-002-003 **required an architecture consult** (the `@read_only=1` clause was an
explicit ADR-003 §3 mandate); the architecture layer resolved it as **ADR-003 Amendment 1** (read-only to the
team — the team complied, recorded a `// DECISION:` citing ADR-003 §3 Amendment 1 + BUG-002-003, and did not
edit the ADR). No `OPEN-QUESTIONS.md` entry remained open at close.

## Carried follow-ups (not blocking this slice)

1. **`packages/db/src/service.rls.test.ts` stale test-helper comments (~L70–72, ~L88).** Comments still say
   "real app uses `@read_only = 1`" and cite "ADR-003 §4 pool hygiene" — both factually wrong after BUG-002-003
   / ADR-003 Amendment 1. **Comment text only — functional behavior is correct.** Disposition: non-blocking
   doc-drift follow-up; the correction rides the next `packages/db` task that touches this file, or a dedicated
   doc-drift cleanup. (Folding a micro-dispatch through the full pipeline for two comment lines is
   disproportionate.)
2. **Local DB-bootstrap + `migrate deploy` P3019 infra fragility (carried from EPIC-004).** Clean-volume
   bootstrap needs `sa`-once login creation, Prisma port-in-authority, `!`-free logins, and works around the
   `migrate deploy` P3019 (`mssql`-vs-`sqlserver`). This is why the clean-volume container Smoke is env-blocked
   and the CI-as-gate substitution is carried.
3. **`sqlserver` compose healthcheck SA-password mismatch (new manifestation of #2).** The healthcheck runs
   `sqlcmd -U sa -P $MSSQL_SA_PASSWORD`, which fails (Error 18456 State 8) because `MSSQL_SA_PASSWORD` only
   applies at volume-init and the persisted volume's SA password differs → `sqlserver (unhealthy)`. **DB fully
   operational via app principals; not a BRIEF-002 regression.** Fix: derive the healthcheck SA password from
   the volume-bootstrap source (or re-assert the env SA password on persisted volumes).
4. **`test-portal` CI job lacks a `packages/**` build step (carried from EPIC-004 follow-up #3).** Graduate
   `test-portal` to a required check only after adding `pnpm -r --filter './packages/**' build --if-present`.
5. **Dispatch-Checkpoint `Started-at` should capture a real clock value, not a midnight sentinel** —
   TASK-002-003 and BUG-002-004 carry `2026-06-16T00:00:00Z` placeholders (in-range; metadata gate passed).
   Metric-integrity observation.

## Demo artifact

`docs/demos/EPIC-002/` — 4 AC-tagged PNGs (4 distinct sha256 hashes, no byte-identical dupes:
`01-AC-DASH-010-01`, `02-AC-DOOR-002-01`, `03-AC-DOOR-002-02`, `04-AC-DOOR-002-03`) + `DEMO.md`, captured by
`apps/admin/e2e/demo/services-catalog.demo.spec.ts` (`@demo`, excluded from the gating `e2e:run` via
`--grep-invert @demo`; runnable only via `e2e:demo`). **Non-gating** — the e2e/acceptance gates (TASK-002-004)
are the gates. Per `.orchestration/DEMO-POLICY.md` the demo may ship in a separate docs-lane PR; the main
session decides placement.

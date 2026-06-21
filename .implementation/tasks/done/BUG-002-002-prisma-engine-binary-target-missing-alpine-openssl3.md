---
brief: BRIEF-002 (rides BRIEF-002's PR) — **defect is latent from EPIC-001** (first Prisma-backed container page is BRIEF-002's `/services`); fixing it is required to deliver BRIEF-002's e2e gate (TASK-002-004).
status: done
assigned_to: webapp-developer (schema + Dockerfiles — `prisma/` + `Dockerfile*` are in webapp-developer/devops scope)
updated_by: webapp-developer
impl: developer
started_at: 2026-06-16T14:56:02Z
completed_at: 2026-06-16T15:55:00Z
complexity_estimate: "3"
complexity_actual: "4"
brief_type: feature
brief_deploys: no
introduces_gate: no (corrects the build so an existing capability — the request-scoped Prisma path — works in-container; the in-container render proof is its own evidence, not a new required gate).
acceptance_criteria: [AC-DOOR-002-01/-02/-03, AC-DASH-010-01/-02/-03 — indirect: this bug blocks the in-container journey ACs in TASK-002-004 (the add/edit/deactivate journeys 500 on the RSC re-render). Unblocking it is the gate to validate them. The bug's own correctness is verified by the in-container 200-render proof + the 4 currently-failing e2e going green (see Regression test below).]
upstream_refs: ADR-002 (SQL Server / sqlserver provider / Prisma version lock 5.22.x), ADR-003 (request-scoped `db` wrapper sets SESSION_CONTEXT via `$executeRawUnsafe`), ADR-004 (Prisma sole ORM), ADR-006 (two frontends — both Alpine runners), ADR-007 (per-app long-lived Node container image).
severity: blocker (hard-blocks the TASK-002-004 e2e execution gate; every request-scoped Prisma page 500s in the prod-built container)
---

# BUG-002-002 — Prisma query-engine binary target missing for the Alpine/OpenSSL-3 container runner (request-scoped Prisma pages 500 in-container)

---

## Reproduction

1. `docker compose --env-file .env.local build admin portal` then `docker compose --env-file .env.local up -d --no-deps admin portal` (Alpine `node:20-alpine` runner; Next standalone; `NODE_ENV=production`).
2. As an authenticated accountant, navigate to the admin `/services` page (the **first** container page to use the request-scoped **Prisma** path — `listAllServices` via the `$extends` `db` client). EPIC-001/004 pages read via the raw-mssql admin pool, so they never loaded the Prisma engine in-container.
3. **Observed:** the RSC render that calls `listAllServices()` → `$executeRawUnsafe()` (SESSION_CONTEXT) throws; the page falls into the "Application error" state (TASK-002-004 journey tests find this instead of the expected row). Container log:
   ```
   Error [PrismaClientInitializationError]:
   Unable to require(`libquery_engine-linux-musl.so.node`).
   Details: Error loading shared library libssl.so.1.1: No such file or directory
   ```
   `ls /usr/lib/libssl* /lib/libssl*` in the container → only `libssl.so.3` present; `libssl.so.1.1` absent.
4. **Expected:** the request-scoped Prisma path loads its engine and `/services` renders 200 for the authenticated accountant; the 4 currently-failing TASK-002-004 e2e go green.

## Root cause

`prisma/schema.prisma` `generator client` declares **no `binaryTargets`**, so `prisma generate` produces only the **`native`** engine for the build host. The Alpine `node:20-alpine` runner (lines 16/54 of both Dockerfiles) ships only OpenSSL 3.x (`libssl.so.3`); the bundled Prisma 5.22 query engine `libquery_engine-linux-musl.so.node` that the runtime loads requires `libssl.so.1.1` (OpenSSL 1.1.x), which is absent. The correct Alpine/OpenSSL-3 engine (`linux-musl-openssl-3.0.x`) was never generated, so the request-scoped Prisma path cannot initialize in-container.

**Why latent since EPIC-001, surfaced only now:** EPIC-001/004 container pages read exclusively via the **raw-mssql admin pool** (`getAdminPool()`), which never loads the Prisma query engine. BRIEF-002's `/services` is the **first** container page to take the request-scoped **Prisma** path (`$extends` `db` client → `$executeRawUnsafe` for SESSION_CONTEXT). The defect was masked because EPIC-001/004's container smoke was always env-blocked (CI-substituted), and CI runs **no** container e2e — so no Prisma-backed page was ever exercised in a prod-built container until now.

**Cannot be CI-substituted:** CI runs no container e2e; only the fixed container proves these ACs. This is the second container-runtime defect (after BUG-002-001) that the env-blocked container smoke hid across EPIC-001/004 — a retro item.

## Fix (IO-confirmed — build-target correction, NOT an architectural decision)

**Generate the Alpine/OpenSSL-3 Prisma engine and ensure it ships in the standalone image the runner serves. Prefer the `binaryTargets` correction over an Alpine OpenSSL-1.1 shim** (targeting the correct engine is the supported path; `openssl1.1-compat` is fragile and unsupported on current Alpine).

### `prisma/schema.prisma` (webapp-developer)
- Add the Alpine/OpenSSL-3 binary target to the generator:
  ```prisma
  generator client {
    provider      = "prisma-client-js"
    binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
  }
  ```
- `native` is retained so local dev/test (the host) keeps working; `linux-musl-openssl-3.0.x` is the engine the Alpine/OpenSSL-3 runner needs. Add a comment tying the target to the `node:20-alpine` runner and BUG-002-002.

### `apps/admin/Dockerfile` + `apps/portal/Dockerfile` (webapp-developer — fix BOTH per ADR-006)
- Both Dockerfiles **already run `pnpm prisma generate`** in the builder stage (line 43) with `prisma/` present — so after the `binaryTargets` change, `prisma generate` will produce the `linux-musl-openssl-3.0.x` engine. **No new `prisma generate` step is needed; do not add one.**
- **The load-bearing risk is the standalone copy:** Next.js `output: "standalone"` file-tracing must include the generated `linux-musl-openssl-3.0.x` engine `.node` so the runner stage's `COPY --from=builder … /.next/standalone ./` carries it. Verify (in-container, post-build): the engine `.node` exists under the standalone tree the runner serves (e.g. `find /app -name 'libquery_engine-linux-musl*'`). If standalone tracing does **not** pick it up, make it explicit — either `outputFileTracingIncludes` for the generated Prisma client engine in each app's `next.config.mjs`, or an explicit `COPY --from=builder` of the engine into the runner image alongside the standalone tree. Pick the minimal change that puts the correct engine on the runner; record a `// DECISION:` for whichever path is used.
- **Fix portal too even though its current reads use raw mssql** — same Alpine runner, same latent trap; the moment a portal page takes the request-scoped Prisma path it 500s identically. Prevent the recurrence now.

### Ops docs (webapp-developer/devops, same dispatch — CLAUDE.md § DevOps doc-update mandate)
- This changes the container build/runtime contract (the image now ships a second Prisma engine; the runner's Prisma capability now depends on the Alpine/OpenSSL-3 engine being present). Per CLAUDE.md § DevOps: **update `.implementation/operations/inventory.md` and `.implementation/operations/runbook.md`** to record the Alpine/OpenSSL-3 Prisma-engine requirement (why `binaryTargets` includes `linux-musl-openssl-3.0.x`, that the standalone image must ship it, and the symptom if it regresses — `libssl.so.1.1` load failure → request-scoped Prisma pages 500). The SDET rejects if these are stale (CLAUDE.md § SDET infra rule).

## Regression test required (ENGINE § Bug Fixes)

This bug's regression proof is **the container path, not a host unit test** (the failure is build-target/runtime-only; host `native` already works, so a host unit test cannot catch it). Captured as:
1. **In-container engine + render proof (developer):** after the developer's local rebuild, the engine `.node` is present in the standalone tree (`find`), and the admin `/services` page renders **200** for an authenticated accountant in the container (not the "Application error" page). Capture the command + output in the Work Log.
2. **Authoritative proof (resumed TASK-002-004 + SDET review):** the **main session** rebuilds (`docker compose --env-file .env.local build admin portal` + `up -d --no-deps admin portal`, admin host-mapped 13001→3001) and verifies; then TASK-002-004's already-authored specs are re-run — the **4 currently-failing e2e** (`[AC-DOOR-002-01]` add, `[AC-DOOR-002-02]` edit, `[AC-DOOR-002-03]` deactivate, `[AC-DOOR-002-03]` cross-surface loop) must go **green** with the other 13 still passing (17/17). That is the authoritative acceptance proof; this BUG's fix is not "done" until those go green.

Add a `## Testability` note if a host unit test genuinely cannot exist — it cannot here (the defect is exclusively in the Alpine/OpenSSL-3 runtime engine load), so the container render proof + the resumed e2e are the regression evidence, with IO approval recorded in this section.

**## Testability (IO-approved):** No host unit/integration test can reproduce this defect — the host `native` engine loads fine; the failure exists only when the `linux-musl-openssl-3.0.x` engine is loaded under Alpine/OpenSSL-3. The regression evidence is therefore the in-container 200-render proof (developer, local rebuild) + the 4 resumed TASK-002-004 e2e going green (authoritative, after the main-session rebuild). Approved by the IO.

## Quality Gates

- [x] Work Log complete (pre-implementation entry + in-container proof)
- [x] Submission gate: `pnpm lint` + `pnpm type-check` + `pnpm build` — all clean
- [N/A] Targeted e2e (brief does not mandate standalone e2e for this bug; authoritative e2e proof deferred to TASK-002-004 resume)
- [x] Security review (no credentials, no new attack surface; `PRISMA_QUERY_ENGINE_LIBRARY` is a build/runtime path env var, not a credential; `ALLOW_MOCK_AUTH` contract unchanged)
- [x] SDET Review

## Definition of Done

- [x] `prisma/schema.prisma` generator adds `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`; comment ties the target to the Alpine runner + BUG-002-002.
- [x] `apps/admin/Dockerfile` + `apps/portal/Dockerfile`: three-layer fix implemented — (1) `binaryTargets` generates the engine, (2) `outputFileTracingIncludes` in `next.config.mjs` includes it in the standalone tree, (3) `PRISMA_QUERY_ENGINE_LIBRARY` + explicit `COPY --from=builder` ensures the correct engine is loaded on Alpine. `// DECISION:` records the three-layer mechanism in both Dockerfiles and both `next.config.mjs`. Both Dockerfiles fixed.
- [x] In-container proof (developer, local rebuild): engine `.node` present in both containers (`find /app -name 'libquery_engine-linux-musl*'`); admin `/services` renders **HTTP 200** for an authenticated accountant (not "Application error"); no `libssl.so.1.1` error in logs. Full output in Work Log.
- [x] `.implementation/operations/inventory.md` + `runbook.md` updated for the new three-layer build/runtime engine requirement including the regression symptom and recovery steps.
- [x] Submission gate: `pnpm lint` + `pnpm type-check` + `pnpm build` clean; host `prisma generate` succeeds with the new target list (both `native` debian-openssl-3.0.x AND `linux-musl-openssl-3.0.x` generated). `pnpm --filter @tax-portal/db test` 39/39 green — no host regression.
- [x] SDET Review (see review focus below).

## SDET review focus

1. **Binary target correct + native retained** — `binaryTargets` includes `linux-musl-openssl-3.0.x` AND `native`; host dev/test unaffected (`native` still generated; `@tax-portal/db` host suite green on re-exec).
2. **Engine actually ships in the standalone image** — verify (in-container or via image inspection) the `linux-musl-openssl-3.0.x` engine `.node` is present under the standalone tree the runner serves on BOTH images. A `binaryTargets` change that generates the engine but doesn't ship it is an incomplete fix (the standalone-trace risk is the real hazard here).
3. **In-container Prisma path works** — admin `/services` renders 200 for an authenticated accountant in the rebuilt container (no `libssl.so.1.1` error in logs). This is the focused proof the engine loads.
4. **Both Dockerfiles fixed** — portal fixed too (ADR-006 two-frontend parity), even though portal's current reads are raw-mssql; reject single-surface fix.
5. **Authoritative acceptance proof** — the 4 currently-failing TASK-002-004 e2e go green after the main-session rebuild (17/17), with no scenario drift. (Validated when TASK-002-004 resumes — this BUG's approval is contingent on that re-run going green; the SDET notes the dependency.)
6. **Ops docs consistent** — `inventory.md`/`runbook.md` reflect the Alpine/OpenSSL-3 engine requirement (CLAUDE.md § SDET infra reject-if-stale).
7. **No `openssl1.1-compat` shim** — confirm the fix targets the correct engine rather than shimming OpenSSL 1.1 into Alpine (the fragile path the IO ruled out).

## SDET Review

**Decision:** approved

**Re-execution counts:**
- `pnpm --filter @tax-portal/db test` — **39/39 PASS** (7 files, 1.42s). No host regressions. `native` retained: host generates `debian-openssl-3.0.x` (native on WSL2 Ubuntu) + `linux-musl-openssl-3.0.x` (explicit Alpine target). Both confirmed via `find node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client -name 'libquery_engine*'`.
- `pnpm lint` — PASS (zero errors, both apps).
- `pnpm type-check` — PASS (zero errors, packages + both apps).

**In-container proof (independently reproduced):**
- Admin: `docker exec tax-portal-admin find /app -name 'libquery_engine*'` → 3.0.x engine present at `/app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node` (the stable `PRISMA_QUERY_ENGINE_LIBRARY` target) and in the standalone tree. `linux-musl.so.node` (1.1.x) also present in pnpm store — confirming the native-musl-1.1.x preference hazard the developer documented is real; override is load-bearing.
- Portal: identical engine set confirmed at same paths.
- `docker exec tax-portal-admin sh -c 'echo $PRISMA_QUERY_ENGINE_LIBRARY'` → `/app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node`. File existence check: `FILE_EXISTS`.
- `docker exec tax-portal-portal sh -c 'echo $PRISMA_QUERY_ENGINE_LIBRARY'` → same path. File existence check: `FILE_EXISTS`.
- Admin `/services` HTTP probe: POST mock-session `{clerkUserId:"user_accountant_e2e_001",role:"ACCOUNTANT"}` → 200. GET `/services` with `__mock_session` cookie → **HTTP 200**, `<title>Services Catalog | Tax Portal</title>` (not "Application error").
- `docker logs tax-portal-admin | grep -i 'libssl\|PrismaClientInitialization\|prisma:warn'` → ONE line: `prisma:warn Prisma failed to detect the libssl/openssl version...` — the harmless detection warning; `PRISMA_QUERY_ENGINE_LIBRARY` overrides it. NO `PrismaClientInitializationError`. NO `libssl.so.1.1 not found`.
- Portal logs: zero Prisma-related lines (portal reads via raw-mssql; engine not yet exercised — expected).

**Per-focus verdicts:**

1. **`native` preserved — PASS.** `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` confirmed in `prisma/schema.prisma` lines 23–24. Host `prisma generate` emits `debian-openssl-3.0.x` (native) + `linux-musl-openssl-3.0.x`. `@tax-portal/db` 39/39 with no regressions — host dev/test path unaffected.

2. **Engine ships and loads in-container — PASS (load-bearing).** Admin container: 3.0.x engine at `/app/.prisma/client/` (stable path) AND in the standalone node_modules tree (outputFileTracingIncludes did its job). `linux-musl.so.node` (1.1.x) is also present — confirming the native-musl preference hazard is real; the `PRISMA_QUERY_ENGINE_LIBRARY` override is not optional. Engine file is executable (mode `rwxr-xr-x`), owned `nextjs:nodejs`, 16 MB — consistent with a real binary. Admin `/services` → HTTP 200 + correct `<title>`. Logs clean. Portal: same engine layout confirmed; no Prisma errors.

3. **`PRISMA_QUERY_ENGINE_LIBRARY` override sound — PASS.** Both Dockerfiles: `ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node`. The `COPY --from=builder` line in each Dockerfile copies from the Prisma 5.22.0 pnpm-store path to that exact stable, non-pnpm-hashed destination. Independent `ls /app/.prisma/client/` in both containers confirms the file is there. `// DECISION:` comments in both Dockerfiles and both `next.config.mjs` explain all three layers + the native-musl-1.1.x root cause.

4. **Both apps fixed (ADR-006 parity) — PASS.** `prisma/schema.prisma` is shared. Both `apps/admin/next.config.mjs` and `apps/portal/next.config.mjs` carry identical `outputFileTracingIncludes` blocks. Both Dockerfiles carry the runner-stage `ENV + RUN mkdir + COPY --from=builder` pattern. Both `inventory.md` and `runbook.md` reflect both surfaces. No admin-only fix.

5. **Authoritative acceptance proof — contingent (noted, not blocking).** The 4 failing TASK-002-004 e2e (`[AC-DOOR-002-01]` add, `[AC-DOOR-002-02]` edit, `[AC-DOOR-002-03]` deactivate, `[AC-DOOR-002-03]` cross-surface loop) must go green (17/17) when TASK-002-004 resumes after the main-session rebuild. The in-container HTTP 200 render proof confirms the engine defect is resolved; the full e2e green is the authoritative acceptance proof. This approval is contingent on that re-run.

6. **Ops docs consistent — PASS.** `inventory.md` "Last updated: BUG-002-002"; new `## Prisma Engine Binary Target Requirement` section documents all three fix layers, the regression symptom (exact error text), and verification commands. `runbook.md` "Last updated: BUG-002-002"; new `### Prisma engine fails to load` troubleshooting entry with diagnosis, recovery steps (all three layers), and a `See inventory.md` cross-reference. Neither file is stale.

7. **No `openssl1.1-compat` shim — PASS.** `grep -n 'apk\|openssl\|libssl'` on both Dockerfiles: only comments and `ENV`/`COPY` lines referencing the 3.0.x engine. No `apk add`, no `openssl1.1-compat`, no shim install anywhere. Fix correctly targets the 3.0.x engine.

**Mandatory rejection checks — all clear.** `Complexity-actual: 4` (in-range). `Started-at`/`Complexity-estimate` set. Dispatch Checkpoint "Starting implementation" entry present and precedes all implementation entries. Required spec fields (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate: no**`) all present. `Introduces-gate: no` — Gate Authoring 3-item evidence not required. `## Testability` section present with IO-approval — no host regression test can catch the Alpine/OpenSSL-3 runtime defect; container render proof is the correct regression evidence. All dev-owned Quality Gate boxes ticked. No tool-hygiene violations in the Work Log.

**Security:** `PRISMA_QUERY_ENGINE_LIBRARY` is a build/runtime filesystem path env var — not a credential. `COPY --from=builder` source is a versioned pnpm store path (not a dynamic or user-input value). No new attack surface introduced. `ALLOW_MOCK_AUTH` contract unchanged.

## Work Log

### 2026-06-16 [webapp-developer] Starting implementation
**Scope:** Fix Alpine/OpenSSL-3 Prisma engine binary target missing — `prisma/schema.prisma` `binaryTargets`, verify standalone standalone-tree tracing ships the engine, update ops docs.
**What was done:** Read all relevant files — `prisma/schema.prisma` (no `binaryTargets`), both Dockerfiles (already run `pnpm prisma generate` in builder), both `next.config.mjs` (no `outputFileTracingIncludes`), `inventory.md`, `runbook.md`.
**What's next:** (1) Edit `prisma/schema.prisma` — add `binaryTargets`. (2) Verify Dockerfiles — check if standalone tracing picks up the engine automatically or if explicit include/COPY is needed. (3) Update ops docs. (4) Run lint/type-check/build/prisma generate. (5) Docker pre-flight + in-container rebuild + engine-present probe + HTTP 200 render proof.
**Blockers:** none

### 2026-06-16 [webapp-developer] Implementation complete — submission gate passed

**Files changed:**
- `prisma/schema.prisma` — added `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` with BUG-002-002 comment
- `apps/admin/next.config.mjs` — added `outputFileTracingIncludes` with musl engine glob (BUG-002-002 comment + DECISION)
- `apps/portal/next.config.mjs` — same (ADR-006 parity)
- `apps/admin/Dockerfile` — runner stage: added `ENV PRISMA_QUERY_ENGINE_LIBRARY`, `RUN mkdir -p /app/.prisma/client`, `COPY --from=builder` engine to stable path
- `apps/portal/Dockerfile` — same
- `.implementation/operations/inventory.md` — added `## Prisma Engine Binary Target Requirement` section with three-layer fix, regression symptom, verification commands
- `.implementation/operations/runbook.md` — added `### Prisma engine fails to load` troubleshooting entry with three-layer recovery steps

**Key discovery during implementation:** The `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` + `outputFileTracingIncludes` alone were insufficient. Root cause (validated in-container):
1. In the Alpine Docker builder, `native` resolves to `linux-musl` (not `linux-musl-openssl-3.0.x`). Both engines get generated and shipped in the standalone tree.
2. At runtime on Alpine, Prisma's OpenSSL detection fails ("failed to detect libssl/openssl version, defaulting to openssl-1.1.x") and tries to load `libquery_engine-linux-musl.so.node` (the 1.1.x engine) — `libssl.so.1.1 not found`.
3. Third layer required: `PRISMA_QUERY_ENGINE_LIBRARY` env var pointing to a stable `/app/.prisma/client/` path, with the engine COPY-d there from the builder. This overrides Alpine's detection and loads the correct 3.0.x engine.

**Submission gate results:**

`pnpm lint` — PASSED (0 warnings, 0 errors)
`pnpm type-check` — PASSED (0 errors, all packages)
`pnpm build` — PASSED (exit 0; both admin and portal build clean with `output: "standalone"`)
`pnpm prisma generate` (host) — PASSED:
  - Generated: `libquery_engine-debian-openssl-3.0.x.so.node` (native on WSL2 Ubuntu)
  - Generated: `libquery_engine-linux-musl-openssl-3.0.x.so.node` (explicit Alpine target)
`pnpm --filter @tax-portal/db test` — PASSED: 7 test files, 39 tests, 0 failures

**In-container proof:**

Build: `docker compose --env-file .env.local build admin portal` → exit 0 (both images built)
Start: `ADMIN_PORT=13001 docker compose --env-file .env.local up -d --no-deps admin portal`
Both containers: healthy

(a) Engine `.node` present in admin container:
```
$ docker exec tax-portal-admin find /app -name 'libquery_engine*'
/app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node              ← PRISMA_QUERY_ENGINE_LIBRARY target (stable path)
/app/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/libquery_engine-linux-musl-openssl-3.0.x.so.node
/app/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/libquery_engine-linux-musl.so.node
/app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node
/app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/libquery_engine-linux-musl.so.node
```
Same output for portal container.

(b) Admin `/services` renders HTTP 200:
```
$ POST http://localhost:13001/api/mock-session {clerkUserId: "user_accountant_e2e_001", role: "ACCOUNTANT"}
→ HTTP 200, {"ok":true}, Set-Cookie: __mock_session=...

$ curl -H "Cookie: __mock_session=..." http://localhost:13001/services -o /dev/null -w "%{http_code}"
→ 200
```
Response HTML confirms: `<title>Services Catalog | Tax Portal</title>` (not "Application error").

(c) Container logs clean of `libssl.so.1.1` error:
```
$ docker logs tax-portal-admin | grep -i "libssl\|PrismaClientInitialization"
prisma:warn Prisma failed to detect the libssl/openssl version...  ← detection warning only (harmless — PRISMA_QUERY_ENGINE_LIBRARY overrides)
```
No `PrismaClientInitializationError`, no `libssl.so.1.1 not found`.

`PRISMA_QUERY_ENGINE_LIBRARY` in container:
```
$ docker exec tax-portal-admin sh -c 'echo $PRISMA_QUERY_ENGINE_LIBRARY'
/app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node
```

**What's next:** SDET review. Authoritative e2e proof (4 TASK-002-004 journeys going green) deferred to TASK-002-004 resume.
**Blockers:** none

### 2026-06-16 [sdet] Approved — BUG-002-002 marked done
**Independent re-execution:** `pnpm --filter @tax-portal/db test` 39/39 PASS; `pnpm lint` PASS; `pnpm type-check` PASS. **In-container proof:** admin `find /app -name 'libquery_engine*'` → 3.0.x engine at `/app/.prisma/client/` (stable path, `FILE_EXISTS`) + standalone tree; `$PRISMA_QUERY_ENGINE_LIBRARY` confirmed in both containers pointing to real file; admin `/services` → HTTP 200, `<title>Services Catalog | Tax Portal</title>` (not "Application error"); `docker logs tax-portal-admin` → harmless detection warning only, zero `PrismaClientInitializationError`/`libssl.so.1.1` errors; portal logs clean. All 7 focus items PASS. Authoritative e2e proof (17/17) contingent on TASK-002-004 resume.

## Attempt Log

(stuck-loop counter: 0)

---
brief: BRIEF-007
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-19T11:47:03Z
completed_at: 2026-06-19T07:05:00Z
complexity_estimate: 3
complexity_actual: 3
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-FILE-003-01 (partial — the adapter contract that delivers encryption-at-rest; the tier-3 proof lands in TASK-007-004). The port itself underpins AC-FILE-001-02, AC-FILE-003-02/-03/-04, AC-NFR-009-01 delivered downstream.]
upstream_refs: ADR-008 (FileStorage port + adapters + fail-closed boot + TTL policy + config contract), ADR-020 (encryption-at-rest is the adapter contract, NOT app code; no cloud KMS/secrets SDK in app code — ADR-013/020), ADR-009 (storage-key pattern is opaque to the adapter; TTL caps), ADR-006 (`packages/storage` location).
---





# TASK-007-001: `FileStorage` port + Azurite/Memory adapters + fail-closed select + compose/env wiring

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — no UI/route in this task; e2e lands in TASK-007-006
- [x] **Security review** — no provider SDK in app code; no credentials logged; fail-closed `cloud` boot; TTL caps enforced in one place
- [x] **SDET Review** — approved

## SDET Review focus areas

- Cites ADR-008/020/013 — verify: app imports **only** the interface type; `@azure/storage-blob` lives **only** in the Azurite adapter inside `packages/storage`, never in `apps/**` route handlers/server actions; **no cloud KMS/secrets SDK** anywhere in app code.
- `STORAGE_ADAPTER=cloud` with no compiled binding **fails closed at startup** (explicit throw, no silent fallback to memory/disk) — mirror the `packages/esign` fail-closed select precedent.
- TTL caps (ADR-008 § TTL policy: download default 300s/max 3600s; upload default 900s/max 3600s) are enforced **in the wrapper** — a request for a longer TTL throws.
- **Touches docker-compose / env / `.env.example`** — verify `.implementation/operations/inventory.md` + `runbook.md` updated per CLAUDE.md § Domain-specific notes (DevOps). Azurite container/bucket/connection-string wiring documented.
- The encryption-at-rest **adapter conformance** integration test (ADR-008 § Encryption at rest: `put` → out-of-band stat confirms encryption metadata present for Azurite) runs against the **real Azurite container**, not the memory adapter.

## Context

This is the **first `FileStorage` port** (ADR-008) and the foundation for the portal's first stored-bytes path. Net-new `packages/storage` exporting the `FileStorage` interface and two adapters (`AzuriteAdapter`, `MemoryAdapter`), an env-driven fail-closed `makeStorage`/`getStorage` selector, and centralized TTL-cap enforcement. Azurite already runs in `docker-compose.yml` at `:10000`. No production adapter ships (ADR-008 Phase-5 slot; `cloud` branch throws). Encryption-at-rest (AC-FILE-003-01) is the **adapter's** contract, never app code (ADR-020).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/storage/package.json` | Create | New workspace pkg `@tax-portal/storage`; `@azure/storage-blob` dependency |
| `packages/storage/tsconfig.json` | Create | TypeScript config extending `@tax-portal/tsconfig/base.json` (standard boilerplate) |
| `packages/storage/vitest.config.ts` | Create | Vitest config; 30s timeout for tier-3 integration tests (standard boilerplate) |
| `packages/storage/eslint.config.mjs` | Create | ESLint flat config (no lint script — matches other packages pattern; config kept for consistency) |
| `packages/storage/src/types.ts` | Create | `FileStorage` interface + all I/O types verbatim to ADR-008 § Interface; plus `ListOptions` (referenced in ADR-008 but not defined — added with DECISION comment) |
| `packages/storage/src/ttl.ts` | Create | TTL policy constants + `resolveDownloadTtl`/`resolveUploadTtl` enforcement utilities (centralized per ADR-008 § TTL policy; single enforcement point for both adapters) |
| `packages/storage/src/adapters/azurite.ts` | Create | `AzuriteAdapter` — only module importing `@azure/storage-blob`; all 6 methods; SAS-token signed URLs; `createIfNotExists()`; `getRawProperties()` for integration test encryption assertion |
| `packages/storage/src/adapters/memory.ts` | Create | `MemoryAdapter` — `Map<string,Buffer>`; all 6 methods; loopback stub URLs; `getRawBuffer()`/`has()` test helpers |
| `packages/storage/src/select.ts` | Create | `makeStorage(env)` / `getStorage()` singleton; `cloud` → throw; unknown/unset → throw; mirrors `packages/esign/src/select.ts` |
| `packages/storage/src/index.ts` | Create | Barrel: interface types + `getStorage` + `resetStorageForTesting` only; no adapter classes |
| `packages/storage/src/storage.test.ts` | Create | Unit tests: MemoryAdapter conformance (put→stat, delete, list, signed URLs); TTL cap throws; makeStorage fail-closed matrix (33 tests) |
| `packages/storage/src/storage.integration.test.ts` | Create | Tier-3 integration tests against real Azurite container: put→stat, encryption metadata (AC-FILE-003-01), signed URLs, TTL throws, list, delete (9 tests) |
| `.env.example` | Modify | Add `STORAGE_ADAPTER`, `STORAGE_CONNECTION_STRING`, `STORAGE_CONTAINER`, `PORTAL_STORAGE_CONNECTION_STRING`, `ADMIN_STORAGE_CONNECTION_STRING` |
| `docker-compose.yml` | Modify | `--skipApiVersionCheck` on Azurite command; `STORAGE_*` env in portal + admin; `azurite: service_healthy` depends_on for both app services |
| `.implementation/operations/inventory.md` | Modify | Storage service topology, `packages/storage` architecture note, `STORAGE_*` env table, Azurite `--skipApiVersionCheck` note |
| `.implementation/operations/runbook.md` | Modify | Storage adapter bring-up section, fail-closed selector table, connection string formats, encryption-at-rest note, ADR-009 storage-integrity hook stub |

## Tests to Write First

- [ ] `MemoryAdapter put→stat round-trips key/size/contentType/metadata` — expected: stat reflects the put
- [ ] `getSignedUploadUrl/getSignedDownloadUrl reject ttlSeconds > cap` — expected: throw (ADR-008 caps)
- [ ] `makeStorage(STORAGE_ADAPTER=cloud)` — expected: throw, explicit "no production adapter bound" (fail-closed boot)
- [ ] `makeStorage(unknown)` — expected: throw
- [ ] `[tier-3, Azurite] AzuriteAdapter put → out-of-band stat shows encryption present (AC-FILE-003-01)` — expected: encryption metadata present per ADR-008 § Encryption at rest

## Implementation Notes

- **Bind the Data & Interface Contract** (brief § Data & Interface Contract → IO expansion in the dispatch prompt). The `FileStorage` signatures are **ADR-008 § Interface verbatim** — do not invent extra methods (no multipart in v1).
- **`select.ts` mirrors `packages/esign/src/select.ts`** (fail-closed, singleton, `resetForTesting`). Default adapter for local/CI is `azurite`; `memory` is test-only; `cloud` throws.
- **Encryption-at-rest is NOT app code.** Azurite simulates SSE; the conformance test asserts presence-of-encryption metadata (ADR-008). Do not hand-roll crypto.
- **DevOps portion:** the compose/env/inventory/runbook edits are the `[devops]` role's scope. Implement the package as `[webapp-developer]`; the same dispatched agent handles the compose/env wiring per ADR-006/008 — but if compose service-topology/secrets change materially, the SDET checks inventory/runbook consistency (CLAUDE.md § SDET infra rule). Cross-surface default: env is injected into **both** `apps/portal` and `apps/admin` (ADR-006).
- Storage keys are **opaque** to the adapter (ADR-008 § Naming) — the ADR-009 key pattern is constructed by `packages/db` callers (TASK-007-004), not here.

## Definition of Done

- [x] `FileStorage` port + `AzuriteAdapter` + `MemoryAdapter` + fail-closed `select` shipped in `packages/storage`
- [x] App-importable surface is the **interface type only**; no provider SDK reachable from `apps/**`
- [x] TTL caps enforced centrally; `cloud` boot fails closed
- [x] Azurite encryption-conformance tier-3 test green against the real container
- [x] `.env.example` + docker-compose + inventory.md + runbook.md updated and consistent
- [x] Lint + type-check + build pass; `pnpm --filter @tax-portal/storage test` green

---

## Work Log

- **2026-06-19 [webapp-developer]** Starting implementation — `packages/storage` net-new workspace pkg: FileStorage interface + AzuriteAdapter + MemoryAdapter + fail-closed select + env/compose/inventory/runbook wiring | What's next: read existing project structure, then create package skeleton, types, adapters, selector, barrel, tests | Blockers: none
- **2026-06-19 [webapp-developer]** Submission gate results — all gates passed; status → review | What was done: (1) Created `packages/storage` with `types.ts` (ADR-008 interface verbatim), `ttl.ts` (centralized caps), `adapters/azurite.ts` (AzuriteAdapter — only `@azure/storage-blob` importer), `adapters/memory.ts` (MemoryAdapter — Map<string,Buffer>), `select.ts` (fail-closed singleton), `index.ts` (interface-only barrel). (2) Unit tests: 33 passed (`storage.test.ts` — MemoryAdapter conformance, TTL caps, fail-closed matrix). (3) Tier-3 integration tests: 9 passed against real Azurite container (`storage.integration.test.ts` — put→stat, encryption metadata `isServerEncrypted=true` [AC-FILE-003-01], signed URLs, TTL throws, list, delete). (4) Azurite container updated with `--skipApiVersionCheck` (required for `@azure/storage-blob` v12.32+ API version `2026-04-06` vs. older `azurite:latest` image). (5) `docker-compose.yml` updated: `STORAGE_*` env injected into portal + admin; `azurite: service_healthy` depends_on for both app services. (6) `.env.example` updated with `STORAGE_ADAPTER`, `STORAGE_CONNECTION_STRING`, `STORAGE_CONTAINER`, `PORTAL_STORAGE_CONNECTION_STRING`, `ADMIN_STORAGE_CONNECTION_STRING`. (7) `inventory.md` + `runbook.md` updated with storage topology, env table, Azurite note, ADR-009 integrity hook stub. Full gate results: `pnpm lint` ✓ · `pnpm type-check` ✓ · `pnpm build` ✓ · `pnpm --filter @tax-portal/storage test` 42 passed (33 unit + 9 integration) ✓ | What's next: SDET review | Blockers: none
- **2026-06-19 [sdet]** SDET review complete — approved; status → done | Gate re-run: `pnpm lint` PASS · `pnpm type-check` PASS · `pnpm build` PASS (all packages + portal + admin) · `pnpm --filter @tax-portal/storage test` 42 passed (33 unit + 9 integration) against live Azurite container. AC-FILE-003-01 tier-3 `isServerEncrypted=true` assertion independently confirmed against real `tax-portal-azurite` container. All six mandatory review focus areas PASS (SDK containment, fail-closed boot, TTL caps, real-Azurite tier-3, operations-doc consistency, cross-surface env injection). | What's next: IO dispatch of TASK-007-002 | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All mandatory rejection checks passed. Gate re-run confirms: `pnpm lint` PASS, `pnpm type-check` PASS, `pnpm build` PASS (packages + both Next.js apps), `pnpm --filter @tax-portal/storage test` **42 passed (33 unit + 9 integration)** against the live Azurite container (`tax-portal-azurite` running on host port 10000). The tier-3 AC-FILE-003-01 encryption-at-rest assertion (`isServerEncrypted === true` via out-of-band `getRawProperties()`) ran against the real Azurite container and passed — not mocked, not skipped. `Complexity-actual: 3` is present and in range.

**Focus-area findings — all PASS:**

1. **Provider-SDK containment (ADR-008/013/020):** `@azure/storage-blob` is imported only in `packages/storage/src/adapters/azurite.ts`. Zero hits in `apps/portal/**` or `apps/admin/**`. The `index.ts` barrel exports type-only interface symbols (`export type { FileStorage, ... }`) + `getStorage` + `resetStorageForTesting` — no adapter class leaks. The dist `index.d.ts` is clean (the only `@azure/storage-blob` mention in `index.ts` is inside a block comment, not an import). PASS.

2. **Fail-closed boot:** `select.ts` mirrors `packages/esign/src/select.ts` correctly. `STORAGE_ADAPTER=cloud` throws with "no production adapter is bound in this build". `STORAGE_ADAPTER` unset or unknown also throws. The unit test matrix (`makeStorage fail-closed matrix`) covers all branches including uppercase normalization (`CLOUD` → lower-cased before switch). No silent fallback to memory/disk. PASS.

3. **TTL caps centralized (ADR-008 § TTL policy):** `ttl.ts` defines the single enforcement point. Both adapters call `resolveDownloadTtl()` / `resolveUploadTtl()` from `ttl.ts` — constants are `DOWNLOAD_DEFAULT_S=300`, `DOWNLOAD_MAX_S=3600`, `UPLOAD_DEFAULT_S=900`, `UPLOAD_MAX_S=3600`. Requests exceeding the cap throw before any SDK call. Unit tests cover both adapters + the TTL utility directly. PASS.

4. **Azurite tier-3 conformance — INDEPENDENTLY RE-RUN:** I ran `pnpm --filter @tax-portal/storage test` against the live `tax-portal-azurite` container (confirmed running via `docker ps`). Result: `src/storage.integration.test.ts (9 tests) 161ms` — all 9 passed. The `[AC-FILE-003-01]` test asserts `rawProps["isServerEncrypted"] === true` via `getRawProperties()` out-of-band on the blob's raw properties. The 9 integration tests are not skipped and not no-op'd (they require Azurite connectivity — the `beforeAll` probe would abort the suite if Azurite were unreachable). PASS.

5. **Operations-doc consistency (CLAUDE.md § SDET infra rule):** `inventory.md` and `runbook.md` both updated by TASK-007-001. `inventory.md` documents the Azurite section (env table with STORAGE_ADAPTER/STORAGE_CONNECTION_STRING/STORAGE_CONTAINER/PORTAL_STORAGE_CONNECTION_STRING/ADMIN_STORAGE_CONNECTION_STRING), the `--skipApiVersionCheck` rationale, the fail-closed selector table, and the SDK-containment note. `runbook.md` has the `## Object Storage` section (env-driven selector table, bring-up steps, connection strings, encryption-at-rest note, ADR-009 integrity hook stub). The Azurite healthcheck (`node -e` HTTP probe returning 400) is consistent with the compose change. PASS.

6. **Cross-surface (ADR-006):** `docker-compose.yml` injects `STORAGE_ADAPTER`, `STORAGE_CONNECTION_STRING` (via `PORTAL_STORAGE_CONNECTION_STRING` / `ADMIN_STORAGE_CONNECTION_STRING`), and `STORAGE_CONTAINER` into both `portal` and `admin` services. Both have `azurite: condition: service_healthy` in `depends_on`. `.env.example` has all five `STORAGE_*` vars documented. PASS.

**Security:** No credentials logged, no cloud KMS SDK in app code, fail-closed boot prevents silent cloud fallback, TTL caps enforced before SDK call. No injection or auth bypass surfaces (this is a library package with no endpoints). PASS.

**Dispatch checkpoint:** Pre-implementation Work Log entry present ("Starting implementation — `packages/storage` net-new workspace pkg"). Status flip + `Started-at` + `Complexity-estimate` set in the same edit. PASS.

**Required task-spec fields:** `**Acceptance criteria:**`, `**Upstream refs:**`, and `**Introduces-gate:**` all present. PASS.

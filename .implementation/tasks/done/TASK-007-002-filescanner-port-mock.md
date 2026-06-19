# TASK-007-002: `FileScanner` port (mock-first) + fail-closed select + MIME/size validation helper

**Brief**: BRIEF-007
**Brief-type**: feature
**Brief-deploys**: no
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: sdet
**Depends on**: none
**Impl**: developer
**E2e-required**: no <!-- port + mock binding + validation helper; the scan-before-available behavior is proven at tier-3 in TASK-007-004 and tier-6 in TASK-007-006 -->
**Started-at**: 2026-06-19T12:08:25Z
**Completed-at**: 2026-06-19T07:34:00Z
**Complexity-estimate**: 2
**Complexity-actual**: 2

**Acceptance criteria:** none directly (justification: this task delivers the `FileScanner` seam + the MIME/size validation helper that AC-NFR-009-01/-02 and AC-FILE-002-01 are *proven against* in TASK-007-004 / TASK-007-006; it has no user-facing behavior of its own). The seam is load-bearing for AC-NFR-009-01, AC-NFR-009-02, AC-FILE-002-01.
**Upstream refs:** ADR-021 (scan-before-available; `FileScanner` capability contract; verdict `clean｜infected｜indeterminate`; fail-closed unbound binding; MIME/magic-byte validation is a *safety* check NOT a type allow-list; size cap), ADR-013/020 (no vendor scanner SDK in app code; port discipline), REQ-NFR-009 (the requirement the seam satisfies), REQ-FILE-002 (any type accepted — validation must not reject for an uncommon type).
**Introduces-gate:** no <!-- port + mock binding; unit-tested (test-is-its-own-evidence). The scan-before-available *promotion* gate is exercised end-to-end in TASK-007-004's tier-3 pipeline. -->

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — no UI/route; e2e lands in TASK-007-006
- [x] **Security review** — fail-closed unbound scanner; MIME check is byte-vs-declared-type only (not a format allow-list); no executable-deny bypass of the any-type allowance
- [x] **SDET Review** — approved

## SDET Review focus areas

- Cites ADR-021 — verify the verdict enum is exactly `clean | infected | indeterminate`; a `cloud`/prod binding requested-but-unbound **fails closed** (throws at select; never silently passes files unscanned).
- **`indeterminate`/scanner-unavailable must NOT be mappable to a pass** — the consumer (TASK-007-004) keeps such files `pending`; verify the port/types make `indeterminate` distinct from `clean`.
- **MIME/magic-byte validation is a safety check, not an allow-list** (REQ-FILE-002 / AC-FILE-002-01): verify the helper rejects only a **bytes-vs-declared-type mismatch** (+ size > cap), and does **not** reject an uncommon/arbitrary type merely for its format. Include a test that an unusual but internally-consistent file type passes.
- The mock verdict trigger is **deterministic** (e.g. a sentinel filename/content marker) so e2e can drive both the clean and malicious paths.

## Context

The **first `FileScanner` port** (ADR-021), mock-first per the standing mock-third-party directive (same posture as `packages/esign` mock e-sign, `packages/auth` mock auth). Delivers: the port interface, a deterministic `MockFileScanner` binding (returns `clean`/`infected`/`indeterminate` by a sentinel), a fail-closed env-driven selector, and a **MIME/magic-byte + size validation helper**. The scan-before-available *pipeline* (where the scan sits in the `pending`→`active`/`infected` state machine) is wired in TASK-007-004; this task delivers the seam it calls.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/storage/src/scanner/port.ts` | Create | `FileScanner` interface: `scan(ref) → Promise<ScanVerdict>` where `ScanVerdict = 'clean' \| 'infected' \| 'indeterminate'` (+ optional threat label); operates on an object reference (key/stream), out-of-band per ADR-021 |
| `packages/storage/src/scanner/bindings/mock.ts` | Create | `MockFileScanner` — deterministic verdict by sentinel (e.g. filename contains `eicar`/`malicious` → `infected`; `indeterminate` sentinel → `indeterminate`; else `clean`) |
| `packages/storage/src/scanner/bindings/cloud.ts` | Create | Deferred stub that throws `ScannerBindingNotAvailableError` at call-time (mirror `packages/esign` docuseal stub) |
| `packages/storage/src/scanner/select.ts` | Create | `getFileScanner()` singleton; `FILE_SCANNER` = `mock｜cloud`; mock requires `ALLOW_MOCK_SCANNER=true` (fail-closed, keyed on the flag NOT NODE_ENV — BUG-002-001 lesson); unbound `cloud` → throw |
| `packages/storage/src/validation.ts` | Create | `validateUploadedBytes({ declaredContentType, bytes/stream, sizeBytes })` — magic-byte/content sniff vs declared type + size ≤ 100 MB (ADR-009/021); returns pass/`mime-mismatch`/`too-large`. **Not** a type allow-list. |
| `packages/storage/src/scanner/*.test.ts`, `validation.test.ts` | Create | Unit tests for verdict determinism, fail-closed select matrix, MIME safety-not-allowlist behavior |
| `packages/storage/src/index.ts` | Modify | Export `getFileScanner`, the `ScanVerdict` type, `validateUploadedBytes`, `resetScannerForTesting` |

## Tests to Write First

- [x] `MockFileScanner returns 'infected' for the malicious sentinel, 'clean' otherwise` — expected: deterministic
- [x] `MockFileScanner returns 'indeterminate' for the indeterminate sentinel` — expected: distinct from clean
- [x] `getFileScanner(FILE_SCANNER=cloud)` unbound — expected: throw (fail-closed)
- [x] `getFileScanner(FILE_SCANNER=mock)` without `ALLOW_MOCK_SCANNER=true` — expected: throw
- [x] `validateUploadedBytes rejects exe-bytes declared as application/pdf` — expected: `mime-mismatch`
- [x] `validateUploadedBytes accepts an uncommon-but-consistent type (AC-FILE-002-01)` — expected: pass (no allow-list rejection)
- [x] `validateUploadedBytes rejects bytes > 100 MB` — expected: `too-large`

## Implementation Notes

- **Bind the Data & Interface Contract** (`FileScanner` signature + mock verdict trigger = IO Design call, expanded in the dispatch prompt). Co-locate under `packages/storage` (the brief allows "a sibling package" — keeping it in `packages/storage` avoids a third new package this slice).
- **Mirror `packages/esign/src/select.ts`** for the fail-closed selector (flag-keyed, singleton, `resetForTesting`).
- **`indeterminate` is fail-closed downstream:** this task makes it a first-class verdict; TASK-007-004 maps it to "stay `pending`", never `active`.
- The validation helper is the ADR-021 §2 MIME/magic-byte check; size cap reaffirms ADR-009 (100 MB).

## Definition of Done

- [x] `FileScanner` port + `MockFileScanner` + deferred `cloud` stub + fail-closed select shipped
- [x] `validateUploadedBytes` enforces bytes-vs-declared-type + size cap **without** a format allow-list
- [x] No vendor scanner SDK imported anywhere in app code
- [x] Lint + type-check + build pass; scanner + validation unit tests green

---

## Work Log

### 2026-06-19T12:08:25Z — webapp-developer — in-progress
**What done:** Starting implementation. Task opened; reading ENGINE.md, developer.md, task spec, ADR-021, and esign package precedent.
**What next:** Implement scanner port, mock/cloud bindings, fail-closed selector, validation helper, and all 7 tests.
**Blockers:** None.

### 2026-06-19T12:17:46Z — webapp-developer — review
**What done:**
- Created `packages/storage/src/scanner/port.ts` — `FileScanner` interface with `scan(ref) → Promise<ScanVerdict>`; `ScanVerdict` discriminated union (`clean | infected | indeterminate`) making `indeterminate` structurally distinct from `clean`.
- Created `packages/storage/src/scanner/bindings/mock.ts` — `MockFileScanner` with deterministic sentinel detection: `eicar`/`malicious` (case-insensitive) in key or first-512 stream bytes → `infected`; `indeterminate` sentinel → `indeterminate`; else → `clean`. Key checked first (zero I/O).
- Created `packages/storage/src/scanner/bindings/cloud.ts` — `CloudFileScanner` deferred stub throws `ScannerBindingNotAvailableError` at call-time. Mirrors `packages/esign/src/bindings/docuseal.ts`. No vendor SDK imported.
- Created `packages/storage/src/scanner/select.ts` — `getFileScanner()` singleton; fail-closed keyed on `ALLOW_MOCK_SCANNER` (NOT `NODE_ENV`, per BUG-002-001 lesson); contradiction guard (cloud + allow-mock → throw); unknown value → throw; `resetScannerForTesting()`.
- Created `packages/storage/src/validation.ts` — `validateUploadedBytes()` with magic-byte detection + 100 MB size cap. Safety check NOT a type allow-list (REQ-FILE-002). Removed `application/octet-stream` from MZ signatures map (too generic). Fail-open on truncated headers. Positive cross-type detection required for mismatch (bytes must positively match a DIFFERENT known type, not merely fail to match declared).
- Modified `packages/storage/src/index.ts` — exports `getFileScanner`, `ScanVerdict`, `ScanObjectRef`, `FileScanner`, `resetScannerForTesting`, `validateUploadedBytes`, `ValidationResult`, `ValidateUploadedBytesInput`, `MAX_FILE_SIZE_BYTES`.
- Created `packages/storage/src/scanner/scanner.test.ts` — 18 tests covering all 7 tests-to-write-first (verdict determinism, fail-closed matrix, contradiction guard, reset).
- Created `packages/storage/src/validation.test.ts` — 28 tests covering MIME mismatch, uncommon-type pass (AC-FILE-002-01 focus), size cap, stream input, edge cases.

**Gate results:**
- `pnpm lint`: PASS (0 errors, 0 warnings)
- `pnpm type-check`: PASS (0 errors)
- `pnpm build`: PASS (0 errors)
- `pnpm --filter @tax-portal/storage test`: PASS — 88 tests (33 storage + 9 integration + 18 scanner + 28 validation), 4 test files, all green.
- No vendor scanner SDK imported anywhere in app/package code (grep confirmed).
- All required exports verified from built dist barrel.

**What next:** SDET review.
**Blockers:** None.

### 2026-06-19T07:34:00Z — sdet — done
**What done:** SDET review complete. All 6 task-specific focus areas PASS; all mandatory rejection checks PASS. Independently ran `pnpm --filter @tax-portal/storage test`: 88/88 tests green (33 storage + 9 integration + 18 scanner + 28 validation, 4 files). `pnpm lint` and `pnpm type-check` independently verified PASS. Vendor-SDK grep confirmed zero hits in `apps/**` and `packages/**` (only project-owned test class imported from the package's own test). Atomic close: ticked SDET Review box, wrote Review prose, appended breadcrumb, set `Completed-at: 2026-06-19T07:34:00Z`, flipped `Status: done`.
**What next:** IO may proceed to dispatch TASK-007-003.
**Blockers:** None.

## Attempt Log

**Attempt count**: 1

## SDET Review

**Decision**: approved
**Notes**:

All six task-specific focus areas PASS; all mandatory rejection checks PASS.

**FA-1 — `indeterminate` is structurally distinct from `clean` (cannot be accidentally promoted):**
`ScanVerdict` is a discriminated union on `verdict`: `{ verdict: 'clean' } | { verdict: 'infected'; threat?: string } | { verdict: 'indeterminate'; reason?: string }`. TypeScript narrowing on `verdict === 'clean'` is exclusive of `indeterminate`. Test `'indeterminate' is NOT 'clean' — consumer cannot accidentally treat them the same` asserts `isPromotable(indeterminate) === false`. PASS.

**FA-2 — Fail-closed select keyed on `ALLOW_MOCK_SCANNER`, NOT `NODE_ENV`:**
`select.ts` mirrors `packages/esign/src/select.ts` precisely. Full matrix exercised by tests: `mock` without flag → throws; `mock` + `false` → throws; `mock` + `true` → MockFileScanner; `cloud` + `true` → throws (contradiction); `cloud` unset → CloudFileScanner stub (scan() throws); unset FILE_SCANNER → defaults to `cloud`; unknown value → throws. Zero `NODE_ENV` references in `select.ts`. PASS.

**FA-3 — No vendor scanner SDK in app/package code (ADR-013/020):**
Grep command: `grep -r --include="*.ts" --include="*.tsx" -l "scanner-sdk|clamav|@clamav|@azure/defender|defender-for-storage|..." /home/ccox/repos/tax-portal/apps/ /home/ccox/repos/tax-portal/packages/`. Only hit: `packages/storage/src/scanner/scanner.test.ts` (for the project's own `MockFileScanner` class — not a vendor SDK). Zero vendor scanner SDK imports in `apps/**`. `cloud.ts` is a throwing stub with no SDK import. PASS.

**FA-4 — `validateUploadedBytes` is a safety check, NOT a type allow-list (AC-FILE-002-01 / REQ-FILE-002):**
Six "uncommon type passes" tests all PASS independently: `application/x-iwork-pages-sffpages`, `model/gltf-binary`, `chemical/x-mdl-molfile`, `application/octet-stream`, `application/x-tax-portal-internal-v1`, `text/plain`. Detection logic only rejects when bytes positively match an executable signature (MZ/ELF/Mach-O) AND declared type is not a known executable type — no rejection for unknown/uncommon formats. Fail-open on truncated headers. PASS.

**FA-5 — Mock determinism:**
`MALICIOUS_PATTERN = /eicar|malicious/i` and `INDETERMINATE_PATTERN = /indeterminate/i` are module-level constants. Key checked first (no I/O), then first-512 stream bytes. Priority: key > stream. Tests cover key sentinels (case-insensitive), stream sentinels, priority ordering, and that same key always yields same verdict. PASS.

**FA-6 — Independent test run (`pnpm --filter @tax-portal/storage test`):**
Result: **88 tests passed (33 storage + 9 integration + 18 scanner + 28 validation), 4 test files, 0 failures, 0 skips.** Matches Work Log claim exactly. Lint (0 errors, 0 warnings) and type-check (0 errors) independently verified. PASS.

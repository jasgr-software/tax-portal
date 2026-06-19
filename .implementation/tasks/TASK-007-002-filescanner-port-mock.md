# TASK-007-002: `FileScanner` port (mock-first) + fail-closed select + MIME/size validation helper

**Brief**: BRIEF-007
**Brief-type**: feature
**Brief-deploys**: no
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: none
**Impl**: developer
**E2e-required**: no <!-- port + mock binding + validation helper; the scan-before-available behavior is proven at tier-3 in TASK-007-004 and tier-6 in TASK-007-006 -->
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** none directly (justification: this task delivers the `FileScanner` seam + the MIME/size validation helper that AC-NFR-009-01/-02 and AC-FILE-002-01 are *proven against* in TASK-007-004 / TASK-007-006; it has no user-facing behavior of its own). The seam is load-bearing for AC-NFR-009-01, AC-NFR-009-02, AC-FILE-002-01.
**Upstream refs:** ADR-021 (scan-before-available; `FileScanner` capability contract; verdict `clean｜infected｜indeterminate`; fail-closed unbound binding; MIME/magic-byte validation is a *safety* check NOT a type allow-list; size cap), ADR-013/020 (no vendor scanner SDK in app code; port discipline), REQ-NFR-009 (the requirement the seam satisfies), REQ-FILE-002 (any type accepted — validation must not reject for an uncommon type).
**Introduces-gate:** no <!-- port + mock binding; unit-tested (test-is-its-own-evidence). The scan-before-available *promotion* gate is exercised end-to-end in TASK-007-004's tier-3 pipeline. -->

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — no UI/route; e2e lands in TASK-007-006
- [ ] **Security review** — fail-closed unbound scanner; MIME check is byte-vs-declared-type only (not a format allow-list); no executable-deny bypass of the any-type allowance
- [ ] **SDET Review** — approved

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

- [ ] `MockFileScanner returns 'infected' for the malicious sentinel, 'clean' otherwise` — expected: deterministic
- [ ] `MockFileScanner returns 'indeterminate' for the indeterminate sentinel` — expected: distinct from clean
- [ ] `getFileScanner(FILE_SCANNER=cloud)` unbound — expected: throw (fail-closed)
- [ ] `getFileScanner(FILE_SCANNER=mock)` without `ALLOW_MOCK_SCANNER=true` — expected: throw
- [ ] `validateUploadedBytes rejects exe-bytes declared as application/pdf` — expected: `mime-mismatch`
- [ ] `validateUploadedBytes accepts an uncommon-but-consistent type (AC-FILE-002-01)` — expected: pass (no allow-list rejection)
- [ ] `validateUploadedBytes rejects bytes > 100 MB` — expected: `too-large`

## Implementation Notes

- **Bind the Data & Interface Contract** (`FileScanner` signature + mock verdict trigger = IO Design call, expanded in the dispatch prompt). Co-locate under `packages/storage` (the brief allows "a sibling package" — keeping it in `packages/storage` avoids a third new package this slice).
- **Mirror `packages/esign/src/select.ts`** for the fail-closed selector (flag-keyed, singleton, `resetForTesting`).
- **`indeterminate` is fail-closed downstream:** this task makes it a first-class verdict; TASK-007-004 maps it to "stay `pending`", never `active`.
- The validation helper is the ADR-021 §2 MIME/magic-byte check; size cap reaffirms ADR-009 (100 MB).

## Definition of Done

- [ ] `FileScanner` port + `MockFileScanner` + deferred `cloud` stub + fail-closed select shipped
- [ ] `validateUploadedBytes` enforces bytes-vs-declared-type + size cap **without** a format allow-list
- [ ] No vendor scanner SDK imported anywhere in app code
- [ ] Lint + type-check + build pass; scanner + validation unit tests green

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

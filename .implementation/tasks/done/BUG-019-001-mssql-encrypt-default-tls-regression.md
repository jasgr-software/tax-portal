---
brief: BRIEF-019
status: done
assigned_to: io
updated_by: sdet
started_at: 2026-06-27T00:00:00Z
completed_at: 2026-06-27T18:04:07.378Z
complexity_estimate: 1
complexity_actual: 1
found_in: "TASK-019-005 (Overwatch Audit BRIEF-019, advisory finding #2)"
category: regression
severity: major
---

# BUG-019-001: raw `mssql` connection parser defaulted `encrypt=true`, breaking admin e2e (TLS against Docker self-signed cert)

---

## Quality Gates

- [x] **Reproduction confirmed** — documented in Reproduction / Evidence section below
- [x] **Regression test added** — `packages/db/src/sql-server-url.test.ts` pins the `encrypt=false`-when-absent contract
- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — `pnpm lint` + `pnpm type-check` + `pnpm --filter db test src/sql-server-url.test.ts` pass
- [N/A] **Targeted e2e** — pure-function unit test; the downstream admin e2e is covered by TASK-019-005
- [x] **Security review** — TLS posture assessed (see Description); does not weaken prod by itself; deploy-time follow-up recorded
- [x] **SDET Review** — approved
- [N/A] **Post-merge verification** — no deployed surface (ADR-007 production deploy deferred)

## SDET Review focus areas

- **Confirm the `encrypt=false` default is correct, not masking a config issue.** It aligns the raw `mssql` pools (`admin-connection.ts`, `engagement.ts`) with Prisma's `sqlserver` connector default (no encryption unless the URL says so). Verify the regression test pins both directions (absent → false; explicit `encrypt=true` → true).
- **Production TLS posture follow-up** — confirm the deploy-time note in `.implementation/operations/inventory.md` § Connection URL conventions (a prod `DATABASE_URL`/`DATABASE_URL_ADMIN` requiring encryption must set `;encrypt=true` explicitly). This is a Phase-5 / ADR-007 deploy concern, not enforced by the parser default.

## Description

The shared raw-`mssql` connection-string parser `packages/db/src/sql-server-url.ts` previously defaulted `options.encrypt = true` when the connection URL omitted the `encrypt` param. The `mssql` driver therefore attempted a TLS handshake against SQL Server's **self-signed certificate inside Docker**, producing `ESOCKET: self-signed certificate` errors. This broke the admin mock-session audit path (`recordAuthEvent`, added by TASK-004-010 on the admin `/api/mock-session` route) for **all admin e2e runs** — a latent pre-existing regression surfaced when BRIEF-019's admin e2e tried to run.

The fix (applied under TASK-019-005, `sql-server-url.ts:59-66`) flips the absent-param default to `encrypt=false`, matching Prisma's `sqlserver` connector behavior (Prisma does not encrypt by default). This is a **legitimate fix-forward** (Overwatch Audit deep-dive verdict A: LEGITIMATE), but it shipped without a BUG record or a regression test — this file is the retroactive record (advisory finding #2) and adds the missing regression test guarding the default against a silent re-flip.

---

## Expected Behavior

`parseSqlServerUrl(url)` returns `options.encrypt = false` when the URL omits `encrypt`, and honors an explicit `encrypt=true` / `encrypt=false` when present. A production deployment requiring in-transit encryption sets `;encrypt=true` explicitly in its connection URL (recorded as a deploy-time follow-up).

---

## Files Involved

| File | Issue |
| ---- | ----- |
| `packages/db/src/sql-server-url.ts` (L59-66) | `encrypt` absent-param default (fixed `true`→`false` under TASK-019-005) |
| `packages/db/src/sql-server-url.test.ts` | NEW — regression test pinning the `encrypt=false`-when-absent contract |
| `.implementation/operations/inventory.md` | Deploy-time TLS/`encrypt` posture note added (TASK-019-006) |

---

## Reproduction / Evidence

- Before the fix: any admin e2e exercising the audit seam failed with `ESOCKET: self-signed certificate` from the raw `mssql` pool.
- After the fix + regression test: `parseSqlServerUrl("sqlserver://u:p@localhost:1433;database=taxportal").options.encrypt === false`; explicit `encrypt=true` still honored. See `packages/db/src/sql-server-url.test.ts`.

---

## Work Log

- 2026-06-27 [sdet] Marking done — Approved. encrypt=false-when-absent default is correct: aligns raw mssql pools with Prisma sqlserver connector behavior; not masking a config issue. Regression test (5 cases) pins both directions: absent→false, explicit true→true, explicit false→false, trustServerCertificate default, param-form parse. Production TLS posture documented in inventory.md with Phase-5/ADR-007 deploy-time note. | What's next: archive | Blockers: none
- 2026-06-27 [io] Retroactive BUG record for the TASK-019-005 `encrypt` default fix (Overwatch advisory #2). Added `packages/db/src/sql-server-url.test.ts` (5 cases pinning the encrypt/trustServerCertificate default contract). Added the deploy-time TLS-posture note to inventory.md (finding #3, under TASK-019-006). The fix code itself shipped under TASK-019-005. | Next: SDET review. | Blockers: none.

## SDET Review

**Decision**: approved — 2026-06-27T18:04:07.378Z
**Notes**: Security adjudication: `encrypt=false`-when-absent is correct and does NOT mask a config issue. The Prisma `sqlserver` connector also defaults to no encryption when the URL omits `encrypt` — the prior `true` default in the raw `mssql` parser was an inconsistency with the established project convention. The Docker dev/test environment uses a self-signed cert that requires this default; a real production deployment that needs in-transit encryption must set `;encrypt=true` explicitly in its connection URL (documented in `inventory.md § Connection URL conventions` with the Phase-5/ADR-007 follow-up). Regression test coverage: 5 pure-function unit tests — absent→false, explicit `encrypt=true`→true, explicit `encrypt=false`→false, `trustServerCertificate` default (false), and param-form URL parse (encrypt still defaults false). Both directions of the `encrypt` param are pinned against silent re-flip. Engine.md § Bug Fixes regression-test requirement met. IO self-implementation reviewed independently by SDET.

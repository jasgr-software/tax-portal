---
bug_id: BUG-013-001
task_ref: TASK-013-003
status: resolved
opened_by: sdet
opened_at: 2026-06-23T00:00:00Z
resolved_at: 2026-06-23T00:00:00Z
resolved_by: webapp-developer
severity: required-gate
gate: devops-docs-sync
---

# BUG-013-001: inventory.md and runbook.md not updated for admin-service storage env additions

## What failed and why

TASK-013-003 added three new environment variables to the `admin` service in `docker-compose.yml`:

- `BLOB_PUBLIC_ENDPOINT` — rewrites the Docker-internal Azurite SAS URL origin to a host-accessible URL for the browser PUT (BUG-008-001 root-cause fix on the admin side)
- `FILE_SCANNER` — file scanner adapter selector (`mock` for local/e2e, `cloud` deferred)
- `ALLOW_MOCK_SCANNER` — mock scanner opt-in flag (same pattern as `ALLOW_MOCK_AUTH` / `ALLOW_MOCK_ESIGN`)

These vars are present in `docker-compose.yml` (lines 260–265) but are **absent from both**:

- `.implementation/operations/inventory.md` — `Last updated` header still reads TASK-011-001. The Azurite section (lines 83–89) documents `STORAGE_ADAPTER`, `STORAGE_CONNECTION_STRING`, `STORAGE_CONTAINER` for "Both" services, but `BLOB_PUBLIC_ENDPOINT`, `FILE_SCANNER`, and `ALLOW_MOCK_SCANNER` are not documented anywhere in the file.
- `.implementation/operations/runbook.md` — `Last updated` header still reads TASK-007-001. No reference to the three new vars anywhere.

## Governing rule

`CLAUDE.md` § DevOps domain-specific notes (mandatory):

> "When a task changes… environment variables… **must update `.implementation/operations/inventory.md` and `.implementation/operations/runbook.md`**."

`CLAUDE.md` § SDET (mandatory):

> "For infrastructure tasks, **must verify** `.implementation/operations/inventory.md` and `.implementation/operations/runbook.md` are consistent with any environment, secret, or configuration changes — **reject if stale**."

## Steps to reproduce

1. Open `docker-compose.yml` → admin service environment block (lines ~260–265)
2. Observe `BLOB_PUBLIC_ENDPOINT`, `FILE_SCANNER`, `ALLOW_MOCK_SCANNER`
3. Search `.implementation/operations/inventory.md` for any of those three var names → no results
4. Search `.implementation/operations/runbook.md` for any of those three var names → no results

## Expected vs actual

**Expected:** `inventory.md` § Environment Variables → Azurite section (or a new subsection) documents all three vars for the admin service with description, required-or-optional status, and default value, mirroring the existing `STORAGE_ADAPTER` / `STORAGE_CONNECTION_STRING` / `STORAGE_CONTAINER` entries. `runbook.md` § Environment Setup notes the mock-scanner opt-in pattern (same as `ALLOW_MOCK_AUTH` / `ALLOW_MOCK_ESIGN`). Both `Last updated` headers updated to TASK-013-003.

**Actual:** Neither doc documents the three new vars. `inventory.md` last-updated is TASK-011-001; `runbook.md` last-updated is TASK-007-001.

## Specific fix required

**`inventory.md`** — In § Environment Variables → Azurite subsection, add three rows to the table:

| Variable | Required | Description | Default (local dev) |
|----------|----------|-------------|---------------------|
| `BLOB_PUBLIC_ENDPOINT` | Optional | Rewrites the Docker-internal Azurite SAS URL origin to a host-accessible URL before returning it to the client browser. In docker-compose, both portal and admin generate SAS URLs using the internal `azurite:10000` hostname; the browser must use `localhost:10000` (BUG-008-001 root-cause fix, added TASK-013-003 for admin). Leave unset in production (real Azure has a single public URL). | `http://localhost:10000` (via compose default) |
| `FILE_SCANNER` | Optional | File scanner adapter selector (ADR-021): `mock` (local/e2e default) or `cloud` (Phase-5 slot — deferred). Set in compose for both portal and admin services. | `mock` (via compose) |
| `ALLOW_MOCK_SCANNER` | Optional | Mock file scanner opt-in. Must be `"true"` for the prod-built container to serve the mock scanner. Same fail-closed pattern as `ALLOW_MOCK_AUTH` (BUG-002-001). Defaults to `"true"` in compose. **NEVER set to `"true"` in a real production deploy.** Added TASK-013-003 (admin now carries these — previously only portal). | `true` (via compose) |

Update the `Last updated` header to TASK-013-003.

**`runbook.md`** — In § Environment Setup, after the `ALLOW_MOCK_ESIGN` block, add a paragraph:

```
**Mock file scanner opt-in (TASK-013-003 — `ALLOW_MOCK_SCANNER`):** Both `portal` and `admin` compose services require `ALLOW_MOCK_SCANNER=true` when `FILE_SCANNER=mock` (the local/e2e default). The fail-closed guard in `packages/scanner` (ADR-021) keys on this flag — same pattern as `ALLOW_MOCK_AUTH`. The compose file defaults both to `mock`/`true` for both services. **NEVER set `ALLOW_MOCK_SCANNER=true` in a real production deployment.**

**`BLOB_PUBLIC_ENDPOINT` (TASK-013-003 — BUG-008-001 admin fix):** Both the `portal` and `admin` compose services set `BLOB_PUBLIC_ENDPOINT` to `http://localhost:10000` so the client browser can PUT bytes directly to Azurite using the host-accessible URL (the server generates SAS URLs with the Docker-internal `azurite:10000` hostname; the browser cannot resolve `azurite`). Leave unset in production.
```

Update the `Last updated` header to TASK-013-003.

## Testability

This is a documentation-only fix to operational docs. Verification: search both files for `BLOB_PUBLIC_ENDPOINT`, `FILE_SCANNER`, `ALLOW_MOCK_SCANNER` — all three must be present with correct descriptions. The `Last updated` header must read TASK-013-003. No code change required.

## Rejection gate

Flag 1 — DevOps docs-sync (HARD). The SDET must reject TASK-013-003 and route back to the developer for this fix before approval.

## Resolution

**Fixed by:** webapp-developer, 2026-06-23 (docs-only remediation)

**Changes made:**
- `.implementation/operations/inventory.md`: Added three rows to the Azurite § table (`BLOB_PUBLIC_ENDPOINT`, `FILE_SCANNER`, `ALLOW_MOCK_SCANNER`). Bumped `Last updated` header to TASK-013-003.
- `.implementation/operations/runbook.md`: Added two paragraphs to § Environment Setup after the `ALLOW_MOCK_ESIGN` block (mock scanner opt-in pattern + BLOB_PUBLIC_ENDPOINT BUG-008-001 admin fix). Bumped `Last updated` header to TASK-013-003.

**Verification:** All three var names (`BLOB_PUBLIC_ENDPOINT`, `FILE_SCANNER`, `ALLOW_MOCK_SCANNER`) now appear in both ops docs with correct descriptions. Both `Last updated` headers read TASK-013-003. No code or compose changes made in this remediation pass.

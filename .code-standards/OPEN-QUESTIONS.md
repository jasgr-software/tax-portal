# Open Questions

Standards ambiguities the Code Standards Agent could not resolve on its own. Each carries a **proposed
default** so adoption is never blocked.

A standard blocked by an open question lists its `SQ-NNN` in `open_questions:`. Use `_templates/open-question.md`
to add an entry.

Status: `open` → `resolved`.

---

## SQ-001 — Shared e2e fixture location for cross-package SQL Server connection helpers

**Status:** open
**Affects:** CS-TS-005
**Raised:** 2026-06-27 (PR #108 audit)

**Question:**
App-level e2e specs (`apps/*/e2e/**/*.ts`) cannot import `parseSqlServerUrl` from
`scripts/db-migrate.ts` directly (different package scope). Where should the shared
mssql URL parser (and other raw-connection helpers used by e2e fixture setup/teardown)
live so that both `apps/portal/e2e` and `apps/admin/e2e` can import it without duplicating
the function inline?

**Proposed default:**
Create `packages/e2e-fixtures/src/sql-server-url.ts` (or add it to an existing shared test
utilities package if one is established) that re-exports `parseSqlServerUrl` from
`scripts/db-migrate.ts` or provides its own authoritative copy. App-level e2e specs import
from this package. Until the shared package exists, inline copies are permitted but MUST
include a `// TODO: CS-TS-005 — replace with shared fixture import when packages/e2e-fixtures is established`
comment and MUST match the current `encrypt` default in `packages/db/src/sql-server-url.ts`.

**Resolution:** _pending_

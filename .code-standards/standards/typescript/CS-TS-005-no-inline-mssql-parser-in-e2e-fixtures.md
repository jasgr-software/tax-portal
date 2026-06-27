---
id: CS-TS-005
title: Import the shared SQL Server URL parser in e2e/test fixtures; do not reimplement it inline
language: typescript
polarity: dont
rating: experimental
status: active
verification: Search `apps/*/e2e/**/*.ts` and `packages/*/src/**/*.test.ts` for local function definitions named `parseSqlServerUrl` (or equivalent). Every occurrence outside `scripts/db-migrate.ts` is a finding unless a shared fixture import is not yet feasible (documented in the file with a `// TODO: CS-TS-005` note). Confirm the `encrypt` default in any inline copy matches the authoritative default in `packages/db/src/sql-server-url.ts`.
source:
  - packages/db/src/sql-server-url.ts
  - scripts/db-migrate.ts
related: [CS-TS-002, CS-GEN-002]
rating_history:
  - { rating: experimental, date: 2026-06-27, by: agent, rationale: "discovered in PR #108 audit — three new e2e/demo spec files (apps/admin/e2e/specs/overdue-reminders.spec.ts, apps/admin/e2e/demo/overdue-reminders.demo.spec.ts, apps/portal/e2e/specs/request-created-nudge.spec.ts) each reimplement parseSqlServerUrl inline with encrypt defaulting to 'true'. BUG-019-001 in the same PR changed the authoritative packages/db/src/sql-server-url.ts to default encrypt='false' — the fix was not propagated to the three inline copies. The correct pattern is established in packages/db/src/*.rls.test.ts which imports parseSqlServerUrl from scripts/db-migrate.ts. Inline copies in app-level e2e specs diverge silently when the shared utility is updated. Proposed experimental pending human ratification; the shared-fixture path for cross-package e2e specs is an open structural question (SQ-001)." }
open_questions: [SQ-001]
---

# CS-TS-005 — Import the shared SQL Server URL parser in e2e/test fixtures; do not reimplement it inline

## Rule

Do not reimplement the `parseSqlServerUrl` URL-to-mssql-config parser inside individual e2e or
integration test files. Instead, import it from the nearest accessible shared location:
- **In-package tests** (`packages/db/src/*.test.ts`): import from `../../scripts/db-migrate.js`
  (the established pattern already in use).
- **App-level e2e specs** (`apps/*/e2e/**/*.ts`): import from a shared e2e fixture (to be
  established — see **SQ-001**) rather than copying the function into each spec file.

## Rationale

Inline reimplementations diverge silently when the shared utility is updated. BUG-019-001 (PR #108)
changed the authoritative `encrypt` default from `true` to `false` in `packages/db/src/sql-server-url.ts`
to align the raw `mssql` pools with Prisma's `sqlserver` connector behavior. Three e2e spec files that
had copied the function inline did not pick up this fix — creating a latent inconsistency between the
e2e fixture's parser (still defaulting `encrypt=true`) and the production parser (now `encrypt=false`).
The tests passed because `DATABASE_URL_ADMIN` in local dev explicitly sets `trustServerCertificate=true`,
masking the divergence. A future update to the parser (e.g. a production-TLS defaulting change) would
again not reach the inline copies without manual auditing.

## Verification

Grep `apps/*/e2e/**/*.ts` and `packages/*/src/**/*.test.ts` for `function parseSqlServerUrl`.
Any match outside `scripts/db-migrate.ts` or a designated shared e2e fixture is a finding.
Additionally, confirm the `encrypt` default in any remaining inline copy matches the current default
in `packages/db/src/sql-server-url.ts` (currently `false` as of BUG-019-001 / PR #108).

## Examples

- do: `import { parseSqlServerUrl } from "../../scripts/db-migrate.js";` (in-package RLS tests)
- don't: copy-pasting `function parseSqlServerUrl(connectionUrl: string): mssql.config { ... }` into each `.spec.ts` file

## Links

- Source: `packages/db/src/sql-server-url.ts` (authoritative parser — BUG-019-001 / PR #108),
  `scripts/db-migrate.ts` (shared import path for in-package tests)
- Observed in: `apps/admin/e2e/specs/overdue-reminders.spec.ts` (PR #108),
  `apps/admin/e2e/demo/overdue-reminders.demo.spec.ts` (PR #108),
  `apps/portal/e2e/specs/request-created-nudge.spec.ts` (PR #108)
- Related: CS-TS-002 (no raw pool import outside packages/db), CS-GEN-002 (additive non-destructive)
- Open questions: SQ-001 (shared e2e fixture location for cross-package specs)

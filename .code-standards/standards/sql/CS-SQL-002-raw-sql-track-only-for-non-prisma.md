---
id: CS-SQL-002
title: Use the raw-SQL track only for what Prisma cannot express
language: sql
polarity: do
rating: required
status: active
verification: Entity schema changes live in `prisma/schema.prisma` (the Prisma migrate track); `db/migrations/` + `db/policies/` carry only what Prisma cannot express — security policies, predicate functions, temporal tables, filtered indexes. A reviewer confirms no entity tables/columns are hand-rolled in raw SQL that Prisma could own, and no Prisma-expressible change duplicates a raw migration.
source:
  - ADR-002
  - ADR-004
related: [CS-SQL-001, CS-SQL-003]
rating_history:
  - { rating: required, date: 2026-06-20, by: agent, rationale: "born required — ADR-002/ADR-004 mandate the single Prisma track for entity schema; the two-track split is load-bearing for migrations in CI" }
open_questions: []
---

# CS-SQL-002 — Use the raw-SQL track only for what Prisma cannot express

## Rule
Entity schema goes on the **Prisma track** (`prisma/schema.prisma` → `prisma migrate`). The **raw-SQL
track** (`db/migrations/`, `db/policies/`) is reserved for things Prisma can't express — security
policies, predicate functions, temporal tables, filtered indexes (**ADR-002**, **ADR-004**). Do not
hand-roll entity tables in raw SQL, and do not duplicate a Prisma-expressible change in a raw migration.

## Rationale
A single source of truth per concern keeps migrations deterministic. Prisma owns the typed entity model;
raw SQL owns only the engine features Prisma has no syntax for. Splitting either way (entity DDL in raw
SQL, or policies forced into Prisma) breaks `prisma migrate deploy` or loses the policy.

## Verification
The cited evidence hook: review the migration diff — entity DDL belongs to a Prisma migration, raw files
under `db/` should contain only policies / predicates / temporal / filtered-index SQL. `pnpm db:migrate`
applies Prisma migrations first, then the raw track.

## Examples
- do: add a column via `prisma/schema.prisma` + `pnpm prisma migrate dev`; add an RLS policy via `db/policies/NNN-*.sql`
- don't: `CREATE TABLE dbo.Engagement (...)` in `db/migrations/` — that entity belongs on the Prisma track

## Links
- Source: ADR-002 (migration tracks), ADR-004 (Prisma single track)
- Related: CS-SQL-001, CS-SQL-003
- Open questions: none

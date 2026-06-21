# Code-Standards Sources

> **This is the only file that couples the code-standards layer to a specific project's source layout.**
> The Code Standards Agent reads this file first to discover *where this project's standards are
> harvested from*. Retarget the layer for a different project by editing this file — nothing else in
> `.code-standards/` hard-codes a source path. Read-only to the agent.

## Harvest sources

### 1. The codebase (observed conventions)

- **type:** code
- **locations:** `apps/portal/`, `apps/admin/`, `packages/`, `db/migrations/`, `db/policies/`,
  `infra/`, `.github/workflows/`, Dockerfiles, `docker-compose*.yml`
- **what to harvest:** patterns the code actually follows — the import boundaries, the DB-access wrapper,
  the RLS predicate skeleton, the test-naming conventions, the Dockerfile shape. Harvest only what is
  *real and recurring*, not what would be nice.

### 2. Architecture decisions (the authority for most rules)

- **type:** architecture-layer
- **location:** `.architecture/`
- **artifacts:** `decisions/ADR-NNN-<slug>.md` (cited as `ADR-NNN`, optionally `ADR-NNN#<section>`),
  `strategy/TESTING.md`, `strategy/CICD.md`
- **note:** ADRs are the **owning authority** for most standards. A standard cites the ADR via `source:`
  and states the rule in one sentence — it does not duplicate the ADR text (pointer, not copy).

### 3. Project instructions

- **type:** project-config
- **location:** `CLAUDE.md` (cited as `CLAUDE.md#<section>`)
- **what to harvest:** the explicit dos and don'ts already written into the project guide — the
  submission-gate commands, the DevOps inventory/runbook update rule, the multi-surface parity rule,
  the merge policy, the migration-track split.

## Language buckets

| LANG | Scope | Dir |
|------|-------|-----|
| `TS` | TypeScript/TSX — `apps/portal`, `apps/admin`, `packages/` | `typescript/` |
| `SQL` | Raw SQL — `db/migrations`, `db/policies`, predicates, temporal tables | `sql/` |
| `GEN` | Cross-cutting / language-agnostic — naming, commits, secrets, doc discipline | `cross-cutting/` |
| `INFRA` | Dockerfiles, compose, GitHub workflows, shell scripts | `infra/` |

## Notes

- **All three sources are present for this project.** Standards are extracted from real code, cite real
  ADRs, and point at real `CLAUDE.md` sections.
- **A future project retargets here.** Point these entries at whatever that project uses. If a project
  has no ADR layer, standards carry their full rule text (no upstream pointer) and cite code/`CLAUDE.md`
  only.
- The agent must **degrade gracefully** when a declared source is absent: harvest from what exists and
  note the missing source in its run summary. It never fails because a source is missing.

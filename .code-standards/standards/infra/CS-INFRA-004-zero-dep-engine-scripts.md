---
id: CS-INFRA-004
title: Engine tooling scripts carry zero runtime npm dependencies
language: infra
polarity: do
rating: recommended
status: active
verification: Engine tooling scripts under `scripts/` — any `.ts`/`.sh` that runs as engine tooling (migration runners, gate validators, schema/format checkers, the task/state-store CLIs), not product code — import only Node.js built-in modules (`node:fs`, `node:path`, `node:child_process`, etc.) and sibling scripts. No third-party npm package is added to a root-level `dependencies` or `devDependencies` entry solely to support a tooling script. A reviewer confirms any new `scripts/*.ts` file's imports are limited to Node built-ins and repo-local sibling modules.
source:
  - scripts/task-frontmatter.ts
  - scripts/db-migrate.ts
  - CLAUDE.md#Domain-specific-notes
related: [CS-INFRA-003]
rating_history:
  - { rating: experimental, date: 2026-06-21, by: agent, rationale: "discovered in PR #74 audit — task-frontmatter.ts explicitly names this as a project ethos ('Zero runtime npm dependencies: hand-rolled scalar/list serializer+parser — matching the zero-dep ethos of db-migrate.ts and db-seed.ts'); two prior scripts follow the same pattern; proposed experimental pending human ratification" }
  - { rating: recommended, date: 2026-06-21, by: user, rationale: "ratified to recommended (not required) — a sound, codebase-named ethos, but the verification's own 'unless the brief justifies it' carve-out makes it a should: a new third-party tooling dep is flagged in review, allowed when justified" }
open_questions: []
---

# CS-INFRA-004 — Engine tooling scripts carry zero runtime npm dependencies

## Rule
Scripts in `scripts/` that run as engine tooling (migration runners, gate validators, schema checkers) must import only Node.js built-in modules and sibling scripts. Do not pull in a third-party npm package as a dependency of a tooling script when a hand-rolled implementation suffices.

## Rationale
Engine tooling scripts run in CI and local dev against the full stack. Third-party dependencies add surface area for supply-chain risk, version conflicts, and install fragility. The project's existing scripts (db-migrate.ts, db-seed.ts, task-frontmatter.ts) demonstrate that YAML parsing, file walking, and schema validation are achievable without external packages. The zero-dep ethos is explicitly named in the codebase as a design constraint.

## Verification
Inspect the `import` statements at the top of any new or modified `scripts/*.ts` file. Built-in `node:*` imports and local `./sibling.js` imports are permitted. Any third-party package import is a finding unless the brief explicitly justifies it and the package is already in the workspace's `devDependencies` for another purpose.

## Examples
- do: `import { readFileSync, readdirSync } from "node:fs"; import { join } from "node:path";`
- don't: `import yaml from "js-yaml"; // new prod dependency pulled in for tooling script`

## Links
- Source: scripts/task-frontmatter.ts (zero-dep ethos named explicitly), scripts/db-migrate.ts (prior art), CLAUDE.md § Domain-specific notes
- Related: CS-INFRA-003
- Open questions: none

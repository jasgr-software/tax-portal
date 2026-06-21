---
brief: BRIEF-004
status: resolved
assigned_to: IO (fix-forward — IO self-implemented, `Impl: io`)
severity: medium (maintenance hazard; gate evidence is valid but repo carries dead files)
task: TASK-004-002
reported_by: SDET (2026-06-15T22:00:00Z)
resolved_by: IO (2026-06-15)
---

# BUG-004-001: Orphan root-level `middleware.ts` in both apps (dead file; Next.js uses `src/middleware.ts`)

---

## What failed and why

Commit `1a83215` added BOTH a root-level `apps/portal/middleware.ts` **and** `apps/portal/src/middleware.ts`, and likewise BOTH `apps/admin/middleware.ts` **and** `apps/admin/src/middleware.ts`.

Both apps use the Next.js `src/` directory layout (`src/app/` exists in both):
- `/home/ccox/repos/tax-portal/apps/portal/src/app/` — confirmed present
- `/home/ccox/repos/tax-portal/apps/admin/src/app/` — confirmed present

**In Next.js 15 with a `src/` layout, middleware MUST reside at `src/middleware.ts`** (co-located with `src/app/`). A root-level `middleware.ts` is silently ignored when `src/app/` is the app directory. Therefore:

- `apps/portal/middleware.ts` (root) — **ORPHAN/DEAD FILE** (Next.js does not pick it up)
- `apps/admin/middleware.ts` (root) — **ORPHAN/DEAD FILE** (Next.js does not pick it up)
- `apps/portal/src/middleware.ts` — **LIVE** (the file Next.js actually executes)
- `apps/admin/src/middleware.ts` — **LIVE** (the file Next.js actually executes)

The live `src/middleware.ts` files are the correct implementations (import `applyPortalAuth`/`applyAdminAuth` from `@tax-portal/auth`; correct ADR-010 logic). The e2e evidence (15/15 portal + 7/7 admin) is valid — it ran through the live `src/middleware.ts` path. The orphan files do not interfere at runtime.

However, the orphan root files:
1. Create a maintenance hazard — a developer editing `apps/portal/middleware.ts` (root) would get no effect on the running app and no error, making it appear the middleware changed.
2. Leave dead code that future linters or reviewers may flag.
3. Contradict the developer's own note in `apps/portal/src/middleware.ts` line 26: "Note: This file lives in src/ because the portal uses the src/ directory structure."

The root files also have a stale comment in the portal root file — it lacks the `src/` layout note that the `src/` file has (line 25–26), making it appear the root file is the authoritative one, which it is not.

## Steps to reproduce

```bash
ls /home/ccox/repos/tax-portal/apps/portal/middleware.ts
ls /home/ccox/repos/tax-portal/apps/portal/src/middleware.ts
ls /home/ccox/repos/tax-portal/apps/admin/middleware.ts
ls /home/ccox/repos/tax-portal/apps/admin/src/middleware.ts
# All four files exist. Only src/ variants are live.
```

## Expected

Only `apps/portal/src/middleware.ts` and `apps/admin/src/middleware.ts` exist. No root-level `middleware.ts` in either app.

## Actual

Both apps contain a root-level `middleware.ts` (orphan/dead) **and** `src/middleware.ts` (live). The orphan files are unused by Next.js 15 with a `src/` layout.

## Specific fix guidance

Delete the two orphan root-level files:

```
apps/portal/middleware.ts   — DELETE (dead; Next.js uses src/middleware.ts)
apps/admin/middleware.ts    — DELETE (dead; Next.js uses src/middleware.ts)
```

The live `src/middleware.ts` in both apps is correct and requires no changes.

After deletion, verify `pnpm lint` + `pnpm type-check` + `pnpm build` still pass (they should — the orphan files were not imported by anything). The e2e gate does not need to re-run (the live path is unchanged).

## Gate evidence status

The developer's e2e evidence (15/15 portal + 7/7 admin against the docker-compose stack under `AUTH_PROVIDER=mock`) is valid — it exercises the live `src/middleware.ts` path, not the orphan. No re-run needed for the fix; the fix is a file deletion only.

## Fix applied (IO self-implementation — `Impl: io`)

The IO orchestrated this fix-forward per ENGINE.md § Bug Fixes. It is a trivial two-file deletion with exact SDET fix guidance — within the IO self-implementation criteria (PHASES.md § IO Self-Implementation: 1–2 files, obvious modification, no debugging, no brief-mandated e2e for the change). The SDET still reviewed (this BUG closes under the IO-as-reviewer atomicity rule on TASK-004-002, whose `## SDET Review` already approved the live `src/` implementation pending this fix).

**Pre-deletion safety verification (IO):**
- Confirmed both apps use the `src/` layout (`apps/portal/src/app/` and `apps/admin/src/app/` present).
- Confirmed the live compiled middleware is the `src/` variant — `apps/portal/.next/server/src/middleware.js` exists in the build artifact, proving Next compiled `src/middleware.ts` and ignored the root file.
- Confirmed no production source imports the root files — the only non-`.next` references to "middleware" are the live `src/middleware.ts`, `next.config.mjs`, the e2e spec, and the mock-session route. The root orphans are imported by nothing.
- Confirmed root and `src/` files are functionally identical (both delegate to `applyPortalAuth`/`applyAdminAuth`); the `src/` files carry the authoritative `src/`-layout note. The root files are pure dead duplicates.

**Action:** `git rm apps/portal/middleware.ts apps/admin/middleware.ts` (working-tree + index). The live `src/middleware.ts` in both apps is correct and unchanged. The main session commits the deletion to PR #38; the IO does not push.

**Gate after deletion:** `pnpm lint` + `pnpm type-check` + `pnpm build` re-run and pass unchanged (the orphans were imported by nothing). No e2e re-run — the live `src/middleware.ts` path is untouched, and the TASK-004-002 e2e evidence (15/15 portal + 7/7 admin under `AUTH_PROVIDER=mock`) already exercised it.

## Testability (IO-approved — no regression test)

ENGINE.md § Bug Fixes requires a regression test for a bug fix, with the sole escape being an explicit `## Testability` section with IO approval. **IO approval granted, no regression test added**, for the following reasons:

- The defect is **structural**, not behavioral: an orphan file that Next.js silently ignores. A deleted dead file has no behavior to assert against — there is nothing for a unit/e2e test to exercise.
- The **live** behavior is already proven: TASK-004-002's e2e (15/15 portal + 7/7 admin) exercises `src/middleware.ts` end-to-end through the docker-compose stack. That suite *is* the standing proof that the surviving middleware is the live gate.
- A standing guard against a re-introduced root `middleware.ts` (e.g. a lint/test asserting `!fs.existsSync('apps/<app>/middleware.ts')`) was considered and **declined as over-engineering** for a one-time orphan deletion caused by a `git add -A` sweep (the root cause — the git-ops boundary violation — is already addressed by the main session adopting git ownership; see Process finding below). If a *future* slice re-introduces this class of duplicate, that is the trigger to add the cheap guard then, not pre-emptively now.

**IO disposition:** regression test waived; structural fix with no testable behavior; live path already covered. Approved 2026-06-15.

## Process finding (note 1 from main session)

The TASK-004-002 developer committed, pushed, and opened PR #38 themselves using a `git add -A`-style sweep, violating `ENGINE.md` § Main Session Rules ("Git operations are the main session's responsibility. Agents write code but do not commit, push, or manage branches.") and § Autonomy Ceiling item 2 ("Never…staging via `git add -A` or `git add .`"). This sweep is what committed the orphan root middleware files alongside the live `src/` files — a selective staged commit would have caught the duplicates. The main session has adopted PR #38 as the slice PR. This is recorded as a process observation; the git-ops violation does not invalidate the code quality, but the orphan-file consequence does require this fix.

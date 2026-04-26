Audit a pattern across `apps/portal` and `apps/admin` to catch cross-surface drift before it becomes a production bug.

## Why this skill exists

`apps/portal` and `apps/admin` are two frontends of one platform (CLAUDE.md § Platform-frontend scope, ADR-006). Cross-app drift is a known failure mode in two-frontend monorepos:

- Auth-context, nav, layout, and session-handling changes that should be mirrored or explicitly justified as single-surface.
- E2e helpers and Playwright config that diverge silently — admin gets the fix, portal doesn't (or vice versa) and the regression surfaces in the next post-merge run.

Rule-by-recall fails enough times to deserve mechanical enforcement.

## What this skill does

Given a pattern (file path, symbol, regex, or task description), this skill:

1. **Resolves the search target.**
   - If `$ARGUMENTS` is a file path under `apps/portal/**`, compute the mirror path under `apps/admin/**` (and vice-versa). Read both.
   - If it's a symbol or regex, `Grep` both `apps/portal/**` and `apps/admin/**` for occurrences.
   - If it's a free-form description ("we changed how the auth context handles cookie expiry"), grep for the relevant terms across both surfaces.

2. **Reports a parity table.** For each match in one app, show the corresponding location in the sibling app (or "MISSING" if no analog exists).

3. **Flags drift.** For each pair of corresponding locations, diff them and call out semantic differences (not just whitespace). Differences that look intentional (admin-only RBAC, portal-only public-page metadata) get marked "likely justified — confirm with caller". Differences that look accidental get marked "likely missed mirror — fix required".

4. **Returns a verdict:**
   - `PARITY_OK` — both surfaces consistent, or differences are clearly intentional.
   - `DRIFT_DETECTED` — list each file pair that needs a mirror fix, with a one-line diff summary per pair.
   - `SINGLE_SURFACE_ONLY` — pattern only exists in one app and that's expected (e.g. admin-only client management, portal-only public services page).

## When to use

- **SDET Review phase** — before approving any change that touches shared patterns (auth context, nav, layout, session handling, common error pages, middleware, route helpers, e2e helpers, Playwright config).
- **Before opening a PR** — when the diff touches `apps/portal/**` or `apps/admin/**`, run this against the changed paths to confirm sibling coverage.
- **Bug triage** — when a bug surfaced in one app, audit the fix's mirror to prevent the symmetric bug.

## When NOT to use

- Pattern is intrinsically single-surface (admin-only client management, portal-only public landing pages).
- Change is scoped to `packages/**` shared code — no mirror needed.
- Pure backend / DB layer (`prisma/`, `db/`, `packages/db`) — this skill is for the portal/admin frontend pair only.

## Output format

```
Target: <path or pattern>
Portal matches: <N>  (apps/portal/...)
Admin matches:  <M>  (apps/admin/...)

Pair 1: apps/portal/src/auth/context.tsx  ↔  apps/admin/src/auth/context.tsx
  Status: DRIFT_DETECTED
  Diff:   portal sets cookie SameSite=Lax; admin sets SameSite=Strict
  Likely: missed mirror (recent change touched portal only)
  Action: apply same change to admin or document why divergent

Pair 2: ...

Verdict: DRIFT_DETECTED — 1 pair needs mirror fix
```

## Argument handling

`$ARGUMENTS` accepts:

- A file path (`apps/portal/src/foo/bar.tsx`)
- A symbol (`useSession`, `AuthProvider`)
- A regex (`/cookie.*expir/`)
- A free-form description of what changed

If empty, ask the user what to audit. Do not guess.

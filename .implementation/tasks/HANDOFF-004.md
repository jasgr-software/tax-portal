# HANDOFF-004 — BRIEF-004 completion / handoff report

> For the upstream producer (Conductor → `.planning/` COVERAGE write-back). States which acceptance criteria
> were satisfied, under which methodology, with which evidence. The AC→test-tag→tier table below is the
> machine-readable companion the planning validate phase flips `COVERAGE.md` rows from. `RETRO-004.md` carries
> the 9-gate scorecard and the retro classification.

## Slice

- **Brief:** BRIEF-004 — Authentication & the two-role model (accountant sign-in, invited-client account, role
  redirect — **the identity spine**). **Re-scoped 2026-06-15:** 2FA deferred; auth provider mocked for
  e2e + local dev (no real Clerk keys required to build/run/validate).
- **Epic source:** `.planning/EPIC-004-*` (auth two-role model).
- **Branch:** `brief-004-auth-two-role-model` (cut from `main`@`f7f6c9d`). **PR:** #38, head `967b88c`.
  **Deploys:** no (ADR-007 — production platform deferred; gate 9 N/A).
- **Methodology honored:** `acceptance_format: gherkin` (scenarios mirrored in
  `apps/portal/e2e/features/auth-two-role.feature` + `apps/admin/e2e/features/auth-cross-app.feature`, bound to
  AC-id-tagged Playwright specs — human-readable until the Cucumber binder lands); `e2e: required` (green vs the
  docker-compose stack **against the mocked auth provider** — real middleware/routes/role-gate/DB path exercised
  end-to-end; only the *provider* is a test double); `tdd: optional`; `coverage_target: none`. Extra gates:
  cross-app redirect e2e in **both** apps (`pnpm e2e:cross-app`, ADR-010 §8 — hard, **newly authored this
  slice**); sign-in rate-limit integration (ADR-022); auth-event audit + CLIENT-reads-zero RLS integration
  (ADR-019); `packages/db` SESSION_CONTEXT `$extends` regression (ADR-003 — closes the carried EPIC-001 retro
  item). Both apps in scope (ADR-006).

## Acceptance criteria — all 11 in-scope SATISFIED

| AC | Verdict | Tier evidence |
| -- | ------- | ------------- |
| AC-AUTH-001-01 | SATISFIED | unit tier-2 |
| AC-AUTH-001-02 | SATISFIED | integration tier-3 |
| AC-AUTH-001-03 | SATISFIED | integration tier-3 (role read) + tier-3 (SESSION_CONTEXT authoritative) |
| AC-AUTH-005-02 | SATISFIED | e2e tier-6 (portal) |
| AC-AUTH-006-01 | SATISFIED | e2e tier-6 (portal) |
| AC-AUTH-006-02 | SATISFIED | e2e tier-6 (portal) |
| AC-AUTH-006-03 | SATISFIED | integration tier-3 |
| AC-AUTH-009-01 | SATISFIED | integration tier-3 |
| AC-AUTH-010-01 | SATISFIED | e2e tier-6 (cross-app) |
| AC-AUTH-010-02 | SATISFIED | e2e tier-6 (cross-app) |
| AC-AUTH-010-03 | SATISFIED | e2e tier-6 (cross-app) |

## AC → test-tag → tier → owning-task → evidence (COVERAGE write-back source)

> Reproduced from the SDET Validate gate-6 report. This is the table the Conductor's `/planning` validate phase
> flips `COVERAGE.md` rows from.

| AC | Test tag | Tier | Owning task | Evidence file / run |
| -- | -------- | ---- | ----------- | ------------------- |
| AC-AUTH-001-01 | `[AC-AUTH-001-01]` | tier-2 unit | TASK-004-004 | `packages/auth/src/role-model.test.ts` (21 tests; 92 auth PASS) — asserts against live `ROLES` const (adding a 3rd role reds the enumeration test) |
| AC-AUTH-001-02 | `[AC-AUTH-001-02]` | tier-3 | TASK-004-004 | same file — session-decode seam; missing-role→null; both-roles unrepresentable |
| AC-AUTH-001-03 (role read) | `[AC-AUTH-001-03]` | tier-3 | TASK-004-004 | same file — ADR-005 negatives: header/query/bearer/forged-payload all ignored; HMAC-verified cookie is the only source |
| AC-AUTH-001-03 (SESSION_CONTEXT) | `[AC-AUTH-001-03]` | tier-3 | TASK-004-007 | `packages/db/src/session-context.propagation.test.ts` (4 live-container tests, 91ms) — identity+role set before first real query |
| AC-AUTH-005-02 | `[AC-AUTH-005-02]` + `@AC-AUTH-005-02` | tier-6 e2e | TASK-004-005 | `apps/portal/e2e/specs/client-signup.spec.ts` (portal e2e 23/23) — client sign-up+sign-in WITHOUT 2FA |
| AC-AUTH-006-01 | `[AC-AUTH-006-01]` | tier-6 e2e | TASK-004-005 | same file — valid invitation ticket → account; invalid → none |
| AC-AUTH-006-02 | `[AC-AUTH-006-02]` | tier-6 e2e | TASK-004-005 | same file — no-self-registration (4 negative-invariant tests) |
| AC-AUTH-006-03 | `[AC-AUTH-006-03]` | tier-3 | TASK-004-005 | `packages/auth/src/invitation-provenance.test.ts` (9 tests) — role server-set from accountant-issued invitation, never client-asserted |
| AC-AUTH-009-01 | `[AC-AUTH-009-01]` | tier-3 | TASK-004-007 | `packages/auth/src/session-expiry.test.ts` (7 tests) — drives `provider.sessionTimeoutMs`; expired→`{valid:false, reason:expired}` + `getIdentity` null |
| AC-AUTH-010-01 | `[AC-AUTH-010-01]` + `@tag` | tier-6 cross-app | TASK-004-008 | `apps/admin/e2e/specs/cross-app-redirect.spec.ts` (`pnpm e2e:cross-app` 9/9) — CLIENT→admin ⇒ portal redirect |
| AC-AUTH-010-02 | `[AC-AUTH-010-02]` + `@tag` | tier-6 cross-app | TASK-004-008 | `apps/portal/e2e/specs/cross-app-redirect.spec.ts` — ACCOUNTANT→client-only ⇒ admin redirect (3xx, not 403) |
| AC-AUTH-010-03 | `[AC-AUTH-010-03]` + `@tag` | tier-6 cross-app | TASK-004-008 | same portal spec — ACCOUNTANT on `/services` + `/` served 200 (stays on portal) |

**Extra-gate evidence (no user-facing AC; ADR obligations):**
- **ADR-022 rate-limit** — 7 `[ADR-022]` tests (per-IP/per-endpoint throttle → 429), TASK-004-009.
- **ADR-019 audit + RLS** — `packages/db/src/audit-event.rls.test.ts` (append-only ledger write + CLIENT-reads-zero
  isolation, live-container), TASK-004-010. Trace tag `[ADR-019]`. Satisfies the CLAUDE.md SDET per-policy RLS hard rule.
- **ADR-003 `$extends` regression** — closes the carried EPIC-001 retro item (the BRIEF-001 RLS hard gate
  exercised raw `mssql`, not the Prisma `$extends` wrapper path), TASK-004-007.
- **`pnpm e2e:cross-app` real gate** — TASK-004-008 authored the real script (was a placeholder echo) with all
  three Gate-Authoring evidence items (run ref, named code path at `packages/auth/src/redirect.ts`,
  counterfactual). ADR-010 §8 hard gate.

Gherkin: `.feature` mirrors exist on both surfaces; no scenario drift (SDET-verified).

## Deferred AC (NOT in this slice — carried to the 2FA-enablement slice)

Planning flipped these `deferred` in `.planning/COVERAGE.md` and removed them from EPIC-004 (re-scope
2026-06-15). No 2FA gate / enrollment flow / MFA-enforcement policy is built or tested here.

- **AC-AUTH-004-01 / -02 / -03** — accountant 2FA gate (mandatory MFA enforcement).
- **AC-AUTH-005-01** — client *may enroll* 2FA (optional MFA).

## Implementation-level decisions (slice-local, recorded — not architectural)

- **`packages/auth` as a new package** (not folded into `packages/db`) — keeps the Clerk/Next middleware
  dependency out of the DB package (consumed by non-Next contexts: vitest, scripts). Sanctioned by ADR-001 /
  ADR-010, both of which name `packages/auth` as the preferred home. No upstream raise needed.
- **Provider port with two bindings behind one interface** — a Clerk binding (production target, ADR-001 shape:
  `publicMetadata.role`, read server-side, one app/two surfaces) + a mock/test-double selected via env in
  e2e + local dev. The seam makes the later 2FA-enablement slice a drop-in (swap mock→real, turn on 2FA AC).
  Role is server-evaluated, never client-asserted, under either binding (ADR-005).
- **TASK-004-003 trimmed → no-op re-plan node.** The minimal compiling production-target seam
  (`bindings/clerk.ts` satisfying the port + throwing if called; `select.ts` mock-default switch) shipped in
  TASK-004-002 and is gate-safe. The remaining real-`@clerk/nextjs` scope requires a live Clerk instance no
  in-slice gate can exercise → carried to the 2FA-enablement slice. No task code; numbering preserved (no 006
  either — the former accountant-2FA task) so cross-references stay stable.
- **admin `page.tsx` uses `adminDb` inside `withRequestContext`** — acceptable for this stub iteration (the AC is
  proven by the TASK-004-007 tier-3 test, not the page stub). DECISION-noted; carried follow-up #4 below.

## Raised upstream

None. All choices resolved at slice altitude within cited ADRs (ADR-001/ADR-010 sanction `packages/auth`; the
provider-mock is user-directed and brief-sanctioned; session-default-timeout pinning is explicitly deferred to
the real-binding slice to avoid making an architecture decision here). No `OPEN-QUESTIONS.md` entry created.

## Carried follow-ups (not blocking this slice)

1. **2FA-enablement hardening (required when that slice lands).** Swap mock→real Clerk test-mode; enforce
   mandatory-accountant / optional-client MFA; re-validate AUTH-006 (invitation), AUTH-009 (session),
   AUTH-010 (redirect) **and** the deferred AUTH-004-01/-02/-03 + AUTH-005-01 against the live provider; pin
   Clerk session max-lifetime + idle timeout to documented defaults and record exact values in the runbook.
2. **Local DB-bootstrap + `migrate deploy` infra fix (why local Smoke is env-blocked).** Clean `down -v`
   volume has no DB/logins; Prisma ignores `;port=` → defaults to host 1433, colliding with another project's
   container → put the port in the authority component; Prisma 5.22 mis-parses `!` passwords → use `!`-free
   logins; `prisma migrate deploy` throws P3019 (`mssql`-vs-`sqlserver`) contradicting the actual files,
   reproducing under Node 20 + 24; `.nvmrc`=20 vs a Node-24 shell. The container layer itself is healthy (both
   images build; all 5 services `(healthy)`; both apps answer `/healthz`+`/readyz` on 3000/13001).
3. **`test-portal` CI job gap.** The job lacks a `pnpm -r --filter './packages/**' build --if-present` step, so
   `@tax-portal/ui` + the new `@tax-portal/auth` dist aren't built → tests that import a workspace package fail
   to resolve dist. Same `@tax-portal/ui` failures exist on `main` pre-EPIC-004 (run `27568768517`); EPIC-004
   extends the pattern to `@tax-portal/auth` (the new rate-limit integration test). Tests pass locally
   (`pnpm -r test` 158/158). **Add the build step before graduating `test-portal` to required.**
4. **admin `page.tsx` `adminDb`-in-`withRequestContext`** — switch to the request-pool `db` client when it
   gains real engagement-data queries.
5. **`.env.example` RATE_LIMIT vars** (`RATE_LIMIT_MAX_ATTEMPTS=10`, `RATE_LIMIT_WINDOW_MS=60000`) —
   permission-walled from agents AND the main session; **user applies**.
6. **EPIC-001 engagement-demo `localhost:1433` flake** — pre-existing, transient/timing; observed green on
   re-run during the demo re-capture.

## Demo artifact (ships in the closing docs-lane PR, not PR #38)

`docs/demos/EPIC-004/` (8 AC-tagged PNGs current after clean-rebuild re-capture; `DEMO.md` assembled;
`docs/demos/README.md` updated). Per DEMO-POLICY this is a separate docs-lane PR.

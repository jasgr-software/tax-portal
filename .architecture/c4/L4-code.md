# C4 L4 — Code

> Living description. See `README.md` for the index. L4 is authored **selectively** — only for code whose
> structure is load-bearing or non-obvious and would otherwise be re-invented. Cite the ADRs each pattern
> realizes.

## Status

Current as of 2026-06-19. **Backfill** of the load-bearing code-level patterns (the level was a stub). This
level pins the four patterns that the "mirror the last slice" convention was implicitly carrying; every future
Design phase anchors to these rather than re-deriving them.

## Key code patterns

### 1. The `$extends` SESSION_CONTEXT SET hook (the identity spine)

**Where:** `packages/db/src/client.ts` (`getDb()` → `db`), `packages/db/src/context.ts`
(`withRequestContext` / `currentRequestContext` / `withClerkIdentity`). **ADR-003 §2/§3 (Amendment 1).**

The single point where the verified identity reaches SQL Server RLS. The request-pool Prisma client is wrapped
with a `$extends` `$allOperations` `query` component that, on the **first** operation per request, runs:

```sql
EXEC sp_set_session_context @key = N'clerk_user_id', @value = @p1;
EXEC sp_set_session_context @key = N'role',          @value = @p2;
```

Load-bearing properties (do not "improve" any of these without revisiting ADR-003):

- **Identity source is `AsyncLocalStorage`**, populated by `withRequestContext()` from the server-verified
  session — **never** from request body/header/query. The single writer is this hook (enforced by the
  ESLint `requestDb` import boundary + the barrel not exporting `requestDb`).
- **Once-per-request guard** (`if (!ctx.sessionContextSet)`), tracked per request, not per connection.
- **Keys are writable — no `@read_only`** (Amendment 1, BUG-002-003). `@read_only=1` locks a key for the
  connection lifetime, which collides with Prisma's non-negotiable pooling → SQL Server error 15664 on every
  reused connection's second request. Within-request immutability is preserved **structurally** (once-per-
  request guard + verified-identity-only value + single writer). Pool-reuse safety is by **overwrite**, not by
  reset (the Prisma 5.22 quaint sqlserver pool issues no `sp_reset_connection` and exposes no release hook).
- **Fail-closed:** missing request context → the hook throws (catches "forgot to wrap"); null
  `SESSION_CONTEXT` on the SQL side → RLS returns **zero rows**, not an error (ADR-003 §5).
- **Lazy construction:** `db`/`adminDb` are `Proxy` getters so importing the package constructs no
  `PrismaClient` until first use (BUG-001-003 fix-forward).
- **Regression obligation:** `session-context.pooled-reuse.test.ts` exercises cross-request pooled reuse
  without `$disconnect` — RED on the old `@read_only` code, GREEN now (ADR-003 §4 Amendment 1).

### 2. The two-phase authorize-then-sign upload pipeline (+ scan-before-available)

**Where:** `packages/db/src/repositories/document.ts`; storage seam `packages/storage` (`getStorage`,
`getFileScanner`, `validateUploadedBytes`). **ADR-009 + ADR-008 + ADR-021.**

The canonical file-access shape every document endpoint must follow. Pool-by-step is the load-bearing detail:

1. **`authorizeEngagementForUpload`** — **request pool** (`db`, SESSION_CONTEXT). RLS FILTER resolves the
   engagement; an RLS miss returns `null` → 404, *before any URL is minted*. Returns the `EngagementItem` so
   the caller can also run `checkStepAccessibility` (letter gate) without a second round-trip.
2. **`insertPendingDocument`** — **admin pool** (`getAdminPool`). Inserts the `Document` row `status='pending'`
   and computes the storage key. Runs only *after* step 1's authorization; never bypasses the gate.
   Not exported from the barrel.
3. **Sign + browser PUT** — caller mints the signed upload URL via `packages/storage` (TTL-capped, content-type
   + size signed into the policy); the browser PUTs bytes directly to storage (no app proxy — ADR-008).
4. **`completeUpload`** — **admin pool**. `validateUploadedBytes` (magic-byte/MIME + size) → `getFileScanner().scan` →
   promote to **`active`** (clean+valid), or terminal **`infected`** (withheld + uploader informed), or **stay
   `pending`** (indeterminate/scanner-unavailable — fail-closed, never silently active). This is the
   scan-before-available gate (ADR-021).
5. **`authorizeThenSignDownload`** — **request pool** authz → **active-only** → signed download URL. A
   `pending`/`infected` object can never be signed. Two layered gates: authorize-then-sign **and**
   active-only-after-scan.

Rate-limit (ADR-022) and same-transaction audit (ADR-019) are the **caller's** responsibility (the action
layer), by design — the repository stays a data+storage primitive (`document.ts` DECISION notes).

### 3. The BLOCK-governed client write pattern (request-pool writes vs. admin-pool substrate)

**Where:** `repositories/engagement.ts` (`recordLetterSignatureAsClient` vs. substrate `recordLetterSignature`),
`repositories/questionnaire-answer.ts` (`submitQuestionnaireAsClient` vs. `submitQuestionnaireAnswer`).
**ADR-005 §3 (BLOCK predicates) + ADR-003.**

Client-initiated state changes (sign the letter, submit the questionnaire) are written through the **request
pool** so the RLS **BLOCK predicate** is the authorization — an attempt to write a row the caller doesn't own
raises a SQL error at the engine, not a swallowed app check. The barrel exposes only the `...AsClient`
request-pool entry points; the admin-pool BLOCK-bypassing variants (same operation, RLS-exempt) are
substrate/test-only and **import-from-source-only** — they exist for seed/substrate paths and the RLS test
suite, and are deliberately kept off the public barrel so a route handler cannot reach for the bypass by
accident. The convention to pin: *if a CLIENT performs it, route it through the request pool and let BLOCK
authorize; reserve the admin-pool variant for trusted substrate.*

### 4. The provider-seam shape (port + bindings + fail-closed select)

**Where:** `packages/{auth,esign,email}/src/{port.ts,select.ts,bindings/*}`, `packages/storage/src/{select.ts,
scanner/select.ts}`. **ADR-023.**

Every external integration is one module with: `port.ts` (a narrow interface — only the operations the app
needs), `bindings/<real>.ts` + `bindings/mock.ts`, and `select.ts` that picks the binding from explicit env
config and **fails closed** — it defaults to the real binding and a mock is selectable **only** behind an
explicit `ALLOW_MOCK_<INTEGRATION>` opt-in that must be impossible to set true in production (the
BUG-002-001 fail-open fix, generalized). The app imports the **port**, never a concrete binding. No DI
container — explicit selector + construction (consistent with ADR-011 §4). Add a new external dependency by
adding a package of this exact shape; do not import a vendor SDK into a route handler.

## Notes

- **Governing ADRs:** ADR-003 (identity propagation hook), ADR-009/008/021 (authorize-then-sign +
  scan-before-available), ADR-005 (BLOCK-governed writes), ADR-011 (repository seam, referenced by pattern 3),
  ADR-023 (provider-seam shape), ADR-019 (in-transaction audit, referenced by patterns 2/3).
- **Deliberately out of scope at L4:** routine CRUD repositories, page/component layout, and the admin UI —
  none carry non-obvious structure worth pinning. L4 stays selective per the C4 guidance and the README.

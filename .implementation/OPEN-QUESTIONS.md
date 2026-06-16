# Open Questions

Ambiguities the implementation team could not resolve on its own. Each carries a **proposed default** so the
build is never blocked — except items that genuinely belong upstream (an architectural decision, a product
requirement), which the team **raises back** to the owning layer rather than deciding locally.

A task blocked by an open question lists its `OQ-NNN` and sits at the relevant status until the question is
resolved (locally, or by the upstream layer for raised-upward items).

Status: `open` → `resolved` (or `raised-upstream` when ownership belongs to `.requirements/` /
`.architecture/` / `.planning/`). IDs are `OQ-NNN`, globally unique across this ledger.

---

## OQ-001 — `sp_set_session_context @read_only = 1` is incompatible with Prisma connection pooling (ADR-003 §3/§4)

**Status:** `resolved` (owner: `.architecture/` — ADR-003; resolved 2026-06-16 by the architecture agent, ADR-003 Amendment 1)
**Raised by:** IO, during BRIEF-002 / TASK-002-004 adjudication (2026-06-16). See `BUG-002-003-session-context-readonly-incompatible-with-pooling.md`.
**Blocks:** BUG-002-003 fix dispatch → TASK-002-004 e2e (4 write journeys, 17/17) → BRIEF-002 close.

**The question:** ADR-003 §3 explicitly mandates that both `sp_set_session_context` calls pass `@read_only = 1`,
and §4's reset-on-release design depends on it. In the delivered Prisma 5.22 + sqlserver stack, `@read_only = 1`
locks the key for the **connection lifetime**; under connection pooling, the first cross-request reuse of a
connection that previously set those keys throws **error 15664** on the 2nd set → the post-write
`revalidatePath` RSC re-render 500s → the 4 TASK-002-004 write-journey e2e fail. Connection pooling is
non-negotiable (ADR-004), so `@read_only = 1` removal is essentially forced.

**Why this is raised, not decided locally:** ADR-003 §3 ("read-only flag") is a named clause of an Accepted
ADR's Decision; §4 depends on it. The implementation team does not author/edit ADRs. The `architecture` agent
must (1) ratify removing `@read_only = 1` as the supported reconciliation of §3 with pooling — or propose an
alternative; (2) update ADR-003 §3 (and §4's dependency) with corrected rationale; (3) add the §4
reset-on-release / pooled-reuse regression-test obligation that was never implemented; (4) ratify the
compensating-control decision.

**IO recommendation (for ratification, not a local decision):** remove `@read_only = 1`. The within-request
immutability §3 protected is already provided structurally by the once-per-request `if (!ctx.sessionContextSet)`
guard + verified-identity-only value (`getIdentity()` → `withRequestContext`, never client input) + no
second `sp_set_session_context` writer anywhere in the codebase (ESLint `requestDb` boundary + barrel
non-export). `@read_only` was defense-in-depth against a within-request second writer that does not exist here,
at the cost of pooling incompatibility. **Compensating control: none beyond the existing property** — `@read_only`
never restricted *who* could call `sp_set_session_context`, only whether a 2nd call on the same connection was
rejected; removing it grants no new capability. Do not over-engineer a reset-then-clear scheme absent a concrete
second-writer threat. (Optional, architecture's call: re-set on mismatch instead of throwing — converts the
15664 hard-fail into a correct identity re-set on connection reuse.)

**Resolution gate:** the IO holds the webapp-developer fix dispatch until the architecture agent updates ADR-003
and resolves this OQ. On resolution → flip to `resolved`, compose the fix dispatch per BUG-002-003 § Fix.

**Resolution (2026-06-16, architecture agent — ADR-003 Amendment 1):** VERDICT **(B) — amend §3 to set
SESSION_CONTEXT WITHOUT `@read_only` (keys writable).** Option (A) "implement §4 reset-on-release, keep
`@read_only=1`" was **rejected on a technical finding**: the request (`db`) path runs through Prisma 5.22's
Rust query engine (quaint) sqlserver pool, **not** the npm `mssql`/tedious driver; quaint does **not** issue
`sp_reset_connection` on pool checkout/checkin and exposes **no** connection-release hook, so reset-on-release
in application code is **not deliverable** on this stack — and a `@read_only=1` key cannot be cleared by
`sp_set_session_context` at all (only a fresh connection / `sp_reset_connection` clears it). With reset
unavailable, `@read_only=1` is fundamentally incompatible with pooling (error 15664 on every reused
connection's 2nd request). The IO's recommendation is ratified. Within-request immutability is preserved
**structurally** (once-per-request `if (!ctx.sessionContextSet)` guard + verified-identity-only value via
`getIdentity()`→`withRequestContext` + single `$extends` writer enforced by the ESLint `requestDb` boundary
and barrel non-export). **Compensating control: none beyond the existing properties** — `@read_only` was
defense-in-depth against a within-request second writer that does not exist (and which `@read_only` would not
meaningfully stop anyway, since any such writer is a SQL-injection vuln that could exfiltrate cross-tenant
rows directly). Correctness no longer depends on clearing keys on release: every request **overwrites** both
keys with its own verified identity before its first read, so a reused connection never serves a query under a
stale identity (re-settability, not reset). ADR-005's RLS trust boundary is intact: RLS still keys on a
server-set, verified identity; CLIENT cannot read/write outside policy; EPIC-004 F1/F6 + TASK-002-001
write-boundary tests remain valid. The **never-written §4 reset-on-release regression test** is replaced by a
**mandatory** tier-3 pooled-reuse re-settability test (cross-request reuse WITHOUT `$disconnect` between
scopes — red against old `@read_only=1` code with 15664, green after removal). Implementation contract + test
shape are specified in **ADR-003 § Implementation contract and regression obligation (Amendment 1)**. IO may
now compose the BUG-002-003 fix dispatch.

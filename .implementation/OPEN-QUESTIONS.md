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

---

## OQ-002 — No ADR governs the outbound transactional-email transport (REQ-NFR-008)

**Status:** `raised-upstream` (owner: `.architecture/`) — IO proceeds on the brief's stated intent; not blocking.
**Raised by:** IO, during BRIEF-003 / EPIC-003 Plan (2026-06-17).
**Blocks:** nothing — TASK-003-002 proceeds on the proposed default below.

**The question:** EPIC-003 is the **first slice that sends email** (acceptance invitation — AC-DOOR-007-01;
decline reason — AC-DOOR-008-02/-03). REQ-NFR-008 mandates only the *property* — "reliable transactional email
delivery" — and explicitly leaves the sending service + templating as an implementation decision. There is no
`ADR-*` for email transport (cf. ADR-001 for auth, ADR-008 for object-storage abstraction), so the
cross-cutting transport seam this slice introduces has no governing architecture record.

**Why raised, not decided locally:** a new cross-cutting transport pattern that later phases (Phase 4 messaging,
digests, all client notifications) will depend on is an **architectural** contract, not a slice-local choice.
The team does not author system ADRs.

**IO proposed default (proceeding now; architecture to ratify/replace):** mirror the established
provider-abstraction precedent (ADR-001 auth seam, ADR-008 storage seam) — a new `packages/email` package with
a thin `send(EmailMessage)` **port**, a binding **selector** keyed on `EMAIL_PROVIDER`, an **SMTP binding**
(nodemailer) bound to the **Mailhog** catcher already in `docker-compose` (SMTP `:1025`, UI `:8025`) for local +
e2e, and a **production provider** (e.g. Resend) left as a deferred drop-in that throws if selected without
configuration (exactly the EPIC-004 mock-vs-Clerk pattern). The seam is the deliverable; the concrete production
provider is deferred like the real-Clerk provisioning. **Architecture's call:** ratify this as an
`ADR-email-transport` (or amend an existing ADR), or propose an alternative; confirm the provider selection +
templating approach for production. Until then the slice ships the seam validated against Mailhog (CI + dev
container runs as the gate — same user-accepted basis as EPIC-004).

---

## OQ-003 — Slice-start gate: may BRIEF-LOE-010 (engine-tooling chore) Plan while BRIEF-009 sits in `## Awaiting PR merge`?

**Status:** `resolved` (process question — owner: user / main session; resolved 2026-06-21).
**Raised by:** IO, during BRIEF-LOE-010 Plan-start (2026-06-21).
**Blocks:** nothing — the IO proceeded with Plan on the default; resolved at BRIEF-LOE-010 Dispatch.

**Resolution (2026-06-21):** Moot — **BRIEF-009/EPIC-009 (PR #71) MERGED 2026-06-21T17:24Z (`169b09e`) + validated
(#73, `b7e0544`)**, so the limbo slice that created the slice-start-gate tension no longer exists. The
`## Awaiting PR merge` entry for BRIEF-009 lingered as a **stale ledger entry** (Close-finalize never swept it),
not an in-flight slice — cleared at BRIEF-LOE-010 Dispatch. The concurrent-Plan default was vindicated: lane
isolation held (BRIEF-LOE-010 touched zero BRIEF-009 feature-lane files) and the value-preserving / identical-
verdict ACs kept BRIEF-009's gates green against the migrated tree regardless of merge order. BRIEF-LOE-010 now
proceeds as the **sole active initiative** with no serialization constraint.

**The question:** `PHASES.md` § Slice-start gate and `ENGINE.md` § Autonomy Ceiling item 5 say: if any slice
appears in `## Awaiting PR merge`, the IO **stops and reports** — no new Plan while an old slice is unresolved
(the only carve-out named is a *hotfix mini-slice targeting the limbo slice*). BRIEF-009 (PoC dev sign-in lane)
is in PR limbo awaiting the Conductor's push + reviewed-lane gates + merge. BRIEF-LOE-010 is **not** a hotfix
for BRIEF-009 — it is a fresh **engine-tooling chore** (epic `chore/lights-out-enablement`, the LOE series,
direct successor to TASK-LOE-003). The dispatch instruction explicitly directs the IO to drive BRIEF-LOE-010
now. Strict reading of the gate ⇒ stop; the explicit directive ⇒ proceed. Genuine tension.

**Why not simply stopped:** (1) The user gave an **explicit, direct directive** to drive this specific brief
(`ENGINE.md` § Autonomy Ceiling item 5's "Resume: user merges the limbo PR **or authorizes a hotfix carve-out**"
— the directive is a user authorization to proceed on a parallel track). (2) The LOE engine-tooling series has
historically run on a **separate main-session-driven track** independent of the feature-slice roadmap the
Conductor drives (TASK-LOE-001/002/003 landed this way). (3) **Lane isolation:** BRIEF-LOE-010's deliverables
(`scripts/migrate-task-frontmatter.ts`, `validate-gates.sh`, `package.json`, `.claude/hooks/log-task-edit.py`,
`.implementation/**` docs + the `tasks/**` on-disk format) touch **zero** BRIEF-009 feature-lane files
(`apps/**`, `packages/**`, the auth lane) — the two PRs cannot collide on content. (4) The single-active-initiative
rule (`ENGINE.md` § Gated Paths) is about one *initiative* in `## Current initiative`; BRIEF-009 has vacated
`## Current initiative` (it is collapsed to a pointer and lives in `## Awaiting PR merge`), so this Plan does not
double-occupy that slot.

**One genuine interaction (flagged, mitigated):** BRIEF-LOE-010 **rewrites the on-disk format** of every file
under `tasks/**` *including* `tasks/done/` AND `PROGRESS.md`'s consumers (`validate-gates.sh`,
`log-task-edit.py`). BRIEF-009's archived task files in `tasks/done/` and its `## Awaiting PR merge` entry are in
scope of the migration. **Mitigation:** the migration is value-preserving and idempotent by AC-LOE-010-01/-02
(body prose byte-preserved; only the relocated fields move), and `validate-gates.sh` must give **identical
verdicts** on already-valid files post-migration (AC-LOE-010-04) — so BRIEF-009's Close-finalize gate
(`validate-gates.sh` over the awaiting-merge entry, the gate-8 backstop) continues to pass against the migrated
tree. The IO must **sequence** the two: if BRIEF-LOE-010 merges first, BRIEF-009's Close-finalize runs against
the migrated format and its gate verdicts must be unchanged (the AC guarantees this); if BRIEF-009 merges first,
BRIEF-LOE-010 picks up its already-archived `done/` files in the migration sweep. Either order is safe under the
ACs. **Risk to watch:** `check_pr_awaiting_merge_gate_verdicts` (validate-gates.sh check 9) parses **PROGRESS.md**
prose, not task front matter — the migration must **not** touch PROGRESS.md's `## Awaiting PR merge` parsing
contract (the brief scopes the format change to `tasks/**` + `_templates/`, NOT PROGRESS.md; see Out-of-scope).
This is bound into TASK-LOE-010-002's SDET focus areas.

**IO proposed default (proceeding now):** Plan BRIEF-LOE-010 on the parallel engine-tooling track. Keep
BRIEF-009 untouched in `## Awaiting PR merge`. Record both slices' coexistence explicitly in PROGRESS.md so the
slice-start-gate state is auditable. If the user prefers strict serialization (merge BRIEF-009 first, then Plan
LOE-010), they halt here and the IO yields. **Recommendation:** proceed — lane isolation + the value-preserving/
identical-verdict ACs make concurrent limbo safe, and the directive authorizes it.

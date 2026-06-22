# HANDOFF-010 — BRIEF-010 / EPIC-010 (Engagement lifecycle pipeline & engagement visibility)

**Slice:** the **first Phase-3 slice** — makes the engagement a **first-class, lifecycle-managed object on
both surfaces.** Extends the EPIC-005/008 `New | In Progress` status set to the full closed set
**{New, In Progress, Review, Complete}**; adds **manual accountant-driven transitions** (server-side, audited),
the **two-confirmation completion gate** (delivery-to-client + filed-with-tax-authority), **accountant-only
reopen**, and the **client-facing label mapping** (Review hidden as "In Progress"); and **signs off the
AUTH-002/003/008 feature AC** over the existing Phase-2 `pol_Engagement` isolation mechanism — including the
**direct-reference (fetch-by-id) isolation proof**. **Reuses, does not fork:** the `Engagement` entity + its
`status` column, the `pol_Engagement` policy, the EPIC-008 onboarding-completion automatic New→In Progress
transition (left intact), and the EPIC-003/004 audit seam (`packages/db/src/audit.ts`).

**Branch:** `brief-010-engagement-lifecycle-pipeline` → **PR (pending — `## Awaiting PR merge`).**
**Brief-type:** feature · **Brief-deploys:** no (gate 9 staging smoke N/A).
**Scope:** application code only (no engine/role/workflow files) → **reviewed lane** (MERGE-POLICY Lane B).

## AC satisfied (25/25) + validation basis

All 25 in-scope AC validated by the SDET acceptance-validation gate (APPROVED), each mapped to an AC-tagged
test at its prescribed ADR-012 tier, with gherkin-scenario prose binding (the 25 epic scenarios; Cucumber
tooling not yet landed — bound in prose per CLAUDE.md § Executable gherkin tooling).

### REQ-LIFE-001 — four-stage status pipeline
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-001-01 — exactly one status from the closed set | tier-3 | `engagement.lifecycle.transition.test.ts` + `0004-engagement-status-check.sql` CHECK constraint |
| AC-LIFE-001-02 — new engagement begins New | tier-3 | `engagement.persistence.test.ts` (proven without the literal tag — cosmetic traceability note, pre-adjudicated non-blocking; reuses EPIC-005 `@default("New")`) |
| AC-LIFE-001-03 — forward order New→In Progress→Review→Complete | tier-3 + tier-6 | `engagement.lifecycle.transition.test.ts`; admin `engagement-lifecycle.spec.ts` |

### REQ-LIFE-002 — client-facing labels
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-002-01 — mapping New→Received / In Progress→In Progress / Review→In Progress / Complete→Completed | tier-2/5 + tier-6 | `engagement-label.test.ts`; portal `engagement-labels.spec.ts` |
| AC-LIFE-002-02 — raw internal stage names never shown; Review surfaces as "In Progress" | tier-2/5 + tier-6 | `engagement-label.test.ts`; portal `engagement-labels.spec.ts` |
| AC-LIFE-002-03 — client perceives three states | tier-2/5 + tier-6 | `engagement-label.test.ts`; portal `engagement-labels.spec.ts` |

### REQ-LIFE-003 — manual transitions
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-003-01 — accountant changes status | tier-6 | admin `engagement-lifecycle.spec.ts` |
| AC-LIFE-003-02 — no auto-advance except the onboarding-completion transition | tier-3 | `engagement.lifecycle.transition.test.ts` + verified-by-reference against the EPIC-008 onboarding-completion suite (correct — not re-testing an EPIC-008 invariant; pre-adjudicated non-blocking) |
| AC-LIFE-003-03 — client cannot change status | tier-3 | `engagement.lifecycle.rls.test.ts` (server-side rejection on direct call) + admin surface-gating (ADR-006) + client redirect (ADR-010, `cross-app-redirect.spec.ts`) |

### REQ-LIFE-004 — Review is internal
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-004-01 — Review = accountant checking own work | tier-2/5 | `engagement-label.test.ts` |
| AC-LIFE-004-02 — Review imposes no client action | tier-2/5 | `engagement-label.test.ts` |
| AC-LIFE-004-03 — Review not a client review/approval step | tier-2/5 | `engagement-label.test.ts` |

### REQ-LIFE-005 — two-confirmation completion gate
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-005-01 — explicit delivery-to-client confirmation required | tier-3 + tier-6 | `engagement.lifecycle.transition.test.ts`; admin `engagement-lifecycle.spec.ts` |
| AC-LIFE-005-02 — explicit filed-with-tax-authority confirmation required | tier-3 + tier-6 | `engagement.lifecycle.transition.test.ts`; admin `engagement-lifecycle.spec.ts` |
| AC-LIFE-005-03 — cannot move Complete unless both recorded | tier-3 | `engagement.lifecycle.transition.test.ts` (negative: ≤1 confirmation ⇒ NOT Complete; positive: both ⇒ Complete), against the real SQL Server container |

### REQ-LIFE-006 — accountant-only reopen
| AC | Tier | Validating test |
|---|---|---|
| AC-LIFE-006-01 — accountant reopens a Complete engagement | tier-6 | admin `engagement-lifecycle.spec.ts` (reopen → In Progress) |
| AC-LIFE-006-02 — client cannot reopen | tier-3 | `engagement.lifecycle.rls.test.ts` (server-side rejection) |

### REQ-AUTH-002 — accountant full visibility
| AC | Tier | Validating test |
|---|---|---|
| AC-AUTH-002-01 — accountant views every client account | tier-3 | `engagement.lifecycle.rls.test.ts` (ACCOUNTANT reads ALL) |
| AC-AUTH-002-02 — accountant views every engagement + data | tier-3 | `engagement.lifecycle.rls.test.ts` |
| AC-AUTH-002-03 — nothing partitioned away from accountant | tier-3 | `engagement.lifecycle.rls.test.ts` |

### REQ-AUTH-003 — client own-data isolation (feature sign-off over the EPIC-005 `pol_Engagement` mechanism)
| AC | Tier | Validating test |
|---|---|---|
| AC-AUTH-003-01 — client reads only own engagements | tier-3 | `engagement.lifecycle.rls.test.ts` (CLIENT-A reads own) + portal `engagement-isolation.spec.ts` |
| AC-AUTH-003-02 — client cannot list/search/reach others' | tier-3 | `engagement.lifecycle.rls.test.ts` (CLIENT-B reads ZERO of CLIENT-A's; null/anon reads ZERO) |
| AC-AUTH-003-03 — restriction holds on direct-reference (fetch-by-id) | tier-3 | `engagement.lifecycle.rls.test.ts` (CLIENT-B requesting CLIENT-A's engagement by id is denied, no data) + portal `engagement-isolation.spec.ts` |

### REQ-AUTH-008 — indefinite post-completion access
| AC | Tier | Validating test |
|---|---|---|
| AC-AUTH-008-01 — client retains sign-in after Complete | tier-3 | `engagement.lifecycle.rls.test.ts` |
| AC-AUTH-008-02 — client views completed engagements + data indefinitely | tier-3 | `engagement.lifecycle.rls.test.ts` (Complete engagement still readable by its client; retention/purge OUT of scope per ADR-018) |

## Validation basis (summary)

- **tier-3 isolation/transition** against the real SQL Server container: `engagement.lifecycle.transition.test.ts`
  (status invariant, forward order, the two-confirmation gate negative + positive) and
  `engagement.lifecycle.rls.test.ts` (the HARD `pol_Engagement` CLIENT-A/CLIENT-B/null/ACCOUNTANT isolation +
  the direct-reference path; client-cannot-transition/reopen server-side rejection; post-completion access).
- **tier-2/5 pure mapping:** `engagement-label.test.ts` (label mapping; Review hidden; Review = internal, no
  client action/approval).
- **tier-6 e2e — admin:** `engagement-lifecycle.spec.ts` (accountant advances New→In Progress→Review, the
  two-confirmation completion gate, reopen).
- **tier-6 e2e — portal:** `engagement-labels.spec.ts` (friendly labels, Review shown as "In Progress") +
  `engagement-isolation.spec.ts` (own-data + direct-reference isolation).
- **cross-app:** `cross-app-redirect.spec.ts` (client redirected away from the admin transition surface, ADR-010).
- **Container smoke: PASS** (docker-compose stack, Docker containers — not local dev).

## Constraint adherence (SDET quality audit — APPROVED, no blocking findings)

- **ADR-005** — reused `pol_Engagement`; no parallel policy; no net-new client-scoped table.
- **ADR-003 (+ Amendment 1)** — caller-identity via the `packages/db` wrapper; admin-pool privileged writes
  inside `withAuditTransaction`; no `@read_only` on the SET.
- **ADR-019** — every transition / confirmation / reopen audited atomically through the single audit seam; no
  parallel audit path.
- **ADR-006 / ADR-010** — transition/completion/reopen controls admin-only; client server-side-rejected +
  redirected (server authority, not UI absence).
- **ADR-018** — completion ≠ loss of access; no retention/purge added.
- **Code standards** — required CS-TS-001/002, CS-SQL-001/003 PASS (`// CS-` tags present); recommended
  CS-GEN-001/002/003 PASS.
- **Security** — parameterized `.input()` bindings; session-derived actor (never from action args); RLS
  fail-closed; no injection / auth-bypass.
- **Gate-authoring (TASK-010-001 `introduces_gate: yes`)** — three-item evidence verified: run marker; named
  code path (`sec.pol_Engagement` FILTER+BLOCK); two counterfactuals.

## IO Design calls (recorded — slice-local, no upstream raise)

The brief deferred field-level minutiae to IO Design. Resolved within slice altitude (no `OPEN-QUESTIONS.md`
raise was needed):
- **Confirmation storage:** delivery + filing confirmations as columns on `Engagement` (migration
  `20260622200407_engagement-lifecycle-confirmation-columns` + the `0004-engagement-status-check.sql` CHECK on
  the extended status set) — no net-new client-scoped table, so no new policy required (CS-SQL-001 satisfied by
  reuse).
- **Reopen target stage:** Complete → **In Progress** (validated by `engagement-lifecycle.spec.ts`).
- **Transition guard:** status-precondition enforced at the seam + DB CHECK constraint; the Complete
  precondition (both confirmations) is enforced server-side in the completion seam.
- See the per-task `// DECISION:` breadcrumbs (DECISION-010-A..C) in the archived task files.

## Carried follow-ups (non-blocking — not slice-blocking, no gate failure)

Recorded for the next slice / future cleanup; none blocks merge. Full detail in RETRO-010.md:
- **(a)** `reviewer:` front-matter absent on all 5 task specs — IO Plan-authoring gap (process item).
- **(b)** TASK-010-003 `started_at` clean-second (`2026-06-22T20:24:00Z`) — retro-012-014 metric-integrity lineage.
- **(c)** One-sided BLOCK proof — CLIENT-A own-row-but-wrong-status write via the request pool is the
  pre-existing admin-pool-trust-fence design (CHECK catches invalid values); retro candidate.
- **(d)** `parseSqlServerUrl` duplicated across e2e specs — DRY retro candidate.
- **(e)** Demo PNG byte-churn (retro-012-012) — main session reverts non-EPIC-010 PNGs before commit.
- **(f)** AC-LIFE-001-02 `@AC-` CLI-grep cosmetic tag mismatch (proven in `engagement.persistence.test.ts`).

## Upstream sign-off note — for the planning layer's COVERAGE write-back

**All 25 BRIEF-010 / EPIC-010 in-scope AC are independently validated and ready for `.planning/COVERAGE.md`
write-back** upon merge: AC-LIFE-001-01..03, AC-LIFE-002-01..03, AC-LIFE-003-01..03, AC-LIFE-004-01..03,
AC-LIFE-005-01..03, AC-LIFE-006-01..02, AC-AUTH-002-01..03, AC-AUTH-003-01..03, AC-AUTH-008-01..02.

Two AC carry pre-adjudicated, non-blocking traceability notes (both SDET-accepted as valid):
- **AC-LIFE-001-02** — proven in `engagement.persistence.test.ts` without the literal `@AC-` tag (cosmetic).
- **AC-LIFE-003-02** — verified-by-reference against the EPIC-008 onboarding-completion suite (correct; the one
  automatic transition is an EPIC-008 invariant left intact, not re-tested here).

AUTH-002/003/008 are the **feature sign-off** over the EPIC-005-built `pol_Engagement` isolation mechanism (the
mechanism was delivered in Phase 2; this slice signs off the feature AC across every access path and adds the
direct-reference proof). EPIC-010 is the **first** of seven Phase-3 epics (EPIC-011..015 still planned) — it
does **not** close Phase 3; no `phase_walkthrough`/`@video` obligation on this brief.

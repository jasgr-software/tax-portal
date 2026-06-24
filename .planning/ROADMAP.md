# Roadmap

> **Living document.** The authoritative *current* phasing of the product into vertically-sliced epics,
> MVP-first, driving toward full acceptance of every requirement's acceptance criteria. The Planning
> Agent maintains it (see `AGENT.md`); per-AC sign-off status lives in `COVERAGE.md`. Update the
> amendment history below whenever a phase's epic set or ordering changes.

## Status / amendment history

- **2026-06-24 (Phase 4 decomposed — the final feature phase is sliced; completing it completes the v1 POC)** —
  decomposed **Phase 4** (Messaging, notifications & the accountant dashboard) into **8 vertically-sliced epics,
  EPIC-016..023**, dependency-sequenced: **EPIC-016** in-portal notification feed (the dual-role spine, real-time,
  badge, read-tracking, 90-day retention — generalizes the EPIC-003 accountant-only `Notification` to clients) →
  **EPIC-017** per-engagement & general messaging (threads, plain-text, scanned attachments, per-viewer unread,
  archive-on-close) → **EPIC-018** email digest fallback (content-free, daily cap, suppression/default-on) →
  **EPIC-019** overdue detection & reminder engine (auto-detect + configurable cadence + reminder notification types;
  FILE-012 + DASH-008 + MSG-018) → **EPIC-020** dashboard home (metrics + activity feed + needs-action) → **EPIC-021**
  client/engagement navigation (client list, pipeline view, dashboard notes & flags) → **EPIC-022** admin settings &
  portal identity (engagement-letter template mgmt, portal names, v1 appearance) → **EPIC-023** accountant audit-trail
  read surface (closes the deferred REQ-NFR-010 read surface + REQ-NFR-011 integrity — **the last slice; completes the
  v1 POC**). **~119 AC newly placed** (`planned`): the MSG v1 remainder (REQ-MSG-001..012, -015..018, the MSG-013-02/
  -03/-05/-06 + MSG-014-01..07 remainders), the DASH v1 remainder (REQ-DASH-001..009, -013), the IDNT v1 verifiable set
  (REQ-IDNT-002/003/004/006), **REQ-NFR-010-01..06 + REQ-NFR-011** (the audit-trail feature/read surface, the user's
  explicit ask — landed in EPIC-023 so the POC does not close with an orphaned requirement), and **REQ-FILE-012**
  (carried in from Phase 3, needs the reminder engine). **Notification types placed at their source event** (not a
  horizontal "all types" epic): new-message → EPIC-017; document-upload/status-change/deliverable/accept-decline →
  EPIC-016; overdue/due-date/doc-request-created → EPIC-019. **Three deferrals:** **REQ-IDNT-001** (custom domain) →
  **Phase 5** (inseparable from the deferred production-hosting decision ADR-007; user-confirmed this run);
  **REQ-IDNT-005** (permanent client hard-delete) → **Deferred** (retention/legal precedence, unchanged); **REQ-MSG-019**
  (proactive lifecycle accountability) → **v2/Deferred** (EPIC-019 builds the overdue-document subset it generalizes).
  **Behavior contract:** reconciled the migrated legacy `flow-message-exchange` (stale "Epic 005" label retired →
  EPIC-016/017/018); authored `flow-notification-feed` and `flow-accountant-dashboard`; no new persona (jane-accountant +
  the two client personas already serve these slices). **Architecture flag:** the **real-time notification transport** has
  no dedicated ADR — consumed behind the ADR-023 mock seam for the POC; the architecture layer should own the transport
  choice before Phase-5 real-provider enablement. **Totals: 190 verified + ~119 newly `planned`.** **Next:**
  `/orchestrate EPIC-016` (the notification spine — the first ready Phase-4 slice).
- **2026-06-24 (EPIC-015 delivered — the destructive end of the document lifecycle lands; EPIC-015 CLOSES Phase 3)** —
  the post-retention-purge & legal-hold slice shipped (PR #99, squash merge `53b3444`). All **16 in-scope AC** signed
  off `verified` in `COVERAGE.md`: AC-FILE-013-01..06 (purge-eligible only after the 7-year window elapses /
  accountant-admin-only — **proven both ways**, the RLS admin-pool path + a portal no-affordance e2e / explicit
  confirmation required / **never automatic** on expiry — expiry creates eligibility, not deletion / eligible-but-unpurged
  stays accessible + retained / each purge audited and the **record survives**), AC-FILE-014-01..07 (hold on an
  engagement / hold on a client → all their engagements / a held engagement cannot be purged even post-expiry /
  indefinite, no auto-expire / lift restores eligibility if the window elapsed / place + lift each audited),
  AC-FILE-015-01/-02 (in-window client erasure = **access-revocation only**, never physical removal / physical
  destruction impossible until post-window + no-hold + explicit accountant-confirmed purge), and **AC-NFR-010-07** (the
  audit records — including the purge event — survive the purge). EPIC-015 → `delivered`. **Reviewed-lane hardening:**
  the `/pr-review` 3-lens panel caught a **purge-atomicity blocker** the in-slice gates missed — the purge DELETEs ran
  **off the audit transaction**, so a mid-purge failure could destroy rows while leaving no audit record (threatening
  AC-FILE-013-06 / AC-NFR-010-07). Fixed in-PR: the whole purge runs inside `withAuditTransaction` and rolls back
  **all-or-nothing**, with audit-survives-purge now proven by a dedicated rollback regression test. **Scope held (no
  over-claim):** EPIC-015 claims **only AC-NFR-010-07** from REQ-NFR-010 — the rest of the audit-trail **feature**
  (NFR-010-01..06: document-access + transition logging, the accountant-only audit *read* surface, audit retention) is a
  **Phase-4 audit-trail slice**; **OQ-014-01** (ADR-018 §2 temporal history) stays raised-upstream as a deferred
  cross-cutting mechanism, **not an unmet AC**; **wholesale client-identity hard-delete (REQ-IDNT-005)** stays deferred
  from v1. Sign-off basis [H] (COVERAGE): green required CI (`lint-and-typecheck` + `security-scan` + `test-admin` +
  `test-portal`) on PR #99 + post-merge `main` `53b3444` (CI run `28114529547` `success`; CodeQL `success`), plus the
  implementation engine's SDET acceptance-validation at the ADR-012 tiers against the real container stack (`pnpm
  ci:local` exit 0; container smoke PASS, env-caveat: the known P3019 local `DATABASE_URL` scheme block — retro-012-002,
  same basis as EPIC-014): tier-3 `purge-eligibility.test.ts` + `purge.integration.test.ts` + `purge.rls.test.ts` +
  `legal-hold.rls.test.ts` + `legal-hold.integration.test.ts`; tier-6 admin `purge-legal-hold.spec.ts` + portal
  `no-client-purge-hold.spec.ts`. Each in-scope AC's AC-id tag was re-confirmed by the validate phase via `git grep`
  against `53b3444` (all 16 ids resolve to one or more `*.test.ts`/`*.tsx`/`*.spec.ts` files). **EPIC-015 CLOSES
  Phase 3** — EPIC-009..015 are all `delivered`; every placed Phase-3 AC is now `verified`. **Phase-3 progress:
  EPIC-009 + EPIC-010 + EPIC-011 + EPIC-012 + EPIC-013 + EPIC-014 + EPIC-015 delivered — Phase 3 COMPLETE.** **Totals:
  190 placed / 190 verified / 0 planned.** **Next:** decompose **Phase 4** (in-portal notifications + activity feed +
  the audit-trail read surface). Run `/planning`.
- **2026-06-24 (EPIC-014 delivered — file-lifecycle governance lands: accountant-only soft-delete + the 7-year retention floor)** —
  the file-deletion / soft-delete / 7-year-retention slice shipped (PR #97, squash merge `37707ad`). All **10 in-scope
  AC** signed off `verified` in `COVERAGE.md`: AC-FILE-004-01/-02/-03 (only the accountant can delete; the
  **no-client-delete boundary proven both ways** — HARD `pol`-isolation RLS denies the client soft-delete write **and**
  a portal negative e2e proves no client-facing remove path exists), AC-FILE-006-01/-02/-03 (soft-delete leaves the
  working view / the file is retained-not-destroyed in-window / recoverable until retention elapses),
  AC-FILE-005-01/-02/-03 (the retention clock runs 7 years from engagement completion / in-window nothing removes a
  document **including an accountant deletion** / retention governs in-window), and AC-NFR-006-01 (system-enforced
  retention — the NFR twin of FILE-005). EPIC-014 → `delivered`. **Adherence obligations met/tracked:** ADR-019
  deletion-audit honored as an adherence obligation; the ADR-002 temporal-history deferral tracked via **OQ-014-01**
  (not an unmet AC). **Scope held:** the REQ-NFR-010 audit-trail **feature** AC (the accountant-only audit *read*
  surface) is NOT claimed (→ Phase 4); post-retention purge / legal hold (EPIC-015) correctly NOT built. Sign-off basis
  [G] (COVERAGE): green required CI (`lint-and-typecheck` + `security-scan` + `test-admin` + `test-portal`) on PR #97
  + post-merge `main` `37707ad` (CI run `28100653224` `success`; CodeQL `success` on `37707ad`), plus the
  implementation engine's SDET acceptance-validation at the ADR-012 tiers against the real container stack — RLS
  isolation 13/13, integration 14/14, retention 10/10, admin e2e 3/3, portal no-delete e2e 2/2; container smoke PASS
  (tier-3 `document.soft-delete-isolation.rls.test.ts` + `document.soft-delete.integration.test.ts` + `retention.test.ts`;
  tier-2 admin `documents/actions.test.ts`; tier-6 admin `file-deletion.spec.ts` + portal `no-client-delete.spec.ts`).
  Each in-scope AC's AC-id tag was re-confirmed by the validate phase via `git grep` against `37707ad` (all 10 ids
  resolve to one or more `*.test.ts`/`*.spec.ts` files). **EPIC-014 does NOT close Phase 3** — **EPIC-015**
  (post-retention purge & legal hold) remains the only un-delivered Phase-3 epic. **Phase-3 progress: EPIC-009 +
  EPIC-010 + EPIC-011 + EPIC-012 + EPIC-013 + EPIC-014 delivered; EPIC-015 `planned`.** **Totals: 190 placed / 174
  verified / 16 planned.** **Next:** **EPIC-015** is next-ready (`depends_on` EPIC-014 ✅ + EPIC-010 ✅) and **closes
  Phase 3**. Run `/orchestrate EPIC-015`.
- **2026-06-23 (EPIC-013 delivered — the two-way document exchange completes on top of EPIC-007's first storage path)** —
  the secure-file-exchange slice shipped (PR #95, squash merge `4aa26d0`). All **13 in-scope AC** signed off
  `verified` in `COVERAGE.md`: AC-FILE-001-01 (accountant upload), AC-FILE-001-03/-04 (both-party download —
  accountant any / client own engagement), AC-FILE-009-01/-02/-03 (replace → newest current → prior versions
  retained AND accessible), AC-FILE-010-01/-02/-03/-04 (organize into folders / create-rename-arrange / place in
  folder / folder management accountant-only behind a HARD-isolated `pol` policy), AC-FILE-011-01/-02/-03
  (top-level group by engagement / by tax year / navigate engagement→tax-year→folder). EPIC-013 → `delivered`.
  Net-new platform capabilities: both-party signed-URL **download authz** over the EPIC-007 storage path (ADR-009),
  a **version-history** model (new row + new key per version, never an overwrite — prior versions survive), an
  accountant-managed **folder structure** (proven both ways — tier-3 RLS + portal negative e2e), and **top-level
  engagement + tax-year organization** keyed on EPIC-012's `Engagement.taxYear`. **Reviewed-lane finding (hardened
  in the delivered build):** the `/pr-review` panel caught a **version-download IDOR** (blocker) the in-slice
  gates missed; fixed in-PR (`e903f51`, folded into the squash) — `requestDownloadUrlForVersionAction` now threads
  `versionId`, resolves the version under the request-pool/RLS, asserts `documentId` match, and signs only the
  server-resolved key, with cross-resource key-substitution negative tests on both surfaces. **Scope held:** file
  lifecycle governance (delete/soft-delete/retention → EPIC-014; purge/legal hold → EPIC-015) and the audit-trail
  **feature** AC (REQ-NFR-010 read surface → Phase 4) correctly NOT claimed — this slice **emits** download/access
  audit events (ADR-019) as an adherence obligation only. **EPIC-013 does NOT close Phase 3** (EPIC-014 + EPIC-015
  remain `planned`). **Phase-3 progress: EPIC-009 + EPIC-010 + EPIC-011 + EPIC-012 + EPIC-013 delivered; EPIC-014 +
  EPIC-015 `planned`.** **Totals: 190 placed / 164 verified / 26 planned.** **Next:** **EPIC-014** (file deletion,
  soft-delete & retention) is next-ready (`depends_on` EPIC-013 ✅ + EPIC-010 ✅); EPIC-015 follows. Run
  `/orchestrate EPIC-014`.
- **2026-06-23 (EPIC-012 delivered — engagements gain creation paths beyond the front door + the multi-participant model)** —
  the engagement-creation-paths & multi-participant slice shipped (PR #93, squash merge `5883fed`). All **20
  in-scope AC** signed off `verified` in `COVERAGE.md`: AC-DOOR-009-01..04 (signed-in **returning client** requests
  a new engagement from inside the Client Portal — active-services checklist, **on-file contact reused / no
  re-entry**, surfaces in the admin inbox), AC-DOOR-010-01..04 (**accountant initiates** directly for an existing
  client — no accept/decline; request pre-`accepted`; primary participant linked), AC-LIFE-010-01/-02 (multiple
  **concurrent** engagements persist and stay isolated), AC-LIFE-011-01..04 (**duplicate guard** per (client,
  service, tax year): warn + existing shown, navigate-or-override, **never silent**), AC-LIFE-012-01..03 +
  AC-AUTH-007-01..03 (**multiple participants**, each their own distinct account — never shared — all associating
  to the one shared engagement). EPIC-012 → `delivered`. Net-new platform capabilities: the `EngagementParticipant`
  entity + the **HARD `pol_EngagementParticipant`** scoped-table RLS policy, the **additive** extension of
  `sec.fn_engagement_access` (CLIENT branch owner→owner-OR-participant; owner branch byte-identical — AC-AUTH-003
  no-regression), the nullable **`Engagement.taxYear`** attribute (consumed by EPIC-013), and both creation seams
  riding the existing `EngagementRequest` + `withAuditTransaction` envelope (no Engagement fork). The
  **participant-isolation boundary was proven both ways** — HARD tier-3 RLS (participant reaches shared engagement;
  unrelated client + null read ZERO; ACCOUNTANT all; owner no-regression) **and** the tier-6 portal surface negative
  (unrelated client → 404). Sign-off basis [E] (COVERAGE): green required CI (`lint-and-typecheck` + `security-scan`)
  on PR #93 + post-merge `main` `5883fed` (CI ✅ + CodeQL ✅, `success`), plus the implementation engine's SDET
  acceptance-validation (gate 6 APPROVE) at the ADR-012 tiers against the real container stack — HARD tier-3
  `engagement-participant.client-isolation.rls.test.ts` + tier-3 `engagement-creation.test.ts` + tier-6 e2e
  (portal `returning-client-request` / `participant-shared-access`; admin `accountant-initiated-engagement` /
  `engagement-participants`); container smoke PASS. Each in-scope AC's AC-id tag was re-confirmed by the validate
  phase via `git grep` against `5883fed`. **Tracked forward item (NOT an unmet AC):** **OQ-012-01** — DECISION-E
  resolves a returning client's on-file contact via a prior-engagement JOIN (satisfies AC-DOOR-009-03 "no re-entry",
  verified); a durable user-profile-contact design is deferred to Phase 5 real auth. **Scope held** — anonymous
  front-door path (Phase 1), real Clerk invitations (Phase 5), per-participant differentiated permissions (v1 note),
  onboarding of the created engagement (Phase-2 epics) correctly NOT built. **EPIC-012 does NOT close Phase 3** (the
  FILE chain EPIC-013→014→015 remains `planned`; EPIC-013 depends on this slice's tax-year attribute).
  **Phase-3 progress: EPIC-009 + EPIC-010 + EPIC-011 + EPIC-012 delivered; EPIC-013..015 `planned`.** **Totals: 190
  placed / 151 verified / 39 planned.** **Next:** the FILE chain opens — **EPIC-013** (secure file exchange) is
  next-ready (`depends_on` EPIC-007 ✅ / EPIC-010 ✅ / EPIC-012 ✅); EPIC-014 → EPIC-015 follow. Run `/orchestrate EPIC-013`.

- **2026-06-23 (EPIC-011 delivered — the accountant gains working metadata on each engagement)** — the
  engagement-attributes slice shipped (PR #89, squash merge `9445e36`). All **9 in-scope AC** signed off
  `verified` in `COVERAGE.md`: AC-LIFE-007-01/-02/-03 (set / update / per-engagement **due date**),
  AC-LIFE-008-01/-02/-03 (record **accountant-only internal note** / visible only to the accountant / never shown
  to a client or participant — the security-sensitive boundary), AC-LIFE-009-01/-02/-03 (flag / unflag /
  per-engagement **priority**). EPIC-011 → `delivered`. Net-new platform capability: a separate one-to-many
  `EngagementNote` entity behind the **accountant-only** `pol_EngagementNote` RLS policy (modeled on the
  `pol_Notification`/`0004` family — no CLIENT branch by design), plus two additive `Engagement` columns
  (`dueDate`, `isPriority`). The notes-confidentiality boundary was **proven both ways** — tier-3 server-side RLS
  (CLIENT / owning-client / null all read ZERO) **and** the tier-6 `apps/portal` negative e2e (no notes seam in
  the portal). Sign-off basis [D] (COVERAGE): green required CI (`lint-and-typecheck` + `security-scan`) on PR #89
  + post-merge `main` `9445e36` (CI run `28025445472` `success`; advisory `test-portal`/`test-admin` ✅; CodeQL run
  `28025442436` ✅), plus the implementation engine's SDET acceptance-validation (Gate 6 PASS) at the ADR-012 tiers
  against the real container stack — tier-3 `engagement-attributes.test.ts` + the HARD `engagement-note.rls.test.ts`
  `pol_EngagementNote` matrix, tier-2/5 `actions.test.ts` + `EngagementAttributesPanel.test.tsx`, tier-6 admin
  `engagement-attributes.spec.ts` + portal `engagement-note-confidentiality.spec.ts`; container smoke PASS. Each
  in-scope AC's AC-id tag was re-confirmed by the validate phase via `git grep` against `9445e36`. **Scope held**
  — no dashboard/needs-action surfacing, no overdue reminders (Phase 4); engagement creation + multi-participant
  remain EPIC-012. **EPIC-011 does NOT close Phase 3.** **Phase-3 progress: EPIC-009 + EPIC-010 + EPIC-011
  delivered; EPIC-012..015 `planned`.** **Totals: 190 placed / 131 verified / 59 planned.** **Next:** **EPIC-012**
  (creation paths & multi-participant) is next-ready — `depends_on: EPIC-010` ✅ / EPIC-002 ✅ / EPIC-003 ✅; the
  FILE chain EPIC-013→014→015 follows. Run `/orchestrate EPIC-012`.

- **2026-06-22 (EPIC-010 delivered — Phase 3 proper opens; the engagement becomes lifecycle-managed)** — the
  engagement-lifecycle-pipeline & visibility slice shipped (PR #87, squash merge `7afd312`). All **25 in-scope
  AC** signed off `verified` in `COVERAGE.md`: AC-LIFE-001-01/-02/-03 (four-stage New→In Progress→Review→Complete
  pipeline — status invariant, New default, forward order), AC-LIFE-002-01/-02/-03 (simplified client-facing
  labels; internal Review hidden as "In Progress"; three client states), AC-LIFE-003-01/-02/-03 (manual
  accountant transitions; no auto-advance except the EPIC-008 onboarding transition; client cannot transition),
  AC-LIFE-004-01/-02/-03 (Review is an internal accountant stage — no client action, not an approval step),
  AC-LIFE-005-01/-02/-03 (two-confirmation completion gate — delivery + filing, both required),
  AC-LIFE-006-01/-02 (accountant reopen; client cannot reopen), AC-AUTH-002-01/-02/-03 (accountant full
  visibility), **AC-AUTH-003-01/-02/-03 (client own-data isolation — the HARD per-policy `pol_Engagement`
  matrix + the direct-reference fetch-by-id proof; the isolation *mechanism* was built in Phase 2 (EPIC-005/007)
  and these are the *feature* AC signed off here over that mechanism, not a second count)**, and
  AC-AUTH-008-01/-02 (indefinite client access after completion). EPIC-010 → `delivered`. The single automatic
  transition (EPIC-008 onboarding New→In Progress) is left intact as the one exception to manual control
  (AC-LIFE-003-02 verified-by-reference against the intact EPIC-008 suite). Sign-off basis [C] (COVERAGE): green
  required CI (`lint-and-typecheck` + `security-scan`) on PR #87 + post-merge `main` `7afd312` (CI run
  `27988679054`; advisory `test-portal`/`test-admin` ✅; CodeQL ✅), plus the implementation engine's SDET
  acceptance-validation at the ADR-012 tiers against the real container stack — tier-3 `packages/db`
  (`engagement.lifecycle.transition.test.ts`, the HARD `engagement.lifecycle.rls.test.ts` `pol_Engagement`
  matrix incl. direct-reference denial, `engagement.persistence.test.ts`), tier-2/5 `engagement-label.test.ts`,
  tier-6 e2e (admin `engagement-lifecycle.spec.ts` 9/9, portal `engagement-labels.spec.ts` 9/9, portal
  `engagement-isolation.spec.ts` 4/4, cross-app), container smoke PASS. **This is the first Phase-3-proper
  slice delivered** (EPIC-009 was a cross-cutting PoC sign-in lane that did not advance Phase 3 proper). **Phase-3
  progress: EPIC-009 + EPIC-010 delivered; EPIC-011..015 `planned`.** **Totals: 190 placed / 122 verified / 68
  planned.** **Next:** **EPIC-011** (attributes) and **EPIC-012** (creation paths & multi-participant) are both
  next-ready — `depends_on: EPIC-010` ✅ (EPIC-012 also needs EPIC-002 ✅ / EPIC-003 ✅); the FILE chain
  EPIC-013→014→015 follows. Run `/orchestrate EPIC-011` (or EPIC-012).

- **2026-06-21 (EPIC-009 delivered — the PoC two-role sign-in lane ships; mock realization)** — the dev
  sign-in lane realizing **REQ-AUTH-013** against the `AUTH_PROVIDER=mock` seam (a usable in-browser sign-in
  page + role/user switcher over the existing mock-session seam, wired to the demo seed accounts, **inert under
  the real provider**) — plus the consolidated **REQ-AUTH-010** role-based-redirect AC — shipped (PR #71, squash
  merge `169b09e`). **All 5 in-scope AC `verified` in `COVERAGE.md`:** the 2 net-new sign-in/sign-out AC
  (AC-AUTH-013-01 sign-in → role-appropriate landing; AC-AUTH-013-02 global sign-out → unauthenticated, re-auth
  on both surfaces) flipped `planned`→`verified` this slice, and the 3 redirect AC (AC-AUTH-010-01/-02/-03,
  consolidated from EPIC-004) stay `verified` with PR #71 confirmation appended (no double-count). **EPIC-009 →
  `delivered`.** **Honest-accounting scope (no over-claim):** this is a **dev-lane PoC against the MOCK
  provider** — AC-AUTH-013-01/-02 are verified *vs the mock*; the **real-provider (Clerk) realization stays
  outstanding at Phase 5** (Production Readiness), and the **2FA AC remain deferred to Phase 5** (REQ-AUTH-004/
  005). The dev-lane affordances (seeded-account picker, role/user switcher, inert-under-`clerk` guard) are
  EPIC-009 dev-acceptance tooling, not product AC. **Phase context:** EPIC-009 is a **cross-cutting PoC sign-in
  slice — it does NOT close or advance Phase 3 proper**; the engagement-lifecycle + FILE work (EPIC-010..015) is
  still entirely `planned`. It makes every later PoC slice human-demoable as either role. Sign-off basis [B]
  (COVERAGE): reviewed application-code lane — code-standards audit `approve` (0 violations) → `/pr-review`
  panel (1 major + 5 minor + 2 nit; blockers/majors fixed in `5551052`, 1 minor deferred as a tracked
  follow-up) → `/pr-fix` green → merged on green required CI (`lint-and-typecheck` + `security-scan`), plus the
  SDET's independent re-run of the in-scope auth e2e against the live docker-compose stack (portal/admin
  `sign-in-lane.spec.ts` 6/6 + 5/5, global-sign-out tier-6 both surfaces, `cross-app-redirect.spec.ts` 5/5).
  **Totals: 190 placed / 97 verified / 93 planned.** **Next:** Phase 3 proper begins — `/orchestrate EPIC-010`
  (its `depends_on` EPIC-005 ✅ + EPIC-008 ✅ are satisfied).

- **2026-06-21 (EPIC-009 re-decomposed — the sign-in lane now carries acceptance criteria; REQ-AUTH-010 consolidated)** —
  Per user direction, **EPIC-009 is no longer an "owns-no-product-AC" enabler** — it is the **dev-capacity
  realization of the login requirement**, and login must carry acceptance criteria (the **2FA slice stays the
  deferred half**, Phase 5). Two changes: (1) a **new requirement REQ-AUTH-013 "User sign-in and sign-out"**
  was authored in `.requirements/` (provider-agnostic: AC-AUTH-013-01 = post-sign-in landing on the
  role-appropriate surface; AC-AUTH-013-02 = sign-out → unauthenticated state) and **EPIC-009 owns its 2 AC**,
  realized against the **mock** provider (real Clerk re-validation → Phase 5). (2) **REQ-AUTH-010** (role-based
  redirect, AC-AUTH-010-01/-02/-03) was **consolidated from EPIC-004 into EPIC-009** so the whole sign-in story
  (sign-in/sign-out + role-based landing) lives in one epic — the redirect *mechanism* was delivered by EPIC-004
  (PR#38, still `verified`), only AC **ownership** moved (not a regression). The dev-lane affordances (sign-in
  page listing seeded accounts, role/user switcher, the inert-under-`AUTH_PROVIDER=clerk` guard) stay as
  EPIC-009 **dev-acceptance** scenarios — not product AC. **Net coverage:** +2 AC placed (AUTH-013-01/-02,
  `planned`); EPIC-009 = 5 AC (3 already `verified` + 2 `planned`); EPIC-004 → 8 in-scope verified AC (still
  `delivered`); totals 190 placed / 95 verified / 95 planned. EPIC-009 is now a normal AC-bearing epic that
  passes the orchestration readiness gate. **Next:** `/orchestrate EPIC-009` (re-gates clean).

- **2026-06-21 (Phase 3 FILE remainder decomposed — the follow-up pass; Phase 3 now fully sliced)** —
  Authored the deferred **FILE-exchange + retention/legal-governance** epics, completing the Phase-3
  decomposition. Three epics, all `planned`: **EPIC-013** (secure file exchange — accountant upload,
  both-party download, accountant-managed folders, top-level organization by engagement & tax year, version
  history; the REQ-FILE-001 remainder + FILE-009/010/011; 13 AC), **EPIC-014** (file deletion, soft-delete &
  7-year retention — accountant-only delete, soft-delete, the in-window retention floor; FILE-004/006/005 +
  NFR-006; 10 AC), **EPIC-015** (post-retention purge & legal hold — accountant-confirmed/never-automatic
  purge, legal hold, retention-vs-erasure precedence, audit-survives-purge; FILE-013/014/015 + NFR-010-07;
  16 AC). **39 AC newly placed.** **FILE domain now fully placed** (no FILE orphans except REQ-FILE-012, which
  is Phase 4). **NFR placements:** AC-NFR-006-01 (system-enforced retention) → EPIC-014; AC-NFR-010-07
  (audit survives purge) → EPIC-015 — the two NFR AC these slices *exclusively* demonstrate. The **rest of
  REQ-NFR-010** (the audit-trail feature — document-access/transition logging, the accountant-only audit
  *read* surface, audit retention) stays orphaned for a **dedicated audit-trail slice (Phase 4)**; these
  epics **emit** the relevant audit events per ADR-019 as an adherence obligation but do not claim those AC
  (avoids fragmenting one AC across un-built surfaces). Behavior contract: authored `flow-document-lifecycle`
  (EPIC-014/015); reconciled `flow-file-exchange`'s stale "Phase 4 stub / Epic 004" label → EPIC-007/013/014
  + Phase-4 (B4); added `flow-document-lifecycle` to jane's linked flows. **Dependencies:** EPIC-013 needs
  EPIC-007 ✅ + EPIC-010 + EPIC-012 (tax-year); EPIC-014 needs EPIC-013 + EPIC-010; EPIC-015 needs EPIC-014 +
  EPIC-010 — a linear chain after the lifecycle core. **Next:** Phase 3 is fully decomposed (EPIC-009..015);
  ready for `/orchestrate` (EPIC-010 first; the FILE chain EPIC-013→014→015 follows EPIC-010/012).

- **2026-06-21 (Phase 3 lifecycle-core decomposed — LIFE epics authored; FILE-exchange + retention/governance deferred to a follow-up pass)** —
  Per user direction (this run: "lifecycle core first"), Phase 3 is decomposed in two passes. **This pass authors the
  engagement-lifecycle (LIFE) core** as three vertical slices, all `planned`:
  **EPIC-010** (engagement lifecycle pipeline & visibility — the four-stage New→In Progress→Review→Complete pipeline,
  manual transitions, simplified client-facing labels, the two-confirmation completion gate, accountant-only reopen,
  plus the AUTH-002/003/008 visibility/isolation **feature** AC whose mechanism Phase 2 stood up),
  **EPIC-011** (engagement attributes — due date, accountant-only internal notes, priority flag),
  **EPIC-012** (engagement creation paths & multi-participant — returning-client request DOOR-009, accountant-initiated
  DOOR-010, the duplicate guard LIFE-011, multiple concurrent engagements LIFE-010, and multi-participant engagements
  LIFE-012/AUTH-007). **54 AC newly placed** (EPIC-010 25, EPIC-011 9, EPIC-012 20). **Deferred to a later `/planning`
  pass** (per user direction): the **FILE-exchange + retention/legal-governance** epics — REQ-FILE-001 remainder
  (accountant upload + both-party download), REQ-FILE-004/005/006/009/010/011/013/014/015. **Two routine planning calls
  recorded:** (1) **REQ-FILE-012** (overdue document-request flagging + configurable reminder cadence) is routed to
  **Phase 4** — it depends on the reminder/notification engine (REQ-MSG-018, REQ-DASH-008), not the file-exchange
  surface; (2) the engagement **tax-year** attribute first emerges in **EPIC-012** (the (client, service, tax year)
  identity tuple for the duplicate guard) and is consumed later by REQ-FILE-011's top-level organization.
  Behavior contract: authored `flow-engagement-lifecycle` (EPIC-010/011); reconciled `flow-engagement-request`'s stale
  "deferred beyond the MVP" / "Epic 002" labels for the DOOR-009/010 branches to **EPIC-012**; refreshed `jane-accountant`
  and `martha-and-james` linked-flows. **Next:** Phase 3 lifecycle core is ready for `/orchestrate` (EPIC-010 first —
  its `depends_on` EPIC-005 ✅ + EPIC-008 ✅ are satisfied; EPIC-009, the PoC sign-in lane, can be built first/anytime).

- **2026-06-20 (EPIC-009 = PoC two-role sign-in lane; all real-provider/production work → end-of-cycle Production Readiness placeholder)** —
  Project stance confirmed (user): this product is built **only in a development capacity as a proof of
  concept**; **production readiness is a single end-of-cycle follow-up**, and external providers stay
  **mocked as long as possible**. Accordingly: (1) **EPIC-009 is reshaped** (it never shipped — an in-session
  draft) from the earlier "real Clerk login enablement" into a **PoC two-role sign-in lane**: a dev sign-in
  page + role/user switcher over the existing mock-session seam (`AUTH_PROVIDER=mock`), wired to the demo seed
  accounts and **inert under the real binding**, so the PoC can be driven and demoed as both the Accountant
  and a Client without the devtools hack. It owns **no product AC** (a dev-capacity enabler) and has no
  dependency on the LIFE/FILE work — it can be built first. (2) New **Phase 5 — Production Readiness**
  *(placeholder)* collects ALL real-provider / go-live work at the end of the cycle: real Clerk login + 2FA +
  real invitations, real Docuseal e-sign, real malware scanner, real email, the production host (ADR-007),
  and hardening — **none minted as epics yet**. The Deferred 2FA item and the COVERAGE "Provider
  re-validation" note are re-pointed from EPIC-009 to Phase 5.

- **2026-06-20 (EPIC-008 delivered — Phase-2 capstone ships; 🎉 PHASE 2 COMPLETE)** — the onboarding-completion
  slice shipped (PR #55, squash merge `7fe2872`). All **8 in-scope AC** signed off `verified` in `COVERAGE.md`:
  AC-ONBD-005-01/-02 (onboarding complete iff all three steps done; no transition while any step is unsatisfied),
  AC-ONBD-006-01/-02/-03 (engagement auto-moves New → In Progress; no accountant input; fires exactly once,
  idempotent under concurrency), AC-ONBD-007-01/-02 (accountant-only completion notification identifying the
  engagement + client by name), AC-MSG-013-04 (the `onboarding_completed` notification type, dual-tagged with
  AC-ONBD-007-01). EPIC-008 → `delivered`. **Delivered with ZERO schema migration** — behavior over existing
  shapes (no net-new entity, column, RLS policy, or provider seam): a derived completion predicate over the three
  existing `resolveOnboarding` `done` flags + a privileged atomic fire-once seam (`status='New'`-guarded UPDATE →
  notification INSERT → audit, one `withAuditTransaction`) reusing the EPIC-003 `Notification` + accountant-only
  `0004` policy + the ADR-019 audit seam. The single automatic transition in the engagement lifecycle.
  **AC-ONBD-005-01's browser-e2e tier deferred to BUG-008-001** (pre-existing EPIC-007/ADR-009 Azurite infra
  defect, not a regression; carried for sign-off by its tier-3 integration proof). The 3-lens PR-review panel
  posted APPROVE (0 blocker / 0 major / 6 minor·nit after dedupe; all dispositioned non-blocking, 3 actionable
  carried to RETRO-008). **🎉 PHASE 2 (the onboarding gate) COMPLETE — EPIC-005/006/007/008 all delivered;
  44/44 placed Phase-2 AC verified; 95/95 placed Phase-1+2 AC verified.** A newly accepted client now signs in,
  e-signs the letter (hard gate), completes the intake questionnaire, uploads documents against the checklist —
  and when all three steps are done the engagement automatically moves to In Progress and the accountant is
  notified, with no manual action. **Next:** Phase 3 (engagement lifecycle — LIFE domain) is the next phase to
  decompose; run `/planning` to author it. **Phase-2 progress: 4/4 epics, 44/44 AC verified.**

- **2026-06-19 (EPIC-007 delivered — third Phase-2 slice ships; the first secure file-storage path)** — the
  initial-document-upload slice (accountant-authored checklist + client uploads against it via the portal's
  first secure, malware-scanned, non-public file-storage path — step 3 of the onboarding sequence) shipped
  (PR #52, squash merge `eaa5875`). All **19 in-scope AC** signed off `verified` in `COVERAGE.md`:
  AC-ONBD-004-01/-02/-03/-04 (checklist shown, outstanding-vs-provided, client uploads to fulfill, step
  satisfied when required items provided), AC-FILE-007-01/-02/-03 (accountant authors labeled document
  requests; client sees + fulfills), AC-FILE-008-01/-02/-03 (per-engagement checklist; outstanding distinct
  from fulfilled; a fulfilled request leaves the outstanding set), AC-FILE-001-02/-05 (client upload +
  engagement isolation), AC-FILE-002-01 (any file type), AC-FILE-003-01/-02/-03/-04 (encrypted at rest,
  authz-required retrieval, no public path, time-limited grant), AC-NFR-009-01/-02 (scanned before available;
  malicious withheld + uploader informed). EPIC-007 → `delivered`. Net-new platform capabilities: the **first
  `FileStorage` port + Azurite adapter (the first stored-bytes path)**, the **first `FileScanner` port
  (mock-first)**, the **third client-isolation RLS policy** (`pol_Document`/`0007` — the client-owned-row
  family is now Engagement + QuestionnaireAnswer + **Document**), the **two-phase authorize-then-sign upload +
  scan-before-available pipeline** (promote to `active` only on clean+valid; `infected`/`indeterminate` never
  signable), the **checklist read model + document-step satisfaction** (zero requests → vacuously satisfied;
  the EPIC-005 letter hard gate NOT weakened), and the **ADR-019/022 audit + rate-limit caller-binding** seam
  split. **REQ-AUTH-003 feature AC remain Phase-3-owned** (the isolation mechanism + its HARD per-policy test
  land here; the feature AC are not claimed). Sign-off basis [A]: green required CI (`lint-and-typecheck` +
  `security-scan`) on the PR #52 head + post-merge `main` `eaa5875` (CI run `27844771147` — `lint-and-typecheck`/
  `security-scan`/`test-portal`/`test-admin` all ✅; CodeQL run `27844771086` ✅), plus the implementation
  engine's SDET acceptance-validation under the mandated gherkin methodology (tier-3 integration against the
  real SQL Server + Azurite stack incl. the HARD third client-isolation policy `0007` and the scan-before-
  available fail-closed proofs; tier-6 e2e both surfaces + cross-app; CI gate `pnpm ci:local` 836/836). The
  3-lens PR-review panel found + the fixer cleared **2 majors** — headlined by a cross-tenant ownership gap in
  the upload-completion path (`completeUpload` now re-asserts engagement ownership before promotion, with a
  dedicated regression test, defense-in-depth atop the `0007` RLS policy). **EPIC-008 (onboarding completion →
  automatic New→In Progress + accountant notification) is now the next-ready Phase-2 slice** — its
  `depends_on` (EPIC-005 ✅, EPIC-006 ✅, EPIC-007 ✅) is fully satisfied. It is the **Phase-2 capstone**.
  **Phase-2 progress: 3/4 epics, 36/44 AC verified.** **Next:** `/orchestrate EPIC-008`.

- **2026-06-18 (EPIC-006 delivered — second Phase-2 slice ships)** — the intake-questionnaire slice
  (per-service-type templates + client completion — step 2 of the onboarding sequence) shipped (PR #50, squash
  merge `e55f8c5`). All **7 in-scope AC** signed off `verified` in `COVERAGE.md`: AC-ONBD-003-01/-02/-03/-04
  (client presented the questionnaire matching their engagement's service type behind the EPIC-005 letter gate,
  one template per service type, completes & submits, answers recorded one-per-engagement, step satisfied) and
  AC-DASH-012-01/-02/-03 (accountant authors/edits a per-service-type template from the Tax Portal, one per
  service type, edits retained). EPIC-006 → `delivered`. Net-new platform capabilities: the **second
  client-owned-row family + second client-isolation RLS policy** (`QuestionnaireAnswer` one-per-engagement;
  `pol_QuestionnaireAnswer` mirroring EPIC-005's `0005`), the **first per-service-type template**
  (`QuestionnaireTemplate`, `@@unique([serviceId])`, accountant-owned BLOCK-only `pol_QuestionnaireTemplate`),
  and **server-side engagement→service-type→template resolution** (no client-supplied ids — the client cannot
  pick their questionnaire), with the letter hard gate **NOT weakened**. **REQ-AUTH-003 feature AC remain
  Phase-3-owned** (the isolation mechanism + its mandatory per-policy HARD test land here; the feature AC are
  not claimed). Sign-off basis [A]: green required CI (`lint-and-typecheck` + `security-scan`) on the PR #50
  head `a7ef3d6` + post-merge `main` `e55f8c5` (CI run `27796565080` — `lint-and-typecheck`/`security-scan`/
  `test-portal`/`test-admin` all ✅; CodeQL run `27796564765` ✅), plus the implementation engine's SDET
  acceptance-validation under the mandated gherkin methodology (tier-3 integration against the real SQL Server
  container incl. the HARD second client-isolation policy `pol_QuestionnaireAnswer` 7/7; e2e admin 35/35,
  portal 36/36, cross-app 11/11). **EPIC-007 (initial document upload) is now the next-ready Phase-2 slice** —
  its `depends_on: EPIC-005` was already satisfied and EPIC-006 was a parallel sibling, not a dependency.
  EPIC-008 remains the capstone (still needs EPIC-007; EPIC-006 ✅). **Phase-2 progress: 2/4 epics, 17/44 AC
  verified.** **Next:** `/orchestrate EPIC-007`.

- **2026-06-18 (EPIC-005 delivered — first Phase-2 slice ships)** — the client onboarding spine +
  engagement-letter e-sign gate shipped (PR #48, squash merge `f879da2`). All **10 in-scope AC** signed off
  `verified` in `COVERAGE.md`: AC-ONBD-001-01/-02/-03 (three-step onboarding sequence + letter hard gate),
  AC-ONBD-002-01/-02/-03/-04 (engagement-letter e-sign served/signed/recorded/gate-satisfied), and
  AC-IDNT-007-01/-02/-03 (accountant-editable letter template). EPIC-005 → `delivered`. Net-new platform
  capabilities: the **minimal Engagement entity** (created on accept → status New — the first client-owned
  rows) and the **first client-isolation RLS policy** (CLIENT-A ≠ CLIENT-B, null=ZERO, ACCOUNTANT=all + a
  cross-client BLOCK write proof), plus the **mocked e-sign provider seam** (real Docuseal deferred per the
  standing mock-integration directive — same pattern as EPIC-004's mocked auth). Sign-off basis [A]: green
  required CI (`lint-and-typecheck` + `security-scan`) on the PR head + post-merge `main` `f879da2` (`CI` +
  CodeQL), plus the implementation engine's SDET acceptance-validation under the mandated gherkin methodology
  (tier-3 integration against the real SQL Server container incl. the first client-isolation RLS policy; e2e
  portal 33/33, admin 32/32, cross-app 10/10). **EPIC-006 (intake questionnaire) and EPIC-007 (initial
  document upload) are now unblocked** — their `depends_on: EPIC-005` is satisfied; both are next-ready and
  parallelizable. EPIC-008 remains the capstone (still needs EPIC-006 + EPIC-007). **Phase-2 progress: 1/4
  epics, 10/44 AC verified.** **Next:** `/orchestrate EPIC-006` (or EPIC-007).

- **2026-06-17 (Phase 2 decomposed — onboarding gate sliced into 4 epics)** — Authored **EPIC-005**
  (onboarding spine + engagement-letter e-sign gate), **EPIC-006** (intake questionnaire — per-service-type
  templates), **EPIC-007** (initial document upload — checklist + first secure file-storage path + malware
  scan), and **EPIC-008** (onboarding completion → automatic New→In Progress transition + accountant
  notification). All four `planned`. **44 AC newly placed**: ONBD-001..007 (the whole v1 ONBD domain),
  IDNT-007 (letter template), DASH-012 (questionnaire templates), FILE-007/008 + a client-upload/isolation
  subset of FILE-001 + FILE-002 + FILE-003 (first file-storage slice's security set), NFR-009 (malware
  scan), and AC-MSG-013-04 (onboarding-complete notification, pulled from the Phase-4 orphan set — same
  pattern as EPIC-003 owning MSG-013-01). **Engagement substrate decision (user, 2026-06-17):** Phase 2
  introduces a *minimal* Engagement entity (created on acceptance → status New; the one automatic
  transition to In Progress on completion); the full four-stage pipeline + manual transitions +
  client-facing labels (REQ-LIFE-001/002/003) stay **Phase 3**. **Splits:** REQ-FILE-001 splits Phase 2
  (client upload + isolation) / Phase 3 (accountant upload + download); REQ-MSG-013 now spans EPIC-003
  (-01) / EPIC-008 (-04) / Phase 4 (-02/-03/-05/-06). **Two boundary flags for the next run / user:** (1)
  REQ-AUTH-003 (client-data RLS isolation) — its enabling slice (first client-owned rows) now lands in
  Phase 2; the isolation mechanism + per-policy test are built in EPIC-005/007 but the AUTH-003 *feature*
  AC remain Phase-3-owned. (2) REQ-DOOR-009 (returning-client in-portal request) — a client portal home now
  exists in Phase 2, so it is newly buildable, but kept Phase 3 (it is a distinct feature, not part of the
  onboarding gate). **Third-party integrations mocked (standing user directive, 2026-06-17):** e-sign
  (EPIC-005) and the malware scanner (EPIC-007) ship behind **mocked provider seams**; the matching AC are
  delivered/`verified` against the mock and the real Docuseal / real-scanner wiring (and their ADRs) are
  deferred "enablement" slices — same pattern as EPIC-004's mocked auth → deferred 2FA. So **no third-party
  ADR blocks dispatch**; the e-sign/scanner ADRs become upstream architecture follow-ups, not Phase-2
  gates. `flow-onboarding` reconciled from its stale "Phase 3 / Epic 003" label to the real Phase-2 epics.
  **Next:** Phase 2 is ready for `/orchestrate` (EPIC-005 first — no Phase-2 predecessor).

- **2026-06-17 (EPIC-003 delivered — 🎉 Phase 1 / MVP COMPLETE)** — the accountant request inbox shipped (PR #42,
  squash merge `ec151cb`). All **20 in-scope AC** signed off `verified` in `COVERAGE.md`: AC-DOOR-005-01/-02/-03
  (new-request accountant notification), AC-DOOR-006-01..05 (view/accept/decline/only-accountant/decide-once),
  AC-DOOR-007-01..04 (acceptance invitation → client-surface sign-up, tied to the request, no account before
  sign-up), AC-DOOR-008-01..04 (decline reason captured/emailed/retained), AC-DASH-011-01/-02/-03 (inbox by
  state), AC-MSG-013-01 (new-request notification). EPIC-003 → `delivered`. Net-new platform capabilities: the
  first **transactional-email seam** (`packages/email`, SMTP→Mailhog; Resend deferred) and the first **in-portal
  notification** (`Notification` entity + accountant-only `sec.pol_Notification`). Sign-off basis [A]: green
  required CI (`lint-and-typecheck` + `security-scan`) on the PR head + post-merge `main` `ec151cb`, plus the
  SDET's dev-time tier-3/e2e (incl. Mailhog) acceptance-validation (20/20). **This completes the Phase-1 MVP
  front-door spine — EPIC-001/004/002/003 all delivered, 51/51 placed Phase-1 AC verified.** A prospect can
  browse services and submit a request; the accountant signs in, is notified, reviews, and accepts (→ invite)
  or declines (→ reason email); an accepted prospect can create a client account. **Next:** Phase 2 (onboarding
  gate) is undecomposed — a future Planning Agent run slices it before the next `/orchestrate`. The deferred
  "2FA enablement" Phase-1 slice (4 deferred AC) also remains.

- **2026-06-16 (EPIC-002 delivered)** — Phase 1's accountant services-catalog management slice shipped (PR #40,
  squash merge `70ea10e`). All **7 in-scope AC** signed off `verified` in `COVERAGE.md`: AC-DOOR-002-01/-02/-03
  (accountant add/edit/deactivate persist), AC-DOOR-002-05 (accountant-only write boundary — the new
  `sec.fn_service_write_access` BLOCK predicate, which **closed EPIC-001's latent write-predicate gap**;
  CLIENT + anonymous rejected at tier-3 RLS 10/10), and AC-DASH-010-01/-02/-03 (the same capability from the
  admin UI, dual-tagged with the DOOR journeys). EPIC-002 → `delivered`. Sign-off evidence basis: green
  required CI (`lint-and-typecheck` + `security-scan` + `test-admin` + `test-portal` + CodeQL) on the PR head
  and the post-merge `main` run, plus the SDET's dev-time tier-3 RLS + e2e runs against the real SQL Server
  container — the user-accepted CI-as-the-gate substitution for the env-blocked container smoke (same basis as
  EPIC-001/004; see COVERAGE note [A]). REQ-DOOR-002 is now fully covered (all 5 AC `verified` — -04 in EPIC-001,
  -01/-02/-03/-05 in EPIC-002). **EPIC-003 remains the only un-delivered Phase-1 epic** — already unblocked
  (EPIC-001 + EPIC-004 delivered); EPIC-002 was not a dependency of EPIC-003, so its state is unchanged
  (`planned`, ready to build).

- **2026-06-16 (EPIC-004 delivered)** — Phase 1's auth & two-role-model identity spine shipped (PR #38, squash
  merge `0444551`). **11/15 in-scope AC** signed off `verified` in `COVERAGE.md` (REQ-AUTH-001/-005-02/-006/
  -009/-010) *(superseded 2026-06-21: REQ-AUTH-010's 3 redirect AC were consolidated into EPIC-009 — EPIC-004
  now owns 8 verified in-scope AC; see the top amendment entry)*; the **4 2FA AC** (AC-AUTH-004-01/-02/-03 + AC-AUTH-005-01) remain `deferred` to a future
  Phase-1 "2FA enablement" slice (2FA not ready to deploy; the slice shipped with the auth provider mocked, a
  user-approved brief deviation). EPIC-004 → `delivered`. Sign-off evidence basis: green required CI
  (`lint-and-typecheck` + `security-scan`) plus `test-admin` + `test-portal` on the PR head and the post-merge
  `main` run — the user-accepted CI-as-the-gate substitution for the env-blocked container smoke (same basis as
  EPIC-001; see COVERAGE note [A]). **EPIC-002 and EPIC-003 are now unblocked** — their `depends_on: EPIC-004`
  is satisfied. Next ready: EPIC-002 (admin catalog) and EPIC-003 (request inbox); EPIC-003 also needs the
  requests EPIC-001 produces (already delivered), so both are buildable.

- **2026-06-15 (EPIC-001 delivered)** — Phase 1's first slice shipped: the public front door (PR #35, squash
  merge `f7f6c9d`). All 13 EPIC-001 AC signed off `verified` in `COVERAGE.md`; EPIC-001 → `delivered`. Sign-off
  evidence basis (precedent set this run): SDET independent acceptance-validation against the real
  docker-compose stack (tier-3 RLS 4/4, e2e 12/12, 28/28 unit/integration) + green required CI; per-PR CI does
  not yet run the AC test tiers — tracked follow-up (see COVERAGE note [A]). Next ready: EPIC-004 (the other
  dependency-free Phase-1 slice); EPIC-002/003 unblock once EPIC-004 delivers. *(Superseded 2026-06-16:
  EPIC-004 delivered; EPIC-002 and EPIC-003 are now unblocked — see the entry above.)*

- **2026-06-14** — Roadmap seeded. Phasing strategy established; Phase 1 (MVP) opened with the public
  front-door slice (EPIC-001 authored). Later phases and the backlog sketched as named epics to be
  authored on subsequent Planning Agent runs. Sources: `.requirements/` (DOOR/AUTH/… domains),
  `.architecture/` (ADR-001..022).
- **2026-06-14 (MVP confirmed + Phase 1 fully authored)** — User confirmed the MVP boundary as the
  **front-door spine** (front door + accountant auth + catalog management + request inbox; onboarding,
  lifecycle, file exchange, messaging, and dashboard deferred to Phases 2–4). Authored **EPIC-002**
  (services-catalog management), **EPIC-003** (accountant request inbox), and **EPIC-004** (auth &
  two-role model); upgraded **EPIC-001** with its Given/When/Then acceptance scenarios + persona/flow
  links. All four Phase-1 epics are now `planned`. The newly-added **v2 requirements** (REQ-ONBD-008,
  REQ-FILE-016, REQ-LIFE-013, REQ-MSG-019, REQ-LIFE-014, REQ-AUTH-011/012) are explicitly **excluded from
  the MVP** and are not yet phased. Several MVP-adjacent AC were **deferred** for lack of an MVP home
  (AUTH-002/003/007/008, DOOR-009/010, MSG-013-02..06, MSG-014) — see `COVERAGE.md`. Behavior contract:
  reconciled the stale "Epic 00x" labels on the migrated legacy flows (`flow-engagement-request`,
  `flow-first-sign-in`, `flow-role-redirect`) against the current epic numbering.

## Phasing strategy

- **Phase 1 = MVP.** The thinnest end-to-end product that demonstrates the portal's reason to exist:
  a prospective client reaches the public front door, sees the offered services, and submits an
  engagement request; the accountant signs in and acts on it (accept/decline). Each later phase is a
  shippable vertical increment that adds a coherent capability.
- **Vertical slices only.** Every epic is a thread through the whole stack delivering user-visible value;
  no horizontal "build the schema / all the routes" epics.
- **Dependencies gate placement.** An epic never lands in a phase before the epics it `depends_on`.
- **Done = signed off.** A phase is complete when every in-scope AC of its epics is `verified` in
  `COVERAGE.md` (a passing tagged automated test in CI). Full acceptance is reached when no source AC
  remains orphaned or unverified.

## Phase 1 — MVP: the front door works end to end

**Milestone:** a prospect can browse services and submit a request; the accountant can sign in, get
notified, and accept or decline. Requirement themes: the public front door (DOOR), the accountant's
authenticated surface and the two-role model (AUTH), and the in-portal notification spine (MSG).

| Epic | Slice | Status | Depends on |
|---|---|---|---|
| **EPIC-001** | Public front door — browse active services & submit an engagement request (anonymous, no account) | `delivered` (PR #35, `f7f6c9d`, 2026-06-15) | — |
| **EPIC-004** | Authentication & the two-role model — accountant signs in; ACCOUNTANT/CLIENT roles; invitation-only client accounts; built the role-based cross-app redirect *mechanism*. 2FA deferred to Phase 5; **REQ-AUTH-010 (3 redirect AC) consolidated into EPIC-009 on 2026-06-21** (mechanism stays here, AC ownership moved). | `delivered` (PR #38, `0444551`, 2026-06-16) — **8** in-scope AC verified; 4 2FA AC deferred; 3 redirect AC → EPIC-009 | — |
| **EPIC-002** | Accountant manages the services catalog (admin surface CRUD: add/edit/deactivate) | `delivered` (PR #40, `70ea10e`, 2026-06-16) — 7/7 in-scope AC | EPIC-004 ✅ |
| **EPIC-003** | Accountant request inbox — notification, review, accept/decline, acceptance-invite, decline-reason email | `delivered` (PR #42, `ec151cb`, 2026-06-17) — 20/20 in-scope AC | EPIC-001 ✅, EPIC-004 ✅ |

> **Phase-1 build status (2026-06-16):** three of the four Phase-1 slices are **delivered** — **EPIC-001**
> (anonymous front-door write path), **EPIC-004** (the auth spine), and **EPIC-002** (the accountant
> services-catalog admin surface). **EPIC-003** (the request inbox) is the only remaining Phase-1 epic; it is
> **unblocked** and ready to build — the authenticated accountant surface (EPIC-004) exists and the requests it
> consumes (EPIC-001) exist — and remains `planned` (in-scope AC not yet verified). EPIC-002 was not a
> dependency of EPIC-003.
>
> **MVP boundary (confirmed 2026-06-14):** the front-door spine only. A prospect can reach the door and
> submit; the accountant can sign in, get notified, and accept (→ invite) or decline (→ reason email); an
> accepted prospect can create a client account. Onboarding, the engagement lifecycle, file exchange,
> messaging, and the dashboard are **out of the MVP** (Phases 2–4). The **v2** capabilities (dynamic
> organizer, prior-year detection, outstanding-question tracking, proactive follow-up engine, recurring
> engagements, multi-accountant) are **not phased here** — they sit above v1 acceptance.

## Phase 2 — Onboarding gate

**Milestone:** a newly accepted client signs in, e-signs the engagement letter (the hard gate), completes
the per-service-type intake questionnaire, and uploads their initial documents against a checklist — and
when all three steps are done, the engagement automatically moves New → In Progress and the accountant is
notified. This is the first **authenticated client** surface and the first **file-storage** path.
Requirement themes: ONBD (the whole v1 domain), plus the minimal supporting capabilities the gate
consumes — the engagement-letter template (IDNT), the questionnaire templates (DASH), and the document
checklist + secure upload (FILE, NFR malware scan). Depends on Phase 1's accept→invite path.

| Epic | Slice | Status | Depends on |
|---|---|---|---|
| **EPIC-005** | Onboarding spine + engagement-letter e-sign gate — minimal Engagement entity (created on accept, status New), three-step sequence, the letter hard gate, editable letter template (10 AC) | `delivered` (PR #48, `f879da2`, 2026-06-18) — 10/10 in-scope AC | EPIC-003 ✅, EPIC-004 ✅ |
| **EPIC-006** | Intake questionnaire — accountant authors per-service-type templates; client completes the matching questionnaire (7 AC) | `delivered` (PR #50, `e55f8c5`, 2026-06-18) — 7/7 in-scope AC | EPIC-005 ✅, EPIC-002 ✅ |
| **EPIC-007** | Initial document upload — accountant defines the checklist; client uploads against it via the first secure, malware-scanned, non-public file-storage path (19 AC) | `delivered` (PR #52, `eaa5875`, 2026-06-19) — 19/19 in-scope AC | EPIC-005 ✅ |
| **EPIC-008** | Onboarding completion — all-three-steps gate, automatic New → In Progress transition, accountant in-portal notification (8 AC, incl. AC-MSG-013-04) | `delivered` (PR #55, `7fe2872`, 2026-06-20) — 8/8 in-scope AC · **Phase-2 capstone** | EPIC-005 ✅, EPIC-006 ✅, EPIC-007 ✅ |

> **Build order:** EPIC-005 first (no Phase-2 predecessor) — **delivered 2026-06-18** (PR #48, `f879da2`).
> EPIC-006 and EPIC-007 both build on EPIC-005's onboarding sequence and gate and are independent of each
> other (parallelizable) — EPIC-006 **delivered 2026-06-18** (PR #50, `e55f8c5`), EPIC-007 **delivered
> 2026-06-19** (PR #52, `eaa5875`). EPIC-008 is the capstone — it depends on all three step-epics because
> onboarding completion is defined over their outputs — **delivered 2026-06-20** (PR #55, `7fe2872`).
>
> **Phase-2 progress (2026-06-20): ✅ COMPLETE — 4 of 4 epics delivered (EPIC-005/006/007/008); 44 of 44
> Phase-2 AC `verified`.** The onboarding gate works end to end: letter e-sign (hard gate) → intake
> questionnaire → document upload → automatic New → In Progress + accountant notification. **Next:** decompose
> **Phase 3 (engagement lifecycle, LIFE domain)** — run `/planning`.
>
> **Scope boundaries (this phase):** Phase 2 introduces only the *minimal* Engagement substrate (New /
> In Progress) the gate needs — the **full four-stage lifecycle pipeline, manual transitions, and
> client-facing status labels (REQ-LIFE-001/002/003) stay Phase 3**. The document-upload slice owns only
> the file properties the *first* stored file forces (security, malware scan, engagement isolation,
> any-type) and the client-upload path; **accountant upload, download, folders, versioning, and retention
> are Phase 3**. Multi-participant signing (Martha & James) is Phase 3.
>
> **Third-party integrations are mocked (standing directive, 2026-06-17).** Every external SaaS in Phase 2
> is built behind a **mocked provider seam** and kept mocked as long as possible — the engagement-letter
> **e-sign** (EPIC-005, real Docuseal deferred) and the **malware scanner** (EPIC-007, real scanner
> deferred); object storage uses the Azurite emulator. The matching AC are **delivered/`verified` against
> the mock** (provider-agnostic behavior contract), exactly like EPIC-004's mocked auth → deferred 2FA
> slice. Consequence: **no third-party ADR blocks dispatch** — the real-integration ADRs (e-sign;
> scanner) are upstream follow-ups, and each real-provider wiring is tracked as its own deferred
> "enablement" slice. This implies a provider-seam / deferred-real-integration **architecture strategy the
> architecture layer should own**.

## Phase 3 — Engagement lifecycle & secure file exchange *(✅ COMPLETE 2026-06-24 — EPIC-009..015 all delivered; 98/98 placed Phase-3 AC verified)*

Builds the **full** New → In Progress → Review → Complete pipeline (manual transitions, client-facing
labels) on top of the *minimal* Engagement substrate Phase 2 introduced, plus the per-engagement folder-
structured document exchange (accountant upload, both-party download, folders, versioning, retention/
legal-hold) on top of the *first* secure file-storage path Phase 2 stood up. Requirement themes: LIFE,
FILE remainder. **Decomposed in two passes (user direction, 2026-06-21): the LIFE lifecycle core first
(EPIC-010/011/012, this pass), the FILE-exchange + retention/legal-governance epics in a follow-up
`/planning` pass.** The carried-in **REQ-AUTH-002/003/008/007** and **REQ-DOOR-009/010** placements are now
formalized into EPIC-010 / EPIC-012; the **REQ-FILE-001 remainder** (AC-FILE-001-01/-03/-04) and the rest of
the FILE domain remain for the follow-up pass.

**Lifecycle core (this pass) + the carried-in AUTH/DOOR placements:**

| Epic | Slice | Status | Depends on |
|---|---|---|---|
| **EPIC-009** | Sign-in lane — realizes the **sign-in/sign-out capability** (REQ-AUTH-013) and the consolidated **role-based landing** (REQ-AUTH-010) — **5 AC** (2 new sign-in/sign-out, realized vs the mock provider; 3 redirect already verified). In the PoC it ships as a usable in-browser sign-in page + role/user switcher over the mock-session seam (`AUTH_PROVIDER=mock`), wired to the demo seed accounts, **inert under the real provider**, so a tester can drive/demo as the Accountant or any seeded Client without the devtools hack. Real Clerk + 2FA → Phase 5. | `delivered` (PR #71, `169b09e`, 2026-06-21) — 5/5 in-scope AC `verified` **vs the mock provider** (real-Clerk re-validation → Phase 5) | EPIC-004 ✅ |
| **EPIC-010** | Engagement lifecycle pipeline & visibility — full New→In Progress→Review→Complete pipeline, manual transitions, simplified client-facing labels (Review hidden), two-confirmation completion gate, accountant-only reopen, accountant full visibility + client own-data isolation + indefinite post-completion access (25 AC: LIFE-001/002/003/004/005/006, AUTH-002/003/008) | `delivered` (PR #87, `7afd312`, 2026-06-22) — 25/25 in-scope AC `verified` · **first Phase-3-proper slice** | EPIC-005 ✅, EPIC-008 ✅ |
| **EPIC-011** | Engagement attributes — accountant-set due date, accountant-only internal notes, priority/flag marker (9 AC: LIFE-007/008/009) | `delivered` (PR #89, `9445e36`, 2026-06-23) — 9/9 in-scope AC `verified` · accountant-only `pol_EngagementNote` RLS proven both ways | EPIC-010 ✅ |
| **EPIC-012** | Engagement creation paths & multi-participant — returning-client request (DOOR-009), accountant-initiated engagement (DOOR-010), duplicate guard per (client, service, tax year) with warn+override (LIFE-011), multiple concurrent engagements (LIFE-010), multi-participant engagements / separate accounts (LIFE-012, AUTH-007); introduces the engagement **tax-year** attribute (20 AC) | `delivered` (PR #93, `5883fed`, 2026-06-23) — 20/20 in-scope AC `verified` · HARD `pol_EngagementParticipant` + extended `pol_Engagement` RLS, participant isolation proven both ways · third Phase-3-proper slice | EPIC-010 ✅, EPIC-002 ✅, EPIC-003 ✅ |
| **EPIC-013** | Secure file exchange — accountant upload + both-party download + accountant-managed folders + top-level org by engagement & tax year + version history (13 AC: FILE-001 remainder, FILE-009/010/011) | `delivered` (PR #95, `4aa26d0`, 2026-06-23) — 13/13 in-scope AC `verified` · both-party download authz + version history + HARD-isolated folders (accountant-only) + top-level engagement/tax-year org · `/pr-review` caught + fixed a version-download IDOR in-PR · fourth Phase-3-proper slice | EPIC-007 ✅, EPIC-010 ✅, EPIC-012 ✅ |
| **EPIC-014** | File deletion, soft-delete & 7-year retention — accountant-only delete, soft-delete, the in-window retention floor (10 AC: FILE-004/006/005, NFR-006) | `delivered` (PR #97, `37707ad`, 2026-06-24) — 10/10 in-scope AC `verified` · accountant-only delete with no-client-delete proven both ways (HARD `pol` RLS + portal no-delete e2e) · soft-delete leaves view, bytes survive · 7-yr-from-completion retention floor, in-window nothing removes incl. accountant deletion · fifth Phase-3-proper slice | EPIC-013 ✅, EPIC-010 ✅ |
| **EPIC-015** | Post-retention purge & legal hold — accountant-confirmed/never-automatic purge, legal hold, retention-vs-erasure precedence, audit-survives-purge (16 AC: FILE-013/014/015, NFR-010-07) | `delivered` (PR #99, `53b3444`, 2026-06-24) — 16/16 in-scope AC `verified` · purge accountant-admin-only proven both ways (RLS admin-pool + portal no-affordance e2e) · legal hold suspends indefinitely · in-window erasure = access-revocation only · audit survives purge (panel-hardened all-or-nothing rollback) · **sixth and final Phase-3 slice — CLOSES Phase 3** | EPIC-014 ✅, EPIC-010 ✅ |

> **EPIC-009 realizes the sign-in/sign-out capability** (REQ-AUTH-013) + the consolidated role-based landing
> (REQ-AUTH-010), placed in Phase 3 per user direction but with **no dependency on the LIFE/FILE work** — it
> can (and should) be built first so every later PoC slice is human-demoable as both roles. It realizes the
> capability against the **mock seam** (a usable dev sign-in lane); **all real-provider / production auth work**
> (real Clerk login re-validating REQ-AUTH-013, 2FA, real invitations) lives in **Phase 5 — Production
> Readiness** (placeholder). The dev-lane affordances (switcher, inert-under-`clerk` guard) are EPIC-009
> dev-acceptance, not product AC.
>
> **Build order:** **all seven Phase-3 epics are delivered** (EPIC-009 PR #71 `169b09e` 5/5 AC; EPIC-010
> PR #87 `7afd312` 25/25 AC; EPIC-011 PR #89 `9445e36` 9/9 AC; EPIC-012 PR #93 `5883fed` 20/20 AC; EPIC-013
> PR #95 `4aa26d0` 13/13 AC; EPIC-014 PR #97 `37707ad` 10/10 AC; EPIC-015 PR #99 `53b3444` 16/16 AC). The
> lifecycle core (010) + attributes (011) + creation-paths & multi-participant (012) + secure file exchange
> (013) + file-lifecycle governance (014) + post-retention purge & legal hold (015) are complete. The **FILE
> chain** ran linear and is finished: **EPIC-013** ✅ → **EPIC-014** ✅ → **EPIC-015** ✅ (the destructive end —
> purge/legal-hold — **closed Phase 3**). **EPIC-009 is delivered** (PR #71, `169b09e`, 2026-06-21 — the PoC
> sign-in lane, 5/5 AC verified vs the mock provider); it was independent of the LIFE/FILE chain and did
> **not** advance Phase 3 proper. **Phase-3 progress (2026-06-24): EPIC-009 + EPIC-010 + EPIC-011 + EPIC-012 +
> EPIC-013 + EPIC-014 + EPIC-015 delivered — Phase 3 COMPLETE (190/190 placed AC verified). Next:** decompose
> **Phase 4** (messaging, notifications, the accountant dashboard + the audit-trail read surface).
>
> **Scope split (recorded 2026-06-21):** **REQ-FILE-012** (overdue document-request flagging + configurable
> reminder cadence) is routed to **Phase 4**, not the Phase-3 FILE epics — it depends on the
> reminder/notification engine (REQ-MSG-018, REQ-DASH-008). The engagement **tax-year** attribute first
> emerges in **EPIC-012** (the duplicate-guard identity tuple) and is consumed by **EPIC-013** (REQ-FILE-011
> top-level org). **REQ-NFR-010** (audit trail): AC-NFR-010-07 (audit survives purge) is owned by EPIC-015;
> the rest of the audit-trail feature (incl. the accountant-only audit *read* surface) is a **dedicated
> audit-trail slice in Phase 4** — these Phase-3 epics emit audit events (ADR-019) without claiming those AC.

## Phase 4 — Messaging, notifications & the accountant dashboard *(decomposed 2026-06-24 — EPIC-016..023, the final feature phase: completes the v1 POC)*

Per-engagement plain-text threads with attachments and unread indicators; the real-time in-portal
notification system and email digest fallback; the overdue-reminder engine; the accountant's activity
feed / needs-action dashboard, client/engagement navigation, and admin settings; portal identity; and the
deferred audit-trail read surface. Requirement themes: **MSG, DASH, IDNT, + the NFR-010/011 audit
feature**. This is the **last feature phase** — once delivered, every core v1 capability is functionally
proven end-to-end against the mocked provider seams (**the v1 POC is complete**); **Phase 5** then swaps
the mocks for real providers and stands up production.

**Build order (dependency-sequenced):** the notification **spine** first (EPIC-016), then the source slices
that emit into it (messaging EPIC-017, email EPIC-018, reminders EPIC-019), then the surfaces that aggregate
them (dashboard EPIC-020, navigation EPIC-021), then settings/identity (EPIC-022), and finally the
audit-trail read surface (EPIC-023) that **closes the POC**.

| Epic | Slice | Status | Depends on |
|---|---|---|---|
| **EPIC-016** | In-portal notification feed — the dual-role spine: real-time feed on both surfaces, persistent unread-count badge, mark-read-on-view, ≥90-day retention; generalizes the EPIC-003 accountant-only `Notification` to a client branch and lights it up with the already-existing events (document upload; status change, deliverable ready, accept/decline) (20 AC: MSG-007/012/015/016/017, MSG-013-03, MSG-014-03..07) | `planned` | EPIC-003 ✅, EPIC-010 ✅, EPIC-013 ✅ |
| **EPIC-017** | Per-engagement & general messaging threads — one thread per engagement + accountant-initiated general threads, plain-text only, file attachments (malware-scanned, signed-URL), per-viewer unread indicators, indefinite retention + archive-on-close; emits the new-message notification types (24 AC: MSG-001..006, MSG-013-02, MSG-014-01) | `planned` | EPIC-016, EPIC-013 ✅, EPIC-010 ✅ |
| **EPIC-018** | Email digest fallback — content-free nudge ("new activity — sign in", no detail), ≤1/recipient/day batching, accountant self-suppression, client default-on (12 AC: MSG-008/009/010/011) | `planned` | EPIC-016 |
| **EPIC-019** | Overdue detection & reminder engine — auto-detect overdue document requests (no manual trigger), configurable cadence (global default + per-engagement override, precedence), and the reminder-driven notification types (14 AC: MSG-018, DASH-008, FILE-012, MSG-013-05/-06, MSG-014-02). Generalized by v2 REQ-MSG-019 (deferred). | `planned` | EPIC-016, EPIC-011 ✅, EPIC-013 ✅ |
| **EPIC-020** | Accountant dashboard home — live summary metrics (active/overdue engagements, pending requests, upcoming deadlines), unified cross-practice activity feed, distinct needs-action grouping (13 AC: DASH-001/002/003) | `planned` | EPIC-016, EPIC-017, EPIC-019, EPIC-010 ✅, EPIC-012 ✅ |
| **EPIC-021** | Accountant navigation — searchable/filterable client list (status, service type, tax year), engagement pipeline view (by status, filterable, act-on-any, full visibility), and dashboard surfacing of internal notes + priority/flag markers (16 AC: DASH-004/005/009/006/007) | `planned` | EPIC-010 ✅, EPIC-011 ✅, EPIC-012 ✅ |
| **EPIC-022** | Admin settings & portal identity — engagement-letter template management (default + edit + used-at-signing), distinct portal names ("Client Portal" / "Tax Portal"), v1 generic appearance, branding & legal-pages recorded-deferred (12 AC: DASH-013, IDNT-002/003/004/006). **IDNT-001 custom domain → Phase 5.** | `planned` | EPIC-005 ✅ |
| **EPIC-023** | Accountant audit-trail read surface — accountant-only record of document access, status transitions, all admin actions, auth events (actor/action/time/outcome), ≥7-yr retention, tamper-evidence + completeness; closes the deferred REQ-NFR-010 read surface (8 AC: NFR-010-01..06, NFR-011). **Last Phase-4 slice — completes the v1 POC.** | `planned` | EPIC-015 ✅, EPIC-010 ✅, EPIC-013 ✅ |

> **~119 AC placed** across the eight epics (MSG v1 remainder + DASH v1 remainder + IDNT v1 verifiable set +
> NFR-010-01..06/NFR-011 + FILE-012). **Deferred from this phase:** **REQ-IDNT-001** (custom domain → Phase 5,
> tied to the deferred production-hosting decision ADR-007); **REQ-IDNT-005** (permanent client hard-delete →
> Deferred, retention/legal precedence); **REQ-MSG-019** (proactive lifecycle accountability — v2 → Deferred;
> EPIC-019 builds the overdue-document subset it generalizes). Already-placed DASH/MSG/IDNT AC are unchanged:
> DASH-010 (EPIC-002), DASH-011 (EPIC-003), DASH-012 (EPIC-006), MSG-013-01 (EPIC-003), MSG-013-04 (EPIC-008),
> IDNT-007 (EPIC-005).
>
> **Architecture note (flag for `.architecture/`):** the **real-time notification transport** (the in-portal
> feed's live delivery — CLAUDE.md references Supabase Realtime / SSE) has **no dedicated ADR**. EPIC-016
> consumes it behind the mock-first provider seam (ADR-023) for the POC, but the transport choice is a HOW the
> architecture layer should own before the real-provider Phase-5 enablement.

## Phase 5 — Production readiness *(end-of-cycle placeholder)*

> **Placeholder, not yet decomposed.** Project stance (user, 2026-06-20): this product is built **only in a
> development capacity as a proof of concept**; **production readiness is a single end-of-cycle follow-up**,
> and external providers stay **mocked as long as possible** until here. This phase is intentionally *not*
> sliced into epics yet — it is the bucket every "real provider / go-live" concern collects into, to be
> decomposed when the feature cycle (Phases 3–4) is complete and a **go-live decision** is taken (a
> release-timing decision reserved to the user).

Collects (each becomes an epic when this phase is decomposed):
- **Real authentication** — flip `AUTH_PROVIDER` mock→clerk: real Clerk login (re-validate EPIC-004's
  AUTH-001/009/010 against the live provider), **2FA enablement** (AC-AUTH-004-01/-02/-03 + AC-AUTH-005-01),
  and **real invitations** (real Clerk invitation + invite email, re-validating AUTH-006-* / the AUTH-005-02
  sign-up half).
- **Real third-party providers** — real **Docuseal** e-sign (re-validate EPIC-005 ONBD-002 / IDNT-007), real
  **malware scanner** (re-validate EPIC-007 NFR-009), real **email** delivery (replacing Mailhog).
- **Production platform (ADR-007)** — choose + stand up the production host; real domains, secrets, object
  storage (replacing Azurite), and the deploy / CI promotion path. Includes **REQ-IDNT-001** (portal served
  on the firm's own custom domain — AC-IDNT-001-01/-02), deferred from Phase 4 because its mechanics are
  inseparable from this hosting decision.
- **Hardening** — security review, performance / NFR validation against the real stack, and the go-live gate.

> See `COVERAGE.md` § Provider re-validation and § Deferred for the specific AC each real-provider item
> re-validates or enables.

## Backlog / unphased

- Non-functional requirements (NFR domain) are cross-cutting adherence obligations carried on each epic's
  *architecture-adherence* set rather than a standalone phase; the Planning Agent maps each `AC-NFR-*` to
  the epic(s) whose slice must demonstrate it (e.g. malware scanning on the first upload slice, RLS
  isolation on the first client-scoped read slice). Tracked in `COVERAGE.md`.
- Catalog-management remainder of REQ-DOOR-002 (the accountant CRUD AC) is split out of EPIC-001 into
  EPIC-002 — see the split-requirements index in `COVERAGE.md`.
- **MVP-adjacent AC deferred to later phases** (no MVP home; not v1-descoped — they get a home when their
  enabling capability lands). Each is in `COVERAGE.md` Orphans with a target phase:
  - **REQ-AUTH-002** (accountant full visibility over clients/engagements) and **REQ-AUTH-003** (client
    data isolation / RLS) → **Phase 3** (first client-scoped engagement data; the per-policy
    CLIENT-A-vs-CLIENT-B test needs client-owned rows).
  - **REQ-AUTH-007** (multiple participants) and **REQ-AUTH-008** (indefinite access after completion) →
    **Phase 3** (engagement lifecycle / completion).
  - **REQ-DOOR-009** (returning-client request from inside the portal) and **REQ-DOOR-010** (accountant
    initiates an engagement for an existing client) → **Phase 2–3** (need a client portal home and the
    engagement entity).
  - **REQ-MSG-013-02..06** (accountant notifications for messages, uploads, onboarding, overdue, due-date)
    and **REQ-MSG-014** (all client notifications) → **Phase 4** (the notification feed). Only
    AC-MSG-013-01 (new-request notification) lands in the MVP, via EPIC-003.
- **v2 requirements — not yet phased.** REQ-ONBD-008 (dynamic organizer), REQ-FILE-016 (prior-year
  detection), REQ-LIFE-013 (outstanding-question tracking), REQ-MSG-019 (proactive follow-up engine),
  REQ-LIFE-014 (recurring engagements), REQ-AUTH-011/012 (multi-accountant). These build above full v1
  acceptance; they will be sliced into a v2 phase set once v1 phases are underway. Tracked in
  `COVERAGE.md` Deferred (v2).

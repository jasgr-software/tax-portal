# Coverage Ledger

> **Living document.** The acceptance mapping from the requirements source to the roadmap. **One row per
> acceptance criterion** — this is what lets a single requirement's AC fan out across multiple epics. The
> Planning Agent maintains it (see `AGENT.md`). The **validate** phase flips a row from `planned` to
> `verified` when a tagged automated test passes in CI; an AC is signed off **only** with passing-test
> evidence.

**Status legend** — per AC: `planned` (mapped to an epic, not yet built/verified) · `verified` (a test
tagged with the AC id passes in CI) · `deferred` (explicitly out of current scope, with rationale).
**Test tag** = the `AC-<DOMAIN>-NNN-NN` id the covering automated test(s) must carry; the roll-up reads
that tag. **Evidence** = the CI run / result the validate phase recorded.

## Summary

| Measure | Count |
|---|---|
| AC placed in an epic (Phase 1 + Phase 2 + Phase 3) | 190 |
| — Phase 1 (EPIC-001/004/002/003) | 48 |
| &nbsp;&nbsp;— EPIC-001 (public front door) | 13 |
| &nbsp;&nbsp;— EPIC-004 (auth & two-role model) | 8 |
| &nbsp;&nbsp;— EPIC-002 (services-catalog management) | 7 |
| &nbsp;&nbsp;— EPIC-003 (accountant request inbox) | 20 |
| — Phase 2 (EPIC-005/006/007/008) | 44 |
| &nbsp;&nbsp;— EPIC-005 (onboarding spine + letter gate) | 10 |
| &nbsp;&nbsp;— EPIC-006 (intake questionnaire) | 7 |
| &nbsp;&nbsp;— EPIC-007 (initial document upload) | 19 |
| &nbsp;&nbsp;— EPIC-008 (onboarding completion → In Progress) | 8 |
| — Phase 3 (EPIC-009..015) — *EPIC-010..015 placed 2026-06-21; EPIC-009 re-decomposed 2026-06-21* | 98 |
| &nbsp;&nbsp;— EPIC-009 (sign-in lane: sign-in/sign-out + consolidated redirect) | 5 |
| &nbsp;&nbsp;— EPIC-010 (lifecycle pipeline & visibility) | 25 |
| &nbsp;&nbsp;— EPIC-011 (engagement attributes) | 9 |
| &nbsp;&nbsp;— EPIC-012 (creation paths & multi-participant) | 20 |
| &nbsp;&nbsp;— EPIC-013 (secure file exchange) | 13 |
| &nbsp;&nbsp;— EPIC-014 (file deletion, soft-delete & retention) | 10 |
| &nbsp;&nbsp;— EPIC-015 (post-retention purge & legal hold) | 16 |
| AC `verified` (signed off) | **131** — all 48 remaining Phase-1 placed AC (EPIC-001 13 · EPIC-004 8 · EPIC-002 7 · EPIC-003 20; **Phase 1 / MVP complete**) **+ all 44 Phase-2 onboarding-gate AC** (EPIC-005 10 · EPIC-006 7 · EPIC-007 19 · **EPIC-008 8** — the capstone) **+ all 5 EPIC-009 sign-in-lane AC** (AC-AUTH-010-01/-02/-03 — the redirect mechanism delivered by EPIC-004 PR#38, ownership consolidated into the sign-in epic 2026-06-21, tests still pass; **+ AC-AUTH-013-01/-02 — the sign-in/sign-out capability, verified vs the MOCK provider via PR#71 `169b09e` 2026-06-21**) **+ all 25 EPIC-010 lifecycle-core AC** (LIFE-001/002/003/004/005/006, AUTH-002/003/008 — the four-stage pipeline, client-facing labels, two-confirmation completion gate, accountant reopen, full visibility + client own-data isolation + indefinite post-completion access; PR#87 `7afd312` 2026-06-22; AUTH-003-* are the **feature** AC over the Phase-2-built isolation mechanism — not double-counted) **+ all 9 EPIC-011 engagement-attributes AC** (LIFE-007/008/009 — per-engagement due date set/update, accountant-only internal notes behind the HARD `pol_EngagementNote` RLS, priority flag set/clear, each per-engagement; PR#89 `9445e36` 2026-06-23). **Phase 1 + Phase 2 complete; EPIC-009 delivered (PoC mock realization); EPIC-010 delivered — Phase 3 proper opens. NOTE:** AC-AUTH-013-01/-02 (and the AUTH-010 redirect trio) are verified **against the mock auth provider** for the proof of concept — their real-provider (Clerk) re-validation is still outstanding at Phase 5 (see § Provider re-validation). |
| AC still `planned` (placed, not yet verified) | **59** — the remaining Phase-3 lifecycle/FILE AC (EPIC-012 20, EPIC-013 13, EPIC-014 10, EPIC-015 16, placed 2026-06-21), awaiting build + CI sign-off. *(EPIC-011's 9 AC flipped `planned`→`verified` 2026-06-23 via PR#89; EPIC-010's 25 AC flipped 2026-06-22 via PR#87; EPIC-009's 2 new sign-in AC AC-AUTH-013-01/-02 flipped 2026-06-21 via PR#71 — see Verified row.)* |
| AC `deferred` | the 2FA set (AC-AUTH-004-01/-02/-03 + AC-AUTH-005-01) + IDNT hard-delete (v1) + the v2 requirement set — see Deferred |
| AC orphaned (source AC not yet decomposed into any epic) | remainder of the v1 corpus — see Orphans |

> **EPIC-001 (13 AC) signed off 2026-06-15** — the public front-door slice shipped (PR #35, merge `f7f6c9d`).
> **EPIC-004 (originally 11 AC) signed off 2026-06-16** — the auth & two-role-model identity spine shipped
> (PR #38, squash merge `0444551`); see basis note [A]. The 4 2FA AC (AC-AUTH-004-01/-02/-03 + AC-AUTH-005-01)
> remain `deferred` to Phase 5 — see Deferred. **On 2026-06-21, REQ-AUTH-010 (AC-AUTH-010-01/-02/-03) was
> consolidated into EPIC-009** (the sign-in epic): the redirect *mechanism* was delivered here and the tests
> still pass — only ownership of the 3 AC moved (still `verified`). EPIC-004 now owns **8** verified in-scope
> AC; it remains `delivered`.
> **EPIC-002 (7 AC) signed off 2026-06-16** — the accountant services-catalog management slice shipped (PR #40,
> squash merge `70ea10e`); see basis note [A]. All 7 in-scope AC verified: AC-DOOR-002-01/-02/-03 (add/edit/
> deactivate persist), AC-DOOR-002-05 (accountant-only write boundary — the new `sec.fn_service_write_access`
> BLOCK predicate, which **closed EPIC-001's latent write-predicate gap**, with CLIENT + anonymous rejected at
> tier-3 RLS 10/10), and AC-DASH-010-01/-02/-03 (the same capability from the admin UI, dual-tagged with the
> DOOR journeys).
> **EPIC-003 (20 AC) signed off 2026-06-17** — the accountant request inbox slice shipped (PR #42, squash
> merge `ec151cb`); see basis note [A]. All 20 in-scope AC verified: AC-DOOR-005-01/-02/-03 (new-request
> accountant notification, leads-to-request, accountant-only), AC-DOOR-006-01/-02/-03/-04/-05 (view details,
> accept, decline, only-accountant-decides, decide-exactly-once), AC-DOOR-007-01/-02/-03/-04 (invitation sent /
> directs to client sign-up / no-account-before-sign-up / tied-to-request), AC-DOOR-008-01/-02/-03/-04 (reason
> captured / emailed / no-account-needed / retained), AC-DASH-011-01/-02/-03 (inbox view-all / states / pending
> identifiable), AC-MSG-013-01 (new-service-request notification). **This completes Phase 1 (the MVP front-door
> spine): EPIC-001/004/002/003 all delivered — 51/51 placed Phase-1 AC verified.** The roll-up reaches **full
> v1 acceptance** when no v1 source AC is orphaned and every non-deferred AC is `verified` (Phases 2–4 remain).
>
> **[A] applied to the EPIC-003 sign-off (2026-06-17).** Same user-accepted CI-as-the-gate basis as
> EPIC-001/002/004. The required checks `lint-and-typecheck` ✅ + `security-scan` ✅ are green on the PR #42
> pre-merge run `27696675400` **and** the post-merge `main` run at `ec151cb` (`CI` ✅ + `Code Quality` ✅;
> `test-admin`/`test-portal` advisory, also green). Each of the 20 in-scope AC has automated test(s) tagged
> with its AC id, exercised by the SDET at dev time against the real container stack (incl. **Mailhog** —
> EPIC-003 is the first email-sending slice): tier-3 RLS (`notification.rls.test.ts` accountant-only read 4/4;
> `engagement-request.decide-boundary.rls.test.ts` CLIENT decide-write BLOCK 3/3), tier-3 persistence
> (`engagement-request.persistence.test.ts` notification-atomic), tier-2 unit (`actions.test.ts` decision/audit/
> rate-limit/invitation invariants), and tier-6 admin e2e (`request-inbox`/`request-accept`/`request-decline`
> specs — accept→invitation-email & decline→reason-email captured via the Mailhog HTTP API; 30/30, 3× zero-flake).
> The cross-epic seam AC-DOOR-007-03 ↔ EPIC-004 AC-AUTH-006-01 (account exists only after sign-up) is intact.
> The AC→test-tag→tier table is in `.implementation/tasks/HANDOFF-003.md`. The same per-PR-CI-tier follow-up
> tracked for EPIC-001 applies here.
>
> **EPIC-005 (10 AC) signed off 2026-06-18** — the client onboarding spine + engagement-letter e-sign gate
> slice shipped (PR #48, squash merge `f879da2`); see basis note [A]. **First Phase-2 slice delivered.** All 10
> in-scope AC verified: AC-ONBD-001-01/-02/-03 (the three-step onboarding sequence surfaces for a newly accepted
> client and the letter is the hard gate), AC-ONBD-002-01/-02/-03/-04 (the engagement-letter e-sign flow —
> served, signed, recorded as audit evidence, gate satisfied), and AC-IDNT-007-01/-02/-03 (the accountant-editable
> letter template). Net-new platform capabilities: the **minimal Engagement entity** (created on accept → status
> New) — the first client-owned rows — and the **first client-isolation RLS policy** (CLIENT-A ≠ CLIENT-B,
> null=ZERO, ACCOUNTANT=all, with a cross-client BLOCK write proof), plus the **mocked e-sign provider seam**
> (real Docuseal deferred per the standing mock-integration directive — same pattern as EPIC-004's mocked auth).
> **This is the first delivered Phase-2 epic; EPIC-006 (intake questionnaire) and EPIC-007 (initial document
> upload) are now unblocked** (their `depends_on: EPIC-005` is satisfied) and EPIC-008 remains the capstone.
>
> **EPIC-006 (7 AC) signed off 2026-06-18** — the intake-questionnaire slice (per-service-type templates +
> client completion — **step 2 of the onboarding sequence**) shipped (PR #50, squash merge `e55f8c5`); see
> basis note [A]. **Second Phase-2 slice delivered.** All 7 in-scope AC verified: AC-ONBD-003-01/-02/-03/-04
> (the client is presented the questionnaire matching their engagement's service type behind the EPIC-005
> letter gate, one template per service type, completes & submits, answers recorded one-per-engagement and the
> step marked satisfied) and AC-DASH-012-01/-02/-03 (the accountant authors/edits a per-service-type template
> from the Tax Portal, one per service type, edits retained). Net-new platform capabilities: the **second
> client-owned-row family + second client-isolation policy** (`QuestionnaireAnswer` one-per-engagement;
> `pol_QuestionnaireAnswer` mirroring EPIC-005's `0005`), the **first per-service-type template**
> (`QuestionnaireTemplate`, `@@unique([serviceId])`, accountant-owned BLOCK-only `pol_QuestionnaireTemplate`),
> and **server-side engagement→service-type→template resolution** (no client-supplied ids — the client cannot
> pick their questionnaire), with the letter hard gate **NOT weakened** (`accessible: signed` unchanged).
> **REQ-AUTH-003 feature AC remain Phase-3-owned** (the isolation *mechanism* + its mandatory per-policy HARD
> test land here; the feature AC are not claimed by this slice).
>
> **EPIC-007 (19 AC) signed off 2026-06-19** — the initial-document-upload slice (accountant-authored checklist
> + client uploads against it via the portal's **first secure, malware-scanned, non-public file-storage path** —
> **step 3 of the onboarding sequence**) shipped (PR #52, squash merge `eaa5875`); see basis note [A]. **Third
> Phase-2 slice delivered.** All 19 in-scope AC verified (AC-ONBD-004-01/-02/-03/-04, AC-FILE-007-01/-02/-03,
> AC-FILE-008-01/-02/-03, AC-FILE-001-02/-05, AC-FILE-002-01, AC-FILE-003-01/-02/-03/-04, AC-NFR-009-01/-02).
> Net-new platform capabilities: the **first `FileStorage` port + Azurite adapter (the first stored-bytes
> path)**, the **first `FileScanner` port (mock-first)**, the **third client-isolation RLS policy** (`pol_Document`/
> `0007` — client-owned-row family now Engagement + QuestionnaireAnswer + **Document**), the **two-phase
> authorize-then-sign upload + scan-before-available pipeline** (promote to `active` only on clean+valid;
> `infected`/`indeterminate` never signable), the **checklist read model + document-step satisfaction** (zero
> requests → vacuously satisfied; letter hard gate **NOT weakened**), and the **ADR-019/022 audit + rate-limit
> caller-binding** seam split. The 3-lens PR-review panel + fixer cleared **2 majors** (headlined by a
> cross-tenant ownership gap in `completeUpload`, now re-asserting engagement ownership before promotion + a
> regression test). **EPIC-008 (onboarding completion → automatic New→In Progress + accountant notification) is
> the next-ready Phase-2 slice** — its `depends_on` (EPIC-005 ✅, EPIC-006 ✅, EPIC-007 ✅) is fully satisfied;
> it is the **Phase-2 capstone**.
>
> **EPIC-008 (8 AC) signed off 2026-06-20** — the onboarding-completion slice (when an engagement's three
> onboarding steps are all satisfied, the **system** marks onboarding complete, **automatically transitions the
> engagement New → In Progress** — the single automatic transition in the lifecycle — and emits an
> **accountant-only in-portal notification** identifying the engagement + client) shipped (PR #55, squash merge
> `7fe2872`); see basis note [A]. **The Phase-2 capstone — fourth and final Phase-2 slice delivered.** All 8
> in-scope AC verified: AC-ONBD-005-01/-02 (onboarding complete when all three steps done / stays incomplete and
> no transition when any step is unsatisfied), AC-ONBD-006-01/-02/-03 (engagement moves to In Progress / the
> transition is automatic with no accountant input / it fires exactly once, idempotent under concurrency via the
> `@@ROWCOUNT`-guarded `status='New'` precondition), AC-ONBD-007-01/-02 (accountant-only completion notification /
> identifying engagement + client by name), and AC-MSG-013-04 (the onboarding-completed notification type —
> dual-tagged with AC-ONBD-007-01, pulled forward from Phase 4 since onboarding completion is built here). Net
> result: **ZERO schema migration** — delivered as behavior over existing shapes (no net-new entity, column, RLS
> policy, or provider seam): a derived completion predicate over the three existing `resolveOnboarding` `done`
> flags + a privileged atomic fire-once seam (`status` UPDATE → notification INSERT → audit, one
> `withAuditTransaction`) reusing the EPIC-003 `Notification` entity + the accountant-only `0004` policy + the
> ADR-019 audit seam. **AC-ONBD-005-01's browser-e2e tier is deferred to BUG-008-001** (pre-existing
> EPIC-007/ADR-009 Azurite SAS-URL host-unreachable infra defect — NOT a BRIEF-008 regression; its own future
> infra slice) and is **carried for sign-off by its tier-3 integration proof** (`onboarding-completion.integration.test.ts:485`,
> real container). **This completes Phase 2 (the onboarding gate): EPIC-005/006/007/008 all delivered — 44/44
> placed Phase-2 AC verified; 95/95 placed Phase-1+2 AC verified.** Phase 3 (engagement lifecycle) is the next
> roadmap phase to decompose.
>
> **[A] applied to the EPIC-008 sign-off (2026-06-20).** Same user-accepted CI-as-the-gate basis as
> EPIC-001/002/003/004/005/006/007 — per-PR CI tiers do not run the full AC test tiers by design (the ADR-007
> staging gate does not exist). The required checks `lint-and-typecheck` ✅ + `security-scan` ✅ are green on the
> PR #55 head `a88f31e` (plus advisory `test-portal` ✅ + `test-admin` ✅) **and** on the post-merge `main` run at
> `7fe2872` — **CI** run `27870105845` (`lint-and-typecheck` ✅ / `security-scan` ✅ / `test-portal` ✅ /
> `test-admin` ✅) + **CodeQL** run `27870105586` ✅. Each of the 8 in-scope AC has automated test(s) tagged with
> its AC id, validated by the implementation engine's SDET acceptance-validation gate (Gate 6 APPROVED
> 2026-06-20T05:30:00Z) under the **mandated gherkin methodology** (prose-bind, each scenario text ↔ test
> assertion confirmed — see `.implementation/tasks/HANDOFF-008.md` for the per-AC tier/evidence map), exercised
> at dev time against the real container stack: tier-2 predicate truth table, **tier-3 integration against the
> real SQL Server container** (fire-once transition+notification+audit atomicity 14/14, incl. the accountant-only
> read re-confirmed REAL — ACCOUNTANT reads ≥1 / CLIENT + null SESSION_CONTEXT read 0, ADR-005 §6), tier-5
> component (`NotificationsIndicator` / `engagement-status`), and tier-6 e2e on the full docker-compose stack
> (admin In-Progress + notification, portal negative path, cross-app, security fail-closed). The same
> per-PR-CI-tier follow-up tracked for EPIC-001 applies here. The 6 advisory PR-review panel minors/nit are
> dispositioned non-blocking (3 carried to `RETRO-008 § Post-Merge Addendum`); none affect AC sign-off.
>
> **EPIC-009 (5 AC) signed off 2026-06-21 — the PoC two-role sign-in lane ships (mock realization).** The dev
> sign-in lane realizing **REQ-AUTH-013** against the `AUTH_PROVIDER=mock` seam — plus the consolidated
> **REQ-AUTH-010** role-based-redirect AC — shipped (PR #71, squash merge `169b09e`); see basis note [B].
> **All 5 in-scope AC now `verified`:** the 2 net-new sign-in/sign-out AC (**AC-AUTH-013-01** sign-in → role-
> appropriate landing; **AC-AUTH-013-02** global sign-out → unauthenticated, re-auth required on both surfaces)
> flipped `planned`→`verified` this slice, and the 3 redirect AC (**AC-AUTH-010-01/-02/-03**, consolidated from
> EPIC-004) stay `verified` with PR #71 confirmation appended (no double-count — they remain owned by EPIC-009).
> **Honest-accounting scope:** this slice is a **dev-lane PoC against the mock provider** — AC-AUTH-013-01/-02
> are verified **vs the mock**; the **real-provider (Clerk) realization stays outstanding at Phase 5** (§ Provider
> re-validation), and the **2FA AC remain deferred to Phase 5** (REQ-AUTH-004/005). The dev-lane affordances
> (seeded-account picker, role/user switcher, the inert-under-`AUTH_PROVIDER=clerk` guard) are EPIC-009
> **dev-acceptance** tooling, not product AC — they have their own automated tests but no COVERAGE rows.
> **EPIC-009 → `delivered`.** **Phase context:** EPIC-009 is a **cross-cutting PoC sign-in slice placed in
> Phase 3 but with no LIFE/FILE dependency** — it does **not** close or advance Phase 3 proper (the
> engagement-lifecycle + FILE work, EPIC-010..015, is still entirely `planned`). It makes every later PoC slice
> human-demoable as either role.
>
> **[B] Evidence basis for the EPIC-009 sign-off (2026-06-21).** Same user-accepted CI-as-the-gate basis as
> [A] — the required checks `lint-and-typecheck` ✅ + `security-scan` ✅ are green on PR #71 and on the
> post-merge `main` squash `169b09e`. EPIC-009 took the **reviewed application-code lane**: code-standards
> audit `approve` (0 violations) → `/pr-review` 3-lens panel (1 major + 5 minor + 2 nit; all blockers/majors
> fixed in `5551052`, 1 minor deferred as a tracked follow-up) → `/pr-fix` green → merged on green required CI.
> Each in-scope AC has automated test(s) tagged with its AC id, **independently re-run by the SDET against the
> live docker-compose stack**: AC-AUTH-013-01 — portal `sign-in-lane.spec.ts` 6/6 + admin `sign-in-lane.spec.ts`
> 5/5 (tier-6, both surfaces) + tier-2/3 server-set-role assertions; AC-AUTH-013-02 — tier-6 global-sign-out e2e
> both surfaces (host-only `__mock_session` cookie cleared → both apps re-auth) + tier-2/3; AC-AUTH-010-01/-02/-03
> — `pnpm e2e:cross-app` `cross-app-redirect.spec.ts` 5/5 (mechanism not rebuilt; re-exercised through the new
> sign-in path). **Slice-specific caveat (the honest-accounting boundary):** the auth provider is **mocked** for
> this slice — AC-AUTH-013-01/-02 + AUTH-010-* are verified **vs the mock**; real Clerk re-validation + 2FA are
> Phase 5 (§ Provider re-validation, § Deferred). The same per-PR-CI-tier follow-up tracked for EPIC-001 applies.
>
> **EPIC-010 (25 AC) signed off 2026-06-22 — Phase 3 proper opens; the engagement becomes a first-class,
> lifecycle-managed object on both surfaces.** The engagement-lifecycle-pipeline & visibility slice shipped
> (PR #87, squash merge `7afd312`); see basis note [C]. **First Phase-3-proper slice delivered** (EPIC-009 was
> a cross-cutting PoC sign-in lane that did not advance Phase 3 proper). All **25 in-scope AC** verified:
> AC-LIFE-001-01/-02/-03 (four-stage pipeline — status invariant, New default, forward order), AC-LIFE-002-01/
> -02/-03 (simplified client-facing labels; internal Review hidden as "In Progress"; three client states),
> AC-LIFE-003-01/-02/-03 (manual accountant transitions; no auto-advance except the EPIC-008 onboarding
> transition; client cannot transition), AC-LIFE-004-01/-02/-03 (Review is an internal accountant stage — no
> client action, not an approval step), AC-LIFE-005-01/-02/-03 (two-confirmation completion gate — delivery +
> filing; both required), AC-LIFE-006-01/-02 (accountant reopen; client cannot reopen), AC-AUTH-002-01/-02/-03
> (accountant full visibility), **AC-AUTH-003-01/-02/-03 (client own-data isolation — the HARD per-policy
> `pol_Engagement` test + the direct-reference fetch-by-id proof; the isolation *mechanism* was built in
> Phase 2 (EPIC-005/007), and these are the *feature* AC signed off here over that mechanism — not a second
> count of the mechanism)**, and AC-AUTH-008-01/-02 (indefinite client access after completion). EPIC-010 →
> `delivered`. The single automatic transition (EPIC-008 onboarding New→In Progress) is left intact as the one
> exception to manual control (AC-LIFE-003-02 verified-by-reference against the intact EPIC-008 suite). **This
> opens Phase 3 proper; EPIC-011 (attributes) and EPIC-012 (creation paths & multi-participant) are now
> next-ready** — both have `depends_on: EPIC-010` satisfied (EPIC-012 also needs EPIC-002 ✅ / EPIC-003 ✅);
> the FILE chain EPIC-013→014→015 follows. **Phase-3 progress: EPIC-009 + EPIC-010 delivered; EPIC-011..015
> `planned`.**
>
> **[C] Evidence basis for the EPIC-010 sign-off (2026-06-22).** Same user-accepted CI-as-the-gate basis as
> [A]/[B] — per-PR CI tiers do not run the full AC test tiers by design (the ADR-007 staging gate does not
> exist). The required checks `lint-and-typecheck` ✅ + `security-scan` ✅ are green on PR #87 and on the
> post-merge `main` squash `7afd312` — **CI** run `27988679054` (`lint-and-typecheck` ✅ / `security-scan` ✅;
> advisory `test-portal` ✅ / `test-admin` ✅) + **CodeQL** (Analyze JS/TS + Python) ✅. Each of the 25
> in-scope AC has automated test(s) tagged with its AC id, validated by the implementation engine's SDET
> acceptance-validation gate at the prescribed ADR-012 tiers (engine sign-off in
> `.implementation/tasks/HANDOFF-010.md` + `RETRO-010.md`; brief `.implementation/briefs/BRIEF-010-engagement-lifecycle-pipeline.md`),
> exercised against the real container stack: tier-3 `packages/db` — `engagement.lifecycle.transition.test.ts`
> (pipeline invariant, two-confirmation gate negative+positive, reopen, ADR-019 audit atomicity),
> `engagement.lifecycle.rls.test.ts` (the **HARD `pol_Engagement` matrix** — CLIENT-A own / CLIENT-B ZERO /
> null ZERO / ACCOUNTANT all + direct-reference denial), `engagement.persistence.test.ts` (New default); tier-2/5
> `engagement-label.test.ts` (4→3 label mapping, Review→"In Progress", Review-internal invariants); tier-6 e2e on
> the full docker-compose stack — admin `engagement-lifecycle.spec.ts` 9/9, portal `engagement-labels.spec.ts`
> 9/9, portal `engagement-isolation.spec.ts` 4/4, cross-app redirect; container smoke PASS. AC-LIFE-003-02 is
> **verified-by-reference** against the intact EPIC-008 onboarding-completion suite (the one allowed auto-advance;
> same carry-by-reference pattern recorded for EPIC-008's AC-ONBD-005-01). The same per-PR-CI-tier follow-up
> tracked for EPIC-001 applies here.
>
> **EPIC-011 (9 AC) signed off 2026-06-23 — the accountant gains working metadata on each engagement.** The
> engagement-attributes slice (a per-engagement **due date** she sets and updates, **accountant-only internal
> notes** only she can read, and a **priority/flag** marker she can set and clear — all surfaced/managed in
> `apps/admin` on the EPIC-010 workspace) shipped (PR #89, squash merge `9445e36`); see basis note [D].
> **Second Phase-3-proper slice delivered.** All 9 in-scope AC verified: AC-LIFE-007-01/-02/-03 (set / update /
> per-engagement due date), AC-LIFE-008-01/-02/-03 (record internal note / visible only to the accountant / never
> shown to a client or participant — the security-sensitive boundary), and AC-LIFE-009-01/-02/-03 (flag / unflag /
> per-engagement priority). Net-new platform capability: a separate one-to-many **`EngagementNote`** entity behind
> the **accountant-only** `pol_EngagementNote` RLS policy (modeled on the `pol_Notification`/`0004` family, **not**
> the client-isolation `pol_Engagement` family — no CLIENT branch by design), plus two additive `Engagement`
> columns (`dueDate`, `isPriority`, both client-readable, accountant-only write). The **notes-confidentiality
> boundary was proven both ways** — tier-3 server-side RLS (CLIENT / owning-client / null all read ZERO) **and**
> the tier-6 `apps/portal` negative e2e (no notes seam exists in the portal). EPIC-011 → `delivered`.
> **Attributes-only scope held:** no dashboard/needs-action surfacing, no overdue reminders (correctly deferred to
> Phase 4); engagement creation + multi-participant remain EPIC-012. **EPIC-011 does NOT close Phase 3** —
> EPIC-012 (creation paths & multi-participant) is next-ready (`depends_on` EPIC-010 ✅ / EPIC-002 ✅ / EPIC-003 ✅);
> the FILE chain EPIC-013→014→015 follows. **Phase-3 progress: EPIC-009 + EPIC-010 + EPIC-011 delivered;
> EPIC-012..015 `planned`.**
>
> **[D] Evidence basis for the EPIC-011 sign-off (2026-06-23).** Same user-accepted CI-as-the-gate basis as
> [A]/[B]/[C] — per-PR CI tiers do not run the full AC test tiers by design (the ADR-007 staging gate does not
> exist). The required checks `lint-and-typecheck` ✅ + `security-scan` ✅ are green on PR #89 and on the
> post-merge `main` squash `9445e36` — **CI** run `28025445472` (`conclusion: success`; `lint-and-typecheck` ✅ /
> `security-scan` ✅; advisory `test-portal` ✅ / `test-admin` ✅) + **CodeQL** run `28025442436` (Analyze JS/TS +
> Python) ✅. Each of the 9 in-scope AC has automated test(s) **tagged with its AC id** on the merge commit
> (verified by the validate phase via `git grep` against `9445e36`), validated by the implementation engine's
> SDET acceptance-validation gate (Gate 6 PASS) at the prescribed ADR-012 tiers (engine sign-off in
> `.implementation/tasks/HANDOFF-011.md` + `RETRO-011.md` Post-Merge Addendum; brief
> `.implementation/briefs/BRIEF-011-engagement-attributes.md`), exercised against the real container stack:
> tier-3 `packages/db` — `engagement-attributes.test.ts` (set/update due date, record note, set/clear priority,
> distinct-engagement isolation for due-date + priority) and `engagement-note.rls.test.ts` (the **HARD
> `pol_EngagementNote` matrix** — ACCOUNTANT reads / CLIENT reads ZERO / null SESSION_CONTEXT reads ZERO,
> fail-closed); tier-2/5 `actions.test.ts` + `EngagementAttributesPanel.test.tsx`; tier-6 e2e on the full
> docker-compose stack — admin `engagement-attributes.spec.ts` and the portal negative
> `engagement-note-confidentiality.spec.ts` (a client participant never sees the note text); container smoke PASS.
> The same per-PR-CI-tier follow-up tracked for EPIC-001 applies here.
>
> **[A] applied to the EPIC-006 sign-off (2026-06-18).** Same user-accepted CI-as-the-gate basis as
> EPIC-001/002/003/004/005 — per-PR CI tiers do not run the full AC test tiers by design (the ADR-007 staging
> gate does not exist). The required checks `lint-and-typecheck` ✅ + `security-scan` ✅ are green on the
> PR #50 head `a7ef3d6` (plus `test-portal` ✅ + `test-admin` ✅ + CodeQL ✅) **and** on the post-merge `main`
> run at `e55f8c5` — **CI** run `27796565080` (`lint-and-typecheck` ✅ / `security-scan` ✅ / `test-portal` ✅ /
> `test-admin` ✅) + **CodeQL** run `27796564765` ✅. Each of the 7 in-scope AC has automated test(s) tagged
> with its AC id, validated by the implementation engine's SDET acceptance-validation gate under the
> **mandated gherkin methodology** (prose-bind, each scenario text ↔ test assertion confirmed — see
> `.implementation/tasks/HANDOFF-006.md` for the per-AC tier/evidence map), exercised at dev time against the
> real container stack: tier-3 integration against the real SQL Server container (incl. the **HARD second
> client-isolation policy** `sec.pol_QuestionnaireAnswer` 7/7 — CLIENT-A reads own / CLIENT-B reads ZERO /
> null SESSION_CONTEXT reads ZERO / ACCOUNTANT reads both / cross-client UPDATE BLOCK / template INSERT BLOCK),
> and e2e on the full docker-compose stack (admin 35/35, portal 36/36, cross-app 11/11). The same per-PR-CI-tier
> follow-up tracked for EPIC-001 applies here.
>
> **[A] applied to the EPIC-005 sign-off (2026-06-18).** Same user-accepted CI-as-the-gate basis as
> EPIC-001/002/003/004 — the same basis the prior four epics shipped on; per-PR CI tiers do not run the full AC
> test tiers by design (the ADR-007 staging gate does not exist). The required checks `lint-and-typecheck` ✅ +
> `security-scan` ✅ are green on the PR #48 head **and** on the post-merge `main` run at `f879da2` (`CI` ✅ +
> CodeQL ✅). Each of the 10 in-scope AC has automated test(s) tagged with its AC id, validated by the
> implementation engine's SDET acceptance-validation gate under the **mandated gherkin methodology** (prose-bind,
> each scenario text ↔ test assertion confirmed), exercised at dev time against the real container stack: tier-3
> integration against the real SQL Server container (incl. the **first client-isolation RLS policy** —
> CLIENT-A≠CLIENT-B, null=ZERO, ACCOUNTANT=all + a cross-client BLOCK write proof), and e2e on the full
> docker-compose stack (portal 33/33, admin 32/32, cross-app 10/10). The same per-PR-CI-tier follow-up tracked
> for EPIC-001 applies here.
>
> **[A] Evidence basis for the EPIC-001 sign-off (precedent — set by the user 2026-06-15); reused for EPIC-004
> 2026-06-16.** Each EPIC-001 AC
> has an automated test **tagged with its AC id** (the AC→test-tag→tier table is in
> `.implementation/tasks/RETRO-001.md`) that **passed** under the SDET's independent acceptance-validation
> against the real docker-compose stack — tier-3 RLS hard gate 4/4 (`engagement-request.rls.test.ts`, real SQL
> Server), e2e 12/12 (`apps/portal/e2e`, containers), and `pnpm -r test` 28/28 — corroborated by green
> **required** CI (run `27560403275` head `211175b`; post-merge run `27560948602` on `main`@`f7f6c9d`:
> `lint-and-typecheck` ✅ + `security-scan` ✅). **Caveat:** per-PR CI does **not** yet execute the tier-3 /
> e2e / component test tiers as required checks — tier-3 + e2e are not run per-PR by design (CLAUDE.md; e2e is
> a deploy-to-staging gate, deferred per ADR-007), and the `test-portal` component job is currently advisory
> (`continue-on-error`, red on a missing CI DB-seed). The SDET acceptance-validation gate is the independent
> verification for those tiers this slice. **Tracked follow-up:** wire the AC test tiers (component + tier-3
> + e2e) into a required CI check so future sign-offs rest on per-PR CI directly (RETRO-001 § carried
> follow-ups; ties to the `test-portal` graduation item).
>
> **[A] applied to the EPIC-004 sign-off (2026-06-16).** Same user-accepted CI-as-the-gate basis as EPIC-001:
> the env-blocked local container smoke is substituted by clean GitHub CI. The required checks
> `lint-and-typecheck` ✅ + `security-scan` ✅ — plus `test-admin` ✅ and `test-portal` ✅ — are green on the
> PR #38 head **and** on the post-merge `main` run at `0444551`. Each in-scope AC has automated test(s)
> tagged with its AC id exercised by the SDET at dev time (167+ auth unit/integration tests, RLS isolation
> tests, per-app + cross-app e2e). **Slice-specific caveat:** the auth provider was **mocked** for this slice
> (user-approved brief deviation); real Clerk + 2FA enforcement are a deferred future Phase-1 "2FA enablement"
> slice that re-validates the 4 deferred AC against the live provider. The same per-PR-CI-tier follow-up
> tracked for EPIC-001 applies here.
>
> **[A] applied to the EPIC-002 sign-off (2026-06-16).** Same user-accepted CI-as-the-gate basis as
> EPIC-001/004: the env-blocked local container smoke is substituted by clean GitHub CI. The required checks
> `lint-and-typecheck` ✅ + `security-scan` ✅ + `test-admin` ✅ + `test-portal` ✅ + CodeQL ✅ are green on the
> PR #40 head **and** on the post-merge `main` run at `70ea10e`. Each of the 7 in-scope AC has automated
> test(s) tagged with its AC id, exercised by the SDET at dev time against the real SQL Server container:
> tier-3 persistence (`service.persistence.test.ts`) for AC-DOOR-002-01/-02/-03, tier-3 RLS
> (`service.rls.test.ts`, 10/10 — CLIENT + anonymous rejected at the `sec.fn_service_write_access` BLOCK
> predicate) for AC-DOOR-002-05, and tier-6 admin e2e (`services-catalog.spec.ts`) for the DASH-010 trio plus
> the UI-surface of the DOOR journeys. **Note:** AC-DOOR-002-05's RLS gate closed EPIC-001's latent
> write-predicate gap. The same per-PR-CI-tier follow-up tracked for EPIC-001 applies here.

## Coverage by acceptance criterion

| REQ | AC | Epic | Phase | Test tag | Status | Evidence |
|---|---|---|---|---|---|---|
| REQ-DOOR-001 | AC-DOOR-001-01 | EPIC-001 | 1 | `AC-DOOR-001-01` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-001 | AC-DOOR-001-02 | EPIC-001 | 1 | `AC-DOOR-001-02` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-001 | AC-DOOR-001-03 | EPIC-001 | 1 | `AC-DOOR-001-03` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-04 | EPIC-001 | 1 | `AC-DOOR-002-04` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-01 | EPIC-002 | 1 | `AC-DOOR-002-01` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-02 | EPIC-002 | 1 | `AC-DOOR-002-02` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-03 | EPIC-002 | 1 | `AC-DOOR-002-03` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DOOR-002 | AC-DOOR-002-05 | EPIC-002 | 1 | `AC-DOOR-002-05` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DOOR-003 | AC-DOOR-003-01 | EPIC-001 | 1 | `AC-DOOR-003-01` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-003 | AC-DOOR-003-02 | EPIC-001 | 1 | `AC-DOOR-003-02` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-003 | AC-DOOR-003-03 | EPIC-001 | 1 | `AC-DOOR-003-03` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-003 | AC-DOOR-003-04 | EPIC-001 | 1 | `AC-DOOR-003-04` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-01 | EPIC-001 | 1 | `AC-DOOR-004-01` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-02 | EPIC-001 | 1 | `AC-DOOR-004-02` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-03 | EPIC-001 | 1 | `AC-DOOR-004-03` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-04 | EPIC-001 | 1 | `AC-DOOR-004-04` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-004 | AC-DOOR-004-05 | EPIC-001 | 1 | `AC-DOOR-004-05` | verified | PR#35 `f7f6c9d` · SDET+CI [A] |
| REQ-DOOR-005 | AC-DOOR-005-01 | EPIC-003 | 1 | `AC-DOOR-005-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-005 | AC-DOOR-005-02 | EPIC-003 | 1 | `AC-DOOR-005-02` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-005 | AC-DOOR-005-03 | EPIC-003 | 1 | `AC-DOOR-005-03` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-006 | AC-DOOR-006-01 | EPIC-003 | 1 | `AC-DOOR-006-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-006 | AC-DOOR-006-02 | EPIC-003 | 1 | `AC-DOOR-006-02` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-006 | AC-DOOR-006-03 | EPIC-003 | 1 | `AC-DOOR-006-03` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-006 | AC-DOOR-006-04 | EPIC-003 | 1 | `AC-DOOR-006-04` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-006 | AC-DOOR-006-05 | EPIC-003 | 1 | `AC-DOOR-006-05` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-007 | AC-DOOR-007-01 | EPIC-003 | 1 | `AC-DOOR-007-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-007 | AC-DOOR-007-02 | EPIC-003 | 1 | `AC-DOOR-007-02` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-007 | AC-DOOR-007-03 | EPIC-003 | 1 | `AC-DOOR-007-03` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-007 | AC-DOOR-007-04 | EPIC-003 | 1 | `AC-DOOR-007-04` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-008 | AC-DOOR-008-01 | EPIC-003 | 1 | `AC-DOOR-008-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-008 | AC-DOOR-008-02 | EPIC-003 | 1 | `AC-DOOR-008-02` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-008 | AC-DOOR-008-03 | EPIC-003 | 1 | `AC-DOOR-008-03` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DOOR-008 | AC-DOOR-008-04 | EPIC-003 | 1 | `AC-DOOR-008-04` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DASH-010 | AC-DASH-010-01 | EPIC-002 | 1 | `AC-DASH-010-01` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DASH-010 | AC-DASH-010-02 | EPIC-002 | 1 | `AC-DASH-010-02` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DASH-010 | AC-DASH-010-03 | EPIC-002 | 1 | `AC-DASH-010-03` | verified | PR#40 `70ea10e` (2026-06-16) · SDET+CI [A] |
| REQ-DASH-011 | AC-DASH-011-01 | EPIC-003 | 1 | `AC-DASH-011-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DASH-011 | AC-DASH-011-02 | EPIC-003 | 1 | `AC-DASH-011-02` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-DASH-011 | AC-DASH-011-03 | EPIC-003 | 1 | `AC-DASH-011-03` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-AUTH-001 | AC-AUTH-001-01 | EPIC-004 | 1 | `AC-AUTH-001-01` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-001 | AC-AUTH-001-02 | EPIC-004 | 1 | `AC-AUTH-001-02` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-001 | AC-AUTH-001-03 | EPIC-004 | 1 | `AC-AUTH-001-03` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-004 | AC-AUTH-004-01 | (2FA-enablement, future Phase 1) | 1 | `AC-AUTH-004-01` | deferred | Deferred 2026-06-15 — 2FA not ready to deploy; see Deferred |
| REQ-AUTH-004 | AC-AUTH-004-02 | (2FA-enablement, future Phase 1) | 1 | `AC-AUTH-004-02` | deferred | Deferred 2026-06-15 — 2FA not ready to deploy; see Deferred |
| REQ-AUTH-004 | AC-AUTH-004-03 | (2FA-enablement, future Phase 1) | 1 | `AC-AUTH-004-03` | deferred | Deferred 2026-06-15 — 2FA not ready to deploy; see Deferred |
| REQ-AUTH-005 | AC-AUTH-005-01 | (2FA-enablement, future Phase 1) | 1 | `AC-AUTH-005-01` | deferred | Deferred 2026-06-15 — 2FA not ready to deploy; see Deferred |
| REQ-AUTH-005 | AC-AUTH-005-02 | EPIC-004 | 1 | `AC-AUTH-005-02` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-006 | AC-AUTH-006-01 | EPIC-004 | 1 | `AC-AUTH-006-01` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-006 | AC-AUTH-006-02 | EPIC-004 | 1 | `AC-AUTH-006-02` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-006 | AC-AUTH-006-03 | EPIC-004 | 1 | `AC-AUTH-006-03` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-009 | AC-AUTH-009-01 | EPIC-004 | 1 | `AC-AUTH-009-01` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] |
| REQ-AUTH-010 | AC-AUTH-010-01 | EPIC-009 | 3 | `AC-AUTH-010-01` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] · owner→EPIC-009 2026-06-21 (consolidated; redirect mechanism built EPIC-004) · confirmed under EPIC-009 by PR#71 `169b09e` (2026-06-21) — `pnpm e2e:cross-app` `cross-app-redirect.spec.ts` 5/5, re-exercised through the new sign-in lane |
| REQ-AUTH-010 | AC-AUTH-010-02 | EPIC-009 | 3 | `AC-AUTH-010-02` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] · owner→EPIC-009 2026-06-21 (consolidated; redirect mechanism built EPIC-004) · confirmed under EPIC-009 by PR#71 `169b09e` (2026-06-21) — `cross-app-redirect.spec.ts` 5/5 |
| REQ-AUTH-010 | AC-AUTH-010-03 | EPIC-009 | 3 | `AC-AUTH-010-03` | verified | PR#38 `0444551` (2026-06-16) · SDET+CI [A] · owner→EPIC-009 2026-06-21 (consolidated; redirect mechanism built EPIC-004) · confirmed under EPIC-009 by PR#71 `169b09e` (2026-06-21) — `cross-app-redirect.spec.ts` 5/5 |
| REQ-AUTH-013 | AC-AUTH-013-01 | EPIC-009 | 3 | `AC-AUTH-013-01` | verified | [B] PR#71 `169b09e` (2026-06-21) — verified **vs the MOCK provider**: portal `sign-in-lane.spec.ts` 6/6 (CLIENT→portal, ACCOUNTANT→admin) + admin `sign-in-lane.spec.ts` 5/5 + tier-2/3 server-set-role assertions; real-provider (Clerk) re-validation outstanding → Phase 5 |
| REQ-AUTH-013 | AC-AUTH-013-02 | EPIC-009 | 3 | `AC-AUTH-013-02` | verified | [B] PR#71 `169b09e` (2026-06-21) — verified **vs the MOCK provider**: tier-6 e2e both surfaces (global sign-out clears the host-only `__mock_session` cookie → both apps re-auth) + tier-2/3; real-provider (Clerk) re-validation outstanding → Phase 5 |
| REQ-MSG-013 | AC-MSG-013-01 | EPIC-003 | 1 | `AC-MSG-013-01` | verified | PR#42 `ec151cb` (2026-06-17) · SDET+CI [A] |
| REQ-ONBD-001 | AC-ONBD-001-01 | EPIC-005 | 2 | `AC-ONBD-001-01` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-001 | AC-ONBD-001-02 | EPIC-005 | 2 | `AC-ONBD-001-02` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-001 | AC-ONBD-001-03 | EPIC-005 | 2 | `AC-ONBD-001-03` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-002 | AC-ONBD-002-01 | EPIC-005 | 2 | `AC-ONBD-002-01` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-002 | AC-ONBD-002-02 | EPIC-005 | 2 | `AC-ONBD-002-02` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-002 | AC-ONBD-002-03 | EPIC-005 | 2 | `AC-ONBD-002-03` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-002 | AC-ONBD-002-04 | EPIC-005 | 2 | `AC-ONBD-002-04` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-IDNT-007 | AC-IDNT-007-01 | EPIC-005 | 2 | `AC-IDNT-007-01` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-IDNT-007 | AC-IDNT-007-02 | EPIC-005 | 2 | `AC-IDNT-007-02` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-IDNT-007 | AC-IDNT-007-03 | EPIC-005 | 2 | `AC-IDNT-007-03` | verified | PR#48 `f879da2` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-003 | AC-ONBD-003-01 | EPIC-006 | 2 | `AC-ONBD-003-01` | verified | PR#50 `e55f8c5` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-003 | AC-ONBD-003-02 | EPIC-006 | 2 | `AC-ONBD-003-02` | verified | PR#50 `e55f8c5` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-003 | AC-ONBD-003-03 | EPIC-006 | 2 | `AC-ONBD-003-03` | verified | PR#50 `e55f8c5` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-003 | AC-ONBD-003-04 | EPIC-006 | 2 | `AC-ONBD-003-04` | verified | PR#50 `e55f8c5` (2026-06-18) · SDET+CI [A] |
| REQ-DASH-012 | AC-DASH-012-01 | EPIC-006 | 2 | `AC-DASH-012-01` | verified | PR#50 `e55f8c5` (2026-06-18) · SDET+CI [A] |
| REQ-DASH-012 | AC-DASH-012-02 | EPIC-006 | 2 | `AC-DASH-012-02` | verified | PR#50 `e55f8c5` (2026-06-18) · SDET+CI [A] |
| REQ-DASH-012 | AC-DASH-012-03 | EPIC-006 | 2 | `AC-DASH-012-03` | verified | PR#50 `e55f8c5` (2026-06-18) · SDET+CI [A] |
| REQ-ONBD-004 | AC-ONBD-004-01 | EPIC-007 | 2 | `AC-ONBD-004-01` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — e2e `document-upload.spec.ts` |
| REQ-ONBD-004 | AC-ONBD-004-02 | EPIC-007 | 2 | `AC-ONBD-004-02` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — e2e outstanding-badge |
| REQ-ONBD-004 | AC-ONBD-004-03 | EPIC-007 | 2 | `AC-ONBD-004-03` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — e2e upload→fulfilled |
| REQ-ONBD-004 | AC-ONBD-004-04 | EPIC-007 | 2 | `AC-ONBD-004-04` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — tier-3 `checklist.test.ts` (zero-reqs vacuously satisfied) |
| REQ-FILE-007 | AC-FILE-007-01 | EPIC-007 | 2 | `AC-FILE-007-01` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — e2e admin `document-requests.spec.ts` |
| REQ-FILE-007 | AC-FILE-007-02 | EPIC-007 | 2 | `AC-FILE-007-02` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — cross-app author→client-sees |
| REQ-FILE-007 | AC-FILE-007-03 | EPIC-007 | 2 | `AC-FILE-007-03` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — cross-app client-fulfills |
| REQ-FILE-008 | AC-FILE-008-01 | EPIC-007 | 2 | `AC-FILE-008-01` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — tier-3 `checklist.test.ts` |
| REQ-FILE-008 | AC-FILE-008-02 | EPIC-007 | 2 | `AC-FILE-008-02` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — e2e outstanding-vs-fulfilled |
| REQ-FILE-008 | AC-FILE-008-03 | EPIC-007 | 2 | `AC-FILE-008-03` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — e2e fulfilled-leaves-outstanding |
| REQ-FILE-001 | AC-FILE-001-02 | EPIC-007 | 2 | `AC-FILE-001-02` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — tier-3 pipeline clean→active |
| REQ-FILE-001 | AC-FILE-001-05 | EPIC-007 | 2 | `AC-FILE-001-05` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — tier-3 HARD isolation `0007` (CLIENT-B reads ZERO) |
| REQ-FILE-002 | AC-FILE-002-01 | EPIC-007 | 2 | `AC-FILE-002-01` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — e2e any-type (no accept restriction) |
| REQ-FILE-003 | AC-FILE-003-01 | EPIC-007 | 2 | `AC-FILE-003-01` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — tier-3 Azurite `isServerEncrypted` |
| REQ-FILE-003 | AC-FILE-003-02 | EPIC-007 | 2 | `AC-FILE-003-02` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — tier-3 HARD authz-required (+ M1 fix regression) |
| REQ-FILE-003 | AC-FILE-003-03 | EPIC-007 | 2 | `AC-FILE-003-03` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — tier-3 null-ctx fail-closed (no public path) |
| REQ-FILE-003 | AC-FILE-003-04 | EPIC-007 | 2 | `AC-FILE-003-04` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — tier-3 TTL-bounded signed URL |
| REQ-NFR-009 | AC-NFR-009-01 | EPIC-007 | 2 | `AC-NFR-009-01` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — tier-3 indeterminate→stays-pending (fail-closed) |
| REQ-NFR-009 | AC-NFR-009-02 | EPIC-007 | 2 | `AC-NFR-009-02` | verified | [A] PR#52 `eaa5875` / CI 27844771147 — tier-3 infected→withheld + e2e rejection banner |
| REQ-ONBD-005 | AC-ONBD-005-01 | EPIC-008 | 2 | `AC-ONBD-005-01` | verified | [A] PR#55 `7fe2872` (2026-06-20) / CI 27870105845 — tier-2 `predicate.test.ts:64` + tier-3 `integration.test.ts:485` (real container); **browser-e2e tier deferred to BUG-008-001**, carried by tier-3 |
| REQ-ONBD-005 | AC-ONBD-005-02 | EPIC-008 | 2 | `AC-ONBD-005-02` | verified | [A] PR#55 `7fe2872` (2026-06-20) / CI 27870105845 — tier-2 predicate single-unsatisfied + tier-3 `integration.test.ts:396/429/456` (no transition, zero notif) + portal e2e negative path |
| REQ-ONBD-006 | AC-ONBD-006-01 | EPIC-008 | 2 | `AC-ONBD-006-01` | verified | [A] PR#55 `7fe2872` (2026-06-20) / CI 27870105845 — tier-3 `integration.test.ts:374` + admin `engagement-status.test.ts:100/114` + admin e2e `:408` (In Progress) |
| REQ-ONBD-006 | AC-ONBD-006-02 | EPIC-008 | 2 | `AC-ONBD-006-02` | verified | [A] PR#55 `7fe2872` (2026-06-20) / CI 27870105845 — tier-3 `integration.test.ts:374` (no accountant input) + admin e2e `:408` (transition without manual action) |
| REQ-ONBD-006 | AC-ONBD-006-03 | EPIC-008 | 2 | `AC-ONBD-006-03` | verified | [A] PR#55 `7fe2872` (2026-06-20) / CI 27870105845 — tier-3 fire-once `integration.test.ts:507/542` (notif=1, audit=1; already-In-Progress no-op) + portal negative e2e |
| REQ-ONBD-007 | AC-ONBD-007-01 | EPIC-008 | 2 | `AC-ONBD-007-01` | verified | [A] PR#55 `7fe2872` (2026-06-20) / CI 27870105845 — tier-3 `integration.test.ts:597/639/653/666` (accountant-only read, ADR-005 §6) + component `NotificationsIndicator.test.tsx` + admin e2e `:429` |
| REQ-ONBD-007 | AC-ONBD-007-02 | EPIC-008 | 2 | `AC-ONBD-007-02` | verified | [A] PR#55 `7fe2872` (2026-06-20) / CI 27870105845 — tier-3 `integration.test.ts:615` (client name in title/body) + component `:126/137` + admin e2e `:453` |
| REQ-MSG-013 | AC-MSG-013-04 | EPIC-008 | 2 | `AC-MSG-013-04` | verified | [A] PR#55 `7fe2872` (2026-06-20) / CI 27870105845 — dual-tagged with AC-ONBD-007-01 at tier-3 `integration.test.ts:597` + component `:76` + admin e2e `:391` |
| REQ-LIFE-001 | AC-LIFE-001-01 | EPIC-010 | 3 | `AC-LIFE-001-01` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-3 `engagement.lifecycle.transition.test.ts` (pipeline status invariant) |
| REQ-LIFE-001 | AC-LIFE-001-02 | EPIC-010 | 3 | `AC-LIFE-001-02` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-3 `engagement.persistence.test.ts` (New default) |
| REQ-LIFE-001 | AC-LIFE-001-03 | EPIC-010 | 3 | `AC-LIFE-001-03` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-6 `engagement-lifecycle.spec.ts` (forward order advance) |
| REQ-LIFE-002 | AC-LIFE-002-01 | EPIC-010 | 3 | `AC-LIFE-002-01` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-2/5 `engagement-label.test.ts` (4→3 mapping) + tier-6 `engagement-labels.spec.ts` |
| REQ-LIFE-002 | AC-LIFE-002-02 | EPIC-010 | 3 | `AC-LIFE-002-02` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-2/5 `engagement-label.test.ts` (Review→"In Progress") + tier-6 `engagement-labels.spec.ts` |
| REQ-LIFE-002 | AC-LIFE-002-03 | EPIC-010 | 3 | `AC-LIFE-002-03` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-6 `engagement-labels.spec.ts` (three client-facing states) |
| REQ-LIFE-003 | AC-LIFE-003-01 | EPIC-010 | 3 | `AC-LIFE-003-01` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-6 `engagement-lifecycle.spec.ts` (accountant manual transition) |
| REQ-LIFE-003 | AC-LIFE-003-02 | EPIC-010 | 3 | `AC-LIFE-003-02` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — verified-by-reference against the intact EPIC-008 onboarding-completion suite (the one allowed auto-advance); no other auto-advance path |
| REQ-LIFE-003 | AC-LIFE-003-03 | EPIC-010 | 3 | `AC-LIFE-003-03` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-3 `engagement.lifecycle.transition.test.ts` + RLS (client cannot transition) |
| REQ-LIFE-004 | AC-LIFE-004-01 | EPIC-010 | 3 | `AC-LIFE-004-01` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-2/5 `engagement-label.test.ts` (Review internal invariant) |
| REQ-LIFE-004 | AC-LIFE-004-02 | EPIC-010 | 3 | `AC-LIFE-004-02` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-2/5 `engagement-label.test.ts` (Review imposes no client action) |
| REQ-LIFE-004 | AC-LIFE-004-03 | EPIC-010 | 3 | `AC-LIFE-004-03` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-2/5 `engagement-label.test.ts` (Review not a client approval step) |
| REQ-LIFE-005 | AC-LIFE-005-01 | EPIC-010 | 3 | `AC-LIFE-005-01` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-6 `engagement-lifecycle.spec.ts` (delivery confirmation required) + tier-3 two-confirmation gate |
| REQ-LIFE-005 | AC-LIFE-005-02 | EPIC-010 | 3 | `AC-LIFE-005-02` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-6 `engagement-lifecycle.spec.ts` (filing confirmation required) + tier-3 two-confirmation gate |
| REQ-LIFE-005 | AC-LIFE-005-03 | EPIC-010 | 3 | `AC-LIFE-005-03` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-3 `engagement.lifecycle.transition.test.ts` (two-confirmation gate negative+positive) |
| REQ-LIFE-006 | AC-LIFE-006-01 | EPIC-010 | 3 | `AC-LIFE-006-01` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-6 `engagement-lifecycle.spec.ts` + tier-3 transition (accountant reopen) |
| REQ-LIFE-006 | AC-LIFE-006-02 | EPIC-010 | 3 | `AC-LIFE-006-02` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-3 `engagement.lifecycle.transition.test.ts` + RLS (client cannot reopen) |
| REQ-AUTH-002 | AC-AUTH-002-01 | EPIC-010 | 3 | `AC-AUTH-002-01` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-3 `engagement.lifecycle.rls.test.ts` (ACCOUNTANT reads all) |
| REQ-AUTH-002 | AC-AUTH-002-02 | EPIC-010 | 3 | `AC-AUTH-002-02` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-3 `engagement.lifecycle.rls.test.ts` (ACCOUNTANT all engagements regardless of owner) |
| REQ-AUTH-002 | AC-AUTH-002-03 | EPIC-010 | 3 | `AC-AUTH-002-03` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-3 `engagement.lifecycle.rls.test.ts` (no partitioning hides from accountant) |
| REQ-AUTH-003 | AC-AUTH-003-01 | EPIC-010 | 3 | `AC-AUTH-003-01` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — HARD tier-3 `engagement.lifecycle.rls.test.ts` `pol_Engagement` (CLIENT-A own); **feature AC** signed off here over the Phase-2-built mechanism (EPIC-005/007), mechanism not double-counted |
| REQ-AUTH-003 | AC-AUTH-003-02 | EPIC-010 | 3 | `AC-AUTH-003-02` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — HARD tier-3 `engagement.lifecycle.rls.test.ts` (CLIENT-B ZERO / null ZERO) + tier-6 `engagement-isolation.spec.ts`; **feature AC** over the Phase-2 mechanism |
| REQ-AUTH-003 | AC-AUTH-003-03 | EPIC-010 | 3 | `AC-AUTH-003-03` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — HARD tier-3 `engagement.lifecycle.rls.test.ts` direct-reference fetch-by-id denial + tier-6 `engagement-isolation.spec.ts`; **feature AC** over the Phase-2 mechanism |
| REQ-AUTH-008 | AC-AUTH-008-01 | EPIC-010 | 3 | `AC-AUTH-008-01` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-3 `engagement.lifecycle.rls.test.ts` (client retains sign-in after completion) |
| REQ-AUTH-008 | AC-AUTH-008-02 | EPIC-010 | 3 | `AC-AUTH-008-02` | verified | [C] PR#87 `7afd312` (2026-06-22) / CI 27988679054 — tier-3 `engagement.lifecycle.rls.test.ts` (client views completed engagement indefinitely) |
| REQ-LIFE-007 | AC-LIFE-007-01 | EPIC-011 | 3 | `AC-LIFE-007-01` | verified | PR#89 `9445e36` (2026-06-23) · SDET+CI [D] — admin e2e `engagement-attributes.spec.ts` + tier-3 `engagement-attributes.test.ts` (`setEngagementDueDate`) |
| REQ-LIFE-007 | AC-LIFE-007-02 | EPIC-011 | 3 | `AC-LIFE-007-02` | verified | PR#89 `9445e36` (2026-06-23) · SDET+CI [D] — admin e2e + tier-3 (first-set + update through the same seam) |
| REQ-LIFE-007 | AC-LIFE-007-03 | EPIC-011 | 3 | `AC-LIFE-007-03` | verified | PR#89 `9445e36` (2026-06-23) · SDET+CI [D] — tier-3 `engagement-attributes.test.ts` (distinct-engagement isolation: A set leaves B unaffected) |
| REQ-LIFE-008 | AC-LIFE-008-01 | EPIC-011 | 3 | `AC-LIFE-008-01` | verified | PR#89 `9445e36` (2026-06-23) · SDET+CI [D] — admin e2e + tier-3 (`recordEngagementNote`) |
| REQ-LIFE-008 | AC-LIFE-008-02 | EPIC-011 | 3 | `AC-LIFE-008-02` | verified | PR#89 `9445e36` (2026-06-23) · SDET+CI [D] — **HARD tier-3 RLS** `engagement-note.rls.test.ts` (`pol_EngagementNote`: ACCOUNTANT reads; CLIENT reads ZERO; null SESSION_CONTEXT reads ZERO) |
| REQ-LIFE-008 | AC-LIFE-008-03 | EPIC-011 | 3 | `AC-LIFE-008-03` | verified | PR#89 `9445e36` (2026-06-23) · SDET+CI [D] — tier-3 RLS server-side negative + tier-6 portal negative `engagement-note-confidentiality.spec.ts` (client participant never sees note text) |
| REQ-LIFE-009 | AC-LIFE-009-01 | EPIC-011 | 3 | `AC-LIFE-009-01` | verified | PR#89 `9445e36` (2026-06-23) · SDET+CI [D] — admin e2e + tier-3 (`setEngagementPriority` true) |
| REQ-LIFE-009 | AC-LIFE-009-02 | EPIC-011 | 3 | `AC-LIFE-009-02` | verified | PR#89 `9445e36` (2026-06-23) · SDET+CI [D] — admin e2e + tier-3 (`setEngagementPriority` false) |
| REQ-LIFE-009 | AC-LIFE-009-03 | EPIC-011 | 3 | `AC-LIFE-009-03` | verified | PR#89 `9445e36` (2026-06-23) · SDET+CI [D] — tier-3 `engagement-attributes.test.ts` (distinct-engagement isolation: A flag leaves B unaffected) |
| REQ-DOOR-009 | AC-DOOR-009-01 | EPIC-012 | 3 | `AC-DOOR-009-01` | planned | — (placed 2026-06-21) |
| REQ-DOOR-009 | AC-DOOR-009-02 | EPIC-012 | 3 | `AC-DOOR-009-02` | planned | — (placed 2026-06-21) |
| REQ-DOOR-009 | AC-DOOR-009-03 | EPIC-012 | 3 | `AC-DOOR-009-03` | planned | — (placed 2026-06-21) |
| REQ-DOOR-009 | AC-DOOR-009-04 | EPIC-012 | 3 | `AC-DOOR-009-04` | planned | — (placed 2026-06-21) |
| REQ-DOOR-010 | AC-DOOR-010-01 | EPIC-012 | 3 | `AC-DOOR-010-01` | planned | — (placed 2026-06-21) |
| REQ-DOOR-010 | AC-DOOR-010-02 | EPIC-012 | 3 | `AC-DOOR-010-02` | planned | — (placed 2026-06-21) |
| REQ-DOOR-010 | AC-DOOR-010-03 | EPIC-012 | 3 | `AC-DOOR-010-03` | planned | — (placed 2026-06-21) |
| REQ-DOOR-010 | AC-DOOR-010-04 | EPIC-012 | 3 | `AC-DOOR-010-04` | planned | — (placed 2026-06-21) |
| REQ-LIFE-010 | AC-LIFE-010-01 | EPIC-012 | 3 | `AC-LIFE-010-01` | planned | — (placed 2026-06-21) |
| REQ-LIFE-010 | AC-LIFE-010-02 | EPIC-012 | 3 | `AC-LIFE-010-02` | planned | — (placed 2026-06-21) |
| REQ-LIFE-011 | AC-LIFE-011-01 | EPIC-012 | 3 | `AC-LIFE-011-01` | planned | — (placed 2026-06-21) |
| REQ-LIFE-011 | AC-LIFE-011-02 | EPIC-012 | 3 | `AC-LIFE-011-02` | planned | — (placed 2026-06-21) |
| REQ-LIFE-011 | AC-LIFE-011-03 | EPIC-012 | 3 | `AC-LIFE-011-03` | planned | — (placed 2026-06-21) |
| REQ-LIFE-011 | AC-LIFE-011-04 | EPIC-012 | 3 | `AC-LIFE-011-04` | planned | — (placed 2026-06-21) |
| REQ-LIFE-012 | AC-LIFE-012-01 | EPIC-012 | 3 | `AC-LIFE-012-01` | planned | — (placed 2026-06-21) |
| REQ-LIFE-012 | AC-LIFE-012-02 | EPIC-012 | 3 | `AC-LIFE-012-02` | planned | — (placed 2026-06-21) |
| REQ-LIFE-012 | AC-LIFE-012-03 | EPIC-012 | 3 | `AC-LIFE-012-03` | planned | — (placed 2026-06-21) |
| REQ-AUTH-007 | AC-AUTH-007-01 | EPIC-012 | 3 | `AC-AUTH-007-01` | planned | — (placed 2026-06-21) |
| REQ-AUTH-007 | AC-AUTH-007-02 | EPIC-012 | 3 | `AC-AUTH-007-02` | planned | — (placed 2026-06-21) |
| REQ-AUTH-007 | AC-AUTH-007-03 | EPIC-012 | 3 | `AC-AUTH-007-03` | planned | — (placed 2026-06-21); each participant sees the shared engagement, unrelated client ZERO |
| REQ-FILE-001 | AC-FILE-001-01 | EPIC-013 | 3 | `AC-FILE-001-01` | planned | — (placed 2026-06-21); accountant upload (client-upload -02/-05 were EPIC-007) |
| REQ-FILE-001 | AC-FILE-001-03 | EPIC-013 | 3 | `AC-FILE-001-03` | planned | — (placed 2026-06-21); accountant download |
| REQ-FILE-001 | AC-FILE-001-04 | EPIC-013 | 3 | `AC-FILE-001-04` | planned | — (placed 2026-06-21); client download |
| REQ-FILE-009 | AC-FILE-009-01 | EPIC-013 | 3 | `AC-FILE-009-01` | planned | — (placed 2026-06-21) |
| REQ-FILE-009 | AC-FILE-009-02 | EPIC-013 | 3 | `AC-FILE-009-02` | planned | — (placed 2026-06-21) |
| REQ-FILE-009 | AC-FILE-009-03 | EPIC-013 | 3 | `AC-FILE-009-03` | planned | — (placed 2026-06-21); prior versions retained |
| REQ-FILE-010 | AC-FILE-010-01 | EPIC-013 | 3 | `AC-FILE-010-01` | planned | — (placed 2026-06-21) |
| REQ-FILE-010 | AC-FILE-010-02 | EPIC-013 | 3 | `AC-FILE-010-02` | planned | — (placed 2026-06-21) |
| REQ-FILE-010 | AC-FILE-010-03 | EPIC-013 | 3 | `AC-FILE-010-03` | planned | — (placed 2026-06-21) |
| REQ-FILE-010 | AC-FILE-010-04 | EPIC-013 | 3 | `AC-FILE-010-04` | planned | — (placed 2026-06-21); folder mgmt accountant-only |
| REQ-FILE-011 | AC-FILE-011-01 | EPIC-013 | 3 | `AC-FILE-011-01` | planned | — (placed 2026-06-21); top-level by engagement |
| REQ-FILE-011 | AC-FILE-011-02 | EPIC-013 | 3 | `AC-FILE-011-02` | planned | — (placed 2026-06-21); top-level by tax year (EPIC-012 tax-year attr) |
| REQ-FILE-011 | AC-FILE-011-03 | EPIC-013 | 3 | `AC-FILE-011-03` | planned | — (placed 2026-06-21) |
| REQ-FILE-004 | AC-FILE-004-01 | EPIC-014 | 3 | `AC-FILE-004-01` | planned | — (placed 2026-06-21) |
| REQ-FILE-004 | AC-FILE-004-02 | EPIC-014 | 3 | `AC-FILE-004-02` | planned | — (placed 2026-06-21); hard no-client-delete |
| REQ-FILE-004 | AC-FILE-004-03 | EPIC-014 | 3 | `AC-FILE-004-03` | planned | — (placed 2026-06-21); no client-facing remove path |
| REQ-FILE-006 | AC-FILE-006-01 | EPIC-014 | 3 | `AC-FILE-006-01` | planned | — (placed 2026-06-21) |
| REQ-FILE-006 | AC-FILE-006-02 | EPIC-014 | 3 | `AC-FILE-006-02` | planned | — (placed 2026-06-21); retained, not destroyed in-window |
| REQ-FILE-006 | AC-FILE-006-03 | EPIC-014 | 3 | `AC-FILE-006-03` | planned | — (placed 2026-06-21); recoverable until retention elapses |
| REQ-FILE-005 | AC-FILE-005-01 | EPIC-014 | 3 | `AC-FILE-005-01` | planned | — (placed 2026-06-21); 7yr from completion |
| REQ-FILE-005 | AC-FILE-005-02 | EPIC-014 | 3 | `AC-FILE-005-02` | planned | — (placed 2026-06-21); no removal in-window incl. accountant delete |
| REQ-FILE-005 | AC-FILE-005-03 | EPIC-014 | 3 | `AC-FILE-005-03` | planned | — (placed 2026-06-21); retention governs in-window |
| REQ-NFR-006 | AC-NFR-006-01 | EPIC-014 | 3 | `AC-NFR-006-01` | planned | — (placed 2026-06-21); system-enforced retention (NFR twin of FILE-005) |
| REQ-FILE-013 | AC-FILE-013-01 | EPIC-015 | 3 | `AC-FILE-013-01` | planned | — (placed 2026-06-21); eligible only post-window |
| REQ-FILE-013 | AC-FILE-013-02 | EPIC-015 | 3 | `AC-FILE-013-02` | planned | — (placed 2026-06-21); accountant/admin-only |
| REQ-FILE-013 | AC-FILE-013-03 | EPIC-015 | 3 | `AC-FILE-013-03` | planned | — (placed 2026-06-21); explicit confirmation required |
| REQ-FILE-013 | AC-FILE-013-04 | EPIC-015 | 3 | `AC-FILE-013-04` | planned | — (placed 2026-06-21); never automatic on expiry |
| REQ-FILE-013 | AC-FILE-013-05 | EPIC-015 | 3 | `AC-FILE-013-05` | planned | — (placed 2026-06-21); eligible-but-unpurged stays retained |
| REQ-FILE-013 | AC-FILE-013-06 | EPIC-015 | 3 | `AC-FILE-013-06` | planned | — (placed 2026-06-21); purge audited, record survives |
| REQ-FILE-014 | AC-FILE-014-01 | EPIC-015 | 3 | `AC-FILE-014-01` | planned | — (placed 2026-06-21); hold on engagement |
| REQ-FILE-014 | AC-FILE-014-02 | EPIC-015 | 3 | `AC-FILE-014-02` | planned | — (placed 2026-06-21); hold on client → all engagements |
| REQ-FILE-014 | AC-FILE-014-03 | EPIC-015 | 3 | `AC-FILE-014-03` | planned | — (placed 2026-06-21); held = no purge even post-expiry |
| REQ-FILE-014 | AC-FILE-014-04 | EPIC-015 | 3 | `AC-FILE-014-04` | planned | — (placed 2026-06-21); indefinite, no auto-expire |
| REQ-FILE-014 | AC-FILE-014-05 | EPIC-015 | 3 | `AC-FILE-014-05` | planned | — (placed 2026-06-21); lift restores eligibility |
| REQ-FILE-014 | AC-FILE-014-06 | EPIC-015 | 3 | `AC-FILE-014-06` | planned | — (placed 2026-06-21); placing audited |
| REQ-FILE-014 | AC-FILE-014-07 | EPIC-015 | 3 | `AC-FILE-014-07` | planned | — (placed 2026-06-21); lifting audited |
| REQ-FILE-015 | AC-FILE-015-01 | EPIC-015 | 3 | `AC-FILE-015-01` | planned | — (placed 2026-06-21); in-window erasure = access-revocation only |
| REQ-FILE-015 | AC-FILE-015-02 | EPIC-015 | 3 | `AC-FILE-015-02` | planned | — (placed 2026-06-21); destruction only post-window + no hold + confirmed |
| REQ-NFR-010 | AC-NFR-010-07 | EPIC-015 | 3 | `AC-NFR-010-07` | planned | — (placed 2026-06-21); audit survives purge (rest of NFR-010 → Phase-4 audit slice) |

## Split requirements

Requirements whose AC span more than one epic (or one epic + orphans/deferred) — the fan-out, at a glance.

- **REQ-DOOR-002 (services catalog)** — split across two epics:
  - **EPIC-001** owns **AC-DOOR-002-04** (a deactivated service does not appear on the public services page
    or request form) — testable from the public front door.
  - **EPIC-002** owns **AC-DOOR-002-01, -02, -03, -05** (accountant add/edit/deactivate + "only the
    accountant may change the catalog") — these need the authenticated accountant admin surface.
- **REQ-MSG-013 (accountant notification types)** — split across two phases plus a Phase-4 remainder:
  - **EPIC-003** (Phase 1) owns **AC-MSG-013-01** (new service-request notification).
  - **EPIC-008** (Phase 2) owns **AC-MSG-013-04** (onboarding completed) — the ONBD-007 notification is the
    MSG-013-04 event; pulled forward from Phase 4 because onboarding completion is built in Phase 2 (same
    pattern as EPIC-003 owning -01).
  - **AC-MSG-013-02/-03/-05/-06** (new message, document uploaded, document-request overdue, due-date
    approaching) → **Orphans**, targeted at **Phase 4** (the notification feed), since those source events
    are not built until later phases.
- **REQ-FILE-001 (file exchange within an engagement)** — split between Phase 2 (onboarding upload) and
  Phase 3 (full exchange):
  - **EPIC-007** (Phase 2) owns **AC-FILE-001-02** (client uploads to their engagement) and
    **AC-FILE-001-05** (engagement isolation) — the client-upload path the onboarding document step needs.
  - **EPIC-013** (Phase 3) owns **AC-FILE-001-01** (accountant upload) and **AC-FILE-001-03/-04** (both-party
    download) — the broader exchange surface (placed 2026-06-21). **REQ-FILE-001 is now fully placed.**
- **REQ-NFR-010 (audit trail)** — split between Phase 3 and a Phase-4 audit-trail slice:
  - **EPIC-015** (Phase 3) owns **AC-NFR-010-07** (the audit record survives a purge) — exclusively
    demonstrable at the purge path (placed 2026-06-21).
  - **AC-NFR-010-01/-02/-03/-04/-05/-06** (document-access logging, transition logging, admin-action logging,
    auth-event logging, the **accountant-only audit read surface**, audit ≥7yr retention) → **Orphans**,
    targeted at a **dedicated audit-trail slice (Phase 4)**. The audit *mechanism* (ADR-019) already exists
    and every relevant slice (incl. EPIC-013/014/015) **emits** these events as an adherence obligation; the
    *feature* AC — chiefly the accountant-only audit **read** surface (-05) — want their own slice.

## Provider re-validation (mock → real enablement slices)

Per the standing mock-first directive, some AC are **delivered/`verified` against a mocked provider** by
their owning epic, then **re-validated against the real provider** by a later "enablement" slice. The
enablement slice **owns no new coverage rows** — it re-runs the same AC-id-tagged tests against the real
seam; the owning epic's rows stay `verified`, and the real-provider confirmation is recorded here.

- **Real Clerk login + invitations + 2FA → Phase 5 (Production Readiness, placeholder).** Re-validates
  **AC-AUTH-001-01/-02/-03, AC-AUTH-009-01** (owned by EPIC-004) and **AC-AUTH-013-01/-02, AC-AUTH-010-01/-02/-03**
  (owned by EPIC-009 — the sign-in/sign-out capability + role-based landing, verified-against-mock) against
  **live Clerk** when the production-readiness phase is decomposed; plus the invitation AC
  (**AC-AUTH-006-01/-02/-03** + the sign-up half of **AC-AUTH-005-02**) and 2FA (see § Deferred). **Not
  minted as an epic yet.** *(Note: the Phase-3 **EPIC-009 sign-in lane realizes REQ-AUTH-013 against the MOCK
  provider** for the proof of concept — it is the mock realization that Phase 5 re-validates against real
  Clerk, not the real-provider slice itself.)*
- *(Same pattern, also Phase 5: real Docuseal e-sign re-validates EPIC-005's ONBD-002 / IDNT-007 e-sign AC;
  real malware scanner re-validates EPIC-007's NFR-009 AC; real email replaces Mailhog.)*

## Orphans

Source AC not yet decomposed into any epic. This is the v1 work remaining — each becomes `planned` when a
Planning Agent run places it in an epic. (v2 AC are tracked separately under Deferred, not here.)

**MVP-adjacent (deferred for lack of an MVP home — with target phase):**
- ✅ **REQ-DOOR-009** (returning client requests from inside the portal) — AC-DOOR-009-01..04 → **placed in
  EPIC-012 (Phase 3)** 2026-06-21.
- ✅ **REQ-DOOR-010** (accountant initiates an engagement for an existing client) — AC-DOOR-010-01..04 →
  **placed in EPIC-012 (Phase 3)** 2026-06-21.
- ✅ **REQ-AUTH-002** (accountant full visibility) — AC-AUTH-002-01..03 → **placed in EPIC-010 (Phase 3)**
  2026-06-21.
- ✅ **REQ-AUTH-003** (client sees only their own data — RLS isolation feature AC) — AC-AUTH-003-01..03 →
  **placed in EPIC-010 (Phase 3)** 2026-06-21 (mechanism built Phase 2 EPIC-005/007; the feature AC sign off
  here, incl. the direct-reference path).
- ✅ **REQ-AUTH-007** (multiple participants per engagement) — AC-AUTH-007-01..03 → **placed in EPIC-012
  (Phase 3)** 2026-06-21.
- ✅ **REQ-AUTH-008** (indefinite access after completion) — AC-AUTH-008-01..02 → **placed in EPIC-010
  (Phase 3)** 2026-06-21.
- **REQ-MSG-013** remainder — AC-MSG-013-02..06 → **Phase 4**.
- **REQ-MSG-014** (all client notification types) — AC-MSG-014-01..07 → **Phase 4** (the client notification
  feed; in the MVP accept/decline reach the account-less prospect by email, not a feed).

**Whole domains pending decomposition** (each `AC-*` orphaned until a future run slices it into a phase —
see `ROADMAP.md` Phases 3–4):
- **ONBD** — ✅ **fully placed in Phase 2** (EPIC-005/006/007/008): REQ-ONBD-001..007. No ONBD orphans
  remain. *(REQ-ONBD-008 is v2 → Deferred.)*
- **LIFE** (Phase 3) — ✅ **fully placed in the Phase-3 lifecycle core** (EPIC-010/011/012), 2026-06-21:
  REQ-LIFE-001..012 (v1). No LIFE orphans remain. The *minimal* Engagement substrate (New / In Progress) was
  introduced in Phase 2 (no LIFE AC claimed there); the **full pipeline, attributes, creation paths, and
  multi-participant** AC land in EPIC-010 (001..006), EPIC-011 (007/008/009), EPIC-012 (010/011/012).
  *(REQ-LIFE-013/014 are v2 → Deferred.)*
- **FILE** (Phase 3) — ✅ **fully placed across Phase 2 + Phase 3** (2026-06-21), with one Phase-4 exception:
  - **Phase 2 (EPIC-007):** FILE-002, FILE-003, FILE-007, FILE-008 in full + the FILE-001 client-upload/
    isolation subset.
  - **Phase 3 (EPIC-013/014/015):** FILE-001 remainder, FILE-009/010/011 (EPIC-013); FILE-004/006/005
    (EPIC-014); FILE-013/014/015 (EPIC-015). **No FILE orphans remain** except —
  - **REQ-FILE-012** (overdue document-request flagging + configurable reminder cadence, AC-FILE-012-01..04)
    → **Phase 4** (needs the reminder/notification engine REQ-MSG-018 / REQ-DASH-008). *(REQ-FILE-016 is v2 →
    Deferred.)*
- **MSG** (Phase 4) — REQ-MSG-001..012, -015..018 (v1), plus the MSG-013 remainder (**-02/-03/-05/-06** —
  -01 in EPIC-003, **-04 in EPIC-008**) and the MSG-014 remainder above. *(REQ-MSG-019 is v2 → Deferred.)*
- **DASH** (Phase 4) — REQ-DASH-001..009, -013 (DASH-010 in EPIC-002, DASH-011 in EPIC-003, **DASH-012 in
  EPIC-006**).
- **IDNT** (Phase 4) — REQ-IDNT-001..004, -006 (**IDNT-007 in EPIC-005**; IDNT-005 → Deferred).
- **NFR** (cross-cutting) — REQ-NFR-001..005, -007, -008, -011 mapped onto the epic(s) whose slice must
  demonstrate each (e.g. RLS isolation on the first client-scoped read slice; malware scanning on the first
  upload slice). **Placed so far:** AC-NFR-009 (malware scan) → Phase 2 (EPIC-007); **AC-NFR-006-01
  (system-enforced 7-year retention) → Phase 3 (EPIC-014)**; **AC-NFR-010-07 (audit survives purge) →
  Phase 3 (EPIC-015)**. **AC-NFR-010-01..06** (the audit-trail feature — incl. the accountant-only audit read
  surface) → a **dedicated audit-trail slice in Phase 4** (see Split requirements); the audit *mechanism*
  (ADR-019) is emitted by many slices already. The remaining NFR AC are attached to epics as those slices are
  authored.

## Deferred

AC explicitly out of current scope, with rationale. Distinct from orphaned — deferred AC are a deliberate
decision, not pending v1 work.

- **2FA (AC-AUTH-004-01/-02/-03 + AC-AUTH-005-01)** — Deferred 2026-06-15 per user direction — 2FA is not
  ready to deploy; the auth spine (EPIC-004) ships without it. **Re-scoped 2026-06-20 (per user direction):**
  this item is **2FA-only** and now lives in the end-of-cycle **Phase 5 — Production Readiness** placeholder,
  alongside the real-Clerk login standup it depends on (real Clerk must exist before 2FA enforcement can be
  validated). *(The Phase-3 **EPIC-009 sign-in lane** realizes the sign-in/sign-out capability (REQ-AUTH-013) against the mock provider — unrelated to 2FA, which stays here in Phase 5.)*
  REQ-AUTH-004 (mandatory accountant 2FA) leaves EPIC-004 entirely; REQ-AUTH-005 keeps only its no-2FA path
  (AC-AUTH-005-02) in EPIC-004, with the enrollment path (AC-AUTH-005-01) deferred to Phase 5. The
  requirements (`.requirements/REQ-AUTH-004/005.md`) are unchanged — a planning-level deferral of the AC, not
  a requirement deletion.
- **REQ-IDNT-005 (permanent client hard-delete)** — descoped from v1 per requirements `OQ-004` (hard-delete
  vs. 7-year retention precedence; the wholesale-erasure deferral was **not** reversed by the 2026-06-14
  purge decision). To be carried as `deferred` when the IDNT domain is decomposed; recorded now so the
  decision is not lost.
- **v2 requirement set (above v1 acceptance — added 2026-06-14, not yet phased):**
  - **REQ-ONBD-008** — dynamic, conditional intake organizer.
  - **REQ-FILE-016** — prior-year-based expected-document detection.
  - **REQ-LIFE-013** — outstanding-question tracking.
  - **REQ-LIFE-014** — recurring engagements & year-over-year reminders.
  - **REQ-MSG-019** — proactive lifecycle accountability / automated follow-up engine.
  - **REQ-AUTH-011** — multiple accountant-side staff accounts within one firm.
  - **REQ-AUTH-012** — staff permissions gate actions; full firm-wide visibility.
  > These are `deferred` here only in the sense of "not part of the v1 roadmap phases." They will be sliced
  > into a v2 phase set in a later planning run. (Payments was considered and **deferred entirely** per
  > requirements OQ-012 — no requirement authored, nothing to track here.)

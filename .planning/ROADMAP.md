# Roadmap

> **Living document.** The authoritative *current* phasing of the product into vertically-sliced epics,
> MVP-first, driving toward full acceptance of every requirement's acceptance criteria. The Planning
> Agent maintains it (see `AGENT.md`); per-AC sign-off status lives in `COVERAGE.md`. Update the
> amendment history below whenever a phase's epic set or ordering changes.

## Status / amendment history

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

## Phase 3 — Engagement lifecycle & secure file exchange *(fully decomposed — EPIC-009..015)*

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
| **EPIC-009** | Sign-in lane — realizes the **sign-in/sign-out capability** (REQ-AUTH-013) and the consolidated **role-based landing** (REQ-AUTH-010) — **5 AC** (2 new sign-in/sign-out, realized vs the mock provider; 3 redirect already verified). In the PoC it ships as a usable in-browser sign-in page + role/user switcher over the mock-session seam (`AUTH_PROVIDER=mock`), wired to the demo seed accounts, **inert under the real provider**, so a tester can drive/demo as the Accountant or any seeded Client without the devtools hack. Real Clerk + 2FA → Phase 5. | `planned` | EPIC-004 ✅ |
| **EPIC-010** | Engagement lifecycle pipeline & visibility — full New→In Progress→Review→Complete pipeline, manual transitions, simplified client-facing labels (Review hidden), two-confirmation completion gate, accountant-only reopen, accountant full visibility + client own-data isolation + indefinite post-completion access (25 AC: LIFE-001/002/003/004/005/006, AUTH-002/003/008) | `planned` | EPIC-005 ✅, EPIC-008 ✅ |
| **EPIC-011** | Engagement attributes — accountant-set due date, accountant-only internal notes, priority/flag marker (9 AC: LIFE-007/008/009) | `planned` | EPIC-010 |
| **EPIC-012** | Engagement creation paths & multi-participant — returning-client request (DOOR-009), accountant-initiated engagement (DOOR-010), duplicate guard per (client, service, tax year) with warn+override (LIFE-011), multiple concurrent engagements (LIFE-010), multi-participant engagements / separate accounts (LIFE-012, AUTH-007); introduces the engagement **tax-year** attribute (20 AC) | `planned` | EPIC-010, EPIC-002 ✅, EPIC-003 ✅ |
| **EPIC-013** | Secure file exchange — accountant upload + both-party download + accountant-managed folders + top-level org by engagement & tax year + version history (13 AC: FILE-001 remainder, FILE-009/010/011) | `planned` | EPIC-007 ✅, EPIC-010, EPIC-012 |
| **EPIC-014** | File deletion, soft-delete & 7-year retention — accountant-only delete, soft-delete, the in-window retention floor (10 AC: FILE-004/006/005, NFR-006) | `planned` | EPIC-013, EPIC-010 |
| **EPIC-015** | Post-retention purge & legal hold — accountant-confirmed/never-automatic purge, legal hold, retention-vs-erasure precedence, audit-survives-purge (16 AC: FILE-013/014/015, NFR-010-07) | `planned` | EPIC-014, EPIC-010 |

> **EPIC-009 realizes the sign-in/sign-out capability** (REQ-AUTH-013) + the consolidated role-based landing
> (REQ-AUTH-010), placed in Phase 3 per user direction but with **no dependency on the LIFE/FILE work** — it
> can (and should) be built first so every later PoC slice is human-demoable as both roles. It realizes the
> capability against the **mock seam** (a usable dev sign-in lane); **all real-provider / production auth work**
> (real Clerk login re-validating REQ-AUTH-013, 2FA, real invitations) lives in **Phase 5 — Production
> Readiness** (placeholder). The dev-lane affordances (switcher, inert-under-`clerk` guard) are EPIC-009
> dev-acceptance, not product AC.
>
> **Build order:** **EPIC-010** first (no un-delivered Phase-3 predecessor — its `depends_on` EPIC-005 ✅ +
> EPIC-008 ✅ are satisfied). **EPIC-011** and **EPIC-012** both build on EPIC-010 and are independent of each
> other (parallelizable). The **FILE chain** is linear and follows the lifecycle core: **EPIC-013** (needs
> EPIC-010 + EPIC-012's tax-year + EPIC-007 ✅) → **EPIC-014** (needs EPIC-013) → **EPIC-015** (needs
> EPIC-014). EPIC-009 is independent and can be built first/anytime.
>
> **Scope split (recorded 2026-06-21):** **REQ-FILE-012** (overdue document-request flagging + configurable
> reminder cadence) is routed to **Phase 4**, not the Phase-3 FILE epics — it depends on the
> reminder/notification engine (REQ-MSG-018, REQ-DASH-008). The engagement **tax-year** attribute first
> emerges in **EPIC-012** (the duplicate-guard identity tuple) and is consumed by **EPIC-013** (REQ-FILE-011
> top-level org). **REQ-NFR-010** (audit trail): AC-NFR-010-07 (audit survives purge) is owned by EPIC-015;
> the rest of the audit-trail feature (incl. the accountant-only audit *read* surface) is a **dedicated
> audit-trail slice in Phase 4** — these Phase-3 epics emit audit events (ADR-019) without claiming those AC.

## Phase 4 — Messaging, notifications & the accountant dashboard *(to decompose)*

Per-engagement plain-text threads with attachments and unread indicators; the real-time in-portal
notification system and email digest fallback; the accountant's activity feed / needs-action dashboard
and admin UI; portal identity & settings. Requirement themes: MSG, DASH, IDNT.

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
  storage (replacing Azurite), and the deploy / CI promotion path.
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

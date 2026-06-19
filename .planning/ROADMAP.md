# Roadmap

> **Living document.** The authoritative *current* phasing of the product into vertically-sliced epics,
> MVP-first, driving toward full acceptance of every requirement's acceptance criteria. The Planning
> Agent maintains it (see `AGENT.md`); per-AC sign-off status lives in `COVERAGE.md`. Update the
> amendment history below whenever a phase's epic set or ordering changes.

## Status / amendment history

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
  -009/-010); the **4 2FA AC** (AC-AUTH-004-01/-02/-03 + AC-AUTH-005-01) remain `deferred` to a future
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
| **EPIC-004** | Authentication & the two-role model — accountant signs in; ACCOUNTANT/CLIENT roles; invitation-only client accounts; role-based cross-app redirect (11 in-scope AC). 2FA deferred to a future Phase-1 "2FA enablement" slice (not ready to deploy) | `delivered` (PR #38, `0444551`, 2026-06-16) — 11/15 in-scope AC; 4 2FA AC deferred | — |
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
| **EPIC-007** | Initial document upload — accountant defines the checklist; client uploads against it via the first secure, malware-scanned, non-public file-storage path (19 AC) | `planned` — **unblocked / next-ready** (EPIC-005 ✅) | EPIC-005 ✅ |
| **EPIC-008** | Onboarding completion — all-three-steps gate, automatic New → In Progress transition, accountant in-portal notification (8 AC, incl. AC-MSG-013-04) | `planned` — capstone (still needs EPIC-006, EPIC-007) | EPIC-005 ✅, EPIC-006, EPIC-007 |

> **Build order:** EPIC-005 first (no Phase-2 predecessor) — **delivered 2026-06-18** (PR #48, `f879da2`).
> EPIC-006 and EPIC-007 both build on EPIC-005's onboarding sequence and gate and are independent of each
> other (parallelizable); EPIC-006 is now **delivered 2026-06-18** (PR #50, `e55f8c5`). EPIC-007 is the
> **next-ready** Phase-2 slice (its `depends_on: EPIC-005` is satisfied; EPIC-006 was a parallel sibling, not
> a dependency). EPIC-008 is the capstone — it depends on all three step-epics because onboarding completion
> is defined over their outputs (still needs EPIC-007; EPIC-006 ✅).
>
> **Phase-2 progress (2026-06-18):** 2 of 4 epics delivered (EPIC-005, EPIC-006) — **17 of 44 Phase-2 AC
> `verified`**; 27 remain `planned` (EPIC-007 19, EPIC-008 8). **Next:** EPIC-007.
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

## Phase 3 — Engagement lifecycle & secure file exchange *(to decompose)*

Builds the **full** New → In Progress → Review → Complete pipeline (manual transitions, client-facing
labels) on top of the *minimal* Engagement substrate Phase 2 introduced, plus the per-engagement folder-
structured document exchange (accountant upload, both-party download, folders, versioning, retention/
legal-hold) on top of the *first* secure file-storage path Phase 2 stood up. Requirement themes: LIFE,
FILE remainder. **Carried-in placements to formalize when this phase is decomposed:** REQ-AUTH-003 (client-
data RLS isolation — its enabling slice + per-policy test were built in Phase 2 EPIC-005/007; the feature
AC are signed off here), REQ-AUTH-002/007/008, REQ-DOOR-009/010, and the REQ-FILE-001 remainder
(AC-FILE-001-01/-03/-04).

## Phase 4 — Messaging, notifications & the accountant dashboard *(to decompose)*

Per-engagement plain-text threads with attachments and unread indicators; the real-time in-portal
notification system and email digest fallback; the accountant's activity feed / needs-action dashboard
and admin UI; portal identity & settings. Requirement themes: MSG, DASH, IDNT.

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

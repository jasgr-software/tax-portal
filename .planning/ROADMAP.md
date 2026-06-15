# Roadmap

> **Living document.** The authoritative *current* phasing of the product into vertically-sliced epics,
> MVP-first, driving toward full acceptance of every requirement's acceptance criteria. The Planning
> Agent maintains it (see `AGENT.md`); per-AC sign-off status lives in `COVERAGE.md`. Update the
> amendment history below whenever a phase's epic set or ordering changes.

## Status / amendment history

- **2026-06-15 (EPIC-001 delivered)** — Phase 1's first slice shipped: the public front door (PR #35, squash
  merge `f7f6c9d`). All 13 EPIC-001 AC signed off `verified` in `COVERAGE.md`; EPIC-001 → `delivered`. Sign-off
  evidence basis (precedent set this run): SDET independent acceptance-validation against the real
  docker-compose stack (tier-3 RLS 4/4, e2e 12/12, 28/28 unit/integration) + green required CI; per-PR CI does
  not yet run the AC test tiers — tracked follow-up (see COVERAGE note [A]). Next ready: EPIC-004 (the other
  dependency-free Phase-1 slice); EPIC-002/003 unblock once EPIC-004 delivers.

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
| **EPIC-004** | Authentication & the two-role model — accountant signs in; ACCOUNTANT/CLIENT roles; invitation-only client accounts; role-based cross-app redirect (11 in-scope AC). 2FA deferred to a future Phase-1 "2FA enablement" slice (not ready to deploy) | `planned` | — |
| **EPIC-002** | Accountant manages the services catalog (admin surface CRUD: add/edit/deactivate) | `planned` | EPIC-004 |
| **EPIC-003** | Accountant request inbox — notification, review, accept/decline, acceptance-invite, decline-reason email | `planned` | EPIC-001, EPIC-004 |

> **All four Phase-1 epics are authored and `planned`.** Build order respects `depends_on`: **EPIC-001**
> and **EPIC-004** have no dependencies and come first (the anonymous front-door write path and the auth
> spine stand alone); **EPIC-002** and **EPIC-003** follow once the authenticated accountant surface
> (EPIC-004) exists, with EPIC-003 also needing the requests EPIC-001 produces.
>
> **MVP boundary (confirmed 2026-06-14):** the front-door spine only. A prospect can reach the door and
> submit; the accountant can sign in, get notified, and accept (→ invite) or decline (→ reason email); an
> accepted prospect can create a client account. Onboarding, the engagement lifecycle, file exchange,
> messaging, and the dashboard are **out of the MVP** (Phases 2–4). The **v2** capabilities (dynamic
> organizer, prior-year detection, outstanding-question tracking, proactive follow-up engine, recurring
> engagements, multi-accountant) are **not phased here** — they sit above v1 acceptance.

## Phase 2 — Onboarding gate *(to decompose)*

Invited client creates an account, signs the engagement letter (e-sign), completes the intake
questionnaire, and uploads initial documents — the hard gate before an engagement goes "In Progress".
Requirement themes: ONBD, the client side of AUTH. Depends on Phase 1's accept→invite path.

## Phase 3 — Engagement lifecycle & secure file exchange *(to decompose)*

The New → In Progress → Review → Complete pipeline (manual transitions) and per-engagement folder-
structured document exchange with retention/versioning. Requirement themes: LIFE, FILE.

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

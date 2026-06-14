# Roadmap

> **Living document.** The authoritative *current* phasing of the product into vertically-sliced epics,
> MVP-first, driving toward full acceptance of every requirement's acceptance criteria. The Planning
> Agent maintains it (see `AGENT.md`); per-AC sign-off status lives in `COVERAGE.md`. Update the
> amendment history below whenever a phase's epic set or ordering changes.

## Status / amendment history

- **2026-06-14** — Roadmap seeded. Phasing strategy established; Phase 1 (MVP) opened with the public
  front-door slice (EPIC-001 authored). Later phases and the backlog sketched as named epics to be
  authored on subsequent Planning Agent runs. Sources: `.requirements/` (DOOR/AUTH/… domains),
  `.architecture/` (ADR-001..022).

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
| **EPIC-001** | Public front door — browse active services & submit an engagement request (anonymous, no account) | `planned` | — |
| EPIC-002 *(to author)* | Accountant manages the services catalog (admin surface CRUD: add/edit/deactivate) | backlog | EPIC-004 (accountant auth) |
| EPIC-003 *(to author)* | Accountant request inbox — notification, review, accept/decline, invite/decline-message | backlog | EPIC-001, EPIC-004 |
| EPIC-004 *(to author)* | Authentication & the two-role model — accountant signs in; ACCOUNTANT/CLIENT roles; invitation-only client accounts | backlog | — |

> Only **EPIC-001** is authored so far; EPIC-002/003/004 are named placeholders that the next Planning
> Agent run will author and slot. EPIC-001 is deliberately authored first because it is the only Phase 1
> slice with no accountant-auth dependency — the anonymous front-door write path stands alone.

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

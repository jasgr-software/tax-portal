# Release Roadmap — Tax Accountant Client Portal

**Version:** 1.0  
**Owner:** Requirements Analyst (RA)  
**Last updated:** 2026-04-16  
**Source:** `docs/requirements/intake.md` § Build phases (planned)

> This roadmap mirrors the build phases from the intake document, refined with epic references. All phases and epics are `Pending`. The SA updates epic statuses in PROGRESS.md as work progresses; this roadmap tracks the phase-level view.

---

## Phase 1 — Foundation (Weeks 1–3)

**Goal:** Working application skeleton with auth, DB, routing, CI/CD, and local dev environment. Nothing user-visible except the auth shell.

| Epic | Name | Status | Priority | Notes |
|---|---|---|---|---|
| ep-001 | Foundation: Scaffold, Auth, DB, Routing & Deployment Pipeline | Pending | P0 | Root epic — all others depend on this |

**Phase gate:** Epic 001 passes RA validation gate (full e2e suite green, all ACs verified).

---

## Phase 2 — Front Door (Weeks 4–6)

**Goal:** Public services page live. Prospective clients can browse and submit requests. Accountant can accept/decline and manage her services catalog.

| Epic | Name | Status | Priority | Notes |
|---|---|---|---|---|
| ep-002 | Front Door: Service Browsing & Engagement Requests | Pending | P1 | Depends on Phase 1 |

**Phase gate:** Epic 002 passes RA validation gate. CLARIF-001 resolved before epic begins.

---

## Phase 3 — Onboarding (Weeks 7–8)

**Goal:** Full three-step client onboarding gate operational: e-sign → questionnaire → initial documents. Engagement moves to In Progress on completion.

| Epic | Name | Status | Priority | Notes |
|---|---|---|---|---|
| ep-003 | Client Onboarding | Pending | P1 | Depends on Phase 2; CLARIF-006 must be resolved |

**Phase gate:** Epic 003 passes RA validation gate. CLARIF-006 resolved before epic begins.

---

## Phase 4 — File Exchange, Messaging & Engagement Lifecycle (Weeks 9–12)

**Goal:** Full working product core — files exchanged securely, messages sent within engagements, real-time notifications, and engagements tracked through their full lifecycle.

| Epic | Name | Status | Priority | Notes |
|---|---|---|---|---|
| ep-004 | Secure File Exchange | Pending | P1 | Depends on Phase 3 |
| ep-005 | Messaging & In-Portal Notifications | Pending | P1 | Depends on Phase 3; may parallel ep-004 on separate branch |
| ep-006 | Engagement Lifecycle | Pending | P1 | Depends on Phase 3; CLARIF-002 and CLARIF-003 must be resolved |

**Phase gate:** All three epics pass RA validation gate. SA to determine execution order and whether parallel branches are used.

---

## Phase 5 — Dashboard, Polish & Production Hardening (Weeks 13–16)

**Goal:** Complete accountant work surface operational. Security and RLS audit complete. System ready for production launch.

| Epic | Name | Status | Priority | Notes |
|---|---|---|---|---|
| ep-007 | Accountant Dashboard & Admin UI | Pending | P1 | Depends on Phase 4 |
| ep-008 | Polish, Security Audit & Production Hardening | Pending | P1 | Depends on ep-007; CLARIF-005 must be resolved |

**Phase gate:** Epic 007 and 008 pass RA validation gate. Full smoke test on production-equivalent environment passes.

---

## Open Clarifications Blocking Phases

These clarifications (from `docs/requirements/SRS.md` § Open Clarifications) must be resolved before the indicated phases begin:

| Clarification | Blocking Phase | Question Summary |
|---|---|---|
| CLARIF-001 | Phase 2 | Decline message retention in portal? |
| CLARIF-002 | Phase 4 | Client-facing status label mapping? |
| CLARIF-003 | Phase 4 | Duplicate engagement handling? |
| CLARIF-004 | Phase 1 | Portal name for client-facing text in v1? |
| CLARIF-005 | Phase 5 | Hard delete vs 7-year retention conflict? |
| CLARIF-006 | Phase 3 | Docuseal self-hosted or cloud? |

> CLARIF-004 technically blocks Phase 1 — the portal needs a name for page titles and email subjects even in the scaffold. The user should answer this before the SA picks up Epic 001.

---

## Out of Scope (v1)

Deferred to v2 or never: firm branding, ToS/privacy pages, payment processing, tax calculation tools, IRS e-filing, scheduling, multi-staff accounts, mobile app, email marketing. See SRS § Out of Scope.

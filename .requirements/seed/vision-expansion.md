# Vision Expansion — Proactive Remote-Firm Platform (v2 intent)

**Status:** New product intent for v2 requirement authoring
**Added:** 2026-06-14
**Purpose:** Captures a strategy/vision document that broadens the product beyond the
v1 "secure portal that replaces email" framing (see `intake.md`) toward a proactive,
automation-driven platform. Read alongside `intake.md` and `SRS-snapshot.md`.

---

## Scope decisions for this expansion (settled before authoring)

These resolve the conflicts between this vision and the v1 baseline. The Requirements
Agent should author to these decisions, not re-litigate them.

- **Payments / invoicing — NOW IN SCOPE (later epic).** The v1 baseline deferred
  payments indefinitely (`SRS-snapshot.md` §Out of Scope). That deferral is reversed:
  payments ("payments due", invoicing) are a confirmed product capability, scheduled
  as a **further-down-the-line epic** — author requirements, tag as a later phase.
  _(Superseded by OQ-012 in `.requirements/OPEN-QUESTIONS.md`: payments were subsequently
  re-deferred with no requirement authored; OQ-012 is the authoritative resolution.)_
- **Multi-accountant (staff within ONE firm) — IN SCOPE (v2).** Expand beyond the
  single-accountant model (REQ-NFR-005) to support multiple staff accounts and roles
  within a single firm (e.g. partner, associate, admin assistant; who can sign off /
  see what). The firm remains a **single tenant** — this is an auth/roles expansion on
  top of the existing data model, NOT a SaaS change.
- **Multi-firm SaaS / multi-tenant — OUT OF SCOPE.** Selling the platform to many
  isolated firms (the TaxDome/Canopy/SafeSend SaaS model) is **not** being authored.
  Do not introduce a firm-level tenant boundary, per-firm onboarding, or per-firm
  billing. The "tax firms" language below is aspirational framing only.

---

## Source vision document (verbatim)

The goal would not be to build another basic client portal. There are already
platforms like TaxDome, Canopy, and SafeSend that offer document uploads, messaging,
e-signatures, workflows, and client portals.

The opportunity is to build something specifically designed for **fully remote tax
firms** that want to reduce phone calls and manage the entire client relationship
digitally from start to finish.

### Vision

A single platform that handles the entire client journey:

1. New client inquiry and lead qualification
2. Engagement letters and onboarding
3. Dynamic tax organizer
4. Secure messaging
5. Document uploads
6. Workflow/status tracking
7. Return review and approval
8. E-signatures
9. Final return delivery
10. Ongoing tax planning and reminders

### Key Features

#### Client Dashboard

- Return status
- Missing documents
- Messages
- Documents uploaded
- Signatures needed
- Payments due

#### Dynamic Organizer

- Asks only relevant questions
- Automatically requests documents based on answers

#### Secure Messaging

- All communication stays attached to the tax return
- Reduces email chains and phone calls

#### Workflow Tracking

- Lead
- Engaged
- Waiting on Documents
- In Preparation
- Review
- Waiting on Signature
- Filed
- Complete

### Biggest Opportunity

The real problem isn't storing documents — it's chasing clients.

The software should proactively move the process forward by:

- Detecting missing documents based on prior-year returns
- Automatically sending reminders
- Tracking outstanding questions
- Showing clients exactly what is needed from them
- Eliminating "Are you done yet?" emails

### Potential Differentiator

A platform built specifically for tax firms that operate remotely and communicate
primarily through messaging rather than phone calls.

The focus would be on automation, client accountability, and reducing administrative
work for tax professionals rather than simply acting as a document portal.

### Existing Competitors

- TaxDome
- Canopy
- SafeSend

Before building anything, it would be important to research common complaints from
users of these platforms and identify gaps that could be solved better.

---

## Author-guidance notes (what is genuinely new vs. already covered)

Already covered by v1 requirements (do NOT re-author): engagement letters + onboarding
gate (REQ-ONBD-*), secure per-engagement messaging (REQ-MSG-*), document upload/exchange
(REQ-FILE-*), workflow/status pipeline (REQ-LIFE-*), e-signatures (REQ-NFR-007), final
return delivery (REQ-LIFE-005), client dashboard tiles (REQ-DASH-*).

Genuinely new capabilities to author (v2):

1. **Dynamic / conditional tax organizer** — questionnaire that branches on answers and
   auto-generates document requests from those answers. (v1 REQ-ONBD-003 is a *static*
   per-service template; this is the adaptive evolution.)
2. **Proactive missing-document detection from prior-year returns** — system models
   prior-year document sets and predicts/requests this year's expected documents.
   (Watch the "not a tax-prep tool" boundary — this is about document expectations, not
   tax calculation.)
3. **Outstanding-question tracking** — a structured ledger of open questions to the
   client, distinct from free-form messaging.
4. **Proactive multi-phase accountability / client-chasing engine** — generalizes v1's
   narrow overdue-document reminder (REQ-MSG-018 / REQ-FILE-012) into lifecycle-wide
   proactive nudging ("eliminate are-you-done-yet"). This is the vision's central thesis.
5. **Ongoing tax planning / year-over-year reminders** — recurring-engagement and
   light advisory concept; v1 treats engagements as discrete and post-Complete clients
   as passive.
6. **Payments / invoicing** — per the scope decision above; later-phase epic.
7. **Multi-accountant staff + roles within one firm** — per the scope decision above.

Finer-grained workflow states (Lead → Engaged → Waiting on Docs → In Prep → Review →
Waiting on Signature → Filed → Complete) are a more granular view of the v1 four-stage
pipeline (REQ-LIFE-001). Treat as a possible refinement, not a conflict.

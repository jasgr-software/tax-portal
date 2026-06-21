---
id: EPIC-012
title: Engagement creation paths & multi-participant engagements
phase: 3
status: planned
slice: Engagements can be created beyond the onboarding path — a returning client requests a new service from inside the portal, and the accountant initiates one directly for an existing client — with a duplicate guard per (client, service, tax year), support for multiple concurrent engagements, and multiple participant accounts linked to one shared engagement.
requirements:
  - REQ-DOOR-009: [AC-DOOR-009-01, AC-DOOR-009-02, AC-DOOR-009-03, AC-DOOR-009-04]
  - REQ-DOOR-010: [AC-DOOR-010-01, AC-DOOR-010-02, AC-DOOR-010-03, AC-DOOR-010-04]
  - REQ-LIFE-010: [AC-LIFE-010-01, AC-LIFE-010-02]
  - REQ-LIFE-011: [AC-LIFE-011-01, AC-LIFE-011-02, AC-LIFE-011-03, AC-LIFE-011-04]
  - REQ-LIFE-012: [AC-LIFE-012-01, AC-LIFE-012-02, AC-LIFE-012-03]
  - REQ-AUTH-007: [AC-AUTH-007-01, AC-AUTH-007-02, AC-AUTH-007-03]
architecture:
  - ADR-005   # RLS — each participant reaches only the shared engagement; concurrent engagements stay isolated
  - ADR-003   # SESSION_CONTEXT — creation + request paths run under the caller's propagated identity
  - ADR-006   # monorepo — returning-client request in apps/portal; accountant-initiated + duplicate guard in apps/admin
  - ADR-001   # authentication (Clerk) — a second participant is invited as their own account
  - ADR-023   # provider-seam mock-first — invitations stay on the mock auth seam in the PoC
  - ADR-019   # audit trail — engagement creation + participant linking are recorded events
  - ADR-022   # anti-abuse rate limiting — the returning-client request path
  - ADR-012   # testing pyramid — tiers the AC tests must hit (participant isolation is a hard tier-3 gate)
depends_on: [EPIC-010, EPIC-002, EPIC-003]
source:
  - .requirements/REQ-DOOR-009.md
  - .requirements/REQ-DOOR-010.md
  - .requirements/REQ-LIFE-010.md
  - .requirements/REQ-LIFE-011.md
  - .requirements/REQ-LIFE-012.md
  - .requirements/REQ-AUTH-007.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
  - .architecture/decisions/ADR-001-authentication-clerk.md
open_questions: []
---

# EPIC-012 — Engagement creation paths & multi-participant engagements

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice opens up **how engagements come into being** beyond the Phase-1 anonymous front door and adds
the **multi-participant** model. A **returning, signed-in client** can request a new engagement from inside
the Client Portal (`apps/portal`) through a simplified flow that reuses their on-file contact details and
routes to the accountant's request inbox just like a front-door request. The **accountant** can also
**initiate** an engagement directly for an existing client from the Tax Portal (`apps/admin`), with no
accept/decline step since she is the originator. At the point of creation a **duplicate guard** warns her
when an engagement already exists for the same (client, service type, tax year) and lets her either go to
the existing one or knowingly override; a client may hold **multiple concurrent** engagements for different
service types, each tracked independently. Finally, an engagement may have **more than one participant** —
each a separate portal account (e.g. a married couple) linked to the same shared engagement. It builds on
EPIC-010 (engagements are first-class and lifecycle-managed), EPIC-003 (the request inbox the returning-client
request routes into), and EPIC-002 (the active-services catalog selected from).

> **Tax-year emerges here.** The duplicate guard (LIFE-011) and concurrent-engagement rule (LIFE-010) make
> **(client, service type, tax year)** the engagement's identity tuple, so this slice introduces the engagement's
> **tax-year** attribute. The later FILE-exchange epic (top-level organization by engagement and tax year,
> REQ-FILE-011) consumes it.

## Requirements delivered

- **REQ-DOOR-009 — Returning client requests a new engagement from inside the portal**
  - **AC-DOOR-009-01** — a signed-in existing client can start a new engagement request from inside the client surface.
  - **AC-DOOR-009-02** — the returning-client flow lets the client select one or more active services.
  - **AC-DOOR-009-03** — the flow does not require re-entering basic contact info already on file.
  - **AC-DOOR-009-04** — a request submitted this way is routed to the accountant for review like a front-door request.
- **REQ-DOOR-010 — Accountant initiates an engagement on a client's behalf**
  - **AC-DOOR-010-01** — the accountant can initiate a new engagement for an existing client from her surface.
  - **AC-DOOR-010-02** — she selects one or more active services for the engagement she initiates.
  - **AC-DOOR-010-03** — an accountant-initiated engagement does not require an accept/decline review step.
  - **AC-DOOR-010-04** — the initiated engagement is associated with the chosen existing client.
- **REQ-LIFE-010 — Multiple concurrent engagements per client**
  - **AC-LIFE-010-01** — a single client can have multiple engagements active concurrently, each for a different service type.
  - **AC-LIFE-010-02** — each of a client's concurrent engagements is tracked independently of the others.
- **REQ-LIFE-011 — One engagement per service type per tax year per client (warn + override)**
  - **AC-LIFE-011-01** — one engagement per (client, service type, tax year) is the expected norm.
  - **AC-LIFE-011-02** — when creation matching an existing (client, service type, tax year) is attempted, the accountant is warned and shown the existing matching engagement before any second one is created.
  - **AC-LIFE-011-03** — from that warning she can either navigate to the existing engagement or deliberately override and create the second.
  - **AC-LIFE-011-04** — the system neither silently blocks nor silently redirects; the duplicate condition is always surfaced for a decision.
- **REQ-LIFE-012 — Multiple participants per engagement**
  - **AC-LIFE-012-01** — an engagement can have more than one participant linked to it.
  - **AC-LIFE-012-02** — each participant is a separate portal account, not a shared login.
  - **AC-LIFE-012-03** — all participants linked to an engagement are associated with that same engagement.
- **REQ-AUTH-007 — Multiple participants per engagement (separate accounts)**
  - **AC-AUTH-007-01** — a single engagement may have more than one CLIENT participant.
  - **AC-AUTH-007-02** — each participant has their own distinct portal account and credentials; participants do not share one account.
  - **AC-AUTH-007-03** — each participant reaches the shared engagement through their own account, and (per REQ-AUTH-003) sees that engagement but no unrelated client's data.

## Architecture adherence
- **ADR-005 — RLS via security policies.** A participant reaches the shared engagement through the
  engagement-participant link, and **only** that engagement — the per-policy test must prove a second
  participant sees the shared engagement while an unrelated client still sees ZERO (AC-AUTH-007-03 builds on
  the AC-AUTH-003 isolation from EPIC-010). Concurrent engagements of one client stay independently scoped
  (AC-LIFE-010-02). This is a **hard** tier-3 obligation.
- **ADR-003 — SESSION_CONTEXT.** The returning-client request runs under the client principal; the
  accountant-initiated creation and duplicate guard run under the accountant principal.
- **ADR-006 — Monorepo, two apps.** The returning-client request lives in `apps/portal`; accountant-initiated
  creation, the duplicate-guard warning, and participant invitation live in `apps/admin`.
- **ADR-001 — Authentication (Clerk).** A second participant is invited as their **own** account (the same
  invitation path as any client), never a shared login (AC-AUTH-007-02, AC-LIFE-012-02).
- **ADR-023 — Provider-seam mock-first integration.** Participant invitations ride the existing **mock** auth
  seam in the PoC (real Clerk invitations are the Phase-5 enablement); the behavior contract is verified
  against the seam.
- **ADR-019 — Audit trail.** Engagement creation (both paths), a duplicate-guard override, and participant
  linking are recorded audit events.
- **ADR-022 — Anti-abuse rate limiting.** The returning-client request submission path is rate-limited, like
  the front-door request path.
- **ADR-012 — Testing pyramid.** The duplicate guard, independent-tracking, and participant isolation are
  tier-3 integration/security (the participant per-policy test is hard); the returning-client request and
  accountant-initiated creation journeys are tier-6 e2e (incl. cross-app request → inbox).

## Acceptance scenarios

### AC-DOOR-009-01 — A returning client starts a request from inside the portal
```gherkin
Given a signed-in existing client
When they start a new engagement request from the client surface
Then a returning-client request flow opens without leaving the portal
```

### AC-DOOR-009-02 — The returning-client flow selects active services
```gherkin
Given a returning client in the request flow
When they choose services
Then they can select one or more active services for the request
```

### AC-DOOR-009-03 — Basic contact info is not re-collected
```gherkin
Given a returning client whose contact details are already on file
When they complete the returning-client request flow
Then they are not required to re-enter that basic contact information
```

### AC-DOOR-009-04 — The request routes to the accountant like a front-door request
```gherkin
Given a returning client submits a new engagement request
When the submission completes
Then it is routed to the accountant for review the same way a front-door request is
```

### AC-DOOR-010-01 — The accountant initiates an engagement for an existing client
```gherkin
Given the accountant on her surface and an existing client
When she initiates a new engagement for that client
Then a new engagement is created for them
```

### AC-DOOR-010-02 — The accountant selects services for the initiated engagement
```gherkin
Given the accountant initiating an engagement
When she chooses services
Then she can select one or more active services for it
```

### AC-DOOR-010-03 — An accountant-initiated engagement skips accept/decline
```gherkin
Given the accountant initiates an engagement herself
When the engagement is created
Then it does not require an accept/decline review step
```

### AC-DOOR-010-04 — The initiated engagement is tied to the chosen client
```gherkin
Given the accountant initiates an engagement for a chosen existing client
When the engagement is created
Then it is associated with that client
```

### AC-LIFE-010-01 — A client holds concurrent engagements for different services
```gherkin
Given a client with an active engagement for one service type
When another engagement for a different service type is created for them
Then both engagements are active concurrently
```

### AC-LIFE-010-02 — Concurrent engagements are tracked independently
```gherkin
Given a client with two concurrent engagements
When one engagement's status, documents, or messages change
Then the other engagement is unaffected and tracked independently
```

### AC-LIFE-011-01 — One engagement per (client, service, tax year) is the norm
```gherkin
Given a client, a service type, and a tax year
When engagements are created in the ordinary course
Then there is one engagement for that combination
```

### AC-LIFE-011-02 — A duplicate attempt warns and shows the existing engagement
```gherkin
Given an engagement already exists for a (client, service type, tax year)
When the accountant attempts to create another matching that combination
Then she is warned and shown the existing matching engagement before any second engagement is created
```

### AC-LIFE-011-03 — From the warning she can navigate or override
```gherkin
Given the duplicate warning is shown
When the accountant responds
Then she can either navigate to the existing engagement or deliberately override and create the second
```

### AC-LIFE-011-04 — The duplicate is never silently blocked or redirected
```gherkin
Given a duplicate (client, service type, tax year) creation is attempted
When the system handles it
Then it neither silently blocks nor silently redirects; the duplicate condition is surfaced for the accountant's decision
```

### AC-LIFE-012-01 — An engagement can have more than one participant
```gherkin
Given an engagement with one participant
When another participant is linked to it
Then the engagement has more than one participant
```

### AC-LIFE-012-02 — Each participant is a separate account
```gherkin
Given two participants on one engagement
When their accounts are examined
Then each has their own separate portal account and they do not share a login
```

### AC-LIFE-012-03 — All participants are associated with the same engagement
```gherkin
Given multiple participants linked to an engagement
When each accesses their portal
Then all of them are associated with that same engagement and its work
```

### AC-AUTH-007-01 — One engagement may have multiple client participants
```gherkin
Given an engagement
When more than one CLIENT is linked to it as a participant
Then the engagement has multiple client participants
```

### AC-AUTH-007-02 — Participants have distinct accounts and credentials
```gherkin
Given two participants on a shared engagement
When they sign in
Then each uses their own distinct account and credentials, never a shared one
```

### AC-AUTH-007-03 — Each participant sees the shared engagement but no unrelated data
```gherkin
Given two participants on a shared engagement and an unrelated client
When each participant accesses the portal
Then they reach the shared engagement through their own account and see no unrelated client's data
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-DOOR-009-NN` / `AC-DOOR-010-NN` / `AC-LIFE-010-NN` / `AC-LIFE-011-NN` /
  `AC-LIFE-012-NN` / `AC-AUTH-007-NN` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration / security (tier 3)** — AC-DOOR-010-03/-04, AC-LIFE-010-02, AC-LIFE-011-01/-04,
    AC-LIFE-012-01/-03, **AC-AUTH-007-01/-03** (the hard participant per-policy isolation test).
  - **e2e (tier 6)** — AC-DOOR-009-01/-02/-03/-04 (returning-client request → inbox, cross-app),
    AC-DOOR-010-01/-02 (accountant-initiated), AC-LIFE-010-01 (a second concurrent engagement),
    AC-LIFE-011-02/-03 (the duplicate warning + navigate/override), AC-LIFE-012-02/AC-AUTH-007-02 (two
    separate participant accounts on one engagement).

## Out of scope
- **The anonymous front-door request path** (REQ-DOOR-001..008) — **delivered in Phase 1** (EPIC-001/003);
  this epic adds only the returning-client (DOOR-009) and accountant-initiated (DOOR-010) creation paths.
- **Real Clerk invitations for participants** — invitations ride the **mock** auth seam (ADR-023); real
  invitation wiring is **Phase 5 — Production Readiness**.
- **Per-participant task assignment / differentiated participant permissions** — not specified for v1; both
  participants can act on the engagement (per the martha-and-james persona, v1 scope note).
- **Onboarding of the newly created engagement** (the letter gate, questionnaire, document upload) →
  **Phase 2** epics (EPIC-005/006/007), which run once the engagement reaches New.
- **The status lifecycle, labels, completion, visibility** (REQ-LIFE-001..006, AUTH-002/003/008) →
  **EPIC-010**; **engagement attributes** (LIFE-007/008/009) → **EPIC-011**.

## Links
- Requirements: REQ-DOOR-009, REQ-DOOR-010, REQ-LIFE-010, REQ-LIFE-011, REQ-LIFE-012, REQ-AUTH-007
- Architecture: ADR-001, ADR-003, ADR-005, ADR-006, ADR-012, ADR-019, ADR-022, ADR-023
- Personas: `personas/sarah-returning-client.md` (returning-client request), `personas/jane-accountant.md` (accountant-initiated, duplicate guard), `personas/martha-and-james-married-couple.md` (two participants, one engagement)
- Flows: `flows/flow-engagement-request.md` (returning-client + accountant-initiated creation branches), `flows/flow-first-sign-in.md` (a second participant's invitation → account)
- Epics: depends on EPIC-010 (engagements first-class), EPIC-003 (request inbox), EPIC-002 (services catalog); sibling of EPIC-011
- Open questions: none

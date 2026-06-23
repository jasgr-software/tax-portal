---
id: BRIEF-012
title: Engagement creation paths & multi-participant engagements
status: ready
acceptance_criteria:
  - id: AC-DOOR-009-01
    text: "A signed-in existing client can start a new engagement request from inside the client surface."
  - id: AC-DOOR-009-02
    text: "The returning-client flow lets the client select one or more active services."
  - id: AC-DOOR-009-03
    text: "The returning-client flow does not require the client to re-enter the basic contact information already on file."
  - id: AC-DOOR-009-04
    text: "A request submitted this way is routed to the accountant for review the same way a front-door request is."
  - id: AC-DOOR-010-01
    text: "The accountant can initiate a new engagement for an existing client from her accountant surface."
  - id: AC-DOOR-010-02
    text: "The accountant selects one or more active services for the engagement she initiates."
  - id: AC-DOOR-010-03
    text: "An accountant-initiated engagement does not require an accept/decline review step, since the accountant is the originator."
  - id: AC-DOOR-010-04
    text: "The initiated engagement is associated with the chosen existing client."
  - id: AC-LIFE-010-01
    text: "A single client can have multiple engagements active concurrently, each for a different service type."
  - id: AC-LIFE-010-02
    text: "Each of a client's concurrent engagements is tracked independently of the others."
  - id: AC-LIFE-011-01
    text: "One engagement per (client, service type, tax year) is the expected norm."
  - id: AC-LIFE-011-02
    text: "When creation of an engagement matching an existing (client, service type, tax year) is attempted, the accountant is warned and shown the existing matching engagement before any second engagement is created."
  - id: AC-LIFE-011-03
    text: "From that warning the accountant can either navigate to the existing engagement or deliberately override and create the second engagement."
  - id: AC-LIFE-011-04
    text: "The system does not silently block the attempt nor silently redirect; the duplicate condition is always surfaced to the accountant for a decision."
  - id: AC-LIFE-012-01
    text: "An engagement can have more than one participant linked to it."
  - id: AC-LIFE-012-02
    text: "Each participant is a separate portal account, not a shared login."
  - id: AC-LIFE-012-03
    text: "All participants linked to an engagement are associated with that same engagement."
  - id: AC-AUTH-007-01
    text: "A single engagement may have more than one CLIENT participant."
  - id: AC-AUTH-007-02
    text: "Each participant in such an engagement has their own distinct portal account and credentials; participants do not share one account."
  - id: AC-AUTH-007-03
    text: "Each participant reaches the shared engagement through their own account, and (per REQ-AUTH-003) sees that engagement but no unrelated client's data."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "HARD tier-3 participant per-policy RLS test (ADR-005 / CS-SQL-001): a second participant on a shared engagement reaches that engagement through their own account, while an unrelated client still sees ZERO rows — proven both ways, per scoped table (AC-AUTH-007-03)."
    - "HARD tier-3 concurrent-engagement isolation: a status/document/message change on one of a client's concurrent engagements leaves the other unaffected (AC-LIFE-010-02)."
    - "Cross-app e2e: a returning-client request submitted in apps/portal surfaces in the apps/admin request inbox exactly like a front-door request (AC-DOOR-009-04)."
    - "Duplicate-guard behavior gate: the warn + show-existing + navigate-or-override path is exercised; assert it neither silently blocks nor silently redirects (AC-LIFE-011-02/-03/-04)."
acceptance_scenarios: .planning/EPIC-012-engagement-creation-participants.md   # Given/When/Then reproduced verbatim in § Acceptance scenarios below
demo:
  applicable: yes
  apps: [portal, admin]
  personas: [sarah-returning-client, jane-accountant, martha-and-james-married-couple]
  flows: [flow-engagement-request, flow-first-sign-in]
source:
  - planning: .planning/EPIC-012-engagement-creation-participants.md
  - requirements: .requirements/REQ-DOOR-009.md
  - requirements: .requirements/REQ-DOOR-010.md
  - requirements: .requirements/REQ-LIFE-010.md
  - requirements: .requirements/REQ-LIFE-011.md
  - requirements: .requirements/REQ-LIFE-012.md
  - requirements: .requirements/REQ-AUTH-007.md
  - architecture: .architecture/decisions/ADR-001-authentication-clerk.md
  - architecture: .architecture/decisions/ADR-003-session-context.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-006-monorepo-two-apps.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
  - architecture: .architecture/decisions/ADR-019-audit-trail.md
  - architecture: .architecture/decisions/ADR-022-anti-abuse-rate-limiting.md
  - architecture: .architecture/decisions/ADR-023-provider-seam-mock-first.md
code_standards:
  - "CS-TS-001 (required) — request-scoped DB access only through the packages/db wrapper (ADR-003 SESSION_CONTEXT)"
  - "CS-TS-002 (required) — never import the raw requestDb/adminDb pools outside packages/db"
  - "CS-TS-003 (recommended) — apply shared patterns to both the portal and admin surfaces"
  - "CS-TS-004 (experimental) — every server action resolves identity from the request cookie and guards role before any DB write"
  - "CS-SQL-001 (required) — an RLS policy AND an isolation test per newly scoped table"
  - "CS-SQL-002 (required) — raw-SQL track only for what Prisma cannot express (security policies)"
  - "CS-SQL-003 (required) — RLS predicate shape conventions"
  - "CS-GEN-001 (recommended) — no secrets or PII in logs"
  - "CS-GEN-002 (recommended) — additive, non-destructive edits"
  - "CS-GEN-003 (recommended) — cite the governing authority (ADR / proposal §) in code & test comments"
---

# BRIEF-012 — Engagement creation paths & multi-participant engagements

> **Self-contained build brief for the EPIC-012 slice (Phase 3).** Opens up how engagements come into being
> beyond the Phase-1 anonymous front door, and adds the multi-participant model. `source:` refs are read-only
> context; the brief stands alone. Composed by the Conductor from `.planning/EPIC-012` + its cited `REQ-*`/ADRs.

## Scope

Deliver two new **engagement-creation paths**, a **duplicate guard**, **concurrent engagements**, and
**multi-participant** engagements:

1. **Returning-client request (apps/portal — Client Portal).** A signed-in existing client starts a new
   engagement request from inside the portal through a simplified flow that **reuses on-file contact details**
   (no re-entry) and lets them **select one or more active services**. Submission produces a **request routed
   to the accountant's inbox exactly like a front-door request** (the EPIC-003 inbox). Runs under the client
   principal (ADR-003) and is rate-limited like the front-door path (ADR-022).
2. **Accountant-initiated engagement (apps/admin — Tax Portal).** The accountant **directly initiates** a new
   engagement for an **existing client** she chooses, selecting **one or more active services**. Because she
   is the originator there is **no accept/decline step**; the engagement is created and associated with the
   chosen client. Runs under the accountant principal (ADR-003).
3. **Duplicate guard per (client, service type, tax year).** This slice introduces the engagement's
   **tax-year** attribute, making **(client, service type, tax year)** the engagement identity tuple. At the
   point of creation (always the accountant's action), if an engagement already exists for that tuple she is
   **warned and shown the existing matching engagement before any second one is created**, and may either
   **navigate** to the existing one or **deliberately override** to create the second. The condition is
   **always surfaced for a decision** — never silently blocked, never silently redirected.
4. **Multiple concurrent engagements.** A client may hold **multiple engagements active at once**, each for a
   different service type, **each tracked independently** (status/documents/messages of one do not affect
   another).
5. **Multiple participants per engagement.** An engagement may have **more than one CLIENT participant** (e.g.
   a married couple) — each a **separate portal account** (invited via the existing **mock** auth seam per
   ADR-023), **linked to the same shared engagement**. Each participant reaches the shared engagement through
   their **own** account and sees **no unrelated client's data** (ADR-005 RLS, building on the AC-AUTH-003
   isolation delivered in EPIC-010). Participant invitation lives in apps/admin.

Engagement creation (both paths), a duplicate-guard override, and participant linking are recorded **audit
events** (ADR-019).

## Out of scope

- **The anonymous front-door request path** (REQ-DOOR-001..008) — delivered in Phase 1 (EPIC-001/003). This
  slice adds only the returning-client (DOOR-009) and accountant-initiated (DOOR-010) creation paths.
- **Real Clerk invitations for participants** — invitations ride the **mock** auth seam (ADR-023); real
  invitation wiring is Phase 5 (Production Readiness).
- **Per-participant task assignment / differentiated participant permissions** — not specified for v1; both
  participants can act on the engagement (martha-and-james persona, v1 scope note).
- **Onboarding of the newly created engagement** (letter gate, questionnaire, document upload) → Phase 2
  epics (EPIC-005/006/007), which run once the engagement reaches New.
- **The status lifecycle, labels, completion, visibility** (REQ-LIFE-001..006, AUTH-002/003/008) → EPIC-010
  (delivered); **engagement attributes** (LIFE-007/008/009) → EPIC-011 (delivered).
- **File-exchange organization by engagement & tax year** (REQ-FILE-011) → EPIC-013 (consumes the tax-year
  attribute this slice introduces).

## Acceptance criteria

Each AC is covered by automated test(s) **tagged with its AC id** at the prescribed tier (§ Methodology). An
AC is implemented only when its tagged test(s) **pass in CI**; the epic is delivered only when all 20 are
`verified` in `COVERAGE.md`.

### REQ-DOOR-009 — Returning client requests a new engagement from inside the portal
- **AC-DOOR-009-01** — A signed-in existing client can start a new engagement request from inside the client surface.
- **AC-DOOR-009-02** — The returning-client flow lets the client select one or more active services.
- **AC-DOOR-009-03** — The returning-client flow does not require the client to re-enter the basic contact information already on file.
- **AC-DOOR-009-04** — A request submitted this way is routed to the accountant for review the same way a front-door request is.

### REQ-DOOR-010 — Accountant initiates an engagement on a client's behalf
- **AC-DOOR-010-01** — The accountant can initiate a new engagement for an existing client from her accountant surface.
- **AC-DOOR-010-02** — The accountant selects one or more active services for the engagement she initiates.
- **AC-DOOR-010-03** — An accountant-initiated engagement does not require an accept/decline review step, since the accountant is the originator.
- **AC-DOOR-010-04** — The initiated engagement is associated with the chosen existing client.

### REQ-LIFE-010 — Multiple concurrent engagements per client
- **AC-LIFE-010-01** — A single client can have multiple engagements active concurrently, each for a different service type.
- **AC-LIFE-010-02** — Each of a client's concurrent engagements is tracked independently of the others.

### REQ-LIFE-011 — One engagement per service type per tax year per client (warn + override)
- **AC-LIFE-011-01** — One engagement per (client, service type, tax year) is the expected norm.
- **AC-LIFE-011-02** — When creation of an engagement matching an existing (client, service type, tax year) is attempted, the accountant is warned and shown the existing matching engagement before any second engagement is created.
- **AC-LIFE-011-03** — From that warning the accountant can either navigate to the existing engagement or deliberately override and create the second engagement.
- **AC-LIFE-011-04** — The system does not silently block the attempt nor silently redirect; the duplicate condition is always surfaced to the accountant for a decision.

### REQ-LIFE-012 — Multiple participants per engagement
- **AC-LIFE-012-01** — An engagement can have more than one participant linked to it.
- **AC-LIFE-012-02** — Each participant is a separate portal account, not a shared login.
- **AC-LIFE-012-03** — All participants linked to an engagement are associated with that same engagement.

### REQ-AUTH-007 — Multiple participants per engagement (separate accounts)
- **AC-AUTH-007-01** — A single engagement may have more than one CLIENT participant.
- **AC-AUTH-007-02** — Each participant in such an engagement has their own distinct portal account and credentials; participants do not share one account.
- **AC-AUTH-007-03** — Each participant reaches the shared engagement through their own account, and (per REQ-AUTH-003) sees that engagement but no unrelated client's data.

## Methodology & quality requirements

- **Acceptance format: gherkin.** Bind the Given/When/Then scenarios in § Acceptance scenarios to executable
  tests (the brief carries them verbatim from the epic). Each test's title/annotation contains its **AC id**
  (the AC-id test-tag contract — what makes the Validate write-back possible).
- **Tier mapping (ADR-012 testing pyramid):**
  - **Service integration / security (tier 3)** — AC-DOOR-010-03/-04, AC-LIFE-010-02, AC-LIFE-011-01/-04,
    AC-LIFE-012-01/-03, **AC-AUTH-007-01/-03** (the **hard** participant per-policy isolation test).
  - **e2e (tier 6)** — AC-DOOR-009-01/-02/-03/-04 (returning-client request → inbox, **cross-app**),
    AC-DOOR-010-01/-02 (accountant-initiated), AC-LIFE-010-01 (a second concurrent engagement),
    AC-LIFE-011-02/-03 (the duplicate warning + navigate/override), AC-LIFE-012-02 / AC-AUTH-007-02 (two
    separate participant accounts on one engagement).
- **e2e required** (CLAUDE.md IO e2e defaults): this slice touches Clerk participant invitation, SQL Server
  RLS policies + `SESSION_CONTEXT` propagation, and a cross-module boundary (returning-client request →
  request inbox). E2E runs against the full docker-compose stack with both apps up; cross-app specs via
  `pnpm e2e:cross-app` (ADR-010).
- **Hard extra gates** — see front-matter `extra_gates`: the participant per-policy RLS test proven both ways
  (CS-SQL-001), concurrent-engagement independence, the cross-app request→inbox e2e, and the duplicate-guard
  warn/navigate/override behavior (never silent).
- **UI demo (`demo.applicable: yes`)** — a `@demo` Playwright walkthrough captures an AC-tagged screenshot
  gallery into `docs/demos/EPIC-012/` across **both** surfaces (returning-client request in portal;
  accountant-initiated + duplicate guard + participant invitation in admin), walking the sarah-returning-client,
  jane-accountant, and martha-and-james personas. **Non-gating** (the e2e gate is the gate);
  see `.orchestration/DEMO-POLICY.md`.

## Constraints

Non-negotiables (cite the originating ADR in code/test comments per CS-GEN-003):

- **ADR-005 — RLS via security policies.** The engagement-participant link is a **scoped table**: a
  participant reaches the shared engagement **only** through their link, and only that engagement. The
  per-policy test must prove a second participant sees the shared engagement while an **unrelated client sees
  ZERO** (builds on AC-AUTH-003 from EPIC-010). Concurrent engagements of one client stay independently
  scoped. **Hard tier-3 obligation** — a missing/failing policy test is a rejection (CS-SQL-001/-003).
- **ADR-003 — SESSION_CONTEXT.** Every request-scoped query goes through the `packages/db` wrapper that sets
  `SESSION_CONTEXT` before the first real query (CS-TS-001/-002). The returning-client request runs under the
  **client** principal; accountant-initiated creation and the duplicate guard run under the **accountant**
  principal.
- **ADR-006 — Monorepo, two apps.** Returning-client request → `apps/portal`; accountant-initiated creation,
  the duplicate-guard warning, and participant invitation → `apps/admin`. Apply shared patterns to both
  surfaces where they mirror (CS-TS-003).
- **ADR-001 — Authentication (Clerk).** A second participant is invited as their **own** account (the same
  invitation path as any client), **never** a shared login (AC-AUTH-007-02, AC-LIFE-012-02).
- **ADR-023 — Provider-seam mock-first.** Participant invitations ride the existing **mock** auth seam; the
  behavior contract is verified against the seam (real Clerk invitations are Phase 5).
- **ADR-019 — Audit trail.** Engagement creation (both paths), a duplicate-guard override, and participant
  linking are recorded audit events.
- **ADR-022 — Anti-abuse rate limiting.** The returning-client request submission path is rate-limited, like
  the front-door request path.
- **ADR-012 — Testing pyramid.** Honor the tier mapping above; the participant per-policy test is a hard
  tier-3 gate.

## Code standards

- **CS-TS-001** (`required`) — request-scoped DB access only through the `packages/db` wrapper (ADR-003).
- **CS-TS-002** (`required`) — never import the raw `requestDb`/`adminDb` pools outside `packages/db`.
- **CS-TS-003** (`recommended`) — apply shared patterns to both the portal and admin surfaces.
- **CS-TS-004** (`experimental`) — every server action resolves identity from the request cookie and guards
  role before any DB write (directly relevant: both creation paths are role-guarded server actions).
- **CS-SQL-001** (`required`) — an RLS policy **and** an isolation test per newly scoped table (the
  engagement-participant link).
- **CS-SQL-002** (`required`) — raw-SQL track only for what Prisma cannot express (the security policies).
- **CS-SQL-003** (`required`) — RLS predicate shape conventions.
- **CS-GEN-001** (`recommended`) — no secrets or PII in logs (client contact details, participant identities).
- **CS-GEN-002** (`recommended`) — additive, non-destructive edits.
- **CS-GEN-003** (`recommended`) — cite the governing ADR/REQ in code & test comments.

## Data & Interface Contract

> Altitude-bounded: only the shapes that **trace** to the epic's behavior + cited ADRs. The IO expands these
> into the full field-level contract at Design; genuinely upstream shape questions are escalated via
> `OPEN-QUESTIONS.md`, never invented. Field-level minutiae (exact column types, regexes, error codes) are NOT
> fixed here.

- **Engagement gains a `tax-year` attribute.** It is the third component of the engagement **identity tuple
  (client, service type, tax year)** that the duplicate guard (LIFE-011) and concurrent-engagement rule
  (LIFE-010) key on. Consumed downstream by EPIC-013 (file org by engagement & tax year). *(traces: EPIC-012
  "Tax-year emerges here"; REQ-LIFE-010/-011)*
- **Engagement ↔ participant becomes many-to-many.** A new **engagement-participant link** associates one or
  more **CLIENT accounts** with one engagement (a single engagement may have ≥1 participant; a client may
  appear on many engagements). This is the **scoped table** ADR-005 RLS guards. *(traces: REQ-LIFE-012,
  REQ-AUTH-007; ADR-005)*
- **A client may own multiple concurrent engagements** for different service types — there is **no uniqueness
  on client alone**; uniqueness/duplicate-detection is on the **(client, service type, tax year)** tuple.
  Concurrent engagements are independently scoped and tracked. *(traces: REQ-LIFE-010)*
- **Duplicate-guard semantics.** Creation matching an existing tuple → **warn + show the existing engagement
  + offer navigate-or-override**; on override a second engagement for the tuple IS created. Never a silent
  block, never a silent redirect — the condition is always surfaced for the accountant's decision. The guard
  fires at the **creation** boundary (the accountant's action; a returning client's duplicate *request*
  simply surfaces to her as a request she can decline). *(traces: REQ-LIFE-011, OQ-003 resolved 2026-06-13)*
- **Creation-path interface contracts.**
  - *Returning-client request (apps/portal):* input = selected active service(s) (contact details sourced
    on-file, not re-collected); output = a **request** routed to the accountant inbox with the same handling
    as a front-door request (EPIC-003); runs under the client principal; rate-limited. *(traces: REQ-DOOR-009;
    ADR-003/-022)*
  - *Accountant-initiated (apps/admin):* input = chosen existing client + selected active service(s); output =
    a **created engagement** associated with that client, with **no accept/decline** step; runs under the
    accountant principal. *(traces: REQ-DOOR-010; ADR-003)*
- **Field-shape obligations (ADR-002).** New entities/columns follow ADR-002 PK/timestamp/identity
  conventions. **Audit events** (ADR-019) are recorded for creation (both paths), override, and participant
  linking.

## Acceptance scenarios

> Reproduced verbatim from `.planning/EPIC-012-engagement-creation-participants.md` (the canonical behavior
> contract). Bind each to an executable test tagged with its AC id.

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

## References

- Planning: `.planning/EPIC-012-engagement-creation-participants.md` (the slice + behavior contract)
- Requirements: REQ-DOOR-009, REQ-DOOR-010, REQ-LIFE-010, REQ-LIFE-011, REQ-LIFE-012, REQ-AUTH-007
- Architecture: ADR-001, ADR-002 (shape conventions), ADR-003, ADR-005, ADR-006, ADR-010 (cross-app), ADR-012,
  ADR-019, ADR-022, ADR-023
- Personas: `.planning/personas/sarah-returning-client.md`, `jane-accountant.md`,
  `martha-and-james-married-couple.md`
- Flows: `.planning/flows/flow-engagement-request.md`, `flow-first-sign-in.md`
- Prior art: EPIC-010 (engagements first-class + AC-AUTH-003 client isolation the participant test builds on),
  EPIC-003 (the request inbox the returning-client request routes into), EPIC-002 (the active-services catalog)

## Notes

- **Build order:** EPIC-013 (file exchange) depends on this slice's **tax-year** attribute — keep it a
  first-class engagement attribute, not a UI-only field.
- **Mirror reminder (CS-TS-003 / CLAUDE.md § Platform-frontend scope):** the two creation paths live on
  different surfaces by design (portal = returning-client request; admin = accountant-initiated + guard +
  invitation). Cross-surface parity here means the **shared** request-handling + DB-wrapper patterns are
  consistent, not that both surfaces grow the same screens.
- **The participant per-policy RLS test is the panel/SDET trap** (per ADR-005 history): assert isolation
  **both ways** (participant reaches shared engagement; unrelated client sees ZERO) per scoped table —
  a one-directional assertion is insufficient.
- Suggested decomposition is the IO's to finalize at Design.

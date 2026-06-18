---
id: EPIC-005
title: Client onboarding spine + engagement-letter e-sign gate
phase: 2
status: delivered   # PR #48, squash merge f879da2, 2026-06-18 — all 10 in-scope AC verified (see COVERAGE.md)
slice: A newly accepted client signs in, sees the three-step onboarding sequence for their engagement, and e-signs the engagement letter — the hard gate that unlocks the remaining steps.
requirements:
  - REQ-ONBD-001: [AC-ONBD-001-01, AC-ONBD-001-02, AC-ONBD-001-03]
  - REQ-ONBD-002: [AC-ONBD-002-01, AC-ONBD-002-02, AC-ONBD-002-03, AC-ONBD-002-04]
  - REQ-IDNT-007: [AC-IDNT-007-01, AC-IDNT-007-02, AC-IDNT-007-03]
architecture:
  - ADR-006   # monorepo — onboarding lives in apps/portal; letter-template editing in apps/admin
  - ADR-001   # Clerk — onboarding is behind CLIENT authentication
  - ADR-003   # SESSION_CONTEXT — onboarding reads/writes run under the client principal
  - ADR-005   # security policy — first client-owned rows (engagement, onboarding state) are client-isolated
  - ADR-019   # audit trail — the signed engagement letter is recorded as evidence the gate was satisfied
  - ADR-012   # testing pyramid — tiers the AC tests must hit
  - REQ-AUTH-003   # client sees only their own engagement/onboarding data (RLS isolation obligation; AC owned in Phase 3)
depends_on: [EPIC-003, EPIC-004]
source:
  - .requirements/REQ-ONBD-001.md
  - .requirements/REQ-ONBD-002.md
  - .requirements/REQ-IDNT-007.md
  - .architecture/decisions/ADR-006-monorepo-layout.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
  - .architecture/decisions/ADR-019-audit-trail-logging.md
open_questions: []
---

# EPIC-005 — Client onboarding spine + engagement-letter e-sign gate

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice opens Phase 2. It establishes the **engagement** an accepted client onboards into and the
**first step of the onboarding gate**. When the accountant accepts a request (EPIC-003) and the invited
prospect signs up (EPIC-004), a minimal **Engagement** comes into being in status **New**, linked to that
request and client. The **client** signs in to the Client Portal (`apps/portal`), opens their engagement,
and sees a three-step onboarding sequence — (1) sign the engagement letter, (2) complete the
questionnaire, (3) upload documents — with steps 2 and 3 visibly locked. The client e-signs the
**engagement letter** (whose content the accountant has edited from a system-provided default in the Tax
Portal); on signature the letter is recorded against the engagement and the later steps unlock. This is
the hard gate the whole onboarding flow hangs from: nothing else advances until the letter is signed. It
depends on EPIC-003 (the accepted request) and EPIC-004 (the authenticated client account).

> **Engagement substrate (scope note).** Per the 2026-06-17 planning decision, Phase 2 introduces only a
> **minimal** Engagement entity — created on acceptance, carrying a status that is `New` or `In Progress`
> — as the substrate onboarding attaches to. The full four-stage pipeline, manual transitions, and
> client-facing status labels (REQ-LIFE-001/002/003) remain **Phase 3** and are not claimed here. EPIC-005
> exercises the entity; EPIC-008 performs its one automatic transition.

## Requirements delivered

- **REQ-ONBD-001 — Onboarding is three sequential steps**
  - **AC-ONBD-001-01** — onboarding presents exactly three steps in order: engagement-letter e-sign,
    intake questionnaire, initial document upload.
  - **AC-ONBD-001-02** — the steps are sequential: the client cannot complete or skip ahead to a later
    step before the steps it depends on are done.
  - **AC-ONBD-001-03** — the client can see their current position in the sequence and which steps remain.
- **REQ-ONBD-002 — Engagement letter e-sign is a hard gate**
  - **AC-ONBD-002-01** — until the letter is e-signed, the questionnaire step is not accessible.
  - **AC-ONBD-002-02** — until the letter is e-signed, the document-upload step is not accessible.
  - **AC-ONBD-002-03** — once the letter is e-signed, the subsequent steps become accessible.
  - **AC-ONBD-002-04** — the signed engagement letter is recorded against the engagement as evidence the
    gate was satisfied.
- **REQ-IDNT-007 — Editable default engagement-letter template**
  - **AC-IDNT-007-01** — a system-provided default engagement-letter template exists without the
    accountant authoring one from scratch.
  - **AC-IDNT-007-02** — the accountant can edit the template's content herself.
  - **AC-IDNT-007-03** — the accountant's edited template is what the client is presented to sign in
    onboarding.

## Architecture adherence
- **ADR-006 — Monorepo, two apps.** The client onboarding surface lives in `apps/portal`; engagement-letter
  template editing is an accountant setting in `apps/admin`.
- **ADR-001 — Authentication via Clerk.** Onboarding is reachable only by the authenticated CLIENT who owns
  the engagement; an anonymous or other-client caller cannot view or act on it.
- **ADR-003 — SESSION_CONTEXT.** Onboarding reads and the letter-signature write run under the client's
  propagated identity; the template-edit write runs under the accountant principal.
- **ADR-005 — Security policies.** This is the **first slice with client-owned rows** (the engagement and
  its onboarding state). Those rows are client-isolated by policy, and per ADR-005 a CLIENT-A-cannot-read-
  CLIENT-B integration test is a hard requirement for the new policy. (The REQ-AUTH-003 *feature* AC remain
  Phase-3-owned — see Out of scope — but the isolation mechanism and its per-policy test land here.)
- **ADR-019 — Audit trail.** The engagement-letter signature is a security-significant event; the signed
  letter / signature evidence is recorded against the engagement (AC-ONBD-002-04).
- **ADR-012 — Testing pyramid.** The hard-gate sequencing (steps locked until signature) and the
  client-isolation policy are tier-3 integration obligations; the end-to-end sign path is tier-6 e2e.

> **E-sign provider — mock-first (per the standing mock-third-party directive).** The engagement letter is
> signed through an e-signature provider **seam that is mocked/stubbed for this slice**; the real Docuseal
> integration (and its governing ADR + completion-callback/idempotency handling) is **deferred** to a later
> "real e-sign enablement" slice — the same pattern as EPIC-004's mocked auth provider → deferred 2FA slice.
> The behavior contract below is provider-agnostic: it asserts *that the letter is signed and the gate
> opens*, not *how* signing is performed, so **ONBD-002 is delivered/`verified` against the mock**. There is
> no ADR blocker on dispatch; the real-provider ADR is an upstream follow-up, not a Phase-2 gate.

## Acceptance scenarios

### AC-ONBD-001-01 — Onboarding presents three ordered steps
```gherkin
Given a client whose engagement is in onboarding
When the client opens their engagement's onboarding
Then they see exactly three steps in order: sign the engagement letter, complete the questionnaire, upload documents
```

### AC-ONBD-001-02 — Later steps cannot be reached before their predecessors
```gherkin
Given a client whose engagement letter is not yet signed
When the client attempts to start the questionnaire or the document upload
Then the attempt is refused and the step remains locked
```

### AC-ONBD-001-03 — Client sees their position and what remains
```gherkin
Given a client partway through onboarding
When they view the onboarding sequence
Then they can see which step they are on and which steps still remain
```

### AC-ONBD-002-01 — Questionnaire locked until the letter is signed
```gherkin
Given an engagement whose letter has not been e-signed
When the questionnaire step's accessibility is evaluated
Then the questionnaire step is not accessible to the client
```

### AC-ONBD-002-02 — Document upload locked until the letter is signed
```gherkin
Given an engagement whose letter has not been e-signed
When the document-upload step's accessibility is evaluated
Then the document-upload step is not accessible to the client
```

### AC-ONBD-002-03 — Signing the letter unlocks the remaining steps
```gherkin
Given an engagement whose letter has just been e-signed by the client
When onboarding is re-evaluated
Then the questionnaire and document-upload steps become accessible
```

### AC-ONBD-002-04 — Signed letter recorded against the engagement
```gherkin
Given a client has e-signed the engagement letter
When the engagement is examined
Then the signed engagement letter is recorded against it as evidence the gate was satisfied
```

### AC-IDNT-007-01 — A default letter template exists out of the box
```gherkin
Given a fresh portal with no accountant-authored letter
When the accountant opens the engagement-letter template setting
Then a system-provided default engagement-letter template is already present
```

### AC-IDNT-007-02 — Accountant edits the letter template
```gherkin
Given the engagement-letter template setting
When the accountant edits the template's content and saves
Then the edited content is retained as the current template
```

### AC-IDNT-007-03 — The edited template is what the client signs
```gherkin
Given the accountant has edited the engagement-letter template
When a client reaches the letter step in onboarding
Then the letter presented for signature is the accountant's edited template
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-ONBD-001-NN` / `AC-ONBD-002-NN` / `AC-IDNT-007-NN` id), at the
  prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI** — CI is the independent gate.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping:
  - **e2e (tier 6)** — AC-ONBD-001-01/-03 (sequence rendered, position shown), AC-ONBD-002-03 (sign →
    unlock happy path), AC-IDNT-007-03 (edited template shown to client).
  - **service integration (tier 3)** — AC-ONBD-001-02, AC-ONBD-002-01/-02 (sequencing/gate enforced
    server-side, not just hidden in UI), AC-ONBD-002-04 (signature recorded), the new client-isolation
    policy test (ADR-005).
  - **unit/component (tier 2/5)** — AC-IDNT-007-01/-02 (default present, edit persists), AC-ONBD-001-03
    progress rendering.

## Out of scope
- The **full engagement-lifecycle pipeline** — REQ-LIFE-001 (four stages), REQ-LIFE-002 (client-facing
  labels), REQ-LIFE-003 (manual transitions) → **Phase 3**. Phase 2 introduces only the minimal `New` /
  `In Progress` engagement substrate.
- The **questionnaire step** (REQ-ONBD-003, REQ-DASH-012) → **EPIC-006**; the **document-upload step**
  (REQ-ONBD-004, REQ-FILE-*) → **EPIC-007**. This epic stands up the sequence and gates them; it does not
  build their internals.
- **Onboarding completion / status transition / completion notification** (REQ-ONBD-005/006/007) →
  **EPIC-008**.
- **REQ-AUTH-003** (client-data RLS isolation — AC-AUTH-003-01..03) remains **Phase-3-owned**: the
  *isolation mechanism and its per-policy test* for the new client-owned onboarding rows are built and run
  here (ADR-005), but the AUTH-003 *feature AC* are signed off in Phase 3 when the full client-data surface
  exists. (Flagged for the next planning run — the enabling slice now lands in Phase 2.)
- **Multi-participant signing** (Martha & James — REQ-AUTH-007, REQ-LIFE-012) → **Phase 3**. Phase-2
  onboarding is scoped to the single primary client participant.
- **The real Docuseal e-sign integration** (live provider, signing redirect, completion webhook +
  idempotency, and its governing ADR) → **deferred** to a future "real e-sign enablement" slice that
  re-validates ONBD-002 against the live provider. This slice ships against the mocked e-sign seam (per the
  standing mock-third-party directive).

## Links
- Requirements: REQ-ONBD-001, REQ-ONBD-002, REQ-IDNT-007
- Architecture: ADR-001, ADR-003, ADR-005, ADR-006, ADR-012, ADR-019; REQ-AUTH-003 (adherence)
- Personas: `personas/sarah-returning-client.md`, `personas/tom-prospective-client.md` (post-signup CLIENT), `personas/jane-accountant.md` (letter-template editing)
- Flows: `flows/flow-onboarding.md` (steps 1 + the gate), `flows/flow-first-sign-in.md` (client lands post-signup)
- Epics: depends on EPIC-003 (accepted request → engagement) and EPIC-004 (client account); related EPIC-006, EPIC-007, EPIC-008
- Open questions: none

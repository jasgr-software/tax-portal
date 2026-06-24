---
id: EPIC-022
title: Admin settings & portal identity — engagement-letter template, portal names, v1 appearance
phase: 4
status: planned
slice: The accountant manages the engagement-letter template from the admin UI (a default exists, she edits it, the current version is what clients sign), and the platform presents a consistent v1 identity — each surface named correctly ("Client Portal" / "Tax Portal"), working without firm branding, with branding and standalone legal pages explicitly recorded as deferred.
requirements:
  - REQ-DASH-013: [AC-DASH-013-01, AC-DASH-013-02, AC-DASH-013-03]
  - REQ-IDNT-002: [AC-IDNT-002-01, AC-IDNT-002-02]
  - REQ-IDNT-003: [AC-IDNT-003-01, AC-IDNT-003-02]
  - REQ-IDNT-004: [AC-IDNT-004-01, AC-IDNT-004-02]
  - REQ-IDNT-006: [AC-IDNT-006-01, AC-IDNT-006-02, AC-IDNT-006-03]
architecture:
  - ADR-006   # monorepo — the two named surfaces (Client Portal / Tax Portal); template management is apps/admin
  - ADR-003   # SESSION_CONTEXT — template edits run under the accountant principal
  - ADR-019   # audit trail — engagement-letter template edits are recorded accountant actions
  - ADR-015   # UI foundation (deferred design) — v1 generic appearance, no firm branding required
  - ADR-024   # self-hosted Docuseal e-sign — the current template is what is presented for signature in onboarding
  - ADR-012   # testing pyramid — "current template is what clients sign" + name-correctness are the key gates
depends_on: [EPIC-005]
source:
  - .requirements/REQ-DASH-013.md
  - .requirements/REQ-IDNT-002.md
  - .requirements/REQ-IDNT-003.md
  - .requirements/REQ-IDNT-004.md
  - .requirements/REQ-IDNT-006.md
  - .architecture/decisions/ADR-006-monorepo-layout.md
  - .architecture/decisions/ADR-015-ui-foundation-deferred-design.md
open_questions: []
---

# EPIC-022 — Admin settings & portal identity — engagement-letter template, portal names, v1 appearance

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice completes the accountant's **admin/settings surface** and pins down the **v1 identity** of the
platform. From the Tax Portal admin UI she manages the **engagement-letter template**: a sensible **default
exists** out of the box so onboarding can proceed immediately, she can **edit** it, and the **current**
template is what accepted clients are presented to sign during onboarding (the admin-UI twin of the
EPIC-005 IDNT-007 editable-template setting). The platform also presents a consistent identity: the
client-facing surface reads **"Client Portal"** and the accountant-facing surface reads **"Tax Portal"**
everywhere each audience encounters the name (titles, headings, client email subjects), never swapped; the
portal **works in v1 without any firm branding**; and **firm branding** and **standalone terms-of-service /
privacy-policy pages** are explicitly **recorded as deferred** future capabilities rather than v1 defects.

> **Sequencing note.** REQ-IDNT-001 (portal served on the firm's own **custom domain**) is **deferred to
> Phase 5 (Production Readiness)** — its mechanics are inseparable from the production hosting decision that
> ADR-007 defers (the POC runs on localhost). See `COVERAGE.md` § Deferred.

## Requirements delivered

- **REQ-DASH-013 — Engagement-letter template management**
  - **AC-DASH-013-01** — the system provides a default engagement-letter template without the accountant authoring one.
  - **AC-DASH-013-02** — the accountant can edit the engagement-letter template from the admin UI.
  - **AC-DASH-013-03** — the current template is what is used for accepted clients during onboarding.
- **REQ-IDNT-002 — Generic v1 appearance (no firm branding required)**
  - **AC-IDNT-002-01** — the portal functions and is usable in v1 with no firm logo, custom color scheme, or firm-name styling configured.
  - **AC-IDNT-002-02** — the lack of firm branding does not block or degrade any client- or accountant-facing capability in v1.
- **REQ-IDNT-003 — Firm branding deferred**
  - **AC-IDNT-003-01** — firm branding (logo, colors, firm-name presentation) is out of scope for v1 and not delivered.
  - **AC-IDNT-003-02** — firm branding is retained as a recorded future capability.
- **REQ-IDNT-004 — TOS / privacy pages deferred**
  - **AC-IDNT-004-01** — no standalone terms-of-service or privacy-policy page is delivered in v1.
  - **AC-IDNT-004-02** — TOS/privacy pages are retained as a recorded future capability.
- **REQ-IDNT-006 — Distinct portal names**
  - **AC-IDNT-006-01** — all client-facing presentations of the product name read "Client Portal" (titles, headings, client email subjects).
  - **AC-IDNT-006-02** — all accountant-facing presentations read "Tax Portal" (titles, headings).
  - **AC-IDNT-006-03** — the two names are applied consistently and never swapped.

## Architecture adherence
- **ADR-006 — Monorepo, two apps.** The two named surfaces are `apps/portal` ("Client Portal") and
  `apps/admin` ("Tax Portal"); template management is an `apps/admin` setting.
- **ADR-003 — SESSION_CONTEXT.** Engagement-letter template edits run under the accountant's propagated
  identity via the `packages/db` wrapper.
- **ADR-019 — Audit trail.** Editing the engagement-letter template is a recorded accountant action.
- **ADR-015 — UI foundation (deferred design).** The v1 generic-appearance stance (no firm branding
  required) is consistent with the deferred design-system decision; AC-IDNT-002/-003 assert exactly that.
- **ADR-024 — Self-hosted Docuseal e-sign.** The **current** engagement-letter template is what is
  presented for signature in the onboarding e-sign flow (AC-DASH-013-03), reusing the EPIC-005 mechanism.
- **ADR-012 — Testing pyramid.** "Current template is what clients sign" is a tier-3 integration gate;
  name-correctness and template edit are tier-6 e2e across both surfaces; the deferral AC (IDNT-003/-004)
  are verified as the documented v1 absence.

## Acceptance scenarios

### AC-DASH-013-01 — A default template exists
```gherkin
Given a fresh installation with no template authored
When onboarding needs an engagement letter
Then a system-provided default engagement-letter template is available
```

### AC-DASH-013-02 — Accountant edits the template
```gherkin
Given the accountant on the admin UI
When she edits the engagement-letter template's content
Then her edited version is saved as the current template
```

### AC-DASH-013-03 — Current template is what clients sign
```gherkin
Given the accountant has edited the engagement-letter template
When an accepted client reaches the onboarding signing step
Then the current (edited) template is what they are presented to sign
```

### AC-IDNT-002-01 — Usable with no branding configured
```gherkin
Given no firm logo, color scheme, or firm-name styling is configured
When a user uses the portal in v1
Then it functions and is usable
```

### AC-IDNT-002-02 — No branding does not degrade capability
```gherkin
Given firm branding is absent
When client-facing and accountant-facing capabilities are exercised
Then none of them is blocked or degraded by the absence of branding
```

### AC-IDNT-003-01 — Firm branding not delivered in v1
```gherkin
Given v1 of the portal
When it is inspected for firm branding configuration
Then no firm branding (logo, colors, firm-name presentation) is delivered
```

### AC-IDNT-003-02 — Firm branding recorded as future
```gherkin
Given firm branding is out of scope for v1
When the roadmap/coverage is consulted
Then firm branding is retained as a recorded future capability
```

### AC-IDNT-004-01 — No standalone legal pages in v1
```gherkin
Given v1 of the portal
When it is inspected for standalone terms-of-service or privacy-policy pages
Then no such standalone legal page is delivered
```

### AC-IDNT-004-02 — Legal pages recorded as future
```gherkin
Given standalone legal pages are out of scope for v1
When the roadmap/coverage is consulted
Then TOS/privacy pages are retained as a recorded future capability
```

### AC-IDNT-006-01 — Client surface reads "Client Portal"
```gherkin
Given a client using the client-facing surface
When they encounter the product name (browser title, headings, email subjects)
Then it reads "Client Portal"
```

### AC-IDNT-006-02 — Accountant surface reads "Tax Portal"
```gherkin
Given the accountant using her surface
When she encounters the product name (browser title, headings)
Then it reads "Tax Portal"
```

### AC-IDNT-006-03 — Names never swapped
```gherkin
Given both surfaces in use
When each audience encounters the product name
Then clients never see "Tax Portal" and the accountant never sees "Client Portal" as the name of her own surface
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-DASH-013-NN` / `AC-IDNT-002-NN` / `-003-NN` / `-004-NN` / `-006-NN` id),
  at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration (tier 3)** — AC-DASH-013-03 (current template flows into onboarding e-sign).
  - **e2e (tier 6)** — AC-DASH-013-01/-02, AC-IDNT-002-01/-02, AC-IDNT-006-01/-02/-03 (name-correctness on
    both surfaces, incl. client email subjects).
  - **documented-constraint assertion** — AC-IDNT-003-01/-02, AC-IDNT-004-01/-02 (verify the v1 absence and
    the recorded-future status; a guard test that no branding config / legal page route exists in v1).

## Out of scope
- **REQ-IDNT-001 (custom domain)** → **Phase 5** (tied to the deferred production-hosting decision, ADR-007).
- **REQ-IDNT-005 (permanent client hard-delete)** → **Deferred** (retention/legal precedence; carried in COVERAGE § Deferred).
- **REQ-IDNT-007 (editable default engagement-letter template — the *setting*)** — delivered in **EPIC-005**;
  DASH-013 here is the **admin-UI management** twin (default + edit + current-used-in-onboarding).
- **Intake-questionnaire template management** (REQ-DASH-012) — delivered in **EPIC-006**; **services
  catalog** (REQ-DASH-010) in **EPIC-002**; **engagement-request management** (REQ-DASH-011) in **EPIC-003**.

## Links
- Requirements: REQ-DASH-013, REQ-IDNT-002, REQ-IDNT-003, REQ-IDNT-004, REQ-IDNT-006
- Architecture: ADR-003, ADR-006, ADR-012, ADR-015, ADR-019, ADR-024
- Personas: `personas/jane-accountant.md` (tailors her engagement letter; her professional work surface)
- Flows: `flows/flow-onboarding.md` (the current-template-used-at-signing branch); relates `flows/flow-role-redirect.md` (named surfaces)
- Epics: depends on EPIC-005 (engagement-letter template substrate + e-sign)
- Open questions: none

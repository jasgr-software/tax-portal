---
id: BRIEF-006
title: Intake questionnaire — per-service-type templates, client completion
status: ready
acceptance_criteria:
  # REQ-ONBD-003 — intake questionnaire is templated per service type
  - id: AC-ONBD-003-01
    text: "The intake questionnaire a client completes corresponds to the service type of their engagement."
  - id: AC-ONBD-003-02
    text: "The accountant can define and maintain a distinct questionnaire template for each service type."
  - id: AC-ONBD-003-03
    text: "The questionnaire step is satisfied only when the client submits their completed questionnaire."
  - id: AC-ONBD-003-04
    text: "The client's submitted answers are recorded against the engagement."
  # REQ-DASH-012 — intake questionnaire template management (admin UI)
  - id: AC-DASH-012-01
    text: "The accountant can create an intake questionnaire template from the admin UI."
  - id: AC-DASH-012-02
    text: "A questionnaire template is associated with a specific service type."
  - id: AC-DASH-012-03
    text: "The accountant can edit an existing questionnaire template."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "Client-data isolation (ADR-005, HARD tier-3 — the new questionnaire-answer rows): a per-policy integration test proving CLIENT-A cannot read CLIENT-B's questionnaire answers, an anonymous / null-SESSION_CONTEXT caller reads ZERO, and ACCOUNTANT/admin can read. New `sec` predicate + security policy (next free `db/policies/0006-*`) on the answer rows — the second client-owned-row family after EPIC-005's `Engagement`."
    - "Correct-questionnaire-for-service-type (tier-3): the questionnaire presented to the client is the template bound to their engagement's service type (AC-ONBD-003-01), and a template is bound to a specific service type (AC-DASH-012-02) — resolved server-side from the engagement's service type, not chosen by the client."
    - "Step-satisfied-only-on-submit (tier-3): the questionnaire onboarding step is NOT satisfied until the client submits their completed questionnaire (AC-ONBD-003-03), and on submit the answers are recorded against the engagement (AC-ONBD-003-04). The satisfaction is evaluated server-side in the EPIC-005 onboarding read model, not merely reflected in the UI."
    - "Behind the EPIC-005 letter gate: the questionnaire step is only reachable once the engagement letter is e-signed (the EPIC-005 hard gate). This slice assumes the gate is passed and does not weaken it — the server-side step-accessibility check still refuses the questionnaire step for an unsigned engagement."
    - "SESSION_CONTEXT on all questionnaire reads/writes (ADR-003): the client's questionnaire read + answer-submission write run under the CLIENT principal; the accountant's template create/edit writes run under the ACCOUNTANT principal — via the `packages/db` request-scoped wrapper (`$extends` SET hook), honoring ADR-003 Amendment 1 (no `@read_only` on the SET)."
    - "Cross-surface (CLAUDE.md § Platform-frontend scope): questionnaire-template authoring/editing lives in `apps/admin`; questionnaire completion lives in `apps/portal`. Validate BOTH surfaces."
    - "Container smoke (docker-compose stack) before Validate."
acceptance_scenarios: .planning/EPIC-006-intake-questionnaire.md#acceptance-scenarios
demo:
  applicable: yes
  apps: [portal, admin]
  personas: [jane-accountant, sarah-returning-client]
  flows: [flow-onboarding]
source:
  - planning: .planning/EPIC-006-intake-questionnaire.md
  - requirements: .requirements/REQ-ONBD-003.md
  - requirements: .requirements/REQ-DASH-012.md
  - architecture: .architecture/decisions/ADR-003-identity-propagation-session-context.md
  - architecture: .architecture/decisions/ADR-004-orm-prisma-single-track.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-006-monorepo-layout.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
---

# BRIEF-006 — Intake questionnaire — per-service-type templates, client completion

> Self-contained build brief for the EPIC-006 slice. `source:` refs are read-only context; the brief stands
> alone. Composed by the Conductor from `.planning/EPIC-006` + its cited `REQ-*`/`ADR-*` sources and the live
> repo state. **7 in-scope AC.** Delivers **step 2 of the onboarding sequence** (the intake questionnaire),
> on top of the EPIC-005 onboarding spine + letter gate.

## Scope

Deliver **step 2 of onboarding** — the intake questionnaire — end to end, on both surfaces.

In the **Tax Portal (`apps/admin`)** the **accountant** authors and maintains an intake-questionnaire
template **tied to a service type**: the questions she needs for a personal return differ from those for a
business return, so each service type in her catalog (EPIC-002) carries its **own distinct** questionnaire
template. She can **create** a new template, **bind** it to a specific service type, and **edit** an existing
one.

In the **Client Portal (`apps/portal`)** the **client** — having passed the engagement-letter gate
(EPIC-005) — reaches the questionnaire step of their onboarding sequence and is presented the questionnaire
**for their engagement's service type**. They complete it and **submit**; their **answers are recorded
against the engagement**, and only then is the questionnaire **step satisfied**.

Concretely the slice delivers:

1. **The questionnaire-template entity, keyed per service type** (AC-ONBD-003-02, AC-DASH-012-02), with a
   **system default available** without bespoke authoring is *not* required here (that was the letter
   template's AC-IDNT-007-01 in EPIC-005; this epic's REQ set does not mandate a seeded default — an empty/
   absent template for a service type is an acceptable starting state). The template is **accountant-owned**
   and managed only from `apps/admin`. Unlike the EPIC-005 `LetterTemplate` (a single global row), there is
   **one template per service type** — the binding to a specific `Service` is the defining shape.

2. **The admin template-management UI** in `apps/admin` (AC-DASH-012-01/-02/-03) — create a template,
   associate it with a service type, and edit an existing one. Mirror the delivered EPIC-005 letter-template
   setting pattern (`apps/admin/src/app/settings/letter-template/`), extended from a single row to a
   per-service-type set. Accountant-guarded; must not be reachable from `apps/portal`.

3. **The client questionnaire step** in `apps/portal` (AC-ONBD-003-01/-03/-04) — within the existing
   onboarding sequence (`apps/portal/src/app/onboarding/`), the client at step 2 is shown the template
   **bound to their engagement's service type** (resolved server-side from the engagement, not chosen by the
   client), completes it, and submits. On submit, the **answers are recorded against the engagement** and the
   step is marked satisfied. The questionnaire step remains **gated behind the EPIC-005 signed-letter hard
   gate** — it is reachable only once the letter is e-signed.

4. **The answer rows as the second client-owned-row family** — the client's submitted answers are
   **client-owned and client-isolated** (ADR-005): a new `sec` predicate + security policy
   (`db/policies/0006-*`) ensures a client can read/complete only **their own** engagement's questionnaire and
   can never read another client's answers; the accountant/admin can read. This extends the
   first-client-owned-rows pattern EPIC-005 established on `Engagement`.

5. **Extending the EPIC-005 onboarding read model** (`packages/db/src/onboarding.ts`) so the **questionnaire
   step's satisfaction** is evaluated server-side from "has the client submitted their completed
   questionnaire" (AC-ONBD-003-03) — one more input to the overall sequence EPIC-008 will complete.

## Out of scope

- **Dynamic / conditional organizer logic** (REQ-ONBD-008, v2) — **deferred**. v1 questionnaires are
  **static per service type**: a fixed set of questions for the service type, no branching/conditional
  reveal, no prior-year pre-fill.
- **The letter gate itself** (EPIC-005, delivered) and the **document-upload step** (EPIC-007) — this epic
  assumes the letter gate is passed and does **not** build the upload step. It stands up step 2 only.
- **Onboarding completion** (REQ-ONBD-005/006/007) → **EPIC-008**: satisfying the questionnaire step is one
  **input** to onboarding completion, but the all-three-steps gate, the automatic New → In Progress
  transition, and the completion notification are evaluated **there**, not here.
- **The full engagement-lifecycle pipeline** (REQ-LIFE-001/002/003) — **Phase 3**. This slice neither
  transitions engagement status nor adds client-facing lifecycle labels.
- **REQ-AUTH-003 client-data RLS *feature* AC (AC-AUTH-003-01..03)** → **Phase-3-owned**. As with EPIC-005,
  the isolation *mechanism* (the new answer-row `sec` predicate + policy) and its **per-policy
  CLIENT-A-cannot-read-CLIENT-B test** are built and run **here**; the AUTH-003 feature AC are signed off in
  Phase 3.
- **Accountant *review/consumption* of submitted answers** beyond the isolation read boundary (a dashboard
  surface for reading client answers) — not in this epic's AC set; the answers are recorded and
  accountant-readable, but no answer-review UI is built (that belongs to Phase 4 dashboard work).

## Acceptance criteria

Each AC must be covered by **automated test(s) tagged with its AC id** (the test title/annotation contains
the id), at the prescribed tier(s). An AC is implemented only when its tagged test(s) pass in CI. The slice
is deliverable only when all 7 in-scope AC are independently validated.

**REQ-ONBD-003 — intake questionnaire is templated per service type**
- **AC-ONBD-003-01** — The intake questionnaire a client completes corresponds to the service type of their engagement.
- **AC-ONBD-003-02** — The accountant can define and maintain a distinct questionnaire template for each service type.
- **AC-ONBD-003-03** — The questionnaire step is satisfied only when the client submits their completed questionnaire.
- **AC-ONBD-003-04** — The client's submitted answers are recorded against the engagement.

**REQ-DASH-012 — intake questionnaire template management (admin UI)**
- **AC-DASH-012-01** — The accountant can create an intake questionnaire template from the admin UI.
- **AC-DASH-012-02** — A questionnaire template is associated with a specific service type.
- **AC-DASH-012-03** — The accountant can edit an existing questionnaire template.

> **Dual-tag note (from the epic).** AC-ONBD-003-02 (accountant defines/maintains a per-service-type
> template) and the REQ-DASH-012 trio describe the **same** admin capability from the onboarding side and the
> dashboard side. Both are owned here and **dual-tagged** — exactly as EPIC-002 dual-tagged the
> DOOR-002 / DASH-010 catalog capability. A single admin-template test can legitimately carry both an
> `AC-ONBD-003-02` and an `AC-DASH-012-*` tag where the behavior is the same.

## Methodology & quality requirements

- **Acceptance format: gherkin.** The 7 Given/When/Then scenarios authored in the epic
  (`.planning/EPIC-006-intake-questionnaire.md` § Acceptance scenarios) are the behavior contract. The SDET
  binds them to executable Playwright/integration steps (or validates against them in prose until the
  Cucumber tooling lands — per CLAUDE.md § Executable gherkin tooling). Do **not** re-author scenarios; bind
  the epic's.
- **E2e required (`apps/portal` + `apps/admin`).** The accountant authoring/editing a template runs against
  the full docker-compose stack in `apps/admin`; the client being shown the correct questionnaire and
  submitting it runs in `apps/portal`; the author → complete path crosses both surfaces.
- **Tier mapping (from the epic's sign-off contract — ADR-012):**
  - **e2e (tier 6):** AC-DASH-012-01/-03 (admin authoring/editing), AC-ONBD-003-01 (correct questionnaire
    shown for the service type), AC-ONBD-003-03 (submit satisfies the step).
  - **service integration (tier 3):** AC-ONBD-003-01 (service-type match resolved server-side),
    AC-ONBD-003-04 (answers recorded against the engagement), AC-DASH-012-02 (template ↔ service-type
    binding), **the new client-isolation policy test (ADR-005)** on the answer rows.
  - **unit/component (tier 2/5):** questionnaire rendering and the submit-state transition (not-satisfied →
    satisfied on submit).
- **Submission gate** (per CLAUDE.md): `pnpm lint` + `pnpm type-check`; `pnpm --filter portal test` +
  `pnpm --filter admin test`; `pnpm --filter portal e2e:run` + `pnpm --filter admin e2e:run` (+ `pnpm
  e2e:cross-app` where the author → complete path crosses surfaces); tier-3 integration against the real
  container DB; container smoke before Validate.
- **UI demo (`demo.applicable: yes`).** A dedicated `@demo` Playwright walkthrough captures an AC-tagged
  screenshot gallery of jane-accountant creating/editing a per-service-type questionnaire template
  (`apps/admin`) and a post-letter-gate client completing and submitting the matching questionnaire
  (`apps/portal`) into `docs/demos/EPIC-006/`. Non-gating; the e2e gate is the gate.

## Constraints

Non-negotiables (cite the originating upstream ref). Each is a hard adherence obligation for this slice:

- **ADR-005 — RLS via security policies (the SECOND client-owned-row family).** The client's submitted
  questionnaire **answers** are **client-owned and client-isolated**: a CLIENT can read/act on only **their
  own** engagement's questionnaire answers; another CLIENT or an anonymous / null-SESSION_CONTEXT caller reads
  **ZERO**; ACCOUNTANT/admin can read. Add a new `sec` predicate function + a FILTER/BLOCK security policy
  (next free `db/policies/0006-*`) that joins answer-row ownership to the client identity in `SESSION_CONTEXT`
  (`clerk_user_id` → `User`, via the owning `Engagement`). **HARD requirement (ADR-005 §6):** a tier-3
  integration test per policy (CLIENT-A-cannot-read-CLIENT-B; anonymous reads ZERO; ACCOUNTANT can). Reuse
  the established `sec` predicate-function + policy pattern — `db/policies/0005-engagement-policy.sql` (the
  first client-isolation policy, EPIC-005) is the direct precedent for the ownership join. The
  **questionnaire template** is **accountant-managed** (not client-owned); its write boundary is
  accountant-only (mirror the EPIC-002 `sec.fn_service_write_access` ACCOUNTANT/admin write predicate).
- **ADR-003 — SESSION_CONTEXT identity propagation.** The client's questionnaire read and answer-submission
  write run under the **client** principal; the accountant's template create/edit writes run under the
  **accountant** principal — both through the `packages/db` request-scoped Prisma wrapper
  (`withRequestContext` / `$extends` SET hook). No direct Prisma access in route handlers/server actions
  outside that wrapper. Honor **ADR-003 Amendment 1** (do not reintroduce `@read_only` on the SET).
- **ADR-004 — Prisma single-track.** The questionnaire **template** (keyed to service type) and the client's
  **answers** are entity schema on the **Prisma track** (`prisma/schema.prisma` → `pnpm prisma migrate dev`).
  Both reads and writes flow through the single `db` / `adminDb` clients from `packages/db` — no second ORM,
  no Prisma client instantiated outside `packages/db`. The new client-isolation `sec` predicate + policy is
  raw-SQL **Track B** (`db/policies/`), applied via `scripts/db-migrate.ts` / `pnpm db:policies:apply`.
- **ADR-006 — Monorepo, two apps.** Questionnaire-template authoring/editing lives in **`apps/admin`**; the
  client fills the questionnaire in **`apps/portal`**. Template management must not be reachable from
  `apps/portal`; the client questionnaire-completion surface must not be reachable from `apps/admin`.
- **ADR-012 — Testing pyramid.** "Correct template for the service type" and "answers recorded / step
  satisfied on submit" are **tier-3 integration** obligations (the trust boundary is the DB; server-side
  resolution and the isolation policy are proved at tier 3, not just e2e); the author → complete → submit
  path is **tier-6 e2e**. Tier-3 integration runs against the **real SQL Server container**, not a mock.
- **Build on the EPIC-005 onboarding spine, do not fork it.** The onboarding sequence, the server-side
  step-accessibility gate, and the read model already exist (`apps/portal/src/app/onboarding/`,
  `packages/db/src/onboarding.ts`). This slice **extends** them with the questionnaire step's satisfaction
  logic; it must **not** weaken the EPIC-005 letter hard gate (the questionnaire step stays unreachable until
  the letter is e-signed) and must keep the sequencing server-authoritative (a locked/ineligible step is
  **refused**, not merely hidden).
- **Service-type linkage (EPIC-002 catalog).** The "service type" a template binds to and a client's
  questionnaire is matched on is the **`Service`** catalog entity (EPIC-002). The engagement resolves its
  service type via its accepted request's service selection (`EngagementRequest` →
  `EngagementRequestService` → `Service`). The exact resolution path (and handling of an engagement whose
  service type has no template yet) is an IO Design call (see **Data & Interface Contract**); deactivated
  services must not break a client mid-onboarding (reuse the EPIC-002 `active=false` reversible-deactivate
  semantics — never hard-delete a `Service` a questionnaire/engagement references).
- **No branch protection / CI authority changes.** Required checks unchanged (`lint-and-typecheck`,
  `security-scan`; `test-portal`/`test-admin` advisory until per-PR AC tiers are wired). Merge on green
  required CI, no `--admin`/`enforce_admins` toggle (MERGE-POLICY Lane B). This slice touches **application
  code only** (no engine/role/workflow files), so it takes the reviewed lane.

## Data & Interface Contract

> Source-traced to the epic's behavior + the cited ADRs (per the brief author's altitude rule). The **IO
> expands this to the full field-level contract at Design** (exact column names/types, the question/answer
> representation, validation, the template ↔ service-type FK, the read-model extension); a genuinely-upstream
> shape question escalates via `OPEN-QUESTIONS.md` — it is **not** invented here. Field-shape conventions
> trace to **ADR-002** (`UNIQUEIDENTIFIER` PK `NEWSEQUENTIALID()`, `DATETIMEOFFSET` timestamps — as on every
> existing entity, e.g. `Engagement`, `LetterTemplate`, `Service` in `prisma/schema.prisma`).

**Entities & relationships**
- **Questionnaire template (NEW — accountant setting, per service type).** A template the accountant authors
  and edits. **Bound to a specific `Service`** (the service type) — AC-DASH-012-02 — with **at most one
  current template per service type** (AC-ONBD-003-02: a *distinct* template *per* service type). Carries the
  template's **questions** (the static v1 set; the question-list representation — structured rows vs. a
  serialized definition on the template — is an IO Design call). Accountant-owned/managed in `apps/admin`.
  Contrast EPIC-005's `LetterTemplate`, which is a **single global row** (DECISION-D); this entity is a
  **set keyed by `Service`**.
- **Questionnaire answers (NEW — the second client-owned-row family).** The client's submitted answers to the
  questionnaire, **recorded against the engagement** (AC-ONBD-003-04). **Client-owned and isolated** under the
  new ADR-005 policy. Whether answers attach to the `Engagement` directly or via a join to the template/its
  questions is an IO Design call; what is fixed is that they are owned by the engagement's client and resolve
  to `SESSION_CONTEXT('clerk_user_id')` for the isolation predicate.
- **Engagement (EXISTING — EPIC-005).** The onboarding-state columns live on `Engagement` (DECISION-B). The
  questionnaire step's satisfaction is one more piece of onboarding state (e.g. a `questionnaireSubmittedAt`
  marker — exact column an IO Design call), evaluated by the read model. The engagement's **service type**
  (resolved via its accepted request) is what selects the client's questionnaire (AC-ONBD-003-01).
- **Service (EXISTING — EPIC-002).** The service-type catalog entity a template binds to and a questionnaire
  is matched on. Not modified by this slice beyond being referenced.

**Status enums & state transitions**
- **Questionnaire step satisfaction:** `not-submitted → submitted`. The step is **not satisfied** while the
  client is viewing/filling but has not submitted (AC-ONBD-003-03); on **submit**, the answers are recorded
  (AC-ONBD-003-04) and the step becomes satisfied. Evaluated **server-side** in the onboarding read model.
- **Step accessibility (unchanged from EPIC-005):** the questionnaire step is reachable only once the
  engagement letter is **signed** (the EPIC-005 hard gate). This slice adds no new lock that precedes it and
  removes none.
- **Template lifecycle:** `created → edited` (AC-DASH-012-01/-03). An edited template is retained as the
  current template for its service type (AC-DASH-012-03). Single-current-template-per-service-type vs.
  versioned history — IO Design (mirror the `LetterTemplate` `updateLetterTemplate` single-target precedent
  unless versioning is warranted).

**Interface contracts**
- **Questionnaire read/accessibility contract.** At the questionnaire step, the server resolves the
  template **for the engagement's service type** under the client's `SESSION_CONTEXT` (ADR-003) and returns
  it; the step's satisfaction is resolved server-side (a not-yet-submitted step is reported unsatisfied —
  AC-ONBD-003-03). The client does **not** supply the template id or the service type — both derive from the
  owned engagement.
- **Answer-submission contract.** A client server action submits the completed questionnaire for **their
  own** engagement (owner-resolved server-side, request-pool/BLOCK-governed like the EPIC-005
  `recordLetterSignatureAsClient` write); it records the answers against the engagement and marks the step
  satisfied. Fail-closed: no recording on a non-owned or ineligible (letter-unsigned) engagement.
- **Admin template contract.** Accountant server actions create/edit a template and bind it to a `Service`
  (AC-DASH-012-01/-02/-03), run under the accountant principal, accountant-write-guarded.
- **Reused seams (do not reinvent):** `packages/db` `withRequestContext` + the `$extends` SET hook (ADR-003);
  the `sec` predicate-function + FILTER/BLOCK policy pattern (`db/policies/0005-engagement-policy.sql` for the
  client-ownership join; the EPIC-002 service-write predicate for the accountant-only template write); the
  EPIC-005 onboarding read model (`packages/db/src/onboarding.ts`) and portal onboarding surface
  (`apps/portal/src/app/onboarding/`); the EPIC-005 admin letter-template setting
  (`apps/admin/src/app/settings/letter-template/` — the template-editor + actions pattern to mirror for
  per-service-type templates); `packages/auth` for the client/accountant identity + role gate.

**Deferred to IO Design (field-level minutiae, not carried here):** exact column names/types; the
question/answer representation (structured question rows vs. a serialized template definition; structured
answer rows vs. a serialized answer blob); the template ↔ `Service` FK and the at-most-one-per-service-type
constraint mechanism; the engagement → service-type resolution path; the onboarding-state column for
questionnaire submission; single-current vs. versioned templates.

## References

- Planning: `.planning/EPIC-006-intake-questionnaire.md` (slice, 7 AC, the gherkin scenarios, tier map, the
  dual-tag note, the static-v1 / out-of-scope boundaries).
- Requirements: REQ-ONBD-003, REQ-DASH-012; REQ-AUTH-003 (isolation-mechanism adherence; feature AC
  Phase-3-owned).
- Architecture: ADR-003 (+ Amendment 1), ADR-004, ADR-005, ADR-006, ADR-012.
- Personas: `.planning/personas/jane-accountant.md` (template authoring),
  `.planning/personas/sarah-returning-client.md`, `.planning/personas/martha-and-james-married-couple.md`
  (questionnaire completion).
- Flows: `.planning/flows/flow-onboarding.md` (step 2).
- Prior art in-repo: the EPIC-005 onboarding spine — `packages/db/src/onboarding.ts` (read model +
  server-side gate), `apps/portal/src/app/onboarding/` (sequence UI), `apps/admin/src/app/settings/
  letter-template/` (accountant template-editor + actions); `db/policies/0005-engagement-policy.sql` (the
  first client-isolation policy — the ownership-join seam to follow); `db/policies/0002-service-readable.sql`
  + the EPIC-002 `sec.fn_service_write_access` accountant-only write predicate; the `Service`,
  `EngagementRequest`, `EngagementRequestService`, `Engagement`, `LetterTemplate` models
  (`prisma/schema.prisma`).

## Notes

- **Second client-owned-row family + first per-service-type template.** The substantive work is the
  questionnaire-template entity (per `Service`), the client answer rows with the **second** client-isolation
  policy (and its mandatory CLIENT-A-vs-CLIENT-B tier-3 test), and wiring the questionnaire step's
  satisfaction into the EPIC-005 read model. The admin template UI and the portal questionnaire step sit on
  top — both have direct EPIC-005 precedents to mirror (the letter-template editor; the onboarding step
  component).
- **Builds directly on EPIC-005 (delivered) and EPIC-002 (delivered).** EPIC-005 supplies the onboarding
  sequence + the letter gate this step lives behind; EPIC-002 supplies the service-type catalog the templates
  key to. Both dependencies are delivered (EPIC-005 PR #48 `f879da2`; EPIC-002 PR #40 `70ea10e`).
  Parallelizable with EPIC-007 (document upload) — both are independent step-epics on the EPIC-005 spine.
- **Static v1 questionnaires.** No conditional/branching organizer logic (REQ-ONBD-008 is v2). A v1
  questionnaire is a fixed set of questions for the service type; "completed" means the client submitted it.
- **REQ-AUTH-003 boundary flag (for the next planning run).** As with EPIC-005, the client-isolation
  *mechanism* (the answer-row policy) lands here; the AUTH-003 *feature* AC remain Phase-3-owned.
- **Carried infra follow-ups (from prior retros / STATE — may resurface at Smoke, not slice-blocking):**
  clean-volume DB bootstrap (`sa`-once login creation, Prisma port-in-authority, `!`-free logins,
  `migrate deploy` P3019), the `sqlserver` healthcheck SA-password mismatch, the `sp_set_session_context` CI
  grep-guard, the per-connection SESSION_CONTEXT hardening (EPIC-005 SEC-3 follow-up), and the inventory.md
  Track-B drift.

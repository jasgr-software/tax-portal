---
id: BRIEF-005
title: Client onboarding spine + engagement-letter e-sign gate
status: ready
acceptance_criteria:
  # REQ-ONBD-001 — onboarding is three sequential steps
  - id: AC-ONBD-001-01
    text: "Onboarding presents exactly three steps in this order: engagement-letter e-sign, intake questionnaire, initial document upload."
  - id: AC-ONBD-001-02
    text: "The steps are sequential: the client cannot complete or skip ahead to a later step before the steps it depends on are done."
  - id: AC-ONBD-001-03
    text: "The client can see their current position in the onboarding sequence and which steps remain."
  # REQ-ONBD-002 — engagement letter e-sign is a hard gate
  - id: AC-ONBD-002-01
    text: "Until the engagement letter is e-signed, the intake questionnaire step is not accessible to the client."
  - id: AC-ONBD-002-02
    text: "Until the engagement letter is e-signed, the initial document upload step is not accessible to the client."
  - id: AC-ONBD-002-03
    text: "Once the engagement letter is e-signed, the subsequent onboarding steps become accessible to the client."
  - id: AC-ONBD-002-04
    text: "The signed engagement letter is recorded against the engagement as evidence the gate was satisfied."
  # REQ-IDNT-007 — editable default engagement-letter template
  - id: AC-IDNT-007-01
    text: "A system-provided default engagement-letter template exists and is available without the accountant having to author one from scratch."
  - id: AC-IDNT-007-02
    text: "The accountant can edit the engagement-letter template's content herself."
  - id: AC-IDNT-007-03
    text: "The accountant's edited template is what is used as the engagement letter presented to clients for signature in the onboarding flow."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "Client-data isolation (ADR-005, HARD tier-3 — the FIRST client-owned rows): a per-policy integration test proving CLIENT-A cannot read CLIENT-B's engagement / onboarding-state rows, an anonymous / null-SESSION_CONTEXT caller reads ZERO, and ACCOUNTANT/admin can read. New `sec` predicate + security policy on the engagement + onboarding-state tables."
    - "Server-side gate enforcement (tier-3): the step-sequencing and the letter hard-gate are enforced server-side, not merely hidden in the UI — questionnaire + document-upload steps are inaccessible until the letter is e-signed (AC-ONBD-001-02, AC-ONBD-002-01/-02), and become accessible once signed (AC-ONBD-002-03)."
    - "Signed-letter evidence recorded + audited (tier-3): on signature the signed engagement letter is recorded against the engagement (AC-ONBD-002-04) and the signing is written to the append-only audit ledger as a security-significant event (ADR-019, ADR-024 §4), reusing the EPIC-004 audit seam."
    - "E-sign provider seam — mock-first, fail-closed (ADR-023 / ADR-024): the letter is signed through an `ESignatureProvider` port (port + bindings + selector); this slice ships the deterministic mock binding only, with the selector fail-closed (real binding default; mock selectable only via an explicit non-production `ALLOW_MOCK_ESIGN` opt-in). Onboarding depends on the port, never on Docuseal directly. ONBD-002 AC are verified against the mock; real Docuseal is a deferred enablement slice."
    - "SESSION_CONTEXT on all onboarding reads/writes (ADR-003): client onboarding reads + the letter-signature write run under the client principal; the template-edit write runs under the accountant principal — via the `packages/db` request-scoped wrapper (`$extends` SET hook), honoring ADR-003 Amendment 1 (no `@read_only` on the SET)."
    - "Cross-surface (CLAUDE.md § Platform-frontend scope): client onboarding lives in `apps/portal`; engagement-letter template editing lives in `apps/admin`. Validate BOTH surfaces."
    - "Container smoke (docker-compose stack) before Validate."
acceptance_scenarios: .planning/EPIC-005-onboarding-spine-engagement-letter.md#acceptance-scenarios
demo:
  applicable: yes
  apps: [portal, admin]
  personas: [tom-prospective-client, jane-accountant]
  flows: [flow-onboarding, flow-first-sign-in]
source:
  - planning: .planning/EPIC-005-onboarding-spine-engagement-letter.md
  - requirements: .requirements/REQ-ONBD-001.md
  - requirements: .requirements/REQ-ONBD-002.md
  - requirements: .requirements/REQ-IDNT-007.md
  - architecture: .architecture/decisions/ADR-001-authentication-clerk.md
  - architecture: .architecture/decisions/ADR-003-identity-propagation-session-context.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-006-monorepo-layout.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
  - architecture: .architecture/decisions/ADR-019-audit-trail-logging.md
  - architecture: .architecture/decisions/ADR-023-provider-seam-mock-first-integration.md
  - architecture: .architecture/decisions/ADR-024-esignature-self-hosted-docuseal.md
---

# BRIEF-005 — Client onboarding spine + engagement-letter e-sign gate

> Self-contained build brief for the EPIC-005 slice. `source:` refs are read-only context; the brief stands
> alone. Composed by the Conductor from `.planning/EPIC-005` + its cited `REQ-*`/`ADR-*` sources and the live
> repo state. **10 in-scope AC.** Opens **Phase 2 (the onboarding gate)**.

## Scope

Stand up the **onboarding spine** and its **first hard gate**. When the accountant accepts an engagement
request (EPIC-003, delivered) and the invited prospect signs up (EPIC-004, delivered), a **minimal
`Engagement`** comes into being in status **New**, linked to that accepted request and (once they sign up) the
client. The **client** signs in to the Client Portal (`apps/portal`), opens their engagement, and sees a
**three-step onboarding sequence** — (1) e-sign the engagement letter, (2) intake questionnaire, (3) initial
document upload — with steps 2 and 3 **visibly locked**. The client **e-signs the engagement letter** (whose
content the accountant has edited from a system-provided default in the Tax Portal, `apps/admin`); on
signature the **letter is recorded against the engagement** and the later steps **unlock**. This is the hard
gate the whole onboarding flow hangs from: nothing else advances until the letter is signed.

Concretely the slice delivers:

1. **The minimal `Engagement` substrate** (epic scope note). A net-new `Engagement` entity — created on
   request **acceptance** (extending the delivered EPIC-003 `acceptRequest` flow), in status **New**, linked
   to the accepted `EngagementRequest` and to the client. This is the **first client-owned row** in the
   system; it is client-isolated by a new ADR-005 security policy (see *Constraints*). The full lifecycle
   pipeline + manual transitions + client-facing labels are **out of scope** (Phase 3) — Phase 2 introduces
   only the `New` / `In Progress` substrate; EPIC-008 performs its one automatic transition.

2. **The three-step onboarding sequence** in `apps/portal` (AC-ONBD-001-*). The client opens their engagement
   and sees exactly three ordered steps; steps 2 and 3 are locked behind the letter gate; the client can see
   their current position and which steps remain. The **sequencing is enforced server-side**, not merely
   hidden in the UI — a client cannot reach a later step before its predecessors are satisfied. This epic
   **stands up the sequence and gates the later steps**; it does **not** build the questionnaire (EPIC-006) or
   the document-upload (EPIC-007) internals.

3. **The engagement-letter e-sign hard gate** (AC-ONBD-002-*). Until the letter is e-signed, the questionnaire
   and document-upload steps are inaccessible; once e-signed, they become accessible. The signing goes through
   a **mocked e-signature provider seam** (ADR-023 / ADR-024) — a deterministic "signed" outcome; the behavior
   contract is provider-agnostic (assert *that* the letter is signed and the gate opens, not *how*). On
   signature, the **signed letter is recorded against the engagement** as evidence and the signing is audited.

4. **The editable default engagement-letter template** (AC-IDNT-007-*) as an accountant setting in `apps/admin`.
   A **system-provided default** exists out of the box (the accountant never starts from a blank page); the
   accountant can **edit** its content herself; her **edited** version is what the client is presented to sign
   in onboarding.

## Out of scope

- **The full engagement-lifecycle pipeline** — REQ-LIFE-001 (four stages), REQ-LIFE-002 (client-facing
  labels), REQ-LIFE-003 (manual transitions) → **Phase 3**. Phase 2 introduces only the minimal `New` /
  `In Progress` engagement substrate; this slice creates it in `New` and never transitions it.
- **The questionnaire step internals** (REQ-ONBD-003, REQ-DASH-012) → **EPIC-006**; the **document-upload step
  internals** (REQ-ONBD-004, REQ-FILE-*) → **EPIC-007**. This epic stands up the sequence and *gates* them; it
  does not build what is behind steps 2 and 3.
- **Onboarding completion / status transition / completion notification** (REQ-ONBD-005/006/007) → **EPIC-008**.
- **REQ-AUTH-003 client-data RLS *feature* AC (AC-AUTH-003-01..03)** → **Phase-3-owned**. The isolation
  *mechanism* (the new `sec` predicate + policy) and its **per-policy CLIENT-A-cannot-read-CLIENT-B test** are
  built and run **here** (ADR-005, the first client-owned rows); the AUTH-003 feature AC are signed off in
  Phase 3 when the full client-data surface exists. (Flagged for the next planning run.)
- **Multi-participant signing** (Martha & James — REQ-AUTH-007, REQ-LIFE-012) → **Phase 3**. Phase-2
  onboarding is scoped to the single primary client participant.
- **The real Docuseal e-sign integration** (live self-hosted provider, signing redirect, verified+idempotent
  completion webhook, reconciliation fallback, and the signed-document encrypted/non-public storage) →
  **deferred** to a future "real e-sign enablement" slice that re-validates ONBD-002 against the live provider
  (ADR-024 §5). This slice ships against the **mock** e-sign seam (the standing mock-third-party directive).

## Acceptance criteria

Each AC must be covered by **automated test(s) tagged with its AC id** (the test title/annotation contains the
id), at the prescribed tier(s). An AC is implemented only when its tagged test(s) pass in CI. The slice is
deliverable only when all 10 in-scope AC are independently validated.

**REQ-ONBD-001 — three sequential steps**
- **AC-ONBD-001-01** — Onboarding presents exactly three steps in this order: engagement-letter e-sign, intake questionnaire, initial document upload.
- **AC-ONBD-001-02** — The steps are sequential: the client cannot complete or skip ahead to a later step before the steps it depends on are done.
- **AC-ONBD-001-03** — The client can see their current position in the onboarding sequence and which steps remain.

**REQ-ONBD-002 — engagement-letter e-sign hard gate**
- **AC-ONBD-002-01** — Until the letter is e-signed, the intake questionnaire step is not accessible to the client.
- **AC-ONBD-002-02** — Until the letter is e-signed, the initial document upload step is not accessible to the client.
- **AC-ONBD-002-03** — Once the letter is e-signed, the subsequent onboarding steps become accessible to the client.
- **AC-ONBD-002-04** — The signed engagement letter is recorded against the engagement as evidence the gate was satisfied.

**REQ-IDNT-007 — editable default letter template**
- **AC-IDNT-007-01** — A system-provided default engagement-letter template exists and is available without the accountant having to author one from scratch.
- **AC-IDNT-007-02** — The accountant can edit the engagement-letter template's content herself.
- **AC-IDNT-007-03** — The accountant's edited template is what is presented to the client for signature in onboarding.

## Methodology & quality requirements

- **Acceptance format: gherkin.** The 10 Given/When/Then scenarios authored in the epic
  (`.planning/EPIC-005-onboarding-spine-engagement-letter.md` § Acceptance scenarios) are the behavior
  contract. The SDET binds them to executable Playwright/integration steps (or validates against them in prose
  until the Cucumber tooling lands — per CLAUDE.md § Executable gherkin tooling). Do **not** re-author
  scenarios; bind the epic's.
- **E2e required (`apps/portal` + `apps/admin`).** The client sign→unlock happy path and the position/sequence
  rendering run against the full docker-compose stack in `apps/portal`; the accountant template-edit →
  client-sees-edited-letter path spans `apps/admin` (edit) and `apps/portal` (sign).
- **Tier mapping (from the epic's sign-off contract — ADR-012):**
  - **e2e (tier 6):** AC-ONBD-001-01/-03 (sequence rendered, position shown), AC-ONBD-002-03 (sign → unlock
    happy path), AC-IDNT-007-03 (edited template shown to client).
  - **service integration (tier 3):** AC-ONBD-001-02, AC-ONBD-002-01/-02 (sequencing / gate enforced
    server-side, not just hidden in UI), AC-ONBD-002-04 (signature recorded), **the new client-isolation
    policy test (ADR-005)**.
  - **unit/component (tier 2/5):** AC-IDNT-007-01/-02 (default present, edit persists), AC-ONBD-001-03 progress
    rendering.
- **Submission gate** (per CLAUDE.md): `pnpm lint` + `pnpm type-check`; `pnpm --filter portal test` +
  `pnpm --filter admin test`; `pnpm --filter portal e2e:run` + `pnpm --filter admin e2e:run` (+ `pnpm
  e2e:cross-app` where the template-edit→sign path crosses surfaces); tier-3 integration against the real
  container DB; container smoke before Validate.
- **UI demo (`demo.applicable: yes`).** A dedicated `@demo` Playwright walkthrough captures an AC-tagged
  screenshot gallery of jane-accountant editing the letter template (`apps/admin`) and the post-signup client
  walking the three-step sequence → signing → seeing the later steps unlock (`apps/portal`) into
  `docs/demos/EPIC-005/`. Non-gating; the e2e gate is the gate.

## Constraints

Non-negotiables (cite the originating upstream ref). Each is a hard adherence obligation for this slice:

- **ADR-005 — RLS via security policies (FIRST client-owned rows).** The `Engagement` and its onboarding-state
  rows are **client-owned and client-isolated**: a CLIENT can read/act on only **their own** engagement;
  another CLIENT or an anonymous / null-SESSION_CONTEXT caller reads **ZERO**; ACCOUNTANT/admin can read all.
  This is the first slice to introduce client-owned rows — it must add a new `sec` predicate function + a
  FILTER/BLOCK security policy that joins row ownership to the client identity in `SESSION_CONTEXT`
  (`clerk_user_id` → `User`). **HARD requirement (ADR-005):** a tier-3 integration test per policy
  (CLIENT-A-cannot-read-CLIENT-B; anonymous reads ZERO; ACCOUNTANT can). Policies live in `db/policies/` as
  versioned raw SQL; reuse the EPIC-001/002/003 `sec` predicate-function pattern
  (`db/policies/0001-engagement-request-policy.sql`, `0002-service-readable.sql`,
  `0004-notification-policy.sql` — the latter's "future client-ownership join" comment is the seam shape).
- **ADR-003 — SESSION_CONTEXT identity propagation.** All client onboarding reads and the letter-signature
  write run under the **client** principal; the template-edit write runs under the **accountant** principal —
  both through the `packages/db` request-scoped Prisma wrapper (`withRequestContext` / `$extends` SET hook).
  No direct Prisma access in route handlers/server actions outside that wrapper. Honor **ADR-003 Amendment 1**
  (do not reintroduce `@read_only` on the SET).
- **ADR-001 — Authentication via Clerk (provider seam, mocked).** Onboarding is reachable only by the
  authenticated **CLIENT who owns the engagement**; an anonymous or other-client caller cannot view or act on
  it. Reuse the existing `packages/auth` seam (mock provider per EPIC-004's user-approved deviation; role
  server-set per the ADR-005 trust boundary). Account creation is EPIC-004's; this slice operates on the
  already-signed-up client.
- **ADR-006 — Monorepo, two apps.** The client onboarding surface lives in **`apps/portal`**; engagement-letter
  template editing is an accountant setting in **`apps/admin`**. Onboarding must not be reachable from
  `apps/admin`; template editing must not be reachable from `apps/portal`.
- **ADR-023 — Provider-seam & mock-first integration (the e-sign seam follows this pattern).** The e-signature
  integration is a **port + bindings + fail-closed selector**: `port.ts` (`ESignatureProvider`), a
  `bindings/mock.ts` deterministic fake (shipped this slice), a deferred real `bindings/docuseal.ts`, and a
  `select.ts` keyed on environment config. The selector **defaults to the real binding and fails closed**; the
  mock is selectable **only** via an explicit non-production `ALLOW_MOCK_ESIGN` opt-in that **cannot be true in
  a production configuration** (the BUG-002-001 fail-open generalization). The mock is **behavior-faithful, not
  security-faithful** — a green mock-bound suite is not evidence the real e-sign is safe (ADR-023 §6).
- **ADR-024 — E-signature via self-hosted Docuseal behind the seam.** This slice ships the **mock e-sign
  binding only**; REQ-ONBD-002 / NFR-007 AC are **delivered/`verified` against the mock**. The real
  Docuseal binding + the verified/idempotent completion callback + the reconciliation fallback + the
  encrypted/non-public signed-document storage are a **deferred enablement slice** (ADR-024 §5). Onboarding
  code depends on the `ESignatureProvider` port, **never on Docuseal directly**. The content presented for
  signature is the accountant's edited template (ADR-024 §6 — the provider renders whatever letter the app
  supplies; authoring is not the provider's concern).
- **ADR-019 — Audit trail.** The engagement-letter signature is a security-significant event and must be
  recorded against the engagement (AC-ONBD-002-04) **and** written to the append-only audit ledger (reuse the
  EPIC-004 `recordAuthEvent` / `withAuditTransaction` seam; fail-closed audit write).
- **ADR-012 — Testing pyramid.** Server-side gate/sequencing enforcement and the client-isolation policy are
  **tier-3 integration obligations**, not just e2e. The end-to-end sign path is tier-6 e2e.
- **Entity changes (Prisma Track A + raw-SQL Track B):** new `Engagement` entity + onboarding-state + the
  letter-template setting via `prisma migrate dev` (Track A); the new client-isolation `sec` predicate +
  security policy via `db/policies/` raw SQL (Track B), applied through `scripts/db-migrate.ts` /
  `pnpm db:policies:apply`. See **Data & Interface Contract** for the source-traced shape.
- **No branch protection / CI authority changes.** Required checks unchanged (`lint-and-typecheck`,
  `security-scan`; `test-portal`/`test-admin` advisory until per-PR AC tiers are wired). Merge on green
  required CI, no `--admin`/`enforce_admins` toggle (MERGE-POLICY Lane B). This slice touches **application
  code only** (no engine/role/workflow files), so it takes the reviewed lane.

## Data & Interface Contract

> Source-traced to the epic's behavior + the cited ADRs (per the brief author's altitude rule). The **IO
> expands this to the full field-level contract at Design** (exact column names/types, validation, the
> onboarding-state representation, the port method signatures); a genuinely-upstream shape question escalates
> via `OPEN-QUESTIONS.md` — it is **not** invented here. Field-shape conventions trace to **ADR-002**
> (`UNIQUEIDENTIFIER` PK `NEWSEQUENTIALID()`, `DATETIMEOFFSET` timestamps — as on every existing entity).

**Entities & relationships**
- **`Engagement` (NEW — the minimal substrate).** Created on request **acceptance**, linked **1:1 to the
  accepted `EngagementRequest`** and to the **client** (the `User` created at EPIC-004 sign-up; the
  client-link mechanism — direct FK vs. resolved via the invitation-ticket → request chain, and its
  nullability before sign-up — is an IO Design call). Carries a **status** (below). This is a **client-owned
  row** (ADR-005) — it must carry/resolve the **client-owner identity** used by the isolation predicate
  (`SESSION_CONTEXT('clerk_user_id')` → `User`).
- **Onboarding state (NEW).** The per-engagement state of the three-step sequence and the letter gate —
  whether the letter is signed, and the client's current position. Whether this is discrete columns on
  `Engagement` or a separate table is an IO Design call; it is **client-owned and isolated** under the same
  ADR-005 policy.
- **Engagement-letter template (NEW — accountant setting).** A **system-provided default** exists out of the
  box (AC-IDNT-007-01); the accountant edits its content (AC-IDNT-007-02); the **edited** content is what the
  client signs (AC-IDNT-007-03). Accountant-owned/managed in `apps/admin`. (Single current template vs.
  versioned history — IO Design.)
- **Signed-letter evidence (NEW).** On signature the **signed engagement letter is recorded against the
  engagement** as gate-satisfied evidence (AC-ONBD-002-04, ADR-024 §4) and the signing is audited (ADR-019).
  The mock binding yields a deterministic "signed" evidence shape; the real signed-document storage is the
  deferred enablement slice.

**Status enums & state transitions**
- **`Engagement.status` ∈ {`New`, `In Progress`}** (Phase-2 minimal). Created in **`New`**. The `New → In
  Progress` transition is **EPIC-008's**, not this slice — this slice never transitions it. (Exact stored enum
  string values — IO Design.)
- **Letter signature state:** `unsigned → signed`. On `signed`: the questionnaire + document-upload steps
  become accessible (AC-ONBD-002-03) and the signed letter is recorded (AC-ONBD-002-04). Driven through the
  mock `ESignatureProvider` (ADR-024 §5).
- **Onboarding step sequence:** exactly **three ordered steps** — `[engagement-letter e-sign, intake
  questionnaire, initial document upload]` (AC-ONBD-001-01). Steps 2 and 3 are **locked until the letter is
  signed** (AC-ONBD-002-01/-02) and are **sequential** (AC-ONBD-001-02). Lock/unlock is **evaluated
  server-side**, not merely a UI affordance.

**Interface contracts**
- **`ESignatureProvider` port (NEW — ADR-023/024 §1 seam).** Names only the operations onboarding needs:
  create a signature request over the supplied letter content for the signing client, and recognize/verify
  completion. `bindings/mock.ts` (deterministic "signed") ships this slice; `select.ts` is **fail-closed**
  (`ALLOW_MOCK_ESIGN` non-production opt-in). Onboarding depends on the port; the exact method signatures are
  IO Design.
- **Onboarding read/accessibility contract.** Step accessibility is resolved server-side from the engagement's
  onboarding state under the client's `SESSION_CONTEXT` (ADR-003) — a locked step is **refused**, not merely
  hidden (AC-ONBD-001-02, AC-ONBD-002-01/-02).
- **Reused seams (do not reinvent):** `packages/db` `withRequestContext` + the `$extends` SET hook (ADR-003);
  the `sec` predicate-function + FILTER/BLOCK policy pattern (`db/policies/`); the audit seam `recordAuthEvent`
  / `withAuditTransaction` (ADR-019); the EPIC-003 `acceptRequest` server action (extended to create the
  `Engagement` on accept); `packages/auth` for the client identity/role gate.

**Deferred to IO Design (field-level minutiae, not carried here):** exact column names/types; the
onboarding-state representation (columns on `Engagement` vs. a separate entity); the template entity shape
(single row vs. versioned); the mock signature-evidence representation; the precise `ESignatureProvider`
method signatures; the `Engagement`↔client linkage/nullability mechanism.

## References

- Planning: `.planning/EPIC-005-onboarding-spine-engagement-letter.md` (slice, 10 AC, the gherkin scenarios,
  tier map, the minimal-`Engagement` scope note).
- Requirements: REQ-ONBD-001, REQ-ONBD-002, REQ-IDNT-007; REQ-AUTH-003 (isolation-mechanism adherence; feature
  AC Phase-3-owned).
- Architecture: ADR-001, ADR-003 (+ Amendment 1), ADR-005, ADR-006, ADR-012, ADR-019, ADR-023, ADR-024.
- Personas: `.planning/personas/tom-prospective-client.md` (post-signup CLIENT onboarding),
  `.planning/personas/jane-accountant.md` (letter-template editing),
  `.planning/personas/sarah-returning-client.md`.
- Flows: `.planning/flows/flow-onboarding.md` (the three steps + the letter gate),
  `.planning/flows/flow-first-sign-in.md` (client lands post-signup).
- Prior art in-repo: `packages/db` request-scoped wrapper + `sec` predicate pattern (EPIC-001/002/003);
  `db/policies/0004-notification-policy.sql` "future client-ownership join" comment (the isolation seam
  shape); the EPIC-003 `acceptRequest` action (`apps/admin/src/app/requests/actions.ts`) + audit seam
  (`packages/db/src/audit.ts`); `EngagementRequest` / `User` models (`prisma/schema.prisma`).

## Notes

- **First client-owned rows + first e-sign seam.** The bulk of the work is the `Engagement` + onboarding-state
  entities, the **first client-isolation security policy** (and its mandatory CLIENT-A-vs-CLIENT-B tier-3
  test), and the e-sign provider seam (mock binding). The onboarding UI and the server-side gate logic sit on
  top of those.
- **Cross-epic touch (additive).** The delivered EPIC-003 `acceptRequest` flow is **extended** to create the
  minimal `Engagement` on accept. This is additive — it does not change EPIC-003's accept/invite/email
  behavior; the engagement is new substrate alongside it.
- **Mock-provider precedent.** The e-sign goes through the mocked `ESignatureProvider`; real self-hosted
  Docuseal is the deferred enablement slice — the same user-accepted basis as EPIC-004 (mocked Clerk → deferred
  2FA) and EPIC-003 (Mailhog email). ONBD-002 AC are legitimately `verified` against the mock with a tracked
  real-provider re-validation follow-up (ADR-023 §2 / ADR-024 §5).
- **REQ-AUTH-003 boundary flag (for the next planning run).** The client-isolation *mechanism* lands here; the
  AUTH-003 *feature* AC remain Phase-3-owned. Planning flagged this as the enabling slice now living in Phase 2.
- **Carried infra follow-ups (from prior retros / STATE — may resurface at Smoke, not slice-blocking):**
  clean-volume DB bootstrap (`sa`-once login creation, Prisma port-in-authority, `!`-free logins,
  `migrate deploy` P3019), the `sqlserver` healthcheck SA-password mismatch, the `sp_set_session_context` CI
  grep-guard, and the user-walled `RATE_LIMIT_*` `.env.example` vars.

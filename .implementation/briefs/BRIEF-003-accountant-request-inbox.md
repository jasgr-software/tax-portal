---
id: BRIEF-003
title: Accountant request inbox — notify, review, accept/decline, invite
status: ready
acceptance_criteria:
  # REQ-DOOR-005 — accountant notified of a new engagement request
  - id: AC-DOOR-005-01
    text: Submitting a new engagement request generates an in-portal notification for the accountant.
  - id: AC-DOOR-005-02
    text: The notification identifies that a new engagement request has arrived and leads the accountant to review it.
  - id: AC-DOOR-005-03
    text: The notification is delivered to the accountant only, not to clients or the anonymous requester.
  # REQ-DOOR-006 — accountant accepts or declines each request
  - id: AC-DOOR-006-01
    text: The accountant can view each pending engagement request and its submitted details.
  - id: AC-DOOR-006-02
    text: The accountant can accept a pending request, moving it to an accepted state.
  - id: AC-DOOR-006-03
    text: The accountant can decline a pending request, moving it to a declined state.
  - id: AC-DOOR-006-04
    text: Each request can be decided (accepted or declined) by the accountant only.
  - id: AC-DOOR-006-05
    text: Once decided, a request is no longer pending and is not awaiting a second accept/decline decision.
  # REQ-DOOR-007 — acceptance invites the prospect to create an account
  - id: AC-DOOR-007-01
    text: Accepting an engagement request sends an invitation to the prospective client's contact email.
  - id: AC-DOOR-007-02
    text: The invitation directs the recipient to create their own portal account on the client surface.
  - id: AC-DOOR-007-03
    text: A portal client account comes into existence only after the invited prospect acts on the invitation, not at the moment of acceptance.
  - id: AC-DOOR-007-04
    text: The invitation is tied to the accepted request so the resulting account is associated with that engagement.
  # REQ-DOOR-008 — decline sends a reason message to the prospect
  - id: AC-DOOR-008-01
    text: Declining a request lets the accountant write a brief free-text reason message.
  - id: AC-DOOR-008-02
    text: The decline reason message is sent to the prospective client's contact email.
  - id: AC-DOOR-008-03
    text: The prospect receives the decline explanation without needing a portal account.
  - id: AC-DOOR-008-04
    text: The decline reason is retained in the portal, attached to the declined request record, and remains visible to the accountant for her reference.
  # REQ-DASH-011 — manage engagement requests (admin UI)
  - id: AC-DASH-011-01
    text: The accountant can view all engagement requests from the admin UI.
  - id: AC-DASH-011-02
    text: Engagement requests are distinguishable by state: pending, accepted, and declined.
  - id: AC-DASH-011-03
    text: The accountant can identify which requests are pending a decision.
  # REQ-MSG-013 — accountant notification types (this epic owns one AC)
  - id: AC-MSG-013-01
    text: The accountant receives a notification when a new service request is submitted.
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "Accountant-only READ boundary on engagement_request + notification (ADR-005, HARD tier-3): a CLIENT or anonymous caller can never list/read requests or accountant notifications — integration test per policy (CLIENT-vs-ACCOUNTANT)."
    - "Decide-exactly-once invariant (tier-3): a decided request cannot be re-decided; only-the-accountant-decides (AC-DOOR-006-04/-05)."
    - "Outbound email send verified via Mailhog (e2e): acceptance invitation email (AC-DOOR-007-01) and decline reason email (AC-DOOR-008-02) actually leave the app and are captured by the local SMTP catcher."
    - "Invitation issued via the existing packages/auth createInvitation seam (mock provider), tied to the accepted request (AC-DOOR-007-04); no account exists pre-sign-up (AC-DOOR-007-03 — pairs with EPIC-004 AC-AUTH-006-01)."
    - "Audit trail on accept + decline decisions (ADR-019, append-only ledger), reusing the EPIC-004 audit seam."
    - "Anti-abuse rate limiting on outbound invitation/decline email (ADR-022), reusing the EPIC-004 RateLimiter seam."
    - "SESSION_CONTEXT on all inbox reads + accept/decline writes (ADR-003) via the packages/db request-scoped wrapper."
    - "Container smoke (docker-compose stack incl. Mailhog) before Validate."
acceptance_scenarios: .planning/EPIC-003-accountant-request-inbox.md#acceptance-scenarios
demo:
  applicable: yes
  apps: [admin]
  personas: [jane-accountant, tom-prospective-client]
  flows: [flow-engagement-request, flow-first-sign-in]
source:
  - planning: .planning/EPIC-003-accountant-request-inbox.md
  - requirements: .requirements/REQ-DOOR-005.md
  - requirements: .requirements/REQ-DOOR-006.md
  - requirements: .requirements/REQ-DOOR-007.md
  - requirements: .requirements/REQ-DOOR-008.md
  - requirements: .requirements/REQ-DASH-011.md
  - requirements: .requirements/REQ-MSG-013.md
  - requirements: .requirements/REQ-NFR-008.md
  - architecture: .architecture/decisions/ADR-001-authentication-clerk.md
  - architecture: .architecture/decisions/ADR-003-identity-propagation-session-context.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-006-monorepo-layout.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
  - architecture: .architecture/decisions/ADR-019-audit-trail-logging.md
  - architecture: .architecture/decisions/ADR-022-anti-abuse-rate-limiting.md
---

# BRIEF-003 — Accountant request inbox — notify, review, accept/decline, invite

> Self-contained build brief for the EPIC-003 slice. `source:` refs are read-only context; the brief stands
> alone. Composed by the Conductor from `.planning/EPIC-003` + its cited `REQ-*`/`ADR-*` sources and the live
> repo state. **20 in-scope AC.**

## Scope

Close the front-door loop. When a prospect submits an engagement request (EPIC-001, anonymous insert), the
**accountant** is notified in-portal, opens a **request inbox** in the Tax Portal (`apps/admin`), reviews each
request and its submitted details, and makes a single, recorded decision per request:

- **Accept** → the request moves to `accepted`; an **invitation** is issued to the prospect's contact email
  (via the existing `packages/auth` `createInvitation(email, 'CLIENT')` seam — the mock provider), tied to the
  accepted request, directing the recipient to create their own account on the **client surface** (`apps/portal`).
  The account itself is **not** created here (that is EPIC-004's sign-up path).
- **Decline** → the accountant writes a brief free-text reason; the request moves to `declined`; the reason is
  **emailed** to the prospect's contact email and **retained** in the portal attached to the declined request
  record for her later reference.

Concretely the slice delivers:

1. **In-portal accountant notification on submission** (AC-DOOR-005-*, AC-MSG-013-01). A new `Notification`
   entity, accountant-scoped, generated when an engagement request is recorded. The submission path is
   EPIC-001's anonymous insert (runs under the admin pool on `apps/portal`) — the notification must be
   generated as part of recording that submission. The notification identifies the new request and links to it.
2. **The request inbox UI** in `apps/admin` (AC-DASH-011-*, AC-DOOR-006-01): list all engagement requests,
   distinguishable by state (pending / accepted / declined), with pending requests identifiable; open one to
   view its submitted details (prospect name, email, phone, selected services, message).
3. **Accept / decline decision actions** (AC-DOOR-006-02/-03/-04/-05) as `apps/admin` server actions running
   under the authenticated accountant identity (SESSION_CONTEXT, ADR-003), guarded accountant-only
   (`requireRole(ACCOUNTANT)` — EPIC-004 seam), idempotent (decide-exactly-once), and audited (ADR-019).
4. **Acceptance → invitation** (AC-DOOR-007-*): issue the CLIENT invitation through the existing
   `packages/auth` seam, tie it to the accepted request, and send the invitation email. Assert no account
   exists before sign-up.
5. **Decline → reason email + retention** (AC-DOOR-008-*): capture the free-text reason, send it by email to
   the accountless prospect, and persist it on the request record.
6. **The outbound email capability** (REQ-NFR-008): EPIC-003 is the **first slice that sends email**. There is
   no email infrastructure or email ADR in the repo yet. The slice must establish a provider-abstracted
   transactional-email seam (mirroring the EPIC-004 auth-provider seam pattern): a thin `send(...)` port with a
   **local/e2e SMTP binding to the Mailhog catcher already in `docker-compose`** (SMTP `:1025`, UI `:8025`),
   and a production-target provider left as the swappable drop-in (REQ-NFR-008 names no specific provider). See
   *Constraints* for the architecture-consult obligation.

## Out of scope

- **The client account creation** that results from the acceptance invitation → **EPIC-004** (REQ-AUTH-006).
  This slice *sends* the invitation and asserts no-account-before-sign-up; EPIC-004 owns the created account.
  AC-DOOR-007-03 is verified here as a cross-epic seam paired with EPIC-004 AC-AUTH-006-01.
- **The rest of the accountant notification catalogue** — AC-MSG-013-02..06 (new message, document uploaded,
  onboarding completed, document-request overdue, due-date approaching) → Phase 4. Those events do not exist
  in the MVP. Only AC-MSG-013-01 (new-request) is in scope.
- **All client-side notifications** — REQ-MSG-014 (incl. request accepted/declined as in-portal
  notifications) → Phase 4. In the MVP the prospect is account-less; accept/decline reach them by email
  (DOOR-007 / DOOR-008), not a notification feed.
- **Real-time notification streaming** (Supabase Realtime / SSE feed) → Phase 4. EPIC-003 only requires the
  notification to be **generated**, accountant-scoped, and to **lead to** the request on the admin surface —
  not a live-pushed feed.
- **REQ-DOOR-009** (returning client requests from inside the portal) and **REQ-DOOR-010** (accountant
  initiates an engagement for an existing client) → later phase (need a client portal home / engagement entity).
- **Real production email provisioning** (e.g. live Resend keys/domains) → deferred like the EPIC-004 real-Clerk
  provisioning. The seam is provider-abstracted; local + e2e verify against Mailhog. (Mirrors the
  user-accepted EPIC-004 mock-provider precedent.)

## Acceptance criteria

Each AC must be covered by **automated test(s) tagged with its AC id** (the test title/annotation contains the
id), at the prescribed tier(s). An AC is implemented only when its tagged test(s) pass in CI. The slice is
deliverable only when all 20 in-scope AC are independently validated.

**REQ-DOOR-005 — accountant notified**
- **AC-DOOR-005-01** — Submitting a new engagement request generates an in-portal notification for the accountant.
- **AC-DOOR-005-02** — The notification identifies that a new request arrived and leads the accountant to review it.
- **AC-DOOR-005-03** — The notification is delivered to the accountant only, not to clients or the anonymous requester.

**REQ-DOOR-006 — accept / decline**
- **AC-DOOR-006-01** — The accountant can view each pending request and its submitted details.
- **AC-DOOR-006-02** — She can accept a pending request, moving it to an accepted state.
- **AC-DOOR-006-03** — She can decline a pending request, moving it to a declined state.
- **AC-DOOR-006-04** — Each request can be decided by the accountant only.
- **AC-DOOR-006-05** — Once decided, a request is no longer pending / awaiting a second decision.

**REQ-DOOR-007 — acceptance invites**
- **AC-DOOR-007-01** — Accepting sends an invitation to the prospect's contact email.
- **AC-DOOR-007-02** — The invitation directs the recipient to create their own portal account on the client surface.
- **AC-DOOR-007-03** — A client account exists only after the invited prospect acts on the invitation, not at acceptance.
- **AC-DOOR-007-04** — The invitation is tied to the accepted request so the resulting account is associated with it.

**REQ-DOOR-008 — decline reason email**
- **AC-DOOR-008-01** — Declining lets the accountant write a brief free-text reason message.
- **AC-DOOR-008-02** — The reason is sent to the prospect's contact email.
- **AC-DOOR-008-03** — The prospect receives the explanation without needing a portal account.
- **AC-DOOR-008-04** — The decline reason is retained in the portal, attached to the declined request, visible to the accountant.

**REQ-DASH-011 — admin UI**
- **AC-DASH-011-01** — The accountant can view all engagement requests from the admin UI.
- **AC-DASH-011-02** — Requests are distinguishable by state: pending, accepted, declined.
- **AC-DASH-011-03** — The accountant can identify which requests are pending a decision.

**REQ-MSG-013 — notification (one AC in scope)**
- **AC-MSG-013-01** — The accountant receives a notification when a new service request is submitted.

## Methodology & quality requirements

- **Acceptance format: gherkin.** The 20 Given/When/Then scenarios authored in the epic
  (`.planning/EPIC-003-accountant-request-inbox.md` § Acceptance scenarios) are the behavior contract. The SDET
  binds them to executable Playwright/integration steps (or validates against them in prose until the Cucumber
  tooling lands — per CLAUDE.md § Executable gherkin tooling). Do **not** re-author scenarios; bind the epic's.
- **E2e required (`apps/admin`).** The accept→invite and decline→email happy paths run against the full
  docker-compose stack (SQL Server + Next.js + Azurite + **Mailhog**). Email assertions read the Mailhog API.
- **Tier mapping (from the epic's sign-off contract — ADR-012):**
  - **e2e (tier 6, `apps/admin`):** AC-DOOR-006-01/-02/-03, AC-DOOR-008-01/-04, AC-DASH-011-01/-02/-03,
    AC-DOOR-005-02; the accept→invite and decline→email happy paths.
  - **service integration (tier 3):** AC-DOOR-005-01/-03 (notification generated; accountant-only read of
    requests + notifications), AC-DOOR-006-04/-05 (only-accountant-decides; decide-exactly-once),
    AC-DOOR-007-01/-03/-04 (invitation issued, tied to request, no account before sign-up), AC-DOOR-008-02/-03
    (email send), AC-MSG-013-01.
  - **unit/component (tier 2/5):** AC-DOOR-006-01 detail rendering, AC-DOOR-008-01 reason capture.
  - **cross-epic seam:** AC-DOOR-007-03 pairs with EPIC-004 AC-AUTH-006-01 (account exists only after sign-up).
- **Submission gate** (per CLAUDE.md): `pnpm lint` + `pnpm type-check`; `pnpm --filter admin test` (+ `portal`
  where the submission path changes); `pnpm --filter admin e2e:run`; tier-3 integration against the real
  container DB; container smoke before Validate.
- **UI demo (`demo.applicable: yes`).** A dedicated `@demo` Playwright walkthrough captures an AC-tagged
  screenshot gallery of jane-accountant's review→accept→invite and review→decline→email journeys (and the
  notification leading her to the request) into `docs/demos/EPIC-003/`. Non-gating; the e2e gate is the gate.

## Constraints

Non-negotiables (cite the originating upstream ref). Each is a hard adherence obligation for this slice:

- **ADR-005 — RLS via security policies (READ boundary).** `engagement_request` is **accountant-readable
  only**, and the new `notification` entity is **accountant-readable only**. A client or anonymous caller can
  never list/read requests or accountant notifications (AC-DOOR-005-03). This is the read counterpart to
  EPIC-001's sanctioned anonymous insert. **HARD requirement:** a tier-3 integration test per policy
  (CLIENT-A/CLIENT cannot read; anonymous cannot read; ACCOUNTANT can). Policies live in `db/policies/` as
  versioned raw SQL; reuse the EPIC-001/002 `sec` predicate-function pattern.
- **ADR-003 — SESSION_CONTEXT identity propagation.** All inbox reads and accept/decline writes run under the
  authenticated accountant identity via the `packages/db` request-scoped Prisma wrapper (`$extends` SET hook).
  No direct Prisma access in route handlers outside that wrapper. Honor **ADR-003 Amendment 1** (the
  `@read_only`-vs-pooling fix from EPIC-002 — do not reintroduce `@read_only` on the SET).
- **ADR-001 — Authentication via Clerk (provider seam).** The acceptance invitation is issued through the
  auth-provider seam — reuse the **existing** `packages/auth` `createInvitation(email, 'CLIENT')` (the mock
  provider per EPIC-004's user-approved mock deviation). The invitation carries the CLIENT role (server-set,
  per ADR-005 trust boundary) and must tie back to the accepted request (AC-DOOR-007-04). Account creation is
  EPIC-004's; this slice asserts no-account-before-sign-up.
- **ADR-006 — Monorepo, two apps.** The inbox + decision actions live in **`apps/admin` only** and must not be
  reachable from `apps/portal`. The invitation email directs the recipient to the **client surface**
  (`apps/portal`) for sign-up (cross-app link per ADR-010).
- **ADR-019 — Audit trail.** Accept and decline are security-significant decisions and must be recorded in the
  append-only audit ledger (reuse the EPIC-004 `APPEND_ONLY_LEDGER_TABLE` + audit seam).
- **ADR-022 — Anti-abuse rate limiting.** Outbound invitation/decline email is rate-limited (reuse the
  EPIC-004 `RateLimiter` port). Note the EPIC-004 single-process caveat + scaling trigger in the runbook.
- **ADR-012 — Testing pyramid.** Accountant-only read of requests/notifications and the decide-exactly-once
  invariant are **tier-3 integration obligations**, not just e2e.
- **REQ-NFR-008 — reliable transactional email.** Outbound invitation + decline emails go through a dependable
  transactional-email capability. The spec names **no** specific provider — provider is an implementation
  decision. **There is no email ADR in `.architecture/` yet and no email infra in the repo.** The slice
  establishes a provider-abstracted email seam: a `send(...)` port, an **SMTP binding to the local Mailhog
  catcher** (already in `docker-compose`, SMTP `:1025`) for local + e2e, and a production provider left as the
  swappable drop-in. **Plan-phase obligation:** because this introduces a new cross-cutting transport with no
  governing ADR, the IO should **consult the architecture agent** during Design (an *email-transport* ADR may
  need to be raised, analogous to ADR-001 for auth and ADR-008 for object storage) and record the seam decision.
- **Entity changes (Prisma Track A + raw-SQL Track B):**
  - **Extend `EngagementRequest`:** the existing `status` field already reserves `accepted`/`declined` ("EPIC-003
    adds this transition"); add a `declineReason` field (nullable NVarChar(Max)) and the request↔invitation
    linkage for AC-DOOR-007-04. Reuse the existing model — do not recreate it.
  - **New `Notification` entity:** accountant-scoped, generated on request submission, links to the request,
    carries read/unread or seen state sufficient for "leads her to review it." Add its ADR-005 read policy.
  - Schema via `prisma migrate dev` (Track A); RLS policies via `db/migrations/` + `db/policies/` raw SQL
    (Track B), applied through `scripts/db-migrate.ts` / `pnpm db:policies:apply`.
- **No branch protection / CI authority changes.** Required checks unchanged (`lint-and-typecheck`,
  `security-scan`; `test-portal`/`test-admin` advisory until per-PR AC tiers are wired). Merge on green
  required CI, no `--admin`/`enforce_admins` toggle (MERGE-POLICY Lane B).

## References

- Planning: `.planning/EPIC-003-accountant-request-inbox.md` (slice, 20 AC, the gherkin scenarios, tier map).
- Requirements: REQ-DOOR-005, -006, -007, -008; REQ-DASH-011; REQ-MSG-013 (partial — AC-01 only); REQ-NFR-008.
- Architecture: ADR-001, ADR-003 (+ Amendment 1), ADR-005, ADR-006, ADR-010, ADR-012, ADR-019, ADR-022.
- Personas: `.planning/personas/jane-accountant.md`, `.planning/personas/tom-prospective-client.md`.
- Flows: `.planning/flows/flow-engagement-request.md` (review/accept/decline + decline branch),
  `.planning/flows/flow-first-sign-in.md` (invitation → sign-up handoff).
- Prior art in-repo: `packages/auth` (`createInvitation`, `requireRole`, RateLimiter, audit seam — EPIC-004);
  `packages/db` request-scoped wrapper + `sec` predicate pattern (EPIC-001/002); `db/policies/0002-service-readable.sql`
  + `sec.fn_service_write_access` (EPIC-002) as the RLS-policy exemplar; `EngagementRequest` model (EPIC-001).

## Notes

- **First email-sending slice + first notification slice.** Both capabilities are net-new; expect the email
  seam + Notification entity + their tests to be the bulk of the work, alongside the inbox UI and the two
  decision actions. The decision *actions* themselves are thin once the seams exist.
- **Cross-surface submission seam (watch this).** AC-DOOR-005-01/AC-MSG-013-01 fire on the EPIC-001 **portal**
  submission path (anonymous insert under the admin pool), but the notification is consumed on the **admin**
  surface. The slice touches `apps/portal`'s submit action to generate the notification, then surfaces it in
  `apps/admin`. Per CLAUDE.md § Platform-frontend scope, validate **both** surfaces.
- **EPIC-004 mock-provider precedent.** The invitation goes through the mocked auth provider; the email goes
  through Mailhog. Real Clerk + real email provider remain deferred drop-ins — same user-accepted basis as
  EPIC-004 (CI + dev-time container runs as the gate; ADR-007 staging gate does not exist yet).
- **Carried infra follow-ups (from RETRO-002 / STATE — may resurface at Smoke, not slice-blocking):**
  clean-volume DB bootstrap (`sa`-once login creation, Prisma port-in-authority, `!`-free logins,
  `migrate deploy` P3019), the `sqlserver` healthcheck SA-password mismatch, and the `sp_set_session_context`
  CI grep-guard. The user-walled EPIC-004 `RATE_LIMIT_*` `.env.example` vars are still pending.

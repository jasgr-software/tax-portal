---
id: BRIEF-008
title: Onboarding completion — gate close, automatic New→In Progress transition, accountant notified
status: ready
acceptance_criteria:
  # REQ-ONBD-005 — onboarding complete requires all three steps
  - id: AC-ONBD-005-01
    text: "Onboarding is marked complete only when the engagement letter is e-signed, the intake questionnaire is submitted, and the initial documents are uploaded."
  - id: AC-ONBD-005-02
    text: "If any one of the three steps is not yet satisfied, onboarding is not complete."
  # REQ-ONBD-006 — onboarding completion moves engagement to In Progress
  - id: AC-ONBD-006-01
    text: "When an engagement's onboarding becomes complete, its status automatically changes from \"New\" to \"In Progress\"."
  - id: AC-ONBD-006-02
    text: "This transition occurs without any manual action by the accountant."
  - id: AC-ONBD-006-03
    text: "The transition occurs only on onboarding completion; an engagement whose onboarding is not yet complete remains in \"New\"."
  # REQ-ONBD-007 — accountant notified when onboarding completes
  - id: AC-ONBD-007-01
    text: "When an engagement's onboarding becomes complete, the accountant receives an in-portal notification of that completion."
  - id: AC-ONBD-007-02
    text: "The notification identifies the engagement (and its client) whose onboarding completed."
  # REQ-MSG-013 — notification types received by the accountant (this epic owns one AC)
  - id: AC-MSG-013-04
    text: "The accountant receives a notification when onboarding is completed for an engagement."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "Completion predicate truth-table (HARD tier-3 integration, ADR-012): the completion evaluation is correct over the three step signals — onboarding is complete ONLY when the letter is signed AND the questionnaire is submitted AND the required documents are uploaded (AC-ONBD-005-01); with ANY one of the three unsatisfied, onboarding is NOT complete (AC-ONBD-005-02). Prove each step toggled (the truth table) at tier-2/3; prove the all-satisfied ⇒ complete-and-transitioned and any-one-unsatisfied ⇒ not-complete-and-stays-New cases at tier-3 against the real SQL Server container. Consume the EPIC-005 read model's existing three step `done` flags (letter via `letterSignedAt`; questionnaire via `questionnaireSubmittedAt` — EPIC-006; document-upload via `allRequiredProvided` — EPIC-007); do NOT re-derive step satisfaction or fork the read model."
    - "Automatic + only-on-completion transition (ADR-003 / ADR-019, HARD tier-3): on completion the engagement's status automatically changes New → In Progress (AC-ONBD-006-01) with no manual accountant action (AC-ONBD-006-02); an engagement whose onboarding is incomplete stays New and has not transitioned (AC-ONBD-006-03). The evaluation + the privileged status write run SERVER-SIDE under a trusted identity (ADR-003), not the client's hand. FIRE-ONCE: the transition + the notification happen exactly once on the New→In Progress edge — a re-evaluation of an already-In-Progress (already-complete) engagement must NOT transition again or emit a duplicate notification (traces to AC-ONBD-006-03 'occurs only on completion'). The auto transition is a recorded audit event (ADR-019) — reuse the EPIC-003/004 audit seam (`packages/db/src/audit.ts`: `recordAuthEvent` / `withAuditTransaction`); do not invent a parallel audit path."
    - "Accountant-only onboarding-complete notification (ADR-005, HARD tier-3 read boundary): on completion the accountant receives an in-portal notification (AC-ONBD-007-01) that identifies the engagement and its client (AC-ONBD-007-02), of an onboarding-completed type (AC-MSG-013-04). REUSE the EPIC-003 `Notification` entity + the accountant-only `db/policies/0004-notification-policy.sql` read boundary + the `packages/db/src/repositories/notification.ts` seam — do NOT add a second notification entity or policy. A per-policy integration test proves the onboarding-complete notification is readable by the ACCOUNTANT and reads ZERO for a CLIENT / anonymous-null-SESSION_CONTEXT caller (the same boundary EPIC-003 established for `Notification`)."
    - "Server-authoritative completion (ADR-003): completion evaluation and the transition + notification writes go through the `packages/db` request-scoped wrapper / admin pool — the client cannot directly write engagement status or insert notifications. The client's own onboarding-state read runs under the CLIENT principal; the privileged completion writes (status transition + accountant notification + audit) run under the admin/system pool (mirror the EPIC-007 ADR-009 step-2d admin-pool write pattern). Honor ADR-003 Amendment 1 (no `@read_only` on the SET)."
    - "Do NOT weaken the EPIC-005 letter hard gate or fork the onboarding spine: this slice consumes the satisfied/unsatisfied signals the three step-epics already produce (`packages/db/src/onboarding.ts`) and extends them with the completion evaluation + transition + notification; it does not rebuild the letter gate, questionnaire, or upload, and it keeps the server-authoritative step sequencing intact."
    - "Cross-surface (CLAUDE.md § Platform-frontend scope): completion is triggered by the client finishing step 3 in `apps/portal`; the In Progress status + the completion notification surface in the accountant's `apps/admin`. Validate BOTH surfaces; the full path crosses both (`pnpm e2e:cross-app`)."
    - "Container smoke (docker-compose stack) before Validate."
acceptance_scenarios: .planning/EPIC-008-onboarding-completion-transition.md#acceptance-scenarios
demo:
  applicable: yes
  apps: [portal, admin]
  personas: [jane-accountant, sarah-returning-client]
  flows: [flow-onboarding]
source:
  - planning: .planning/EPIC-008-onboarding-completion-transition.md
  - requirements: .requirements/REQ-ONBD-005.md
  - requirements: .requirements/REQ-ONBD-006.md
  - requirements: .requirements/REQ-ONBD-007.md
  - requirements: .requirements/REQ-MSG-013.md
  - architecture: .architecture/decisions/ADR-003-identity-propagation-session-context.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-006-monorepo-layout.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
  - architecture: .architecture/decisions/ADR-019-audit-trail-logging.md
---

# BRIEF-008 — Onboarding completion — gate close, automatic New→In Progress transition, accountant notified

> Self-contained build brief for the EPIC-008 slice. `source:` refs are read-only context; the brief stands
> alone. Composed by the Conductor from `.planning/EPIC-008` + its cited `REQ-*`/`ADR-*` sources and the live
> repo state. **8 in-scope AC.** This is the **Phase-2 capstone** — it **closes the onboarding gate** over the
> outputs of EPIC-005 (letter), EPIC-006 (questionnaire), and EPIC-007 (documents), and it is the only slice
> that delivers an **automatic** engagement-status transition. It introduces **no net-new entities** — it is
> behavior layered over the existing onboarding read model, the `Engagement` status column, and the EPIC-003
> notification spine.

## Scope

Deliver **onboarding completion** end to end, across both surfaces:

1. **A completion evaluation (the gate close — AC-ONBD-005-01/-02).** The **system** evaluates an engagement's
   three onboarding steps and marks onboarding **complete only when all three are satisfied**: the engagement
   letter is e-signed (EPIC-005), the intake questionnaire is submitted (EPIC-006), and the required documents
   are uploaded (EPIC-007). If **any one** of the three is unsatisfied, onboarding is **not** complete. This
   reuses — and must not re-derive — the three step `done` signals the EPIC-005 onboarding read model already
   computes (`packages/db/src/onboarding.ts`: letter via `letterSignedAt`; questionnaire via
   `questionnaireSubmittedAt`; document-upload via `allRequiredProvided`).

2. **The automatic New → In Progress transition (AC-ONBD-006-01/-02/-03).** On the moment onboarding becomes
   complete, the engagement's status changes from **New** to **In Progress** — **automatically**, with **no
   manual action** by the accountant. This is the **single automatic transition** in the engagement lifecycle
   (all other status changes are manual, Phase 3). An engagement whose onboarding is **incomplete stays New**.
   The transition runs **server-side under a trusted identity** (ADR-003) and is a **recorded audit event**
   (ADR-019).

3. **The accountant in-portal notification (AC-ONBD-007-01/-02, AC-MSG-013-04).** On completion the
   **accountant** receives an **in-portal notification** of an onboarding-completed type, that **identifies the
   engagement and its client** whose onboarding finished, so she can pick up the work. This **reuses** the
   EPIC-003 `Notification` entity, the accountant-only read policy (`db/policies/0004-notification-policy.sql`),
   and the `packages/db/src/repositories/notification.ts` seam — a new notification **`type`** value, not a new
   entity (the same pattern by which EPIC-003 added `new_engagement_request`).

The completion path is **triggered by the client finishing the last onboarding step** in the **Client Portal
(`apps/portal`)**; the resulting **In Progress** status and the **completion notification** surface in the
accountant's **Tax Portal (`apps/admin`)**. The full path therefore crosses both surfaces.

**Fire-once.** The transition and the notification occur **exactly once**, on the New → In Progress edge.
Re-evaluating an engagement whose onboarding is already complete (already In Progress) must **not** transition
it again or emit a duplicate notification (traces to AC-ONBD-006-03 "occurs only on completion").

## Out of scope

- **The internals of each onboarding step** (EPIC-005 letter gate, EPIC-006 questionnaire, EPIC-007 document
  upload). This slice **consumes** their satisfied/unsatisfied signals — it does not build, modify, or weaken
  them. It must not re-derive step satisfaction or fork the read model.
- **The manual lifecycle transitions and the rest of the four-stage pipeline** — REQ-LIFE-001/002/003 →
  **Phase 3**. This slice delivers **only** the single *automatic* New → In Progress transition; **Review** and
  **Complete** statuses, client-facing lifecycle labels, and accountant-driven moves are Phase 3.
- **The remaining accountant notification types** — AC-MSG-013-02/-03/-05/-06 (new message, document uploaded,
  overdue, due-date) → **Phase 4** (those source events arrive in later phases). This epic owns **only**
  AC-MSG-013-04 (onboarding completed).
- **Client-side onboarding-progress notifications** — REQ-MSG-014 → **Phase 4**. The notification this slice
  emits is for the **accountant** only.
- **Real-time delivery / digest-email fallback of the notification.** The in-portal notification is recorded
  and accountant-readable (the same surface EPIC-003 established); the real-time Supabase Realtime push and the
  email digest fallback are **Phase 4** (the notification feed).

## Acceptance criteria

Each AC must be covered by **automated test(s) tagged with its AC id** (the test title/annotation contains the
id), at the prescribed tier(s). An AC is implemented only when its tagged test(s) pass in CI. The slice is
deliverable only when all 8 in-scope AC are independently validated.

**REQ-ONBD-005 — onboarding complete requires all three steps**
- **AC-ONBD-005-01** — Onboarding is marked complete only when the engagement letter is e-signed, the intake questionnaire is submitted, and the initial documents are uploaded.
- **AC-ONBD-005-02** — If any one of the three steps is not yet satisfied, onboarding is not complete.

**REQ-ONBD-006 — onboarding completion moves engagement to In Progress**
- **AC-ONBD-006-01** — When an engagement's onboarding becomes complete, its status automatically changes from "New" to "In Progress".
- **AC-ONBD-006-02** — This transition occurs without any manual action by the accountant.
- **AC-ONBD-006-03** — The transition occurs only on onboarding completion; an engagement whose onboarding is not yet complete remains in "New".

**REQ-ONBD-007 — accountant notified when onboarding completes**
- **AC-ONBD-007-01** — When an engagement's onboarding becomes complete, the accountant receives an in-portal notification of that completion.
- **AC-ONBD-007-02** — The notification identifies the engagement (and its client) whose onboarding completed.

**REQ-MSG-013 — notification types received by the accountant** *(this epic owns AC-MSG-013-04; the rest are other phases)*
- **AC-MSG-013-04** — The accountant receives a notification when onboarding is completed for an engagement.

> **AC-ONBD-007-01 ↔ AC-MSG-013-04** are the ONBD-side and MSG-side statements of the **same**
> onboarding-complete notification — both are owned here and **dual-tagged** (a single test surface may satisfy
> both), mirroring EPIC-003's ownership of AC-MSG-013-01 for the new-request notification.

## Methodology & quality requirements

- **Acceptance format: gherkin.** The 8 Given/When/Then scenarios authored in the epic
  (`.planning/EPIC-008-onboarding-completion-transition.md` § Acceptance scenarios) are the behavior contract.
  The SDET binds them to executable Playwright/integration steps (or validates against them in prose until the
  Cucumber tooling lands — per CLAUDE.md § Executable gherkin tooling). Do **not** re-author scenarios; bind
  the epic's.
- **E2e required (`apps/portal` + `apps/admin`).** The client completing the third onboarding step runs in
  `apps/portal`; the resulting **In Progress** status and the **onboarding-complete notification** surface in
  `apps/admin`; the complete-steps → status-changed → accountant-notified path crosses both surfaces
  (`pnpm e2e:cross-app`).
- **Tier mapping (from the epic's sign-off contract — ADR-012):**
  - **e2e (tier 6):** the full path — complete the three steps ⇒ the engagement shows **In Progress** ⇒ the
    accountant **sees the notification** identifying the engagement + client (AC-ONBD-006-01, AC-ONBD-007-01/-02,
    AC-MSG-013-04).
  - **service integration / security (tier 3):** AC-ONBD-005-01/-02 (the completion predicate); AC-ONBD-006-02/-03
    (automatic, only-on-completion — incl. the **fire-once** property: an already-In-Progress engagement does not
    re-transition or re-notify); AC-ONBD-007-01 (notification generated **and** accountant-only read — the
    per-policy read test: ACCOUNTANT reads, CLIENT / anonymous-null read ZERO).
  - **unit/component (tier 2/5):** the completion predicate's **truth table** — each of the three steps toggled
    (the three single-unsatisfied cases ⇒ not complete; all-three ⇒ complete).
- **Submission gate** (per CLAUDE.md): `pnpm lint` + `pnpm type-check`; `pnpm --filter portal test` +
  `pnpm --filter admin test`; `pnpm --filter portal e2e:run` + `pnpm --filter admin e2e:run` + `pnpm
  e2e:cross-app` (the path crosses surfaces); tier-3 integration against the real container DB; container smoke
  before Validate.
- **UI demo (`demo.applicable: yes`).** A dedicated `@demo` Playwright walkthrough captures an AC-tagged
  screenshot gallery of a post-letter-gate client (sarah-returning-client) completing the final onboarding step
  in `apps/portal`, and jane-accountant seeing the engagement flip to **In Progress** and the
  onboarding-complete notification in `apps/admin`, into `docs/demos/EPIC-008/`. Non-gating; the e2e gate is the
  gate.

## Constraints

Non-negotiables (cite the originating upstream ref). Each is a hard adherence obligation for this slice:

- **ADR-003 — SESSION_CONTEXT identity propagation.** Completion **evaluation** and the **status transition**
  run server-side under a **trusted identity**, not the client's hand. The client's own onboarding-state read
  runs under the **client** principal through the `packages/db` request-scoped wrapper (`withRequestContext` /
  `$extends` SET hook); the **privileged completion writes** (the engagement-status UPDATE, the accountant
  notification INSERT, and the audit record) run under the **admin/system pool** — the client cannot directly
  write engagement status or insert notifications (mirror the EPIC-007 ADR-009 step-2d admin-pool write
  pattern). No direct Prisma access outside the wrapper. Honor **ADR-003 Amendment 1** (do not reintroduce
  `@read_only` on the SET).
- **ADR-005 — RLS via security policies (reuse, do not add).** The onboarding-complete notification is
  **accountant-readable only** — the **same** read boundary EPIC-003 established for `Notification`
  (`db/policies/0004-notification-policy.sql`). Do **not** author a new policy or a second notification entity.
  **HARD requirement (ADR-005 §6):** a tier-3 integration test proving the onboarding-complete notification is
  readable by the **ACCOUNTANT** and reads **ZERO** for a **CLIENT** and for an **anonymous / null-SESSION_CONTEXT**
  caller. (No new client-owned-row family is introduced this slice; the engagement isolation policies `0005`/
  `0007` already govern the engagement the notification points at.)
- **ADR-019 — Audit trail.** The automatic New → In Progress transition is a **security-/state-significant
  event** and is **recorded** — reuse the EPIC-003/004 audit seam (`packages/db/src/audit.ts`:
  `recordAuthEvent` / `withAuditTransaction`); do not invent a parallel audit path. The status UPDATE, the
  notification INSERT, and the audit record should be **atomic** (one transaction) so a completion never leaves
  a transitioned engagement without its notification/audit, or vice versa.
- **ADR-006 — Monorepo, two apps.** The completion notification and the In Progress status surface in the
  accountant's **`apps/admin`**; the client's completing action lives in **`apps/portal`**. The accountant
  notification surface must not be reachable from `apps/portal`.
- **ADR-012 — Testing pyramid.** "All three satisfied ⇒ complete & transitioned" and "any one unsatisfied ⇒
  not complete & stays New" are **tier-3 integration** obligations proved against the **real** SQL Server
  container; the completion predicate truth table is **tier-2/5**; the full step-through-to-notification path is
  **tier-6 e2e**.
- **Build on the EPIC-005 onboarding spine, do not fork it.** The onboarding read model and the three step
  `done` signals already exist (`packages/db/src/onboarding.ts`). This slice **consumes** those signals to
  evaluate completion; it must **not** re-derive step satisfaction, weaken the EPIC-005 letter hard gate, or
  alter the EPIC-006/007 step logic.
- **No branch protection / CI authority changes.** Required checks unchanged (`lint-and-typecheck`,
  `security-scan`; `test-portal`/`test-admin` advisory until per-PR AC tiers are wired). Merge on green required
  CI, no `--admin`/`enforce_admins` toggle (MERGE-POLICY Lane B). This slice touches **application code only**
  (no engine/role/workflow files), so it takes the reviewed lane.

## Data & Interface Contract

> Source-traced to the epic's behavior + the cited ADRs (per the brief author's altitude rule). This slice
> introduces **no net-new entity** — it adds a **status transition**, an **onboarding-complete marker**, and a
> reused **notification type**. The **IO expands the field-level contract at Design** (the marker representation,
> the notification's engagement/client reference, the trigger point, idempotency mechanism); a genuinely-upstream
> shape question escalates via `OPEN-QUESTIONS.md` — it is **not** invented here. Field-shape conventions trace
> to **ADR-002** (`UNIQUEIDENTIFIER` PK `NEWSEQUENTIALID()`, `DATETIMEOFFSET` timestamps — as on every existing
> entity).

**Entities & relationships (all EXISTING — no net-new entity)**
- **Engagement (EXISTING — EPIC-005).** Already carries `status` (`@default("New")`, `'New' | 'In Progress'` —
  the schema comment already reserves the transition for EPIC-008) and the onboarding-state columns
  (`letterSignedAt`, `questionnaireSubmittedAt`, the document-checklist relations). This slice **transitions
  `status` New → In Progress** on completion and records an **onboarding-complete marker** (e.g. an
  `onboardingCompletedAt` timestamp, or a derived evaluation — the representation is an IO Design call; what is
  fixed is that completion is observable and the transition fires once). Not otherwise modified.
- **Notification (EXISTING — EPIC-003).** The accountant notification feed entity, accountant-readable only via
  `db/policies/0004-notification-policy.sql`. This slice adds a **new `type` value** (e.g.
  `onboarding_completed`) and a notification that **resolves to the engagement and its client** (AC-ONBD-007-02).
  The current schema has a nullable FK to `EngagementRequest` (1:1 with `Engagement`) — whether the
  engagement/client is referenced via a **new nullable `engagementId` FK**, via the existing 1:1
  `EngagementRequest` link, or via denormalized title/body text is an **IO Design call**; what is fixed is that
  opening the notification identifies the completed engagement and its client.

**Status enums & state transitions**
- **Engagement status (the one automatic transition):** `New → In Progress`, fired **only** on onboarding
  completion (AC-ONBD-006-01/-03), **automatically** (no accountant action — AC-ONBD-006-02), and **once** (no
  re-transition on an already-In-Progress engagement). `Review` and `Complete` and all manual moves are **Phase
  3** — out of scope.
- **Onboarding state:** `incomplete → complete` when **all three** step `done` flags are true (AC-ONBD-005-01);
  remains `incomplete` while **any** is false (AC-ONBD-005-02). Derived from the existing read model's three
  step signals — not a new source of truth for the steps themselves.

**Interface contracts**
- **Completion-evaluation seam (server-side).** A server-side evaluation that consumes the three existing step
  `done` signals (from `packages/db/src/onboarding.ts`) and returns complete/incomplete (AC-ONBD-005-01/-02).
  Whether this lives as an extension of the onboarding read model or a dedicated completion service is an IO
  Design call; it must run server-side (ADR-003) and must not re-derive step satisfaction.
- **Completion-processing seam (privileged, atomic, idempotent).** On the incomplete → complete edge, under the
  admin/system pool: transition the engagement `New → In Progress`, INSERT the accountant onboarding-complete
  `Notification` (reusing the `notification.ts` repo seam), and record the ADR-019 audit event — **in one
  transaction**, **fire-once** (guarded so an already-complete/In-Progress engagement does not re-fire). The
  **trigger point** (evaluate-on-step-3-fulfillment vs. a reconciliation pass vs. evaluate-on-onboarding-state
  read) is an IO Design call traceable to "when onboarding becomes complete"; whichever is chosen must preserve
  automatic (AC-ONBD-006-02) and fire-once semantics.
- **Reused seams (do not reinvent):** the EPIC-005 onboarding read model + step signals
  (`packages/db/src/onboarding.ts`); the EPIC-003 `Notification` entity + `repositories/notification.ts` +
  `db/policies/0004-notification-policy.sql`; the EPIC-003/004 audit seam (`packages/db/src/audit.ts`:
  `recordAuthEvent` / `withAuditTransaction`); `packages/db` `withRequestContext` + the `$extends` SET hook
  (ADR-003); the EPIC-005/007 admin-pool privileged-write pattern; the accountant notification feed surface in
  `apps/admin`; `packages/auth` for the accountant identity + role gate.

**Deferred to IO Design (field-level minutiae, not carried here):** the onboarding-complete marker
representation (a timestamp column vs. a purely derived evaluation); how the notification references the
engagement + client (new nullable `engagementId` FK vs. the existing 1:1 `EngagementRequest` link vs.
denormalized title/body); the exact new notification `type` string; the completion **trigger point** and the
**fire-once** guard mechanism (a status-precondition on the UPDATE, a unique constraint on the notification, or
an `onboardingCompletedAt`-null guard); the transaction boundary specifics.

## References

- Planning: `.planning/EPIC-008-onboarding-completion-transition.md` (slice, 8 AC, the 8 gherkin scenarios,
  tier map, the out-of-scope boundaries, the REQ-ONBD-007 ↔ AC-MSG-013-04 dual-tag note).
- Requirements: REQ-ONBD-005, REQ-ONBD-006, REQ-ONBD-007, REQ-MSG-013 (partial — -04 only).
- Architecture: ADR-003 (+ Amendment 1), ADR-005, ADR-006, ADR-012, ADR-019.
- Personas: `.planning/personas/jane-accountant.md` (receives completion),
  `.planning/personas/sarah-returning-client.md`, `.planning/personas/martha-and-james-married-couple.md`
  (finish onboarding).
- Flows: `.planning/flows/flow-onboarding.md` (completion + transition + notification — steps 5–6).
- Prior art in-repo: the EPIC-005 onboarding spine — `packages/db/src/onboarding.ts` (read model + step
  signals); the EPIC-003 notification spine — `prisma/schema.prisma` `model Notification`,
  `packages/db/src/repositories/notification.ts`, `db/policies/0004-notification-policy.sql`; the EPIC-003/004
  audit seam (`packages/db/src/audit.ts`); the `Engagement` model + its `status` column
  (`prisma/schema.prisma`, comment already deferring the transition to EPIC-008); the EPIC-007 ADR-009 step-2d
  admin-pool privileged-write pattern (`packages/db/src/repositories/document.ts`).

## Notes

- **Smallest Phase-2 slice (8 AC) and the Phase-2 capstone.** Unlike EPIC-005/006/007 it introduces **no
  net-new entity, no new RLS policy, and no new provider seam** — it is **behavior over existing shapes**. The
  substantive work is the completion predicate over the three existing step signals, the **single automatic**
  status transition (fire-once, audited, atomic with the notification), and the reused accountant notification
  with a new `type`. The risk surface is correctness of the predicate + transition (truth table) and the
  fire-once / accountant-only-read properties — not new infrastructure.
- **Closes Phase 2.** With EPIC-008 delivered, all 44 Phase-2 AC are verified and the onboarding gate is
  complete end to end: a newly accepted client signs in, e-signs the letter, completes the questionnaire,
  uploads documents, and the engagement automatically moves New → In Progress with the accountant notified.
  **The Report phase must run the phase-closeout check** (produce/refresh the Phase-2 walkthrough video per
  `DEMO-POLICY.md` § Part B and ship `docs/demos/phase-2/` in the docs-lane PR) since this slice completes the
  roadmap phase.
- **No third-party integration in this slice.** No e-sign, scanner, storage, or email — pure server-side
  evaluation + a status transition + an in-portal notification over the existing SQL Server schema. No ADR
  blocks dispatch (all five cited ADRs — 003/005/006/012/019 — are Accepted).
- **REQ-AUTH-003 boundary unchanged.** This slice adds no new client-owned-row family; the AUTH-003 *feature*
  AC remain Phase-3-owned (the isolation mechanism + per-policy tests landed in EPIC-005/007).
- **Carried infra follow-ups (from prior retros / STATE — may resurface at Smoke, not slice-blocking):** the
  clock-domain `Completed-at` inversion (RETRO-007 `ungated-fix` — relevant if a completion timestamp is added),
  the per-connection SESSION_CONTEXT hardening (EPIC-005 SEC-3), the `sqlserver` healthcheck SA-password
  mismatch, and the inventory.md Track-B drift. This slice does **not** change docker-compose/env wiring, so the
  DevOps inventory/runbook update is **not** expected to be triggered.

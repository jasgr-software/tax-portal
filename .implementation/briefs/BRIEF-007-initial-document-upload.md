---
id: BRIEF-007
title: Initial document upload — checklist, secure malware-scanned file-storage path
status: ready
acceptance_criteria:
  # REQ-ONBD-004 — initial document upload follows a checklist
  - id: AC-ONBD-004-01
    text: "During the upload step the client is shown the engagement's document checklist the accountant defined."
  - id: AC-ONBD-004-02
    text: "The client can see which checklist items are still outstanding versus which have been provided."
  - id: AC-ONBD-004-03
    text: "The client can upload documents to fulfill checklist items."
  - id: AC-ONBD-004-04
    text: "The document-upload step is satisfied when the engagement's required checklist items have been provided."
  # REQ-FILE-007 — accountant creates labeled document requests
  - id: AC-FILE-007-01
    text: "The accountant can create a document request within an engagement, with a free-text label naming the document requested."
  - id: AC-FILE-007-02
    text: "A client participant of the engagement can see the engagement's document requests and the label of each."
  - id: AC-FILE-007-03
    text: "The client can fulfill a document request by uploading a file in response to it."
  # REQ-FILE-008 — per-engagement document checklist shows outstanding items
  - id: AC-FILE-008-01
    text: "Each engagement has a document checklist reflecting its document requests."
  - id: AC-FILE-008-02
    text: "A client participant can view the engagement's checklist and distinguish outstanding items from fulfilled ones."
  - id: AC-FILE-008-03
    text: "When a document request is fulfilled, its checklist item is no longer shown as outstanding."
  # REQ-FILE-001 — file exchange within an engagement (client-upload + isolation subset; remainder Phase 3)
  - id: AC-FILE-001-02
    text: "A client participant of an engagement can upload a file to that engagement."
  - id: AC-FILE-001-05
    text: "A file uploaded to an engagement is part of that engagement's document set and is not exposed to other engagements."
  # REQ-FILE-002 — no file type restrictions
  - id: AC-FILE-002-01
    text: "A file may be uploaded regardless of its file type or extension; no file type is rejected solely because of its format."
  # REQ-FILE-003 — files encrypted at rest and never publicly accessible
  - id: AC-FILE-003-01
    text: "Stored files are encrypted at rest."
  - id: AC-FILE-003-02
    text: "A file cannot be retrieved without an authorization check confirming the requester is permitted to access that engagement's documents."
  - id: AC-FILE-003-03
    text: "No file is reachable through an anonymous or public path; access is never granted to an unauthenticated, unauthorized requester."
  - id: AC-FILE-003-04
    text: "Any access grant to a file is time-limited and ceases to work after it expires."
  # REQ-NFR-009 — all uploaded files are scanned for malware
  - id: AC-NFR-009-01
    text: "Every file uploaded through the document-upload path is scanned for malware before it is made available to view or download."
  - id: AC-NFR-009-02
    text: "A file found to be malicious is withheld from recipients and the uploader is informed that the file was rejected."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "Engagement-scoped file isolation (ADR-005, HARD tier-3 — the THIRD client-owned-row family / third client-isolation policy): a per-policy integration test proving a file uploaded to engagement A is NOT readable or reachable from engagement B (AC-FILE-001-05), retrieval requires an authorization check (AC-FILE-003-02), an anonymous / null-SESSION_CONTEXT caller reads ZERO, and ACCOUNTANT/admin can read. New `sec` predicate + security policy (next free `db/policies/0007-*`) on the document/file rows — joining row ownership to the owning `Engagement` via `SESSION_CONTEXT`, after EPIC-005's `0005` (Engagement) and EPIC-006's `0006` (questionnaire answers)."
    - "Scan-before-available (ADR-021 / REQ-NFR-009, mock-first `FileScanner` seam): every uploaded file is scanned BEFORE it is made available to view/download (AC-NFR-009-01); a file the scanner flags malicious is withheld (never promoted to available) and the uploader is informed it was rejected (AC-NFR-009-02). The scan sits in the ADR-009 `pending`→`active` state machine — a `pending`/quarantined file is never downloadable; an indeterminate / scanner-unavailable result stays `pending` (fail-closed), never silently `active`. Ships against a deterministic mock scanner (clean/malicious) per the standing mock-third-party directive; real scanner is a deferred drop-in."
    - "Signed-URL-only file access (ADR-009): all upload and download access is via server-issued, time-limited signed URLs against the storage adapter, gated by an authorize-then-sign check on the request pool (RLS-scoped `db`). No file is reachable by an anonymous/public path (AC-FILE-003-03); a grant is time-limited and stops working after it expires (AC-FILE-003-04); retrieval requires the authorization check (AC-FILE-003-02). The client never holds adapter credentials."
    - "Encryption at rest via the storage adapter (ADR-020 / ADR-008): stored files are encrypted at rest (AC-FILE-003-01) — delivered by the `FileStorage` adapter contract (Azurite simulates SSE locally; PMK v1 per ADR-020 OD-006), NOT implemented in app code. No cloud KMS/secrets SDK in app code (ADR-013/020)."
    - "Any file type accepted (REQ-FILE-002): no allow-list/block-list of extensions or formats rejects an upload solely for its format (AC-FILE-002-01). (MIME/magic-byte validation that the bytes match the declared type — ADR-021 — is a safety check, not a format allow-list, and must not reject a file merely for being an uncommon type.)"
    - "Upload audited + rate-limited (ADR-019 / ADR-022): an upload is a recorded audit event (reuse the EPIC-003/004 audit seam); the upload path is rate-limited against abuse (reuse the EPIC-004 `RateLimiter` seam)."
    - "SESSION_CONTEXT on the client upload + authz path (ADR-003): the client's upload and the authorization check run under the CLIENT principal via the `packages/db` request-scoped wrapper (`$extends` SET hook), honoring ADR-003 Amendment 1 (no `@read_only` on the SET); the pending-row insert runs under the admin pool per ADR-009 step 2d. The accountant's document-request authoring runs under the ACCOUNTANT principal."
    - "Behind the EPIC-005 letter gate: the document-upload step is only reachable once the engagement letter is e-signed (the EPIC-005 hard gate). This slice assumes the gate is passed and does not weaken it — the server-side step-accessibility check still refuses the upload step for an unsigned engagement."
    - "Cross-surface (CLAUDE.md § Platform-frontend scope): document-request authoring lives in `apps/admin`; the client checklist + upload lives in `apps/portal`. Validate BOTH surfaces."
    - "Container smoke (docker-compose stack incl. Azurite) before Validate."
acceptance_scenarios: .planning/EPIC-007-initial-document-upload-checklist.md#acceptance-scenarios
demo:
  applicable: yes
  apps: [portal, admin]
  personas: [jane-accountant, sarah-returning-client]
  flows: [flow-onboarding, flow-file-exchange]
source:
  - planning: .planning/EPIC-007-initial-document-upload-checklist.md
  - requirements: .requirements/REQ-ONBD-004.md
  - requirements: .requirements/REQ-FILE-007.md
  - requirements: .requirements/REQ-FILE-008.md
  - requirements: .requirements/REQ-FILE-001.md
  - requirements: .requirements/REQ-FILE-002.md
  - requirements: .requirements/REQ-FILE-003.md
  - requirements: .requirements/REQ-NFR-009.md
  - architecture: .architecture/decisions/ADR-003-identity-propagation-session-context.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-006-monorepo-layout.md
  - architecture: .architecture/decisions/ADR-008-object-storage-abstraction.md
  - architecture: .architecture/decisions/ADR-009-signed-url-file-access.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
  - architecture: .architecture/decisions/ADR-019-audit-trail.md
  - architecture: .architecture/decisions/ADR-020-encryption-key-management.md
  - architecture: .architecture/decisions/ADR-021-file-upload-safety.md
  - architecture: .architecture/decisions/ADR-022-anti-abuse-rate-limiting.md
---

# BRIEF-007 — Initial document upload — checklist, secure malware-scanned file-storage path

> Self-contained build brief for the EPIC-007 slice. `source:` refs are read-only context; the brief stands
> alone. Composed by the Conductor from `.planning/EPIC-007` + its cited `REQ-*`/`ADR-*` sources and the live
> repo state. **19 in-scope AC.** Delivers **step 3 of the onboarding sequence** (initial document upload)
> and stands up the portal's **first secure file-storage path**, on top of the EPIC-005 onboarding spine +
> letter gate.

## Scope

Deliver **step 3 of onboarding** — initial document upload against a checklist — end to end, on both
surfaces, and stand up the **first file-storage path** with the security/safety properties every later upload
inherits.

In the **Tax Portal (`apps/admin`)** the **accountant** authors labeled **document requests** for an
engagement ("Please upload your W-2", "Send last year's return") — each carries a human-readable free-text
label. The set of an engagement's document requests composes its **document checklist**.

In the **Client Portal (`apps/portal`)** the **client** — having passed the engagement-letter gate
(EPIC-005) — reaches the document-upload step of their onboarding sequence and sees the engagement's
checklist with **outstanding vs. provided** items. They **upload** documents (any file type) to fulfill the
requests; a fulfilled item leaves the outstanding set; and the step is **satisfied** when the engagement's
required checklist items have been provided.

Because this is the first slice that stores client files, it carries the **cross-cutting file properties**
every later upload inherits, from the very first stored byte:

- **Encrypted at rest** — delivered by the storage adapter (ADR-020/008), not app code.
- **Reachable only through an authorized, time-limited path** — server-issued signed URLs (ADR-009); never a
  public link; the grant expires.
- **Malware-scanned before anyone can open it** — scan-before-available in the `pending`→`active` pipeline
  (ADR-021); a malicious file is withheld and the uploader informed; ships against a **mock scanner** seam.
- **Scoped to its engagement** — a new ADR-005 security policy; a file in one engagement is never reachable
  from another.

Concretely the slice delivers:

1. **The first `FileStorage` port + Azurite adapter (ADR-008)** — net-new `packages/storage` with the
   `FileStorage` interface (`put`, `getSignedUploadUrl`, `getSignedDownloadUrl`, `stat`, …; ADR-008 §Interface
   is the contract). The **Azurite** blob emulator (already in `docker-compose` at `:10000`) is the local
   adapter, plugged in at startup; the production adapter is a deferred Phase-5 slot. The app imports **only**
   the interface type — no `@azure/storage-blob` in route handlers. Encryption at rest is the adapter's
   contract (AC-FILE-003-01).

2. **The first `FileScanner` port, mock-first (ADR-021 / REQ-NFR-009)** — a port with a deterministic **mock**
   binding (returns clean/malicious) so AC-NFR-009-01/-02 are delivered against the seam (per the standing
   mock-third-party directive; same pattern as EPIC-005's mock e-sign and EPIC-004's mock auth). The real
   scanner is a deferred drop-in. The scan sits **inside** the ADR-009 `pending`→`active` state machine.

3. **The accountant document-request authoring UI** in `apps/admin` (AC-FILE-007-01) — create a labeled
   document request within an engagement. Mirror the delivered EPIC-005/006 admin authoring patterns
   (`apps/admin/src/app/settings/letter-template/`, `…/questionnaire-templates/`); accountant-guarded; must
   not be reachable from `apps/portal`.

4. **The client document-upload step** in `apps/portal` (AC-ONBD-004-01/-02/-03, AC-FILE-007-02/-03,
   AC-FILE-008-02/-03, AC-FILE-001-02, AC-FILE-002-01) — within the existing onboarding sequence
   (`apps/portal/src/app/onboarding/`), the client at step 3 sees the engagement's checklist (outstanding vs.
   provided), uploads files (any type) to fulfill requests, and a fulfilled request drops out of the
   outstanding set. The step remains **gated behind the EPIC-005 signed-letter hard gate**.

5. **The secure upload + download pipeline (ADR-009 + ADR-021)** — two-phase upload (authorize on the request
   pool → insert a `pending` `Document` on the admin pool → mint a TTL signed upload URL → client PUTs to
   storage → scan + MIME/size validation → promote to `active` or terminal `infected`); download is
   authorize-then-sign for `active` docs only, time-limited, no public path (AC-FILE-003-01/-02/-03/-04,
   AC-NFR-009-01/-02).

6. **The document/file rows as a new client-isolated, engagement-scoped row family (ADR-005)** — a new `sec`
   predicate + security policy (`db/policies/0007-*`) ensures a file is reachable only within its owning
   engagement and never from another (AC-FILE-001-05, AC-FILE-003-02). This is the **third** client-isolation
   policy after EPIC-005's `0005` (Engagement) and EPIC-006's `0006` (questionnaire answers).

7. **Extending the EPIC-005 onboarding read model** (`packages/db/src/onboarding.ts`) so the
   **document-upload step's satisfaction** is evaluated server-side from "have the engagement's required
   checklist items been provided" (AC-ONBD-004-04) — one more input to the overall sequence EPIC-008 will
   complete. An upload is also a recorded **audit** event (ADR-019), and the upload path is **rate-limited**
   (ADR-022).

## Out of scope

- **REQ-FILE-001 remainder** — **AC-FILE-001-01** (accountant *upload*), **AC-FILE-001-03/-04** (both-party
  *download*) → **Phase 3** (the file-exchange epic). Onboarding's step 3 is the client *providing* documents;
  general exchange and download UX are the later slice. (This slice mints download URLs only as needed to
  *prove* the access-control AC — FILE-003-02/-03/-04 — not as a client/accountant download feature surface.)
- **Folders, versioning, retention / legal-hold, soft-delete, overdue flagging, download UX** —
  REQ-FILE-004/005/006/009/010/011/012/013/014/015 → **Phase 3**. (The ADR-009 storage key reserves a
  `v{version}` segment and the `documentId` UUID, but this slice ships **v1 uploads only** — no replace/version
  history, no folder segment.)
- **Message-attachment ingress** of REQ-NFR-009 (AC-NFR-009 also governs message attachments) → realized again
  on the **Phase 4** messaging slice; this epic satisfies the **document-upload ingress only**.
- **The real malware-scanning service** (live scanner wiring) → **deferred**; this slice ships against the
  **mock** scanner seam (standing mock-third-party directive). Real-scanner enablement re-validates NFR-009
  against the live service.
- **The real production storage provider** → **deferred** (ADR-008 Phase-5 slot). This slice ships the
  `FileStorage` port + the **Azurite** local adapter only.
- **Onboarding completion / transition / notification** (REQ-ONBD-005/006/007) → **EPIC-008**: satisfying the
  document-upload step is one **input** to onboarding completion, but the all-three-steps gate, the automatic
  New → In Progress transition, and the completion notification are evaluated **there**, not here.
- **The full engagement-lifecycle pipeline** (REQ-LIFE-001/002/003) — **Phase 3**. This slice neither
  transitions engagement status nor adds client-facing lifecycle labels.
- **REQ-AUTH-003 client-data RLS *feature* AC (AC-AUTH-003-01..03)** → **Phase-3-owned**. As with EPIC-005/006,
  the isolation *mechanism* (the new `0007` document/file `sec` predicate + policy) and its **per-policy
  cross-engagement isolation test** are built and run **here**; the AUTH-003 feature AC are signed off in
  Phase 3.

## Acceptance criteria

Each AC must be covered by **automated test(s) tagged with its AC id** (the test title/annotation contains the
id), at the prescribed tier(s). An AC is implemented only when its tagged test(s) pass in CI. The slice is
deliverable only when all 19 in-scope AC are independently validated.

**REQ-ONBD-004 — initial document upload follows a checklist**
- **AC-ONBD-004-01** — During the upload step the client is shown the engagement's document checklist the accountant defined.
- **AC-ONBD-004-02** — The client can see which checklist items are still outstanding versus which have been provided.
- **AC-ONBD-004-03** — The client can upload documents to fulfill checklist items.
- **AC-ONBD-004-04** — The document-upload step is satisfied when the engagement's required checklist items have been provided.

**REQ-FILE-007 — accountant creates labeled document requests**
- **AC-FILE-007-01** — The accountant can create a document request within an engagement, with a free-text label naming the document requested.
- **AC-FILE-007-02** — A client participant of the engagement can see the engagement's document requests and the label of each.
- **AC-FILE-007-03** — The client can fulfill a document request by uploading a file in response to it.

**REQ-FILE-008 — per-engagement document checklist shows outstanding items**
- **AC-FILE-008-01** — Each engagement has a document checklist reflecting its document requests.
- **AC-FILE-008-02** — A client participant can view the engagement's checklist and distinguish outstanding items from fulfilled ones.
- **AC-FILE-008-03** — When a document request is fulfilled, its checklist item is no longer shown as outstanding.

**REQ-FILE-001 — file exchange within an engagement** *(client-upload + isolation subset; remainder Phase 3)*
- **AC-FILE-001-02** — A client participant of an engagement can upload a file to that engagement.
- **AC-FILE-001-05** — A file uploaded to an engagement is part of that engagement's document set and is not exposed to other engagements.

**REQ-FILE-002 — no file type restrictions**
- **AC-FILE-002-01** — A file may be uploaded regardless of its file type or extension; no file type is rejected solely because of its format.

**REQ-FILE-003 — files encrypted at rest and never publicly accessible**
- **AC-FILE-003-01** — Stored files are encrypted at rest.
- **AC-FILE-003-02** — A file cannot be retrieved without an authorization check confirming the requester is permitted to access that engagement's documents.
- **AC-FILE-003-03** — No file is reachable through an anonymous or public path; access is never granted to an unauthenticated, unauthorized requester.
- **AC-FILE-003-04** — Any access grant to a file is time-limited and ceases to work after it expires.

**REQ-NFR-009 — all uploaded files are scanned for malware**
- **AC-NFR-009-01** — Every file uploaded through the document-upload path is scanned for malware before it is made available to view or download.
- **AC-NFR-009-02** — A file found to be malicious is withheld from recipients and the uploader is informed that the file was rejected.

## Methodology & quality requirements

- **Acceptance format: gherkin.** The 19 Given/When/Then scenarios authored in the epic
  (`.planning/EPIC-007-initial-document-upload-checklist.md` § Acceptance scenarios) are the behavior
  contract. The SDET binds them to executable Playwright/integration steps (or validates against them in prose
  until the Cucumber tooling lands — per CLAUDE.md § Executable gherkin tooling). Do **not** re-author
  scenarios; bind the epic's.
- **E2e required (`apps/portal` + `apps/admin`).** The accountant authoring a document request runs against
  the full docker-compose stack (incl. Azurite) in `apps/admin`; the client seeing the checklist, uploading
  any-type files, fulfilling requests, and the rejected-malicious surface run in `apps/portal`; the author →
  fulfill path crosses both surfaces.
- **Tier mapping (from the epic's sign-off contract — ADR-012):**
  - **e2e (tier 6):** AC-ONBD-004-01/-02/-03, AC-FILE-007-01/-02/-03, AC-FILE-008-02/-03, AC-FILE-002-01
    (any-type upload), AC-NFR-009-02 (rejection surfaced to the uploader).
  - **service integration / security (tier 3):** AC-ONBD-004-04 (step satisfaction), AC-FILE-008-01 (checklist
    reflects requests), AC-FILE-001-02 (client upload stored in the engagement's set), **AC-FILE-001-05 +
    AC-FILE-003-02 the per-policy cross-engagement isolation test (ADR-005)**, AC-FILE-003-01 (encrypted at
    rest), AC-FILE-003-03 (no anonymous/public path), AC-FILE-003-04 (grant expiry), AC-NFR-009-01 (scanned
    before available).
  - **unit/component (tier 2/5):** checklist outstanding/fulfilled rendering; the step satisfaction transition.
- **Submission gate** (per CLAUDE.md): `pnpm lint` + `pnpm type-check`; `pnpm --filter portal test` +
  `pnpm --filter admin test`; `pnpm --filter portal e2e:run` + `pnpm --filter admin e2e:run` (+ `pnpm
  e2e:cross-app` where the author → fulfill path crosses surfaces); tier-3 integration against the real
  container DB **+ Azurite**; container smoke before Validate.
- **UI demo (`demo.applicable: yes`).** A dedicated `@demo` Playwright walkthrough captures an AC-tagged
  screenshot gallery of jane-accountant creating a labeled document request (`apps/admin`) and a
  post-letter-gate client viewing the checklist, uploading to fulfill an item, and seeing a malicious upload
  rejected (`apps/portal`) into `docs/demos/EPIC-007/`. Non-gating; the e2e gate is the gate.

## Constraints

Non-negotiables (cite the originating upstream ref). Each is a hard adherence obligation for this slice:

- **ADR-008 — Object storage abstraction (the FIRST `FileStorage` port).** Files land in the engagement's
  document set via a `packages/storage` `FileStorage` port, **not** the app database — the DB holds only the
  file *metadata* row + storage key. The app imports only the interface type; the **Azurite** adapter is wired
  at startup (local/e2e); no `@azure/storage-blob` (or any provider SDK) in route handlers/server actions. The
  storage key follows the ADR-009 pattern (`engagements/{engagementId}/documents/{documentId}/v{version}/
  {originalFilename}`, all-UUID segments, filename URL-encoded and cosmetic).
- **ADR-009 — Signed-URL file access.** All upload/download access is through server-issued, **time-limited
  signed URLs** against the adapter, with the app-side authorization query (RLS-scoped `db`) as the gate
  **before** any URL is minted. Two-phase upload: authorize the engagement on the request pool (404 if RLS
  filters it out) → insert the `Document` row in **`pending`** on the **admin pool** (ADR-009 step 2d, because
  RLS BLOCK predicates on INSERT need the FK chain consistent and the row must exist before the upload
  completes) → mint `getSignedUploadUrl` (TTL) → client PUTs directly to storage. The client never holds
  adapter credentials. Download mints a short-lived URL only after the authorize-then-sign gate and only for
  `active` documents (AC-FILE-003-02/-03/-04).
- **ADR-021 — File-upload safety (scan-before-available; the FIRST `FileScanner` port).** A file is scanned
  (malware) and validated (MIME/magic-byte matches the declared type + size limit) **while `pending`/
  quarantined**, and promoted to **`active`/available only after it passes**. **Pass** → `active`; **malware
  detected** → terminal **`infected`**, withheld (never signable for download), uploader informed it was
  rejected (AC-NFR-009-02); **indeterminate / scanner-unavailable** → stays `pending` (**fail-closed**, never
  silently `active`). The authorize-then-sign download gate (ADR-009) only ever mints URLs for `active` docs —
  the scan gate and the authz gate are **layered, both load-bearing**. The AV engine is **mocked** behind the
  `FileScanner` port (deterministic clean/malicious) — real scanner deferred. The MIME/magic-byte check is a
  *safety* validation (bytes must match the declared type), **not** a file-type allow-list: it must not reject
  a file merely for being an uncommon/arbitrary type (AC-FILE-002-01 / REQ-FILE-002).
- **ADR-020 — Encryption posture / key management.** Stored files are **encrypted at rest** (AC-FILE-003-01) —
  delivered by the `FileStorage` adapter contract (Azurite simulates SSE locally; PMK v1, OD-006 resolved),
  **not** implemented in app code. No cloud KMS/secrets SDK in app code (ADR-013/020); any key access is
  behind a port / env-injected.
- **ADR-005 — RLS via security policies (the THIRD client-isolation policy).** A file/document row is
  **engagement-scoped**: a client can reach only their **own** engagement's documents and never another
  engagement's (AC-FILE-001-05, AC-FILE-003-02). Add a new `sec` predicate function + a FILTER/BLOCK security
  policy (next free `db/policies/0007-*`) joining document-row ownership to the client identity in
  `SESSION_CONTEXT` (`clerk_user_id` → `User`, via the owning `Engagement`). **HARD requirement (ADR-005 §6):**
  a tier-3 integration test per policy — a file in engagement A is unreadable/unreachable from engagement B;
  an anonymous / null-SESSION_CONTEXT caller reads **ZERO**; ACCOUNTANT/admin can read. Reuse
  `db/policies/0005-engagement-policy.sql` (the first client-isolation policy) as the ownership-join precedent.
  The **document request** (accountant-authored) write boundary is accountant-only (mirror the EPIC-002
  `sec.fn_service_write_access` ACCOUNTANT/admin write predicate); a client *reads* the requests for their own
  engagement and *fulfills* them by upload.
- **ADR-003 — SESSION_CONTEXT identity propagation.** The client's upload and the authorization check run
  under the **client** principal; the accountant's document-request authoring runs under the **accountant**
  principal — both through the `packages/db` request-scoped Prisma wrapper (`withRequestContext` / `$extends`
  SET hook). No direct Prisma access in route handlers/server actions outside that wrapper. Honor **ADR-003
  Amendment 1** (do not reintroduce `@read_only` on the SET). The `pending`-row INSERT runs under the admin
  pool per ADR-009 step 2d (authorization already happened on the request pool).
- **ADR-019 — Audit trail.** An upload is a **recorded audit event** — reuse the EPIC-003/004 audit seam
  (`recordAuthEvent` / `withAuditTransaction`); do not invent a parallel audit path.
- **ADR-022 — Anti-abuse rate limiting.** The upload path is **rate-limited** against abuse — reuse the
  EPIC-004 `RateLimiter` seam; do not hand-roll a second limiter.
- **ADR-006 — Monorepo, two apps.** Document-request authoring lives in **`apps/admin`**; the client checklist
  + upload lives in **`apps/portal`**. Authoring must not be reachable from `apps/portal`; the client upload
  surface must not be reachable from `apps/admin`.
- **ADR-012 — Testing pyramid.** Encryption/authz/no-public/time-limited/engagement-isolation and
  malware-withholding are **tier-3 integration (and security)** obligations proved against the **real** SQL
  Server container **+ Azurite** (not mocks — except the `FileScanner`, which is the mocked seam under test);
  the checklist → upload → fulfilled → step-satisfied path is **tier-6 e2e**.
- **Build on the EPIC-005 onboarding spine, do not fork it.** The onboarding sequence, the server-side
  step-accessibility gate, and the read model already exist (`apps/portal/src/app/onboarding/`,
  `packages/db/src/onboarding.ts`). This slice **extends** them with the document-upload step's satisfaction
  logic; it must **not** weaken the EPIC-005 letter hard gate (the upload step stays unreachable until the
  letter is e-signed) and must keep sequencing server-authoritative (a locked/ineligible step is **refused**,
  not merely hidden).
- **No branch protection / CI authority changes.** Required checks unchanged (`lint-and-typecheck`,
  `security-scan`; `test-portal`/`test-admin` advisory until per-PR AC tiers are wired). Merge on green
  required CI, no `--admin`/`enforce_admins` toggle (MERGE-POLICY Lane B). This slice touches **application
  code only** (no engine/role/workflow files), so it takes the reviewed lane.

## Data & Interface Contract

> Source-traced to the epic's behavior + the cited ADRs (per the brief author's altitude rule). The **IO
> expands this to the full field-level contract at Design** (exact column names/types, the document-request ↔
> document fulfillment representation, the storage key + state columns, validation, the read-model extension);
> a genuinely-upstream shape question escalates via `OPEN-QUESTIONS.md` — it is **not** invented here.
> Field-shape conventions trace to **ADR-002** (`UNIQUEIDENTIFIER` PK `NEWSEQUENTIALID()`, `DATETIMEOFFSET`
> timestamps — as on every existing entity, e.g. `Engagement`, `Service` in `prisma/schema.prisma`) and the
> ADR-009 storage-key/state conventions.

**Entities & relationships**
- **DocumentRequest (NEW — accountant-authored, per engagement).** A labeled request for a document within an
  engagement — carries a **free-text label** (AC-FILE-007-01). Belongs to an `Engagement`; an engagement has
  zero-or-more. The engagement's **checklist** is the set of its document requests (AC-FILE-008-01) — a
  *derived view*, not necessarily a separate entity. A request is **outstanding** until fulfilled and
  **fulfilled** once a document is uploaded in response (AC-FILE-007-03, AC-FILE-008-03). Accountant-owned
  write boundary (ADR-005); client reads the requests for their own engagement (AC-FILE-007-02).
- **Document / engagement file (NEW — the stored-file metadata row; the third client-owned-row family).** The
  metadata for a stored file: its storage key (ADR-009 pattern), `originalFilename`, `contentType`, size, its
  **upload-safety state** (`pending`/`active`/`infected`), the owning `Engagement`, and the `DocumentRequest`
  it fulfills (when uploaded in response to one). The **bytes** live in storage via the `FileStorage` adapter
  (ADR-008), **not** in the DB. **Client-owned and engagement-isolated** under the new ADR-005 `0007` policy.
  Whether "fulfillment" is a FK on the Document to the DocumentRequest, or a join, is an IO Design call; what
  is fixed is that the row is owned by the engagement's client and resolves to `SESSION_CONTEXT('clerk_user_id')`
  via the owning `Engagement` for the isolation predicate.
- **Engagement (EXISTING — EPIC-005).** The onboarding-state columns live on `Engagement`. The
  document-upload step's satisfaction is one more piece of onboarding state (e.g. a derived
  "required-items-provided" evaluation, or a marker column — exact representation an IO Design call), evaluated
  by the read model (AC-ONBD-004-04). Not otherwise modified beyond gaining the document-request / document
  relationships.

**Status enums & state transitions**
- **Upload-safety lifecycle (ADR-009 + ADR-021):** `pending` → `active` (scan **clean** + MIME/size
  validation pass) **|** `infected` (scan **malicious** — terminal, withheld). An **indeterminate /
  scanner-unavailable** result **stays `pending`** (fail-closed) and is retried — it must never become
  `active` without a pass. Only `active` documents are ever signable for download. A `pending`/`infected`
  document is never downloadable and never appears as available.
- **Checklist item state:** `outstanding → fulfilled`. A request is outstanding until a document is uploaded
  in response; on fulfillment it leaves the outstanding set (AC-FILE-008-03, AC-ONBD-004-02).
- **Document-upload step satisfaction:** `not-satisfied → satisfied` when the engagement's **required**
  checklist items have been provided (AC-ONBD-004-04). Evaluated **server-side** in the onboarding read model.
  (Which requests are "required" vs. optional — and whether all requests are required in v1 — is an IO Design
  call traceable to "required checklist items"; do not invent an optionality UI not in the AC.)
- **Step accessibility (unchanged from EPIC-005):** the document-upload step is reachable only once the
  engagement letter is **signed** (the EPIC-005 hard gate). This slice adds no new lock that precedes it and
  removes none.

**Interface contracts**
- **`FileStorage` port (NEW — `packages/storage`, ADR-008).** `put` / `getSignedUploadUrl` /
  `getSignedDownloadUrl` / `stat` / `delete` / `list` against an opaque key; adapters plug in at startup;
  Azurite is the local adapter. Encryption at rest is the adapter's contract (AC-FILE-003-01). The app depends
  only on the interface type.
- **`FileScanner` port (NEW — mock-first, ADR-021).** `scan(object) → clean | malicious | indeterminate` (the
  exact signature an IO Design call). The mock binding returns a deterministic verdict (e.g. by a sentinel
  filename/content) so AC-NFR-009-01/-02 are provable; the real scanner is a deferred drop-in selected
  fail-closed (mirror the EPIC-005 `packages/esign` `select.ts` `ALLOW_MOCK_*` pattern).
- **Upload contract (two-phase, ADR-009 + ADR-021).** A client server action / route handler for **their own**
  engagement (owner-resolved server-side, request-pool authorized; 404 if RLS filters the engagement):
  authorize → insert `pending` Document (admin pool) → return a TTL signed upload URL → client PUTs to storage
  → on `complete` (or the reconciliation path) scan + validate → promote to `active` or `infected`; on
  `infected`, withhold and inform the uploader (AC-NFR-009-02). Fail-closed: no upload accepted for a
  non-owned or ineligible (letter-unsigned) engagement; rate-limited (ADR-022); audited (ADR-019).
- **Download / access contract (ADR-009).** Retrieval is authorize-then-sign: the app-side authorization query
  (RLS-scoped `db`) runs **first**; only on success, and only for an `active` document, is a **short-lived**
  signed URL minted (AC-FILE-003-02/-03/-04). No anonymous/public path returns a file (AC-FILE-003-03); an
  expired grant no longer retrieves it (AC-FILE-003-04).
- **Admin authoring contract.** Accountant server actions create a labeled document request within an
  engagement (AC-FILE-007-01), run under the accountant principal, accountant-write-guarded.
- **Reused seams (do not reinvent):** `packages/db` `withRequestContext` + the `$extends` SET hook (ADR-003);
  the `sec` predicate-function + FILTER/BLOCK policy pattern (`db/policies/0005-engagement-policy.sql` for the
  client-ownership join; the EPIC-002 service-write predicate for the accountant-only request write); the
  EPIC-005 onboarding read model (`packages/db/src/onboarding.ts`) and portal onboarding surface
  (`apps/portal/src/app/onboarding/`); the EPIC-005 request-pool/BLOCK-governed client write
  (`recordLetterSignatureAsClient`) for the fail-closed client upload action; the EPIC-003/004 audit seam
  (`recordAuthEvent` / `withAuditTransaction`, ADR-019); the EPIC-004 `RateLimiter` seam (ADR-022); the
  EPIC-005/006 admin authoring patterns (`apps/admin/src/app/settings/letter-template/`,
  `…/questionnaire-templates/`) for the document-request authoring UI; `packages/auth` for the
  client/accountant identity + role gate.

**Deferred to IO Design (field-level minutiae, not carried here):** exact column names/types; the
DocumentRequest ↔ Document fulfillment representation (FK vs. join); the storage-key + state columns and the
`complete`/reconciliation handler shape; the `FileScanner` signature + mock-verdict trigger; the
required-vs-optional checklist-item semantics and the step-satisfaction evaluation; the signed-URL TTL values
and size limit; the MIME/magic-byte validation list.

## References

- Planning: `.planning/EPIC-007-initial-document-upload-checklist.md` (slice, 19 AC, the 19 gherkin scenarios,
  tier map, the first-upload-slice scope note, the out-of-scope boundaries).
- Requirements: REQ-ONBD-004, REQ-FILE-007, REQ-FILE-008, REQ-FILE-001 (partial — -02/-05), REQ-FILE-002,
  REQ-FILE-003, REQ-NFR-009; REQ-AUTH-003 (isolation-mechanism adherence; feature AC Phase-3-owned).
- Architecture: ADR-003 (+ Amendment 1), ADR-005, ADR-006, ADR-008, ADR-009, ADR-012, ADR-019, ADR-020,
  ADR-021, ADR-022.
- Personas: `.planning/personas/jane-accountant.md` (document requests),
  `.planning/personas/sarah-returning-client.md`, `.planning/personas/martha-and-james-married-couple.md`
  (upload).
- Flows: `.planning/flows/flow-onboarding.md` (step 3), `.planning/flows/flow-file-exchange.md` (first upload
  path).
- Prior art in-repo: the EPIC-005 onboarding spine — `packages/db/src/onboarding.ts` (read model + server-side
  gate), `apps/portal/src/app/onboarding/` (sequence UI); the EPIC-005/006 admin authoring + `packages/esign`
  mock-select pattern (`packages/esign/src/select.ts`); `db/policies/0005-engagement-policy.sql` +
  `0006-questionnaire-policy.sql` (the first two client-isolation policies — the ownership-join seam to
  follow); the EPIC-002 `sec.fn_service_write_access` accountant-only write predicate; the EPIC-003/004 audit
  + `RateLimiter` seams; the Azurite service in `docker-compose.yml` (`:10000`); the `Engagement`,
  `EngagementRequest`, `EngagementRequestService`, `Service` models (`prisma/schema.prisma`).

## Notes

- **Largest Phase-2 slice (19 AC) — two net-new ports + a new RLS policy + the first stored-bytes path.** The
  substantive work is the `packages/storage` `FileStorage` port + Azurite adapter (ADR-008), the mock-first
  `FileScanner` port + the scan-before-available pipeline (ADR-021), the document/file rows with the **third**
  client-isolation policy `0007` (and its mandatory cross-engagement tier-3 test), the two-phase
  authorize-then-sign upload/download (ADR-009), and wiring the upload step's satisfaction into the EPIC-005
  read model. The accountant document-request UI and the portal upload step sit on top — both have direct
  EPIC-005/006 precedents to mirror.
- **Builds directly on EPIC-005 (delivered).** EPIC-005 supplies the onboarding sequence + the letter gate
  this step lives behind (PR #48 `f879da2`). EPIC-006 (questionnaire, PR #50 `e55f8c5`) is a parallel sibling,
  not a dependency — but its `0006` policy is the freshest precedent for the new `0007` client-isolation
  policy. EPIC-008 (onboarding completion) is the downstream capstone that consumes this step's satisfaction.
- **Mock-third-party, two seams.** Both the storage provider (→ Azurite emulator) and the malware scanner (→
  mock `FileScanner`) ship behind seams kept mocked as long as possible (standing directive); the matching AC
  are delivered/`verified` against the seam, and real Azure Blob / real-scanner wiring (and any new enablement
  ADRs) are deferred drop-in slices — same pattern as EPIC-005's mock e-sign and EPIC-004's mock auth. **No
  third-party ADR blocks dispatch.**
- **First stored-bytes path → smoke must include Azurite.** This is the first slice whose container smoke
  exercises the Azurite blob emulator end-to-end (upload → scan → promote → authorize-then-sign download).
  Expect the smoke/e2e to surface any Azurite wiring gaps the way EPIC-002 first surfaced the request-scoped
  Prisma path in a container.
- **REQ-AUTH-003 boundary flag (for the next planning run).** As with EPIC-005/006, the client-isolation
  *mechanism* (the `0007` document/file policy) lands here; the AUTH-003 *feature* AC remain Phase-3-owned.
- **Carried infra follow-ups (from prior retros / STATE — may resurface at Smoke, not slice-blocking):**
  clean-volume DB bootstrap (`sa`-once login creation, Prisma port-in-authority, `!`-free logins,
  `migrate deploy` P3019), the `sqlserver` healthcheck SA-password mismatch, the `sp_set_session_context` CI
  grep-guard, the per-connection SESSION_CONTEXT hardening (EPIC-005 SEC-3 follow-up), and the inventory.md
  Track-B drift. **DevOps note:** standing up `packages/storage` + the Azurite adapter touches
  docker-compose/env wiring — per CLAUDE.md § Domain-specific notes, update
  `.implementation/operations/inventory.md` + `runbook.md` if the storage service topology/secrets/env change.

---
id: BRIEF-013
title: Secure file exchange — accountant upload, both-party download, folders, tax-year organization, versioning
status: ready
acceptance_criteria:
  - id: AC-FILE-001-01
    text: "The accountant can upload a file to an engagement."
  - id: AC-FILE-001-03
    text: "The accountant can download any file belonging to an engagement."
  - id: AC-FILE-001-04
    text: "A client participant of an engagement can download files belonging to that engagement."
  - id: AC-FILE-009-01
    text: "An existing file can be replaced with a new version."
  - id: AC-FILE-009-02
    text: "After replacement, the newest version is presented as the current version of the file."
  - id: AC-FILE-009-03
    text: "Every prior version of a file is retained and remains accessible after the file is replaced."
  - id: AC-FILE-010-01
    text: "Files within an engagement can be organized into folders."
  - id: AC-FILE-010-02
    text: "The accountant can create, rename, and arrange the folders within an engagement."
  - id: AC-FILE-010-03
    text: "A file can be placed within a folder of its engagement."
  - id: AC-FILE-010-04
    text: "Management of the folder structure is an accountant capability; clients do not manage the folder structure."
  - id: AC-FILE-011-01
    text: "At the top level, files are grouped by the engagement they belong to."
  - id: AC-FILE-011-02
    text: "At the top level, files are grouped by tax year."
  - id: AC-FILE-011-03
    text: "A user can locate an engagement's files by navigating from its engagement and tax year down into the engagement's folder structure."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "HARD tier-3 both-party download authz + isolation (ADR-005 / CS-SQL-001): the accountant downloads any engagement's files; a client participant downloads only their own engagement's files; a file never crosses engagements (the EPIC-007 pol_Document/0007 isolation still holds) — proven both ways (AC-FILE-001-03/-04)."
    - "HARD tier-3 version retention (ADR-009): replacing a file creates a NEW row + NEW storage key (never an overwrite); after replacement every prior version is retained and remains accessible (AC-FILE-009-03)."
    - "Folder-management accountant-only gate: a client participant cannot create, rename, arrange, or otherwise manage the folder structure; the capability is not available to them (AC-FILE-010-04)."
    - "Both-party download round-trip e2e across both surfaces: the accountant uploads a file in apps/admin and both the accountant (apps/admin) and a client participant (apps/portal) download it over the authorized, time-limited, never-public path (AC-FILE-001-01/-03/-04)."
acceptance_scenarios: .planning/EPIC-013-secure-file-exchange.md   # Given/When/Then reproduced verbatim in § Acceptance scenarios below
demo:
  applicable: yes
  apps: [admin, portal]
  personas: [jane-accountant, sarah-returning-client, martha-and-james-married-couple]
  flows: [flow-file-exchange]
source:
  - planning: .planning/EPIC-013-secure-file-exchange.md
  - requirements: .requirements/REQ-FILE-001.md
  - requirements: .requirements/REQ-FILE-009.md
  - requirements: .requirements/REQ-FILE-010.md
  - requirements: .requirements/REQ-FILE-011.md
  - architecture: .architecture/decisions/ADR-008-object-storage-abstraction.md
  - architecture: .architecture/decisions/ADR-009-signed-url-file-access.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-003-session-context.md
  - architecture: .architecture/decisions/ADR-006-monorepo-two-apps.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
  - architecture: .architecture/decisions/ADR-019-audit-trail.md
  - architecture: .architecture/decisions/ADR-020-encryption-key-management.md
  - architecture: .architecture/decisions/ADR-022-anti-abuse-rate-limiting.md
code_standards:
  - "CS-TS-001 (required) — request-scoped DB access only through the packages/db wrapper (ADR-003 SESSION_CONTEXT)"
  - "CS-TS-002 (required) — never import the raw requestDb/adminDb pools outside packages/db"
  - "CS-TS-003 (recommended) — apply shared patterns to both the portal and admin surfaces (the download path is exercised from both)"
  - "CS-TS-004 (experimental) — every server action resolves identity from the request cookie and guards role before any DB write (upload + folder management are accountant-only server actions)"
  - "CS-SQL-001 (required) — an RLS policy AND an isolation test per newly scoped table (folders + version rows ride the engagement-scoped document set)"
  - "CS-SQL-002 (required) — raw-SQL track only for what Prisma cannot express (security policies)"
  - "CS-SQL-003 (required) — RLS predicate shape conventions"
  - "CS-GEN-001 (recommended) — no secrets or PII in logs (signed URLs, file names, client identities)"
  - "CS-GEN-002 (recommended) — additive, non-destructive edits"
  - "CS-GEN-003 (recommended) — cite the governing authority (ADR / REQ) in code & test comments"
---

# BRIEF-013 — Secure file exchange — accountant upload, both-party download, folders, tax-year organization, versioning

> **Self-contained build brief for the EPIC-013 slice (Phase 3).** Completes the two-way document exchange on
> top of the first secure file-storage path EPIC-007 stood up: accountant upload, both-party download,
> accountant-managed folders, top-level organization by engagement & tax year, and version history. `source:`
> refs are read-only context; the brief stands alone. Composed by the Conductor from `.planning/EPIC-013` +
> its cited `REQ-*`/ADRs.

## Scope

Complete the **two-way document exchange** on the secure file-storage path EPIC-007 established. Five capabilities:

1. **Accountant upload (apps/admin — Tax Portal).** The accountant uploads files (deliverables — a completed
   return, an organizer, a letter) into an engagement. Bytes flow through the storage adapter's engagement
   document set (ADR-008), encrypted at rest (ADR-020, inherited from EPIC-007), over the same authorized,
   time-limited, never-public signed-URL path EPIC-007 established (ADR-009). The upload path runs under the
   accountant principal (ADR-003) and is rate-limited (ADR-022).
2. **Both-party download (apps/admin + apps/portal).** Both the accountant and the engagement's **client
   participant(s)** can download the engagement's files over the authorized, time-limited signed-URL path
   (never public). The accountant downloads **any** engagement's files; a client participant downloads **only**
   files belonging to **their** engagement. Download is exercised from **both** surfaces.
3. **Accountant-managed folders (apps/admin).** The accountant organizes an engagement's files into a folder
   structure she **creates, renames, and arranges**; a file can be **placed within a folder** of its
   engagement. Folder-structure management is an **accountant-only** capability — clients do not manage it.
4. **Top-level organization by engagement & tax year.** At the top level, files are grouped by the
   **engagement** they belong to and by **tax year** (the `Engagement.taxYear` attribute EPIC-012 introduced),
   so a user navigates **from an engagement and its tax year down into** the accountant's folder structure to
   locate files.
5. **Version history.** Replacing an existing file keeps a **version history**: the newest version is presented
   as **current**, and **every prior version is retained and remains accessible**. A new version is a **new row
   + new storage key**, never an overwrite (ADR-009), so prior versions survive.

Document access/downloads are recorded **audit events** (ADR-019) as an adherence obligation.

## Out of scope

- **Client upload + engagement isolation + malware scan + encryption-at-rest + any-type** (REQ-FILE-001-02/-05,
  REQ-FILE-002, REQ-FILE-003, REQ-NFR-009) — **delivered in Phase 2 (EPIC-007)**; this slice **inherits and
  reuses** them (the `FileStorage` port + Azurite adapter, the `FileScanner` port, the `pol_Document`/`0007`
  isolation policy, the two-phase authorize-then-sign upload pipeline). It does not re-implement them.
- **File lifecycle governance** — accountant-only delete (REQ-FILE-004), soft-delete (REQ-FILE-006), 7-year
  retention (REQ-FILE-005) → **EPIC-014**; post-retention purge (REQ-FILE-013), legal hold (REQ-FILE-014),
  retention-vs-erasure precedence (REQ-FILE-015) → **EPIC-015**.
- **Overdue document-request flagging + reminder cadence** (REQ-FILE-012) → **Phase 4** (the reminder/
  notification engine).
- **The audit-trail feature AC** (REQ-NFR-010 document-access logging, the accountant-only audit *read*
  surface, audit retention) → a dedicated **audit-trail slice (Phase 4)**. This slice **emits** download/access
  audit events per ADR-019 as an adherence obligation but does **not** claim the NFR-010 feature AC.

## Acceptance criteria

Each AC is covered by automated test(s) **tagged with its AC id** at the prescribed tier (§ Methodology). An
AC is implemented only when its tagged test(s) **pass in CI**; the epic is delivered only when all 13 are
`verified` in `COVERAGE.md`.

### REQ-FILE-001 — Both parties exchange files within an engagement *(remainder; client-upload + isolation were EPIC-007)*
- **AC-FILE-001-01** — The accountant can upload a file to an engagement.
- **AC-FILE-001-03** — The accountant can download any file belonging to an engagement.
- **AC-FILE-001-04** — A client participant of an engagement can download files belonging to that engagement.

### REQ-FILE-009 — Files support version history
- **AC-FILE-009-01** — An existing file can be replaced with a new version.
- **AC-FILE-009-02** — After replacement, the newest version is presented as the current version of the file.
- **AC-FILE-009-03** — Every prior version of a file is retained and remains accessible after the file is replaced.

### REQ-FILE-010 — Accountant organizes engagement files into folders
- **AC-FILE-010-01** — Files within an engagement can be organized into folders.
- **AC-FILE-010-02** — The accountant can create, rename, and arrange the folders within an engagement.
- **AC-FILE-010-03** — A file can be placed within a folder of its engagement.
- **AC-FILE-010-04** — Management of the folder structure is an accountant capability; clients do not manage the folder structure.

### REQ-FILE-011 — Top-level organization by engagement and tax year
- **AC-FILE-011-01** — At the top level, files are grouped by the engagement they belong to.
- **AC-FILE-011-02** — At the top level, files are grouped by tax year.
- **AC-FILE-011-03** — A user can locate an engagement's files by navigating from its engagement and tax year down into the engagement's folder structure.

## Methodology & quality requirements

- **Acceptance format: gherkin.** Bind the Given/When/Then scenarios in § Acceptance scenarios to executable
  tests (the brief carries them verbatim from the epic). Each test's title/annotation contains its **AC id**
  (the AC-id test-tag contract — what makes the Validate write-back possible).
- **Tier mapping (ADR-012 testing pyramid):**
  - **Service integration / security (tier 3)** — AC-FILE-001-03/-04 (both-party download authz + isolation,
    the **hard** per-policy proof), AC-FILE-009-03 (prior versions retained + accessible), AC-FILE-010-04
    (folder management accountant-only), AC-FILE-011-01/-02 (top-level grouping by engagement / tax year).
  - **e2e (tier 6)** — AC-FILE-001-01 (accountant upload), AC-FILE-009-01/-02 (replace → current),
    AC-FILE-010-01/-02/-03 (folders: organize, create/rename/arrange, place a file), AC-FILE-011-03 (navigate
    engagement → tax year → folder), and the both-party download round-trips.
- **e2e required** (CLAUDE.md IO e2e defaults): this slice touches file upload/download via **signed URLs**,
  SQL Server security policies + `SESSION_CONTEXT` propagation (the both-party download authz), and a
  cross-module boundary (the engagement workspace → document set). E2E runs against the full docker-compose
  stack with both apps up; the download round-trip is exercised from **both** surfaces (cross-app per ADR-010).
- **Hard extra gates** — see front-matter `extra_gates`: the both-party download authz + isolation per-policy
  test proven both ways (CS-SQL-001), version retention (new row + new key, prior versions survive), the
  folder-management accountant-only negative, and the both-party download round-trip across both surfaces.
- **UI demo (`demo.applicable: yes`)** — a `@demo` Playwright walkthrough captures an AC-tagged screenshot
  gallery into `docs/demos/EPIC-013/` across **both** surfaces (accountant upload + folders + tax-year
  organization + version replace in admin; both-party download in admin and portal), walking the
  jane-accountant, sarah-returning-client, and martha-and-james personas. **Non-gating** (the e2e gate is the
  gate); see `.orchestration/DEMO-POLICY.md`.

## Constraints

Non-negotiables (cite the originating ADR in code/test comments per CS-GEN-003):

- **ADR-008 — Object storage abstraction.** Uploaded/downloaded bytes flow through the storage adapter's
  **engagement document set**, not the app DB. Reuse the EPIC-007 `FileStorage` port + Azurite adapter.
- **ADR-009 — Signed-URL file access + version history.** Download **and** accountant upload use short-lived
  **signed URLs** — no public path, time-limited (inherited from EPIC-007). A new version is a **new row + new
  storage key**, **never an overwrite**, so prior versions survive (AC-FILE-009-03). **Hard obligation.**
- **ADR-005 — RLS via security policies.** Both-party access is engagement-scoped: the accountant reads **all**
  (AUTH-002), a client participant reads **only** their engagement's documents (AUTH-003, building on EPIC-010/
  EPIC-012), and a file **never crosses engagements** (the EPIC-007 `pol_Document`/`0007` isolation still
  holds). Any **net-new scoped table** (folders; version rows if modeled as a distinct table) gets a policy
  **and** an isolation test (CS-SQL-001/-003). The both-party **download** authorization is a **hard tier-3
  obligation** — a missing/failing policy test is a rejection.
- **ADR-003 — SESSION_CONTEXT.** Every request-scoped query goes through the `packages/db` wrapper that sets
  `SESSION_CONTEXT` before the first real query (CS-TS-001/-002). Upload and the download authorization check
  run under the **caller's** propagated identity; folder management runs under the **accountant** principal.
- **ADR-006 — Monorepo, two apps.** Accountant upload + folder management → `apps/admin`; **download is
  exercised from both** `apps/admin` and `apps/portal`. Apply shared download/DB-wrapper patterns to both
  surfaces where they mirror (CS-TS-003).
- **ADR-020 — Encryption key management.** Accountant-uploaded files are encrypted at rest, like client
  uploads (inherited from EPIC-007).
- **ADR-019 — Audit trail.** Document access/downloads (and uploads, folder changes, version replacements) are
  recorded audit events — an adherence obligation; the NFR-010 feature AC are not claimed here.
- **ADR-022 — Anti-abuse rate limiting.** The accountant upload path is rate-limited.
- **ADR-012 — Testing pyramid.** Honor the tier mapping above; the both-party download authz + isolation and
  the version-retention proof are hard tier-3 gates.

## Code standards

- **CS-TS-001** (`required`) — request-scoped DB access only through the `packages/db` wrapper (ADR-003).
- **CS-TS-002** (`required`) — never import the raw `requestDb`/`adminDb` pools outside `packages/db`.
- **CS-TS-003** (`recommended`) — apply shared patterns to both surfaces (the download path is exercised from
  both portal and admin).
- **CS-TS-004** (`experimental`) — every server action resolves identity from the request cookie and guards
  role before any DB write (upload + folder management are accountant-only server actions; download authorizes
  the caller).
- **CS-SQL-001** (`required`) — an RLS policy **and** an isolation test per newly scoped table (folders; and
  version rows if modeled as a distinct scoped table).
- **CS-SQL-002** (`required`) — raw-SQL track only for what Prisma cannot express (the security policies).
- **CS-SQL-003** (`required`) — RLS predicate shape conventions.
- **CS-GEN-001** (`recommended`) — no secrets or PII in logs (signed URLs, file names, client identities).
- **CS-GEN-002** (`recommended`) — additive, non-destructive edits.
- **CS-GEN-003** (`recommended`) — cite the governing ADR/REQ in code & test comments.

## Data & Interface Contract

> Altitude-bounded: only the shapes that **trace** to the epic's behavior + cited ADRs. The IO expands these
> into the full field-level contract at Design; genuinely upstream shape questions are escalated via
> `OPEN-QUESTIONS.md`, never invented. Field-level minutiae (exact column types, regexes, error codes) are NOT
> fixed here.

- **Folder entity (net-new, engagement-scoped).** A folder belongs to one engagement; the accountant creates,
  renames, and arranges folders, and a file can be **placed within** a folder of its engagement. This is a
  **scoped table** ADR-005 RLS guards (a folder, like a document, never crosses engagements). Whether folders
  nest (a parent-folder reference for "arrange") is an IO Design decision bounded by AC-FILE-010-02's
  create/rename/arrange behavior. *(traces: REQ-FILE-010; ADR-005)*
- **Document gains a folder association.** A document may reside within a folder of its engagement (AC-FILE-010-03);
  the association is engagement-scoped and consistent with the existing `Document`/`pol_Document` family from
  EPIC-007. *(traces: REQ-FILE-010; EPIC-007)*
- **Version history (net-new shape over `Document`).** Replacing a file produces a **new version row + new
  storage key** (never an overwrite, ADR-009); the file presents the **newest version as current** while
  **every prior version is retained and remains accessible**. Whether versions are a distinct
  `DocumentVersion` table or a versioned-row chain on `Document` is an IO Design decision — but a prior version
  must remain retrievable after replacement, and a net-new scoped table inherits the engagement-isolation
  obligation (CS-SQL-001). *(traces: REQ-FILE-009; ADR-009)*
- **Top-level organization read model.** A read model groups files **by engagement** and **by tax year** (the
  `Engagement.taxYear` attribute introduced in EPIC-012), supporting navigation **from engagement + tax year
  down into** the folder structure (AC-FILE-011-01/-02/-03). No net-new write shape — it composes existing
  `Engagement.taxYear` + the engagement's documents/folders. *(traces: REQ-FILE-011; EPIC-012)*
- **Interface contracts.**
  - *Accountant upload (apps/admin):* input = the target engagement (+ optional folder placement) and the
    file; output = a stored document in that engagement's document set over the signed-URL path; runs under the
    accountant principal; rate-limited. *(traces: REQ-FILE-001-01; ADR-008/-009/-022)*
  - *Both-party download (apps/admin + apps/portal):* input = a document the caller is authorized to read;
    output = a short-lived **signed URL** (never public, time-limited); the accountant authorizes for any
    engagement, a client participant only for their own engagement (RLS). *(traces: REQ-FILE-001-03/-04;
    ADR-009/-005/-003)*
  - *Replace with a new version (apps/admin):* input = an existing file + the replacement bytes; output = a new
    current version with the prior version retained + accessible. *(traces: REQ-FILE-009; ADR-009)*
  - *Folder management (apps/admin):* create / rename / arrange folders; place a file in a folder; **accountant
    only** — the capability is not available to a client (AC-FILE-010-04). *(traces: REQ-FILE-010; ADR-003/-005)*
- **Field-shape obligations (ADR-002).** New entities/columns follow ADR-002 PK/timestamp/identity
  conventions. **Audit events** (ADR-019) are recorded for upload, download/access, folder changes, and version
  replacement.

## Acceptance scenarios

> Reproduced verbatim from `.planning/EPIC-013-secure-file-exchange.md` (the canonical behavior contract).
> Bind each to an executable test tagged with its AC id.

### AC-FILE-001-01 — Accountant uploads a file to an engagement
```gherkin
Given the accountant in an engagement
When she uploads a file to it
Then the file is stored as part of that engagement's document set
```

### AC-FILE-001-03 — Accountant downloads an engagement file
```gherkin
Given a file belonging to an engagement
When the accountant downloads it
Then she receives the file over the authorized, time-limited path
```

### AC-FILE-001-04 — Client participant downloads their engagement's file
```gherkin
Given a file belonging to an engagement the client participates in
When the client downloads it
Then they receive the file over the authorized, time-limited path
```

### AC-FILE-009-01 — A file can be replaced with a new version
```gherkin
Given an existing file in an engagement
When it is replaced with a new version
Then the file now has a newer version
```

### AC-FILE-009-02 — The newest version is current
```gherkin
Given a file that has been replaced
When the file is viewed
Then the newest version is presented as the current version
```

### AC-FILE-009-03 — Prior versions are retained and accessible
```gherkin
Given a file that has been replaced with a new version
When its history is examined
Then every prior version is retained and remains accessible
```

### AC-FILE-010-01 — Files can be organized into folders
```gherkin
Given an engagement with files
When folders are present
Then files within the engagement can be organized into those folders
```

### AC-FILE-010-02 — Accountant creates, renames, and arranges folders
```gherkin
Given the accountant in an engagement
When she creates, renames, or rearranges folders
Then the engagement's folder structure reflects those changes
```

### AC-FILE-010-03 — A file can be placed in a folder
```gherkin
Given a folder in an engagement
When a file is placed in it
Then the file resides within that folder of its engagement
```

### AC-FILE-010-04 — Folder management is accountant-only
```gherkin
Given a client participant of an engagement
When they attempt to manage the folder structure
Then the capability is not available to them; only the accountant manages folders
```

### AC-FILE-011-01 — Top-level grouping by engagement
```gherkin
Given files belonging to different engagements
When the top-level document organization is viewed
Then files are grouped by the engagement they belong to
```

### AC-FILE-011-02 — Top-level grouping by tax year
```gherkin
Given engagements spanning different tax years
When the top-level document organization is viewed
Then files are grouped by tax year
```

### AC-FILE-011-03 — Navigate from engagement + tax year into the folders
```gherkin
Given a user looking for an engagement's files
When they navigate from the engagement and its tax year
Then they can drill down into the engagement's folder structure to locate the files
```

## References

- Planning: `.planning/EPIC-013-secure-file-exchange.md` (the slice + behavior contract)
- Requirements: REQ-FILE-001 (remainder), REQ-FILE-009, REQ-FILE-010, REQ-FILE-011
- Architecture: ADR-003, ADR-005, ADR-006, ADR-008, ADR-009, ADR-012, ADR-019, ADR-020, ADR-022 (+ ADR-002
  shape conventions, ADR-010 cross-app)
- Personas: `.planning/personas/jane-accountant.md` (upload deliverables, folders, download client docs),
  `sarah-returning-client.md` (download deliverables, re-upload a version),
  `martha-and-james-married-couple.md` (both participants download the shared engagement's files)
- Flows: `.planning/flows/flow-file-exchange.md` (the upload/download/folders/versioning paths this epic realizes)
- Prior art: EPIC-007 (first secure file-storage path + client upload + `pol_Document`/`0007` isolation this
  slice inherits), EPIC-010 (the navigable engagement workspace + AC-AUTH-003 client isolation), EPIC-012 (the
  engagement **tax-year** attribute REQ-FILE-011 keys on)

## Notes

- **Inherit, do not re-implement EPIC-007.** The storage port + Azurite adapter, the signed-URL path, the
  encryption-at-rest, and the `pol_Document`/`0007` isolation policy already exist — this slice extends them
  with the accountant-upload direction, both-party download, folders, tax-year organization, and versioning.
- **The both-party download per-policy RLS test is the panel/SDET trap** (per ADR-005 history): assert
  isolation **both ways** — the accountant reaches any engagement's files; a client participant reaches **only**
  their own engagement's files and an unrelated client sees **ZERO**; a file never crosses engagements. A
  one-directional assertion is insufficient.
- **Versioning is never an overwrite** (ADR-009): a replacement is a new row + new storage key; the
  prior-version-retained proof (AC-FILE-009-03) must show the old version still retrievable after replacement.
- **Mirror reminder (CS-TS-003 / CLAUDE.md § Platform-frontend scope):** upload + folders live in admin by
  design; the **download** path mirrors across both surfaces — keep the shared signed-URL + DB-wrapper handling
  consistent, and exercise download from both portal and admin.
- **Known infra caveat (carried, non-gating):** BUG-008-001 (Azurite SAS-URL host-unreachable from the host
  Playwright browser) affected the document-upload scene in earlier e2e. If it recurs against the both-party
  download round-trip, carry the affected tier-6 AC by its tier-3 integration proof and flag it — do not weaken
  the gate.
- Suggested decomposition is the IO's to finalize at Design (e.g. whether folders nest and whether versions are
  a distinct table).
- **Build order:** EPIC-014 (file deletion / soft-delete / 7-year retention) builds directly on this slice's
  document + version + folder shapes.

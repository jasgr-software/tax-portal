---
id: EPIC-013
title: Secure file exchange — accountant upload, both-party download, folders, tax-year organization, versioning
phase: 3
status: delivered
slice: Both parties exchange documents within an engagement — the accountant uploads (e.g. deliverables) and both the accountant and the client download; files are organized into accountant-managed folders, grouped at the top level by engagement and tax year, and a replaced file keeps its full version history.
requirements:
  - REQ-FILE-001: [AC-FILE-001-01, AC-FILE-001-03, AC-FILE-001-04]
  - REQ-FILE-009: [AC-FILE-009-01, AC-FILE-009-02, AC-FILE-009-03]
  - REQ-FILE-010: [AC-FILE-010-01, AC-FILE-010-02, AC-FILE-010-03, AC-FILE-010-04]
  - REQ-FILE-011: [AC-FILE-011-01, AC-FILE-011-02, AC-FILE-011-03]
architecture:
  - ADR-008   # object storage abstraction — engagement document set; the storage adapter
  - ADR-009   # signed-URL file access + version history (new row + new key per version, never overwrite)
  - ADR-005   # RLS — both-party engagement-scoped access; a file never crosses engagements
  - ADR-003   # SESSION_CONTEXT — upload/download authz runs under the caller's propagated identity
  - ADR-006   # monorepo — accountant upload/folders in apps/admin; both-party download across both apps
  - ADR-020   # encryption key management — files encrypted at rest (inherited from EPIC-007)
  - ADR-019   # audit trail — document access/downloads are recorded events
  - ADR-022   # anti-abuse rate limiting — the accountant upload path
  - ADR-012   # testing pyramid — tiers the AC tests must hit
depends_on: [EPIC-007, EPIC-010, EPIC-012]
source:
  - .requirements/REQ-FILE-001.md
  - .requirements/REQ-FILE-009.md
  - .requirements/REQ-FILE-010.md
  - .requirements/REQ-FILE-011.md
  - .architecture/decisions/ADR-009-signed-url-file-access.md
  - .architecture/decisions/ADR-008-object-storage-abstraction.md
open_questions: []
---

# EPIC-013 — Secure file exchange — accountant upload, both-party download, folders, tax-year organization, versioning

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice completes the **two-way document exchange** on top of the first secure file-storage path
EPIC-007 stood up. The **accountant** uploads files into an engagement (deliverables — a completed return,
an organizer, a letter) in the Tax Portal (`apps/admin`), and **both** the accountant and the engagement's
**client participant(s)** can **download** the engagement's files (over the same authorized, time-limited,
never-public path EPIC-007 established). The accountant **organizes** an engagement's files into a folder
structure she creates, renames, and arranges; at the **top level** files are grouped by **engagement and
tax year** so prior-year documents are easy to locate. Replacing a file keeps a **version history** — the
newest version is current, every prior version is retained and accessible. It builds on EPIC-007 (the
storage path + client-upload + isolation), EPIC-010 (the navigable engagement workspace), and EPIC-012 (the
engagement **tax-year** attribute that REQ-FILE-011's top-level organization keys on).

> **Exchange-surface scope.** This epic owns the **accountant-upload + both-party-download + folders +
> tax-year organization + versioning** surface. The **lifecycle governance** of those files — accountant-only
> delete, soft-delete, 7-year retention (EPIC-014) and post-retention purge + legal hold (EPIC-015) — is the
> next two epics. Overdue-document-request reminders (REQ-FILE-012) are **Phase 4** (the reminder engine).

## Requirements delivered

- **REQ-FILE-001 — Both parties exchange files within an engagement** *(remainder; client-upload + isolation were EPIC-007)*
  - **AC-FILE-001-01** — the accountant can upload a file to an engagement.
  - **AC-FILE-001-03** — the accountant can download any file belonging to an engagement.
  - **AC-FILE-001-04** — a client participant can download files belonging to their engagement.
- **REQ-FILE-009 — Files support version history**
  - **AC-FILE-009-01** — an existing file can be replaced with a new version.
  - **AC-FILE-009-02** — after replacement, the newest version is presented as the current version.
  - **AC-FILE-009-03** — every prior version is retained and remains accessible after replacement.
- **REQ-FILE-010 — Accountant organizes engagement files into folders**
  - **AC-FILE-010-01** — files within an engagement can be organized into folders.
  - **AC-FILE-010-02** — the accountant can create, rename, and arrange the folders within an engagement.
  - **AC-FILE-010-03** — a file can be placed within a folder of its engagement.
  - **AC-FILE-010-04** — folder-structure management is an accountant capability; clients do not manage it.
- **REQ-FILE-011 — Top-level organization by engagement and tax year**
  - **AC-FILE-011-01** — at the top level, files are grouped by the engagement they belong to.
  - **AC-FILE-011-02** — at the top level, files are grouped by tax year.
  - **AC-FILE-011-03** — a user can locate an engagement's files by navigating from its engagement and tax year down into the folder structure.

## Architecture adherence
- **ADR-008 — Object storage abstraction.** Uploaded/downloaded bytes flow through the storage adapter's
  engagement document set, not the app DB.
- **ADR-009 — Signed-URL file access + version history.** Download (and accountant upload) use short-lived
  signed URLs (no public path, time-limited — inherited from EPIC-007); a new version is a **new row + new
  storage key**, never an overwrite, so prior versions survive (AC-FILE-009-03).
- **ADR-005 — RLS via security policies.** Both-party access is engagement-scoped: the accountant reads all
  (AUTH-002), a client participant reads only their engagement's documents (AUTH-003), and a file never
  crosses engagements (the EPIC-007 `pol_Document`/`0007` isolation still holds). The both-party **download**
  authorization is a tier-3 obligation.
- **ADR-003 — SESSION_CONTEXT.** Upload and the download authorization check run under the caller's
  propagated identity; folder management runs under the accountant principal.
- **ADR-006 — Monorepo, two apps.** Accountant upload + folder management in `apps/admin`; download is
  exercised from both surfaces.
- **ADR-020 — Encryption key management.** Accountant-uploaded files are encrypted at rest, like client
  uploads (inherited).
- **ADR-019 — Audit trail.** Document access/downloads are recorded events (the NFR-010-01 audit emission is
  carried here as an adherence obligation; the NFR-010 **feature** AC are owned by the later audit-trail
  slice — see Out of scope).
- **ADR-022 — Anti-abuse rate limiting.** The accountant upload path is rate-limited.
- **ADR-012 — Testing pyramid.** Both-party download authz + isolation + version-retention are tier-3; the
  upload/download/folder/organization journeys are tier-6 e2e (both surfaces).

## Acceptance scenarios

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

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-FILE-001-01/-03/-04` / `AC-FILE-009-NN` / `AC-FILE-010-NN` /
  `AC-FILE-011-NN` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration / security (tier 3)** — AC-FILE-001-03/-04 (both-party download authz),
    AC-FILE-009-03 (prior versions retained), AC-FILE-010-04 (folder management accountant-only),
    AC-FILE-011-01/-02 (grouping).
  - **e2e (tier 6)** — AC-FILE-001-01 (accountant upload), AC-FILE-009-01/-02 (replace → current),
    AC-FILE-010-01/-02/-03 (folders), AC-FILE-011-03 (navigate engagement→tax-year→folder), both-party
    download round-trips.

## Out of scope
- **File lifecycle governance** — accountant-only delete (REQ-FILE-004), soft-delete (REQ-FILE-006), 7-year
  retention (REQ-FILE-005) → **EPIC-014**; post-retention purge (REQ-FILE-013), legal hold (REQ-FILE-014),
  retention precedence (REQ-FILE-015) → **EPIC-015**.
- **Client upload + engagement isolation + malware scan + encryption-at-rest + any-type** (REQ-FILE-001-02/-05,
  REQ-FILE-002, REQ-FILE-003, REQ-NFR-009) → **delivered in Phase 2 (EPIC-007)**; this slice inherits and
  reuses them.
- **Overdue document-request flagging + reminder cadence** (REQ-FILE-012) → **Phase 4** (the reminder/
  notification engine).
- **The audit-trail feature AC** (REQ-NFR-010-01 document-access logging, etc.) → a dedicated **audit-trail
  slice** (Phase 4). This epic **emits** download/access audit events per ADR-019 as an adherence obligation
  but does not claim the NFR-010 feature AC.

## Links
- Requirements: REQ-FILE-001 (remainder), REQ-FILE-009, REQ-FILE-010, REQ-FILE-011
- Architecture: ADR-003, ADR-005, ADR-006, ADR-008, ADR-009, ADR-012, ADR-019, ADR-020, ADR-022
- Personas: `personas/jane-accountant.md` (upload deliverables, folders, download client docs), `personas/sarah-returning-client.md` (download deliverables, re-upload a version), `personas/martha-and-james-married-couple.md` (both participants download the shared engagement's files)
- Flows: `flows/flow-file-exchange.md` (the upload/download/folders/versioning paths this epic realizes — reconciled from its legacy "Phase 4 stub / Epic 004" label)
- Epics: depends on EPIC-007 (first storage path), EPIC-010 (engagement workspace), EPIC-012 (tax-year attribute); precedes EPIC-014/EPIC-015 (the lifecycle governance of these files)
- Open questions: none

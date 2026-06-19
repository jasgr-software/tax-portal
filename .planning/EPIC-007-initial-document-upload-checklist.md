---
id: EPIC-007
title: Initial document upload — checklist, secure upload, malware scan
phase: 2
status: delivered
slice: The accountant defines a document checklist for the engagement; the onboarding client uploads documents against it through secure, malware-scanned, non-public storage, and the step is satisfied when the required items are provided.
requirements:
  - REQ-ONBD-004: [AC-ONBD-004-01, AC-ONBD-004-02, AC-ONBD-004-03, AC-ONBD-004-04]
  - REQ-FILE-007: [AC-FILE-007-01, AC-FILE-007-02, AC-FILE-007-03]
  - REQ-FILE-008: [AC-FILE-008-01, AC-FILE-008-02, AC-FILE-008-03]
  - REQ-FILE-001: [AC-FILE-001-02, AC-FILE-001-05]
  - REQ-FILE-002: [AC-FILE-002-01]
  - REQ-FILE-003: [AC-FILE-003-01, AC-FILE-003-02, AC-FILE-003-03, AC-FILE-003-04]
  - REQ-NFR-009: [AC-NFR-009-01, AC-NFR-009-02]
architecture:
  - ADR-006   # monorepo — checklist authoring in apps/admin; upload in apps/portal
  - ADR-008   # object storage abstraction — engagement document set
  - ADR-009   # signed-URL file access — time-limited, no public path
  - ADR-020   # encryption key management — files encrypted at rest
  - ADR-021   # file upload safety — malware scanning before a file is available
  - ADR-005   # security policy — files are engagement-scoped and never cross engagements
  - ADR-003   # SESSION_CONTEXT — upload runs under the client principal
  - ADR-019   # audit trail — uploads are recorded events
  - ADR-022   # anti-abuse rate limiting — upload path
  - ADR-012   # testing pyramid — tiers the AC tests must hit
depends_on: [EPIC-005]
source:
  - .requirements/REQ-ONBD-004.md
  - .requirements/REQ-FILE-007.md
  - .requirements/REQ-FILE-008.md
  - .requirements/REQ-FILE-001.md
  - .requirements/REQ-FILE-002.md
  - .requirements/REQ-FILE-003.md
  - .requirements/REQ-NFR-009.md
  - .architecture/decisions/ADR-009-signed-url-file-access.md
  - .architecture/decisions/ADR-021-file-upload-safety.md
open_questions: []
---

# EPIC-007 — Initial document upload — checklist, secure upload, malware scan

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice delivers **step 3 of onboarding** and stands up the portal's **first file-storage path**. In
the Tax Portal (`apps/admin`) the **accountant** creates labeled **document requests** for the engagement,
which compose the engagement's **document checklist**. In the Client Portal (`apps/portal`) the **client**,
past the letter gate (EPIC-005), sees the checklist with **outstanding vs. provided** items and **uploads**
documents (any file type) to fulfill them. Because this is the first slice that stores client files, it
carries the security and safety properties every later upload inherits: files are **encrypted at rest**,
reachable **only** through an authorized, **time-limited** path (never a public link), **scanned for
malware** before anyone can open them, and **scoped to their engagement**. The step is satisfied when the
engagement's required checklist items have been provided. It builds on EPIC-005 (the gate that unlocks this
step).

> **First-upload-slice scope.** This slice owns the **cross-cutting file properties** for the first time —
> malware scanning (REQ-NFR-009), encryption/authz/no-public/time-limited access (REQ-FILE-003), any-type
> permissiveness (REQ-FILE-002), and engagement isolation (REQ-FILE-001-05) — because they must hold from
> the very first stored file. The **broader file-exchange surface** (accountant upload, both-party
> download, folders, versioning, retention, overdue flagging) is **Phase 3** — see Out of scope.

## Requirements delivered

- **REQ-ONBD-004 — Initial document upload follows a checklist**
  - **AC-ONBD-004-01** — during the upload step the client is shown the engagement's document checklist.
  - **AC-ONBD-004-02** — the client can see which items are still outstanding vs. provided.
  - **AC-ONBD-004-03** — the client can upload documents to fulfill checklist items.
  - **AC-ONBD-004-04** — the step is satisfied when the engagement's required checklist items are provided.
- **REQ-FILE-007 — Accountant creates labeled document requests**
  - **AC-FILE-007-01** — the accountant can create a document request in an engagement with a free-text
    label.
  - **AC-FILE-007-02** — the client participant can see the engagement's document requests and each label.
  - **AC-FILE-007-03** — the client can fulfill a document request by uploading a file in response.
- **REQ-FILE-008 — Per-engagement document checklist shows outstanding items**
  - **AC-FILE-008-01** — each engagement has a checklist reflecting its document requests.
  - **AC-FILE-008-02** — the client can view the checklist and distinguish outstanding from fulfilled items.
  - **AC-FILE-008-03** — a fulfilled request's checklist item is no longer shown as outstanding.
- **REQ-FILE-001 — File exchange within an engagement** *(client-upload + isolation subset; remainder Phase 3)*
  - **AC-FILE-001-02** — a client participant can upload a file to their engagement.
  - **AC-FILE-001-05** — an uploaded file belongs to that engagement's document set and is not exposed to
    other engagements.
- **REQ-FILE-002 — No file type restrictions**
  - **AC-FILE-002-01** — a file may be uploaded regardless of type/extension; none is rejected for format.
- **REQ-FILE-003 — Files encrypted at rest and never publicly accessible**
  - **AC-FILE-003-01** — stored files are encrypted at rest.
  - **AC-FILE-003-02** — a file cannot be retrieved without an authorization check on the requester's
    permission to that engagement's documents.
  - **AC-FILE-003-03** — no file is reachable by an anonymous/public path.
  - **AC-FILE-003-04** — any access grant is time-limited and stops working after it expires.
- **REQ-NFR-009 — All uploaded files are scanned for malware**
  - **AC-NFR-009-01** — every uploaded file is scanned for malware before it is made available to view/
    download.
  - **AC-NFR-009-02** — a file found malicious is withheld and the uploader is informed it was rejected.

## Architecture adherence
- **ADR-006 — Monorepo, two apps.** Document-request authoring in `apps/admin`; client checklist + upload
  in `apps/portal`.
- **ADR-008 — Object storage abstraction.** Files land in the engagement's document set via the storage
  abstraction, not the app database.
- **ADR-009 — Signed-URL file access.** Access is via short-lived signed URLs — satisfying AC-FILE-003-03
  (no public path) and AC-FILE-003-04 (time-limited grant).
- **ADR-020 — Encryption key management.** Stored files are encrypted at rest (AC-FILE-003-01).
- **ADR-021 — File upload safety.** Uploaded files are malware-scanned before being made available; a
  malicious file is withheld and the uploader notified (REQ-NFR-009). **The scanning service is mocked/
  stubbed behind a seam** (per the standing mock-third-party directive) — a deterministic stub that returns
  clean/malicious lets NFR-009-01/-02 be delivered against the seam; the real scanner is a deferred
  drop-in. Object storage uses the Azurite emulator (already the local stand-in for Azure Blob).
- **ADR-005 — Security policies.** A file is engagement-scoped; a client can reach only their own
  engagement's documents and never another engagement's (AC-FILE-001-05, AC-FILE-003-02). The per-policy
  cross-engagement isolation test is a hard requirement.
- **ADR-003 — SESSION_CONTEXT.** The upload and the authorization check run under the client's propagated
  identity.
- **ADR-019 — Audit trail.** Uploads are recorded events.
- **ADR-022 — Anti-abuse rate limiting.** The upload path is rate-limited against abuse.
- **ADR-012 — Testing pyramid.** Encryption/authz/no-public/time-limited and malware-withholding are
  tier-3 integration (and security) obligations; the checklist→upload→satisfied path is tier-6 e2e.

## Acceptance scenarios

### AC-ONBD-004-01 — Client is shown the engagement's checklist
```gherkin
Given a client at the document-upload step whose engagement has a document checklist
When the client opens the step
Then they are shown the document checklist the accountant defined for that engagement
```

### AC-ONBD-004-02 — Outstanding vs. provided is visible
```gherkin
Given a checklist with some items provided and some not
When the client views the checklist
Then they can distinguish which items are still outstanding from those already provided
```

### AC-ONBD-004-03 — Client uploads to fulfill an item
```gherkin
Given an outstanding checklist item
When the client uploads the corresponding document
Then the upload is accepted and the item is fulfilled
```

### AC-ONBD-004-04 — Step satisfied when required items are provided
```gherkin
Given an engagement whose required checklist items have all been provided
When the upload step's satisfaction is evaluated
Then the document-upload step is satisfied
```

### AC-FILE-007-01 — Accountant creates a labeled document request
```gherkin
Given the accountant in an engagement
When she creates a document request with a free-text label
Then a labeled document request is created in that engagement
```

### AC-FILE-007-02 — Client sees the requests and their labels
```gherkin
Given an engagement with document requests
When the client participant views the engagement
Then they see each document request and its label
```

### AC-FILE-007-03 — Client fulfills a request by uploading
```gherkin
Given a document request addressed to the client's engagement
When the client uploads a file in response
Then that request is fulfilled by the uploaded file
```

### AC-FILE-008-01 — Checklist reflects the engagement's requests
```gherkin
Given an engagement with one or more document requests
When the engagement's checklist is examined
Then the checklist reflects those document requests
```

### AC-FILE-008-02 — Client distinguishes outstanding from fulfilled
```gherkin
Given a client participant viewing their engagement's checklist
When they review it
Then outstanding items are distinguishable from fulfilled ones
```

### AC-FILE-008-03 — A fulfilled item leaves the outstanding set
```gherkin
Given an outstanding checklist item
When its document request is fulfilled
Then that item is no longer shown as outstanding
```

### AC-FILE-001-02 — Client uploads a file to their engagement
```gherkin
Given a client participant of an engagement
When they upload a file to that engagement
Then the file is stored as part of that engagement's document set
```

### AC-FILE-001-05 — Uploaded file does not cross engagements
```gherkin
Given a file uploaded to one engagement
When another engagement's document set is examined
Then the file is not present in or reachable from that other engagement
```

### AC-FILE-002-01 — Any file type is accepted
```gherkin
Given a client uploading a file of an arbitrary type or extension
When the upload is processed
Then the file is not rejected solely because of its format
```

### AC-FILE-003-01 — Files encrypted at rest
```gherkin
Given a file stored through the portal
When its storage is examined
Then the file is encrypted at rest
```

### AC-FILE-003-02 — Retrieval requires an authorization check
```gherkin
Given a stored engagement file
When retrieval is attempted
Then it succeeds only after an authorization check confirms the requester may access that engagement's documents
```

### AC-FILE-003-03 — No anonymous/public path to a file
```gherkin
Given a stored engagement file
When an unauthenticated, unauthorized requester attempts to reach it
Then no anonymous or public path returns the file
```

### AC-FILE-003-04 — Access grants are time-limited
```gherkin
Given a time-limited access grant to a file
When the grant has expired
Then the grant no longer retrieves the file
```

### AC-NFR-009-01 — Files scanned before being made available
```gherkin
Given a file uploaded through the document-upload path
When the upload is processed
Then the file is scanned for malware before it is made available to view or download
```

### AC-NFR-009-02 — Malicious file withheld and uploader informed
```gherkin
Given an uploaded file found to be malicious
When the scan completes
Then the file is withheld from recipients and the uploader is informed it was rejected
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-ONBD-004-NN` / `AC-FILE-007-NN` / `AC-FILE-008-NN` /
  `AC-FILE-001-02` / `AC-FILE-001-05` / `AC-FILE-002-01` / `AC-FILE-003-NN` / `AC-NFR-009-NN` id), at the
  prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping:
  - **e2e (tier 6)** — AC-ONBD-004-01/-02/-03, AC-FILE-007-01/-02/-03, AC-FILE-008-02/-03, AC-FILE-002-01
    (any-type upload), AC-NFR-009-02 (rejection surfaced to the uploader).
  - **service integration / security (tier 3)** — AC-ONBD-004-04, AC-FILE-008-01, AC-FILE-001-02/-05,
    AC-FILE-003-01/-02/-03/-04, AC-NFR-009-01; the per-policy cross-engagement isolation test (ADR-005).
  - **unit/component (tier 2/5)** — checklist outstanding/fulfilled rendering.

## Out of scope
- **REQ-FILE-001 remainder** — **AC-FILE-001-01** (accountant upload), **AC-FILE-001-03/-04** (both-party
  download) → **Phase 3** (file-exchange epic). Onboarding's step 3 is the client *providing* documents;
  general exchange and download are the later slice.
- **Folders, versioning, retention/legal-hold, soft-delete, overdue flagging, download UX** — REQ-FILE-004/
  005/006/009/010/011/012/013/014/015 → **Phase 3**.
- **Message-attachment ingress** of REQ-NFR-009 (AC-NFR-009 also governs message attachments) → realized
  again on the **Phase 4** messaging slice; this epic satisfies the document-upload ingress only.
- **The real malware-scanning service** (live scanner wiring) → **deferred**; this slice ships against the
  mocked scanner seam (per the standing mock-third-party directive). Real-scanner enablement re-validates
  NFR-009 against the live service.
- **Onboarding completion / transition / notification** (REQ-ONBD-005/006/007) → **EPIC-008**.

## Links
- Requirements: REQ-ONBD-004, REQ-FILE-001 (partial), REQ-FILE-002, REQ-FILE-003, REQ-FILE-007, REQ-FILE-008, REQ-NFR-009
- Architecture: ADR-003, ADR-005, ADR-006, ADR-008, ADR-009, ADR-012, ADR-019, ADR-020, ADR-021, ADR-022
- Personas: `personas/jane-accountant.md` (document requests), `personas/sarah-returning-client.md`, `personas/martha-and-james-married-couple.md` (upload)
- Flows: `flows/flow-onboarding.md` (step 3), `flows/flow-file-exchange.md` (first upload path)
- Epics: depends on EPIC-005 (gate); related EPIC-008; precursor to the Phase-3 file-exchange epic
- Open questions: none

---
id: EPIC-014
title: File deletion, soft-delete & 7-year retention
phase: 3
status: delivered
slice: Only the accountant can delete a file; deletion is soft (the file leaves the working view but is preserved); and every document belonging to a completed engagement is retained by the system for at least 7 years — within the window nothing, not even an accountant deletion, permanently removes it.
requirements:
  - REQ-FILE-004: [AC-FILE-004-01, AC-FILE-004-02, AC-FILE-004-03]
  - REQ-FILE-006: [AC-FILE-006-01, AC-FILE-006-02, AC-FILE-006-03]
  - REQ-FILE-005: [AC-FILE-005-01, AC-FILE-005-02, AC-FILE-005-03]
  - REQ-NFR-006: [AC-NFR-006-01]
architecture:
  - ADR-018   # data-retention lifecycle — soft-delete-first, retention clock anchored at completion, in-window no physical removal
  - ADR-002   # SQL Server — soft-delete columns, temporal tables (history), DATETIMEOFFSET, raw-SQL track
  - ADR-005   # RLS — deletedAt filter in the CLIENT branch; delete is accountant-only; admin-pool path
  - ADR-009   # signed-URL access — document soft-delete (Document.deletedAt), bytes survive the soft-delete
  - ADR-003   # SESSION_CONTEXT — delete runs under the accountant principal; no client delete path
  - ADR-006   # monorepo — delete is an apps/admin capability
  - ADR-019   # audit trail — file deletions are recorded admin actions
  - ADR-012   # testing pyramid — tiers the AC tests must hit (no-client-delete + in-window-no-removal are hard gates)
depends_on: [EPIC-013, EPIC-010]
source:
  - .requirements/REQ-FILE-004.md
  - .requirements/REQ-FILE-005.md
  - .requirements/REQ-FILE-006.md
  - .requirements/REQ-NFR-006.md
  - .architecture/decisions/ADR-018-data-retention-lifecycle.md
open_questions: []
---

# EPIC-014 — File deletion, soft-delete & 7-year retention

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice establishes the **everyday lifecycle governance** of engagement documents: deletion is an
**accountant-only**, **soft** action, and the underlying record is held under the **7-year retention** rule.
In the Tax Portal (`apps/admin`) the **accountant** can delete a file — which marks it deleted and removes
it from the normal working view while **preserving** the bytes and row; a **client cannot delete any file**,
including one they uploaded, and no client-facing path to remove a file exists. Every document belonging to a
**completed** engagement is **retained by the system** for at least 7 years measured from completion, and
**within that window no action permanently removes it** — not even an accountant deletion (a deletion is a
recoverable soft-delete, not destruction). This realizes the "never lose access / soft-delete-first"
invariant from ADR-018 over the exchange surface EPIC-013 built. It is the prerequisite for EPIC-015
(post-retention purge + legal hold), which governs what may happen **after** the window elapses.

> **In-window scope.** This epic owns deletion semantics and the **retention floor** — what is true
> *during* the 7-year window: soft-delete, recoverability, no physical removal. The **destructive end** of
> the lifecycle — post-retention accountant-confirmed **purge** (REQ-FILE-013), **legal hold**
> (REQ-FILE-014), and the retention-vs-erasure **precedence** (REQ-FILE-015) — is **EPIC-015**.

## Requirements delivered

- **REQ-FILE-004 — Only the accountant can delete files**
  - **AC-FILE-004-01** — the accountant can delete a file within an engagement.
  - **AC-FILE-004-02** — a client cannot delete any file, including a file the client uploaded.
  - **AC-FILE-004-03** — no client-facing path exists to remove a file from an engagement.
- **REQ-FILE-006 — Deletion is soft — files retained through the retention period**
  - **AC-FILE-006-01** — deleting a file marks it as deleted and removes it from the normal file view.
  - **AC-FILE-006-02** — a deleted file is retained for the engagement's 7-year retention period and is not permanently destroyed within that period.
  - **AC-FILE-006-03** — a deleted file remains recoverable until its retention period elapses.
- **REQ-FILE-005 — Documents retained for 7 years after engagement completion**
  - **AC-FILE-005-01** — a document of a completed engagement is retained for at least 7 years from the engagement's completion.
  - **AC-FILE-005-02** — within the window a document remains recoverable and is not permanently removed by any action, including an accountant deletion.
  - **AC-FILE-005-03** — no action permanently removes a document during its 7-year window; in-window, retention governs.
- **REQ-NFR-006 — Seven-year document retention enforced by the system**
  - **AC-NFR-006-01** — client documents are retained by the system (not by manual discipline) and not permanently removed until at least 7 years after the related engagement completes.

## Architecture adherence
- **ADR-018 — Data-retention lifecycle.** Soft-delete-first is the default: "delete" sets a tombstone
  (`deletedAt`), never a request-path physical `DELETE`. The retention clock is **anchored at engagement
  completion**; within the window expiry has not occurred, so no purge path is reachable (that is EPIC-015).
  This epic implements §1 (soft-delete-first), §3 (retention clock), and the in-window guarantee.
- **ADR-002 — SQL Server.** Soft-delete columns + system-versioned **temporal tables** (history side-table)
  on the raw-SQL track preserve prior state and survive a soft-delete; `DATETIMEOFFSET` timestamps.
- **ADR-005 — RLS via security policies.** The CLIENT branch filters `deletedAt IS NULL` (a soft-deleted
  file leaves the client/working view); **delete is accountant-only** (no client principal can delete — a
  hard tier-3 obligation for AC-FILE-004-02/-03); physical removal, when it eventually happens, is an
  admin-pool path (EPIC-015).
- **ADR-009 — Signed-URL access.** Generalizes the document soft-delete it already defines
  (`Document.deletedAt`); the storage bytes survive the soft-delete until a confirmed post-retention purge.
- **ADR-003 — SESSION_CONTEXT.** Delete runs under the accountant principal; there is no client delete path.
- **ADR-006 — Monorepo, two apps.** Delete is an `apps/admin` capability; `apps/portal` exposes no delete.
- **ADR-019 — Audit trail.** File deletions are recorded admin actions (the NFR-010-03 emission is carried
  here as an adherence obligation; the NFR-010 feature AC are owned by the later audit-trail slice).
- **ADR-012 — Testing pyramid.** No-client-delete (FILE-004-02/-03) and in-window-no-removal
  (FILE-005-02/-03, FILE-006-02) are hard tier-3 integration/security; the accountant delete →
  leaves-working-view → still-recoverable journey is tier-3 + tier-6.

## Acceptance scenarios

### AC-FILE-004-01 — Accountant deletes a file
```gherkin
Given the accountant viewing a file in an engagement
When she deletes it
Then the file is deleted from the working view of that engagement
```

### AC-FILE-004-02 — A client cannot delete any file
```gherkin
Given a client participant of an engagement, including for a file they uploaded
When they attempt to delete a file through any portal path
Then no deletion occurs and the capability is not available to them
```

### AC-FILE-004-03 — No client-facing path removes a file
```gherkin
Given the client surface of an engagement
When it is examined for a file-removal capability
Then no client-facing path exists to remove a file from the engagement
```

### AC-FILE-006-01 — Deleting marks deleted and hides from the working view
```gherkin
Given a file in an engagement
When the accountant deletes it
Then it is marked deleted and removed from the normal file view
```

### AC-FILE-006-02 — A deleted file is retained, not destroyed, within the window
```gherkin
Given a file the accountant has deleted within the retention window
When the underlying record is examined
Then the file is retained for the 7-year period and not permanently destroyed
```

### AC-FILE-006-03 — A deleted file remains recoverable until retention elapses
```gherkin
Given a soft-deleted file within its retention window
When recovery is attempted
Then the file is recoverable until the retention period elapses
```

### AC-FILE-005-01 — A completed engagement's document is retained 7 years
```gherkin
Given a document belonging to a completed engagement
When its retention is evaluated
Then it is retained for at least 7 years measured from the engagement's completion
```

### AC-FILE-005-02 — In-window, no action removes it — including an accountant deletion
```gherkin
Given a document within its 7-year retention window
When any action is taken on it, including an accountant deletion
Then the document remains recoverable and is not permanently removed
```

### AC-FILE-005-03 — Retention governs during the window
```gherkin
Given a document within its 7-year retention window
When permanent removal is attempted by any path
Then no path permanently removes it; retention is the governing rule in-window
```

### AC-NFR-006-01 — The system enforces 7-year retention
```gherkin
Given client documents of a completed engagement
When retention is enforced
Then the system itself retains them and does not permanently remove them until at least 7 years after completion, without relying on manual discipline
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-FILE-004-NN` / `AC-FILE-006-NN` / `AC-FILE-005-NN` / `AC-NFR-006-01`
  id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration / security (tier 3)** — AC-FILE-004-02/-03 (hard no-client-delete),
    AC-FILE-006-02/-03 (retained + recoverable), AC-FILE-005-01/-02/-03, AC-NFR-006-01 (system-enforced
    retention).
  - **e2e (tier 6)** — AC-FILE-004-01 (accountant delete), AC-FILE-006-01 (leaves the working view).

## Out of scope
- **Post-retention purge** (REQ-FILE-013), **legal hold** (REQ-FILE-014), **retention-vs-erasure precedence**
  (REQ-FILE-015) → **EPIC-015**. This epic stops at the in-window guarantee; what may happen *after* the
  window elapses is the next slice.
- **Wholesale client-identity hard-delete** (REQ-IDNT-005) → **deferred from v1** (ADR-018; OQ-004).
- **The audit-trail feature AC** (REQ-NFR-010 — incl. -03 file-deletion logging) → a dedicated **audit-trail
  slice** (Phase 4). This epic emits deletion audit events per ADR-019 as adherence but does not claim the
  NFR-010 feature AC.
- **The file-exchange surface** (upload/download/folders/versioning) → **EPIC-013** (predecessor).

## Links
- Requirements: REQ-FILE-004, REQ-FILE-005, REQ-FILE-006, REQ-NFR-006
- Architecture: ADR-002, ADR-003, ADR-005, ADR-006, ADR-009, ADR-012, ADR-018, ADR-019
- Personas: `personas/jane-accountant.md` (tidy the working view without losing the record; records-retention obligation)
- Flows: `flows/flow-document-lifecycle.md` (the delete → soft-delete → retention path this epic realizes)
- Epics: depends on EPIC-013 (files to delete/retain) and EPIC-010 (completion anchors the retention clock); precedes EPIC-015 (post-retention purge + legal hold)
- Open questions: none

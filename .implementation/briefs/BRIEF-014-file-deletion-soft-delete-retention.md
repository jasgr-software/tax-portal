---
id: BRIEF-014
title: File deletion, soft-delete & 7-year retention — accountant-only delete, soft-delete-first, the in-window retention floor
status: ready
acceptance_criteria:
  - id: AC-FILE-004-01
    text: "The accountant can delete a file within an engagement."
  - id: AC-FILE-004-02
    text: "A client cannot delete any file, including a file the client uploaded."
  - id: AC-FILE-004-03
    text: "No client-facing path exists to remove a file from an engagement."
  - id: AC-FILE-006-01
    text: "Deleting a file marks it as deleted and removes it from the normal file view."
  - id: AC-FILE-006-02
    text: "A file marked as deleted is retained for the engagement's 7-year retention period and is not permanently destroyed within that period."
  - id: AC-FILE-006-03
    text: "A file marked as deleted remains recoverable until its retention period elapses."
  - id: AC-FILE-005-01
    text: "A document belonging to a completed engagement is retained for at least 7 years measured from the engagement's completion."
  - id: AC-FILE-005-02
    text: "Within the 7-year retention window, a document remains recoverable and is not permanently removed by any action, including an accountant deletion."
  - id: AC-FILE-005-03
    text: "No action permanently removes a document during its 7-year retention window; within the window, retention is the governing rule."
  - id: AC-NFR-006-01
    text: "Client documents are retained by the system and not permanently removed until at least seven years after the related engagement is completed; this retention is enforced by the system rather than left to manual discipline."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "HARD tier-3 no-client-delete authz (ADR-005 / ADR-003 / CS-SQL-001): a client participant — including for a file they uploaded — cannot delete any file through any path; delete is accountant-only under the accountant principal. Proven both ways — server-side (no client principal can delete; the deletedAt-filtered CLIENT branch holds) AND the portal surface exposes NO delete capability (AC-FILE-004-02/-03)."
    - "HARD tier-3 in-window-no-physical-removal (ADR-018 §1/§3 / ADR-009): a soft-delete sets a tombstone (deletedAt) and NEVER issues a request-path physical DELETE; the row and the storage bytes survive the soft-delete; within the 7-year window no path permanently removes the document — not even an accountant deletion (AC-FILE-005-02/-03, AC-FILE-006-02)."
    - "HARD tier-3 system-enforced retention (ADR-018 §3 / REQ-NFR-006): retention is computed by the system from an engagement-completion-anchored retention clock (default 7 years, configurable) — not left to manual discipline; a completed engagement's document is retained ≥7 years from completion (AC-FILE-005-01, AC-NFR-006-01)."
    - "Soft-delete recoverability + leaves-working-view: deleting marks the file deleted and removes it from the normal file view while keeping it recoverable until the retention period elapses; the accountant delete → leaves-working-view → still-recoverable journey is proven end-to-end (AC-FILE-006-01/-03, AC-FILE-004-01)."
acceptance_scenarios: .planning/EPIC-014-file-deletion-soft-delete-retention.md   # Given/When/Then reproduced verbatim in § Acceptance scenarios below
demo:
  applicable: yes
  apps: [admin]
  personas: [jane-accountant]
  flows: [flow-document-lifecycle]
source:
  - planning: .planning/EPIC-014-file-deletion-soft-delete-retention.md
  - requirements: .requirements/REQ-FILE-004.md
  - requirements: .requirements/REQ-FILE-005.md
  - requirements: .requirements/REQ-FILE-006.md
  - requirements: .requirements/REQ-NFR-006.md
  - architecture: .architecture/decisions/ADR-018-data-retention-lifecycle.md
  - architecture: .architecture/decisions/ADR-002-database-sql-server.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-009-signed-url-file-access.md
  - architecture: .architecture/decisions/ADR-003-session-context.md
  - architecture: .architecture/decisions/ADR-006-monorepo-two-apps.md
  - architecture: .architecture/decisions/ADR-019-audit-trail.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
code_standards:
  - "CS-TS-001 (required) — request-scoped DB access only through the packages/db wrapper (ADR-003 SESSION_CONTEXT)"
  - "CS-TS-002 (required) — never import the raw requestDb/adminDb pools outside packages/db"
  - "CS-TS-003 (recommended) — apply shared patterns to both surfaces (the no-client-delete absence is verified on the portal surface)"
  - "CS-TS-004 (experimental) — every server action resolves identity from the request cookie and guards role before any DB write (delete is an accountant-only server action)"
  - "CS-SQL-001 (required) — an RLS policy AND an isolation test per newly scoped table / changed predicate (the deletedAt-filtered CLIENT branch + accountant-only delete authz)"
  - "CS-SQL-002 (required) — raw-SQL track only for what Prisma cannot express (temporal tables, the soft-delete RLS predicate)"
  - "CS-SQL-003 (required) — RLS predicate shape conventions (the deletedAt IS NULL CLIENT branch)"
  - "CS-GEN-001 (recommended) — no secrets or PII in logs (file names, client identities, storage keys)"
  - "CS-GEN-002 (recommended) — additive, non-destructive edits"
  - "CS-GEN-003 (recommended) — cite the governing authority (ADR / REQ) in code & test comments"
---

# BRIEF-014 — File deletion, soft-delete & 7-year retention

> **Self-contained build brief for the EPIC-014 slice (Phase 3).** Establishes the everyday lifecycle
> governance of engagement documents on top of the file-exchange surface EPIC-013 built: deletion is an
> **accountant-only**, **soft** action, and every document of a completed engagement is held under the
> **7-year retention** floor — within the window nothing, not even an accountant deletion, permanently
> removes it. `source:` refs are read-only context; the brief stands alone. Composed by the Conductor from
> `.planning/EPIC-014` + its cited `REQ-*`/ADRs.

## Scope

Implement the **in-window document lifecycle** over the exchange surface EPIC-013 established. Three capabilities:

1. **Accountant-only soft-delete (apps/admin — Tax Portal).** The accountant can **delete a file** within an
   engagement. "Delete" is a **soft** action (ADR-018 §1): it sets a tombstone (`deletedAt`), removes the file
   from the **normal working view**, but **preserves the row and the storage bytes**. The delete runs under the
   **accountant principal** (ADR-003) and never issues a request-path physical `DELETE`. A **client cannot
   delete any file** — including one they uploaded — and **no client-facing path** to remove a file exists
   (`apps/portal` exposes no delete capability).

2. **In-window retention floor (the governing rule).** Every document belonging to a **completed** engagement
   is **retained by the system** for at least **7 years measured from the engagement's completion** (ADR-018
   §3 retention clock; default 7 years, configurable — not hard-coded magic). **Within that window no action
   permanently removes a document** — not even an accountant deletion. A soft-deleted file is a **recoverable**
   tombstone, not destruction; it remains recoverable until the retention period elapses. Retention is the
   **governing rule** in-window; there is **no purge path reachable** in this slice (purge is EPIC-015).

3. **System-enforced, not manual (NFR).** Retention is enforced by the **system itself** — the retention
   deadline is **computable** from the engagement-completion anchor and the configurable window — rather than
   relying on the accountant remembering not to delete things.

History preservation is via system-versioned **temporal tables** on the raw-SQL track (ADR-002 / ADR-018 §2):
a soft-delete (and any prior edit) leaves an immutable prior-state record in the `*_History` side table.
File deletions are recorded **audit events** (ADR-019) as an adherence obligation.

## Out of scope

- **Post-retention purge** (REQ-FILE-013), **legal hold** (REQ-FILE-014), and the **retention-vs-erasure
  precedence** (REQ-FILE-015) → **EPIC-015**. This slice stops at the **in-window guarantee**; what may happen
  *after* the 7-year window elapses (accountant-confirmed purge, holds) is the next slice. **No purge path,
  no legal-hold marker behavior, and no purge-eligibility surfacing are built here.**
- **Wholesale client-identity hard-delete** (REQ-IDNT-005) → **deferred from v1** (ADR-018 §4; OQ-004).
- **The audit-trail feature AC** (REQ-NFR-010 — incl. -03 file-deletion logging, the accountant-only audit
  *read* surface, audit retention) → a dedicated **audit-trail slice (Phase 4)**. This slice **emits**
  deletion audit events per ADR-019 as an adherence obligation but does **not** claim the NFR-010 feature AC.
- **The file-exchange surface** (upload / download / folders / tax-year organization / versioning) →
  **EPIC-013** (predecessor). This slice **inherits and reuses** the `Document` / `DocumentVersion` / `Folder`
  shapes and the `pol_Document` family; it does not re-implement them.

## Acceptance criteria

Each AC is covered by automated test(s) **tagged with its AC id** at the prescribed tier (§ Methodology). An
AC is implemented only when its tagged test(s) **pass in CI**; the epic is delivered only when all 10 are
`verified` in `COVERAGE.md`.

### REQ-FILE-004 — Only the accountant can delete files
- **AC-FILE-004-01** — The accountant can delete a file within an engagement.
- **AC-FILE-004-02** — A client cannot delete any file, including a file the client uploaded.
- **AC-FILE-004-03** — No client-facing path exists to remove a file from an engagement.

### REQ-FILE-006 — Deletion is soft — files retained through the retention period
- **AC-FILE-006-01** — Deleting a file marks it as deleted and removes it from the normal file view.
- **AC-FILE-006-02** — A file marked as deleted is retained for the engagement's 7-year retention period and is not permanently destroyed within that period.
- **AC-FILE-006-03** — A file marked as deleted remains recoverable until its retention period elapses.

### REQ-FILE-005 — Documents retained for 7 years after engagement completion
- **AC-FILE-005-01** — A document belonging to a completed engagement is retained for at least 7 years measured from the engagement's completion.
- **AC-FILE-005-02** — Within the 7-year retention window, a document remains recoverable and is not permanently removed by any action, including an accountant deletion.
- **AC-FILE-005-03** — No action permanently removes a document during its 7-year retention window; within the window, retention is the governing rule.

### REQ-NFR-006 — Seven-year document retention enforced by the system
- **AC-NFR-006-01** — Client documents are retained by the system and not permanently removed until at least seven years after the related engagement is completed; this retention is enforced by the system rather than left to manual discipline.

## Methodology & quality requirements

- **Acceptance format: gherkin.** Bind the Given/When/Then scenarios in § Acceptance scenarios to executable
  tests (the brief carries them verbatim from the epic). Each test's title/annotation contains its **AC id**
  (the AC-id test-tag contract — what makes the Validate write-back possible).
- **Tier mapping (ADR-012 testing pyramid; per the epic's sign-off contract):**
  - **Service integration / security (tier 3)** — AC-FILE-004-02/-03 (the **hard** no-client-delete),
    AC-FILE-006-02/-03 (retained + recoverable in-window), AC-FILE-005-01/-02/-03 (the in-window retention
    floor, incl. no-removal-by-accountant-deletion), AC-NFR-006-01 (system-enforced, not manual).
  - **e2e (tier 6)** — AC-FILE-004-01 (accountant delete), AC-FILE-006-01 (leaves the working view).
- **e2e required** (CLAUDE.md IO e2e defaults): this slice touches SQL Server security policies + the
  `deletedAt` RLS predicate, `SESSION_CONTEXT` propagation (delete under the accountant principal), and the
  file-lifecycle cross-module boundary. E2E runs against the full docker-compose stack with both apps up; the
  no-client-delete absence is exercised on the **portal** surface (cross-app per ADR-010).
- **Hard extra gates** — see front-matter `extra_gates`: the no-client-delete authz **proven both ways**
  (server-side RLS + portal absence), in-window-no-physical-removal (tombstone, bytes+row survive, no
  request-path DELETE), system-enforced retention (completion-anchored clock), and the accountant delete →
  leaves-working-view → still-recoverable journey.
- **UI demo (`demo.applicable: yes`)** — a `@demo` Playwright walkthrough captures an AC-tagged screenshot
  gallery into `docs/demos/EPIC-014/` on the **admin** surface, walking the **jane-accountant** journey along
  `flow-document-lifecycle` (delete a file → it leaves the working view → it is still recoverable within the
  retention window). **Non-gating** (the e2e gate is the gate); see `.orchestration/DEMO-POLICY.md`.

## Constraints

Non-negotiables (cite the originating ADR in code/test comments per CS-GEN-003):

- **ADR-018 — Data-retention lifecycle.** Soft-delete-first is the **default** (§1): "delete" sets a tombstone
  (`deletedAt`), never a request-path physical `DELETE`. The **retention clock is anchored at engagement
  completion** (§3); the 7-year duration is a **configurable** retention-window value, not hard-coded.
  **Within the window, expiry has not occurred, so no purge path is reachable** — purge is EPIC-015. This
  slice implements §1 (soft-delete-first), §3 (retention clock), and the in-window guarantee. **Hard
  obligation.**
- **ADR-002 — SQL Server.** Soft-delete columns + system-versioned **temporal tables** (`SYSTEM_VERSIONING =
  ON`, `*_History` side-table) on the **raw-SQL track** (`db/migrations/`, Track B — Prisma cannot express
  system-versioning) preserve prior state and survive a soft-delete; `DATETIMEOFFSET` timestamps; ADR-002
  PK/timestamp/identity conventions on any net-new column.
- **ADR-005 — RLS via security policies.** The **CLIENT branch filters `deletedAt IS NULL`** (a soft-deleted
  file leaves the client/working view); **delete is accountant-only** — **no client principal can delete** (a
  hard tier-3 obligation for AC-FILE-004-02/-03). A file never crosses engagements (the inherited
  `pol_Document`/`0007` isolation still holds). Physical removal, when it eventually happens, is an
  admin-pool path (**EPIC-015** — not built here). A missing/failing no-client-delete policy test is a
  rejection.
- **ADR-009 — Signed-URL access / document soft-delete.** Generalizes the document soft-delete it already
  defines (`Document.deletedAt`); the storage **bytes survive the soft-delete** until a confirmed
  post-retention purge (EPIC-015). No new public path.
- **ADR-003 — SESSION_CONTEXT.** Every request-scoped query goes through the `packages/db` wrapper that sets
  `SESSION_CONTEXT` before the first real query (CS-TS-001/-002). The delete runs under the **accountant
  principal**; there is **no client delete path**.
- **ADR-006 — Monorepo, two apps.** Delete is an **`apps/admin`** capability; **`apps/portal` exposes no
  delete** (the no-client-path obligation is verified on the portal surface; CS-TS-003).
- **ADR-019 — Audit trail.** File deletions are recorded audit events — an adherence obligation (the
  NFR-010-03 emission is carried here); the NFR-010 feature AC are not claimed here.
- **ADR-012 — Testing pyramid.** Honor the tier mapping above; the no-client-delete and the
  in-window-no-removal proofs are hard tier-3 gates.

## Code standards

- **CS-TS-001** (`required`) — request-scoped DB access only through the `packages/db` wrapper (ADR-003).
- **CS-TS-002** (`required`) — never import the raw `requestDb`/`adminDb` pools outside `packages/db`.
- **CS-TS-003** (`recommended`) — apply shared patterns to both surfaces; the **no-client-delete absence** is
  verified on the portal surface.
- **CS-TS-004** (`experimental`) — every server action resolves identity from the request cookie and guards
  role before any DB write (delete is an **accountant-only** server action).
- **CS-SQL-001** (`required`) — an RLS policy **and** an isolation test per newly scoped table / changed
  predicate (the `deletedAt`-filtered CLIENT branch + the accountant-only delete authz — proven both ways).
- **CS-SQL-002** (`required`) — raw-SQL track only for what Prisma cannot express (temporal tables, the
  soft-delete RLS predicate).
- **CS-SQL-003** (`required`) — RLS predicate shape conventions (the `deletedAt IS NULL` CLIENT branch).
- **CS-GEN-001** (`recommended`) — no secrets or PII in logs (file names, client identities, storage keys).
- **CS-GEN-002** (`recommended`) — additive, non-destructive edits.
- **CS-GEN-003** (`recommended`) — cite the governing ADR/REQ in code & test comments.

## Data & Interface Contract

> Altitude-bounded: only the shapes that **trace** to the epic's behavior + cited ADRs. The IO expands these
> into the full field-level contract at Design; genuinely upstream shape questions are escalated via
> `OPEN-QUESTIONS.md`, never invented. Field-level minutiae (exact column types, retention-window config key,
> recovery-action surface) are NOT fixed here.

- **`Document` soft-delete state (tombstone).** A document carries a `deletedAt` tombstone (ADR-009 already
  defines `Document.deletedAt`; ADR-002 `DATETIMEOFFSET` convention). State set: **active** (`deletedAt IS
  NULL`) ↔ **soft-deleted** (`deletedAt` set). Transitions: **active → soft-deleted** (accountant delete);
  **soft-deleted → active** (recover, **in-window only**). There is **no** active/soft-deleted → *purged*
  transition in this slice. A soft-deleted document leaves the CLIENT/working view (RLS `deletedAt IS NULL`)
  yet the row + bytes are retained. *(traces: REQ-FILE-004/006; ADR-018 §1, ADR-005, ADR-009)*
- **Version rows follow the document's soft-delete (consistency).** A deleted file's **prior versions**
  (`DocumentVersion`, from EPIC-013) are retained under the same retention floor — soft-deleting a file does
  not destroy its version history; the version rows ride the same engagement-scoped, in-window-retained set.
  Whether the tombstone is modeled on the parent `Document` only or also on `DocumentVersion` is an IO Design
  decision bounded by "a deleted file remains recoverable, with its history, within the window." *(traces:
  REQ-FILE-006; ADR-018 §1/§2, ADR-009 version history)*
- **Retention clock (computable deadline).** A retainable document's retention deadline is **computable** from
  the **engagement-completion timestamp** (the EPIC-010 completion anchor) + a **configurable retention-window
  value (default 7 years)** — encoded as configuration, **not hard-coded magic** (ADR-018 §3). The system
  evaluates retention from these inputs; no manual discipline. *(traces: REQ-FILE-005, REQ-NFR-006; ADR-018
  §3)*
- **Temporal history (raw-SQL track).** Retention-sensitive tables use system-versioned temporal tables
  (`SYSTEM_VERSIONING = ON`, `ValidFrom`/`ValidTo` period columns) so a soft-delete leaves an immutable
  prior-state record in the `*_History` side table. Defined on the raw-SQL migration track (Prisma cannot
  express system-versioning). *(traces: ADR-018 §2, ADR-002)*
- **Interface contracts.**
  - *Delete a file (apps/admin):* input = a document of an engagement the accountant owns; effect = set the
    `deletedAt` tombstone (no physical `DELETE`), remove it from the working view, retain row + bytes; runs
    under the **accountant principal**; **accountant-only** — the capability is **not available to a client**
    and **no client path** exists. *(traces: REQ-FILE-004/006; ADR-003/-005/-018)*
  - *No client delete (apps/portal):* the client surface exposes **no** file-removal capability for any file,
    including one the client uploaded; a client principal cannot delete server-side. *(traces:
    REQ-FILE-004-02/-03; ADR-005/-006)*
  - *Recover a soft-deleted file (in-window):* a soft-deleted document remains **recoverable** until its
    retention period elapses (the recovery-surface shape is an IO Design decision; the obligation is that it
    is recoverable in-window). *(traces: REQ-FILE-006-03, REQ-FILE-005-02; ADR-018 §1/§3)*
- **Field-shape obligations (ADR-002).** New columns follow ADR-002 PK/timestamp/identity conventions. **Audit
  events** (ADR-019) are recorded for file deletion (and recovery).

## Acceptance scenarios

> Reproduced verbatim from `.planning/EPIC-014-file-deletion-soft-delete-retention.md` (the canonical behavior
> contract). Bind each to an executable test tagged with its AC id.

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

## References

- Planning: `.planning/EPIC-014-file-deletion-soft-delete-retention.md` (the slice + behavior contract)
- Requirements: REQ-FILE-004, REQ-FILE-005, REQ-FILE-006, REQ-NFR-006
- Architecture: ADR-018 (data-retention lifecycle — the governing HOW), ADR-002 (temporal tables, soft-delete
  columns, `DATETIMEOFFSET`, raw-SQL track), ADR-005 (RLS `deletedAt` filter + accountant-only delete),
  ADR-009 (`Document.deletedAt`, bytes survive soft-delete), ADR-003 (SESSION_CONTEXT — accountant principal),
  ADR-006 (delete is an admin capability), ADR-019 (deletion audit events), ADR-012 (testing tiers)
- Personas: `.planning/personas/jane-accountant.md` (tidy the working view without losing the record; the
  records-retention obligation)
- Flows: `.planning/flows/flow-document-lifecycle.md` (the delete → soft-delete → retention path this slice realizes)
- Prior art: EPIC-013 (the `Document`/`DocumentVersion`/`Folder` shapes + `pol_Document` family this slice
  governs), EPIC-010 (engagement **completion** — the retention-clock anchor)

## Notes

- **Inherit, do not re-implement EPIC-013.** The `Document`/`DocumentVersion`/`Folder` entities, the
  `pol_Document`/`0007` engagement isolation, and the signed-URL storage path already exist — this slice adds
  the **soft-delete capability**, the **`deletedAt`-filtered CLIENT branch**, the **retention clock**, and the
  **temporal history**. It does not touch upload/download/folders/versioning behavior.
- **The no-client-delete proof is the panel/SDET trap** (per ADR-005 history, mirroring EPIC-013's both-party
  trap): assert it **both ways** — **server-side** (no client principal can delete; the `deletedAt`-filtered
  CLIENT branch holds and a client cannot reach a delete path), **and** the **portal surface** exposes **no**
  delete capability for any file, *including one the client uploaded*. A one-directional assertion is
  insufficient.
- **Soft-delete is never a physical DELETE** (ADR-018 §1): a delete sets `deletedAt`; the
  in-window-no-removal proof (AC-FILE-005-02/-03, AC-FILE-006-02) must show the row + bytes still present and
  the file still recoverable after deletion.
- **No purge in this slice.** Purge, legal hold, and retention-vs-erasure precedence are **EPIC-015** — do not
  build a purge path, a legal-hold marker behavior, or purge-eligibility surfacing here. This slice owns only
  the **in-window** guarantee. The retention clock produces *eligibility* downstream, but expiry/purge is not
  reachable in-window and is out of scope.
- **Opportunistic hardening (IO discretion, non-AC):** EPIC-013's close-out flagged `pol_DocumentVersion`
  defense-in-depth as a natural fit here (version rows currently ride the parent `Document`'s engagement
  scope). If the IO's Design adds a `deletedAt` tombstone or scoped policy to `DocumentVersion` for soft-delete
  consistency (per the "version rows follow the document's soft-delete" contract above), tightening
  `pol_DocumentVersion` is a sensible companion — **non-gating, traces to ADR-005 + REQ-FILE-006**, not a
  net-new AC. Decide at Design; do not over-build.
- **Mirror reminder (CS-TS-003 / CLAUDE.md § Platform-frontend scope):** delete lives in admin by design; the
  obligation that mirrors to portal is the **absence** of any delete capability — verify it on the portal
  surface, not just by omission.
- **Known infra caveat (carried, non-gating):** BUG-008-001 (Azurite SAS-URL host-unreachable from the host
  Playwright browser) affected file-byte e2e scenes earlier. This slice's hard gates are server-side
  (soft-delete tombstone, RLS, retention clock) and do not depend on a byte round-trip; if a tier-6 scene
  trips it, carry the affected AC by its tier-3 integration proof and flag it — do not weaken the gate.
- Suggested decomposition is the IO's to finalize at Design (e.g. whether the `deletedAt` tombstone lives on
  `Document` only or also `DocumentVersion`; the recovery-surface shape; the retention-window config key).
- **Build order:** EPIC-015 (post-retention purge + legal hold + precedence) builds directly on this slice's
  soft-delete + retention-clock foundation and closes Phase 3.

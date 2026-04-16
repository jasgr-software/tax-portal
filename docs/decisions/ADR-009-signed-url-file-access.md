# ADR-009: Signed-URL File Access Pattern

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** SA (with user direction)
**Related:** ADR-002 (SQL Server), ADR-003 (Identity propagation), ADR-005 (RLS via Security Policies), ADR-008 (Object storage abstraction)

## Context

ADR-008 defines the `FileStorage` port. This ADR defines the **behaviour layer** — how the app uses that port to give clients controlled access to uploads and downloads, and how file objects and their metadata are organised. Requirements in scope:

- Signed URLs only — never public (REQ-FILE-003, REQ-NFR-002).
- Encryption at rest (REQ-FILE-003) — delivered by the adapter (ADR-008), not by the app.
- Soft-delete with 7-year retention after engagement completion (REQ-FILE-005, REQ-FILE-006).
- Version history — replacing a file retains the previous version (REQ-FILE-009).
- Folder organisation within an engagement (REQ-FILE-010), top-level by engagement + tax year (REQ-FILE-011).
- Only the accountant can delete files; clients cannot (REQ-FILE-004).

Hard-delete policy (REQ-IDNT-005) conflicts with retention (REQ-FILE-005) and indefinite client access (REQ-AUTH-008). The RA has flagged this as **CLARIF-005** and it is unresolved. This ADR does not resolve it — it carves out a section that will be filled in when CLARIF-005 is decided.

## Decision

**All document downloads and uploads happen through server-issued, time-limited signed URLs against the storage adapter (ADR-008). Objects are keyed opaquely by ID. Folder structure lives in the database, not in the storage path. Version history creates new key suffixes, not new rows at the same key. The app-side authorization query (via RLS-scoped `db`) is the gate before any URL is minted.**

### Storage key pattern

```
engagements/{engagementId}/documents/{documentId}/v{version}/{originalFilename}
```

All ID segments are UUIDs (ADR-002 PK convention). Examples:

```
engagements/7b2e1f8c-.../documents/4a9d6a12-.../v1/W-2-2025.pdf
engagements/7b2e1f8c-.../documents/4a9d6a12-.../v2/W-2-2025-corrected.pdf
```

Rules:

- **Top-level `engagements/{id}/`** — matches the coarse access boundary. Even if an adapter supports bucket-level signed URLs (broader than key-level), the engagement segment is the natural scope.
- **`documents/{documentId}/`** — app-owned UUID per logical document. Replacing a document keeps the same `documentId` and increments the `version` segment.
- **`v{version}/`** — integer starting at 1. Deletion (soft) does not decrement; a new upload after a soft-delete gets `v{latest + 1}`.
- **`{originalFilename}`** — carried through for download UX (so the browser's saved file has a meaningful name). **This is cosmetic, not authoritative** — the adapter tolerates arbitrary filename characters by URL-encoding. Authoritative filename lives in `Document.label` / `Document.originalFilename` columns.
- **No folder segment in the storage key.** Folder membership is a database relationship (`Document.folderId` → `Folder.id`), not a path. Rationale:
  - Renaming a folder would otherwise cascade to rewriting every key under it — expensive, race-condition-prone, and breaks already-issued signed URLs.
  - Moving a document between folders is a DB update, not an object copy.
  - Path-traversal / path-injection attack surface collapses: there is no user-supplied substring in the key except the filename, which is URL-encoded.

### Upload flow

The client (browser) never talks to the adapter through app-held credentials. Flow:

1. **Client requests upload URL.** POST `/api/documents/upload-url` with `{ engagementId, folderId, filename, contentType, sizeBytes }`.
2. **Server action / route handler** (runs under request pool, `db` with `SESSION_CONTEXT` set, ADR-003):
   a. Loads the `Engagement` row via `db`. If RLS filters it out (caller has no access), return 404.
   b. Loads the `Folder` row via `db`. Verifies `Folder.engagementId === engagementId`. If RLS filters or the check fails, return 404.
   c. Generates a new `documentId` (UUID) and determines the next `version` (1 if new, `latestVersion + 1` if replacing an existing document — caller passes `documentId` in the replace case).
   d. Inserts a `Document` row in `pending` state (see § Upload readiness) with the computed storage key. Insert runs under the **admin pool** (`adminDb`) because RLS BLOCK predicates on INSERT (ADR-005) need the FK chain to be consistent, and the row must exist before the upload completes. Authorization has already happened in steps 2a/2b against the request pool.
   e. Calls `storage.getSignedUploadUrl(key, { contentType, maxSizeBytes: 100 MB, ttlSeconds: 900 })`.
   f. Returns `{ uploadUrl, documentId, expiresAt }` to the client.
3. **Client PUTs the file body** directly to the signed URL with the exact `contentType` header it claimed. The adapter enforces size + content-type + expiry on the signed URL; a mismatch rejects at the storage layer.
4. **Client notifies server of completion.** POST `/api/documents/{documentId}/complete`. The server:
   a. Calls `storage.stat(key)` to verify the object exists and the reported size matches the claimed size within a tolerance.
   b. Updates the `Document` row from `pending` to `active` (under admin pool).
   c. Emits notifications, updates document-request status, etc.
5. **If step 4 never arrives**, a periodic reconciliation job (cron) runs `SELECT ... WHERE status = 'pending' AND createdAt < now() - INTERVAL 1 HOUR`, checks each against the adapter, and either promotes to `active` (if the object did land) or marks `orphaned` and schedules adapter-side deletion. Runs under admin pool.

### Download flow

1. **Client requests download URL.** POST `/api/documents/{documentId}/download-url` with optional `{ version }` (defaults to latest active version).
2. **Server action / route handler** (request pool, identity-bound via `SESSION_CONTEXT`):
   a. Loads the `Document` row (plus the target `Version` row if tracked as a separate table in schema — decided during Epic 001 Plan) via `db`. RLS filters to visible rows.
   b. If the document doesn't appear or `deletedAt IS NOT NULL` and caller is not ACCOUNTANT, return 404.
   c. Calls `storage.getSignedDownloadUrl(key, { ttlSeconds: 300, responseContentDisposition: attachment; filename="${safeFilename}" })`.
   d. Returns `{ downloadUrl, expiresAt }` to the client.
3. **Client GETs the signed URL.** Byte stream from the adapter to the browser.

### Signed URLs are never persisted

The URL returned in a server response is transient. The app does not:

- Store it in the DB.
- Cache it in an in-memory layer with a TTL (Redis, LRU, etc.).
- Log the full URL (including query-string signature) outside of dev mode — production logs include only the key + TTL.

Each download click / upload attempt triggers a fresh mint. The TTL caps from ADR-008 (default 5 min download, 15 min upload; hard max 1 hour) are enforced in the adapter wrapper.

### Version history

Semantics:

- Versions are a **new row and a new storage key per version**, not an overwrite. `Document` may still be the parent row with metadata; the per-version data (key, size, contentType, uploadedBy, uploadedAt) may live on `Document` directly for v1 or on a `DocumentVersion` child table if the schema warrants it — decided during Epic 001 Plan.
- Replacing a file means: upload completes successfully → old version rows flip `supersededAt = now()`, new row has `version = previousLatest + 1` and is marked `active`.
- Downloading a specific historical version is supported — `POST /api/documents/{id}/download-url?version=N`.
- Soft-deleting (REQ-FILE-006) applies at the document level — all versions become inaccessible to non-accountant callers via the RLS predicate's `deletedAt` check.

### Soft delete

Only the accountant can delete (REQ-FILE-004). Semantics:

- `Document.deletedAt = now()` set via admin pool (accountant's request handler validates role, then calls admin for the mutation).
- RLS predicate for `Document` includes `deletedAt IS NULL` in the CLIENT branch — soft-deleted rows vanish from client view.
- The accountant can still see soft-deleted documents in an archive view (same RLS predicate, ACCOUNTANT branch does not filter `deletedAt`).
- Storage objects are **not** deleted at soft-delete time — they live until the 7-year retention sweep or hard-delete (CLARIF-005 pending).
- Document requests tied to the soft-deleted document are not auto-resolved — an explicit flow handles that.

### Access-control summary

| Actor           | Download own document | Download other client's document | Upload to engagement | Delete (soft) | Delete (hard)                           |
|-----------------|-----------------------|----------------------------------|----------------------|---------------|-----------------------------------------|
| CLIENT          | Yes (via RLS)         | No (RLS returns 404)             | Yes (own engagement) | No            | No                                      |
| ACCOUNTANT      | Yes (all)             | Yes (all)                        | Yes (any)            | Yes           | Pending CLARIF-005                      |
| Anonymous       | No (no session)       | No                               | No                   | No            | No                                      |
| admin pool      | n/a (webhooks/cron)   | n/a                              | Yes (pre-create row) | Yes           | Yes (once CLARIF-005 resolves)          |

### Content-type + size enforcement

- **Allowed content types:** any (REQ-FILE-002). The app does not restrict content types. Antivirus / malicious-file scanning is a later consideration (Phase 4 or Phase 5).
- **Size cap in v1:** 100 MB per file. Enforced in the signed upload URL policy. Larger caps are evaluated at real-usage time; multipart/resumable uploads (beyond ADR-008's scope) are added if sustained demand emerges.
- **Filename sanitisation:** the `responseContentDisposition` header on signed download URLs uses an ASCII-safe rendering of `Document.originalFilename`. The storage key's `{originalFilename}` segment is URL-encoded; it never goes back into user-supplied contexts unescaped.

### Reconciliation and integrity

- **Pending-upload sweep** — cron runs every hour, under admin pool, to promote or orphan stale `pending` `Document` rows (see Upload flow step 5).
- **Orphan-object sweep** — cron runs nightly, under admin pool, to list adapter objects with no corresponding `Document` row and schedule them for deletion after a 24-hour grace window (prevents race conditions with in-flight uploads that have a Document row but haven't committed yet).
- **Integrity check** — nightly, admin pool, compares `Document.storageKey` against `storage.stat(key)` for active rows. Flags missing objects for operator review. Runs under admin pool, results land in `docs/operations/runbook.md`-flagged channels.

## Hard-Delete Policy (pending CLARIF-005)

CLARIF-005 (from SRS § 7) asks whether REQ-IDNT-005's hard-delete overrides REQ-FILE-005's 7-year retention, and whether hard-delete physically removes storage objects or only DB rows. This ADR **does not resolve CLARIF-005**. It carves out a slot and proposes a default that the RA / user can accept or revise.

**Proposed default (not yet accepted):**

- Hard-delete marks the `User`, `Engagement`, `Document` rows with a tombstone (`hardDeletedAt`), which hides them from all app queries (including ACCOUNTANT views).
- **Storage objects are not immediately purged.** They remain until the 7-year retention sweep from engagement completion, at which point the objects and the tombstoned rows are both physically deleted.
- A separate admin-only "purge now" path (paperwork-gated, audit-logged) physically deletes storage objects before the 7-year boundary when regulatory or user-rights reasons require it (GDPR erasure, accidental sensitive upload, etc.).
- Clerk user deletion is a separate call — driven through Clerk's admin API when the hardDelete decision is made.

Once CLARIF-005 is resolved, this ADR is amended (Status stays `Accepted`, amendment date added, and this section is replaced with the accepted policy). If the resolution changes the storage-object lifecycle materially, a retention sweep utility is designed at that time.

## Alternatives considered

### Proxy downloads through the app

App-issued short-lived URL → browser GETs `/api/documents/{id}/download` → app streams bytes from adapter to client. Rejected:

- Egress double-tax (adapter → app → client).
- App becomes a streaming bottleneck; large files tie up Node request-handling slots.
- Signed URLs already solve authorization + confidentiality with less code.

### Include caller identity in the storage key

`engagements/{engagementId}/documents/{documentId}/clients/{clerkUserId}/v{n}/...`. Tempting for audit-trace purposes. Rejected:

- Explodes the key count (one version per caller doesn't make sense — the document is the document).
- Multi-participant engagements (REQ-AUTH-007) make "which client owns the key" ambiguous.
- Audit trail belongs in the DB (temporal tables per ADR-002), not in storage paths.

### Folder structure reflected in the storage key

`engagements/{engagementId}/folders/{folder-path}/documents/{documentId}/v{n}/...`. Matches the visible folder UI. Rejected:

- Folder renames cascade to object copies (O(n) objects per rename).
- Folder moves across engagements (unlikely but possible) become expensive rewrites.
- Already-issued signed URLs break when keys change — URL leases become fragile.
- DB-resident folder membership is trivial to re-parent.

### Public URLs with a "security through obscurity" UUID

Long-form UUID URLs that anyone with the link can access. Rejected on sight — violates REQ-FILE-003 explicitly, violates Tenet 1, violates basic confidentiality for tax documents.

### Content-addressed storage (key = SHA-256 of content)

Deduplicates identical files across documents. Rejected:

- Signed-URL caching semantics become confusing — one object has many "owning" documents.
- Soft-delete of a logical document doesn't imply delete of the content-addressed object, so deletion semantics diverge from document semantics. Unnecessary complexity for v1.
- 7-year retention enforcement requires tracking "which document(s) last referenced this object" — a reference-count sidecar that doesn't pull its weight.

### Pre-signed URL renewal (long-lived polling)

Client holds a long-lived URL that auto-renews by calling a refresh endpoint. Rejected — the fresh-mint-per-click pattern is simpler, has no renewal race conditions, and matches TTL caps naturally.

### Server-side antivirus scan in v1

ClamAV / Windows Defender / third-party scanner on every upload before marking `active`. Deferred to a later phase. Reasoning: the customer base is tiny (one accountant + low-dozens of clients), the threat model is "trusted known clients with occasional document ambiguity," and AV integration adds significant operational complexity. Scanning is revisited at Phase 4 or 5.

## Consequences

- **Authorization-then-sign is the load-bearing pattern.** Any new document-related endpoint follows this shape. The SA reviews document-access endpoints in every future epic to ensure the RLS query runs **before** the signed URL mint.
- **Storage keys are stable across folder operations.** Folders can be renamed, reparented, deleted in the DB without any adapter traffic. Already-issued URLs remain valid for their TTL.
- **Version history is explicit.** A `version` column (or `DocumentVersion` child table) is part of the Epic 001 schema. Replacement = new row + new storage key, never an overwrite.
- **Pending-state rows are real.** The two-phase upload (create row → upload → complete) means a fraction of uploads will land in `pending` and need reconciliation. The cron sweep is part of v1, not a Phase 5 concern.
- **Orphan objects are managed.** Adapter-side objects without DB rows are detected nightly. A 24-hour grace window avoids deleting in-flight uploads.
- **Hard delete is not shipped in Epic 001.** Soft delete is. Hard-delete behaviour depends on CLARIF-005, which is blocked on a user decision; Epic 008 (Polish & Security Audit) is where hard-delete lands once CLARIF-005 is resolved.
- **Storage-side integrity monitoring lives in ops.** `runbook.md` gains a "document storage integrity" section during Epic 001 DevOps task. Missing objects surface to the accountant via a notification, not via a silent 404 at user-click time.
- **TTL discipline is centralised.** Request → adapter.signRequest paths all go through a single wrapper that enforces the TTL caps. A PR that bypasses the wrapper fails code review + the `validate-gates.sh` extension that lints signed-URL TTL sources.
- **Signed URLs are never in logs (prod).** Production logging of URLs omits the query-string signature. Dev logs are permissive. Documented in `runbook.md`.
- **CLARIF-005 is tracked.** This ADR owns the hard-delete policy slot. When CLARIF-005 resolves, the SA amends this ADR in the Close-prep of the epic that delivers hard-delete.

## Related

- **ADR-002** — SQL Server; defines UUID-based `documentId`, `Document` table shape.
- **ADR-003** — `SESSION_CONTEXT` identity propagation; enables RLS-scoped authorization check before signing.
- **ADR-005** — RLS via Security Policies; RLS on `Document` + `Folder` is the gate that makes authorize-then-sign safe.
- **ADR-008** — Object storage abstraction; defines the `FileStorage` port this ADR consumes.
- **SRS** — REQ-FILE-001 through REQ-FILE-012, REQ-NFR-002, REQ-AUTH-008, REQ-IDNT-005, CLARIF-005.
- **Tenet 1** — Security and data privacy non-negotiable.
- **Tenet 5** — Clients never lose access; soft-delete + 7-year retention derive from this.

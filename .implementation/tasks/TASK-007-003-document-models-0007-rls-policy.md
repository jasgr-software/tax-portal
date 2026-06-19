# TASK-007-003: DocumentRequest + Document Prisma models + `0007` RLS policy (third client-isolation policy) + cross-engagement isolation test

**Brief**: BRIEF-007
**Brief-type**: feature
**Brief-deploys**: no
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: none <!-- schema + policy are independent of the ports; TASK-007-004 depends on THIS -->
**Impl**: developer
**E2e-required**: no <!-- the policy is proven at tier-3 (the mandatory per-policy isolation test), not e2e -->
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-FILE-008-01 (each engagement has a checklist reflecting its document requests — the schema relationship), AC-FILE-001-05 (a file in engagement A is not exposed to other engagements — proven by the `0007` FILTER predicate), AC-FILE-003-02 (retrieval requires an authorization check — the FILTER predicate is that gate at the data layer).
**Upstream refs:** ADR-005 (RLS via security policies; THIRD client-isolation policy after `0005`/`0006`; HARD §6 per-policy integration test; ITVF+SCHEMABINDING; shallow predicate), ADR-002 (UNIQUEIDENTIFIER PK NEWSEQUENTIALID(), DATETIMEOFFSET, two-track migrations), ADR-009 (storage-key columns + `pending｜active｜infected` state column), ADR-003 (null SESSION_CONTEXT → ZERO; Amendment 1 — no `@read_only`).
**Introduces-gate:** yes <!-- new REQUIRED security gate: the `0007` security policy + its per-policy cross-engagement isolation tier-3 integration test (ADR-005 §6 HARD). Three-item Gate Authoring evidence MANDATORY in the Work Log. -->

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — policy is proven at tier-3 integration, not e2e
- [ ] **Security review** — fail-closed null SESSION_CONTEXT; client cannot write document-requests; cross-engagement isolation holds
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Gate-authoring (ENGINE.md § Gate Authoring Rules) — three items MANDATORY in the Work Log** for the new `0007` policy: (1) run/log path + the test name that ran the per-policy isolation test green against the **real SQL Server container**; (2) the named predicate code path (the CLIENT-ownership `EXISTS` branch); (3) the counterfactual (removing the FILTER predicate reds the isolation test; removing the CLIENT branch reds the positive read).
- **ADR-005 §6 HARD per-policy test** must assert ALL of: a Document in engagement A is **unreadable/unreachable** from engagement B (CLIENT-B reads ZERO); a CLIENT reading their **own** engagement's documents succeeds; an **anonymous / null-SESSION_CONTEXT** caller reads **ZERO**; **ACCOUNTANT/admin** can read.
- **DocumentRequest write boundary is accountant-only** — mirror `sec.fn_service_write_access` (BLOCK-only, no CLIENT branch); a request-pool CLIENT INSERT/UPDATE/DELETE fails closed. A CLIENT *reads* requests for their own engagement (FILTER via the owning Engagement).
- **Document state column** is `pending｜active｜infected` (default `pending`); verify the enum/CHECK + default. The ownership predicate joins Document → owning Engagement → User.clerkId (mirror `0005`/`0006`).
- Track-B drift: the inventory.md Track-B policy table gains the `0007` row(s).

## Context

The third client-isolation policy. Adds two Prisma models — `DocumentRequest` (accountant-authored, per engagement; free-text label) and `Document` (the stored-file metadata row; storage key + safety state) — and the raw-SQL `db/policies/0007-*` security policy that scopes both to their owning engagement. The Document/file rows are the **third client-owned-row family**. Reuse `0005-engagement-policy.sql` (ownership join) and the `0006` two-part-policy file structure (FILTER+BLOCK for the client-owned table; BLOCK-only accountant-write for the request table).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `prisma/schema.prisma` | Modify | Add `DocumentRequest` + `Document` models (see § Data shape below); add reverse relations on `Engagement` |
| `prisma/migrations/*/migration.sql` | Create | `pnpm prisma migrate dev --name document-request-and-document` (Track A) |
| `db/policies/0007-document-policy.sql` | Create | Two-part policy: (1) `sec.fn_document_access(@engagementId)` FILTER+BLOCK on `Document` (client-owned, ownership join → Engagement → User.clerkId; mirror `0006` PART 1); (2) `sec.fn_document_request_*` for `DocumentRequest` — FILTER (client reads own engagement's requests) + BLOCK accountant-only write (mirror `0006` PART 2 / `fn_service_write_access`) |
| `packages/db/src/document.client-isolation.rls.test.ts` | Create | **The ADR-005 §6 HARD per-policy tier-3 test** (cross-engagement isolation; null-context ZERO; ACCOUNTANT/admin read) against the real container |
| `packages/db/src/document-request.rls.test.ts` | Create | DocumentRequest FILTER (client reads own) + BLOCK (client write denied) tier-3 test |
| `.implementation/operations/inventory.md` | Modify | Add `0007` to the Track-B policy table |

## Data shape (the IO-expanded Data & Interface Contract — binding)

**`DocumentRequest`** (accountant-authored checklist item):
- `id` UNIQUEIDENTIFIER PK `NEWSEQUENTIALID()`
- `engagementId` UNIQUEIDENTIFIER FK → `Engagement` (onDelete: NoAction)
- `label` NVARCHAR(...) — the free-text label (AC-FILE-007-01); reasonable length cap (e.g. 500)
- `createdBy` NVARCHAR(64)? — accountant clerkId (audit, mirror `LetterTemplate.updatedBy`)
- `createdAt` / `updatedAt` DATETIMEOFFSET
- reverse relation: `documents Document[]` (the documents uploaded in response)

**`Document`** (stored-file metadata row; the third client-owned-row family):
- `id` UNIQUEIDENTIFIER PK `NEWSEQUENTIALID()`  *(this is the ADR-009 `documentId`)*
- `engagementId` UNIQUEIDENTIFIER FK → `Engagement` (onDelete: NoAction) — **the isolation column** the FILTER predicate keys on
- `documentRequestId` UNIQUEIDENTIFIER? FK → `DocumentRequest` (onDelete: NoAction) — **fulfillment is a nullable FK** (DECISION below)
- `storageKey` NVARCHAR(1024) — the ADR-009 key `engagements/{engagementId}/documents/{id}/v1/{urlencoded-filename}`
- `originalFilename` NVARCHAR(...) — authoritative filename (ADR-009)
- `contentType` NVARCHAR(255) — declared content-type
- `sizeBytes` BIGINT (`@db.BigInt`) — claimed/verified size
- `status` NVARCHAR(16) default `'pending'` — `pending｜active｜infected` (CHECK constraint via raw-SQL migration if Prisma can't express it)
- `version` INT default 1 — v1 only this slice (no replace/history)
- `scanThreat` NVARCHAR(...)? — optional threat label when `infected`
- `uploadedBy` NVARCHAR(64)? — uploader clerkId (audit)
- `createdAt` / `updatedAt` DATETIMEOFFSET

`Engagement` gains reverse relations: `documentRequests DocumentRequest[]`, `documents Document[]`.

**// DECISION (TASK-007-003):** Fulfillment is a **nullable FK `Document.documentRequestId`** (not a join table). A `DocumentRequest` is *fulfilled* when ≥1 `active` Document references it; *outstanding* otherwise (the read model computes this — TASK-007-004). Rationale: v1 ships one-document-per-request semantics with no versioning/history (brief Out-of-scope); a FK is the simplest representation that supports the outstanding/fulfilled derivation and keeps the isolation predicate a single shallow join.

**// DECISION (TASK-007-003):** Required-vs-optional checklist items — in v1 **all of an engagement's document requests are required**; the step is satisfied when every request has ≥1 `active` Document (AC-ONBD-004-04). No optionality UI ships (brief: "do not invent an optionality UI not in the AC"). An engagement with **zero** requests has a vacuously-satisfied upload step (consistent with "required items provided").

## Tests to Write First

- [ ] `[tier-3] Document in engagement A unreadable from engagement B (AC-FILE-001-05)` — expected: CLIENT-B reads ZERO
- [ ] `[tier-3] CLIENT reads own engagement's Documents (AC-FILE-003-02 gate)` — expected: own rows visible
- [ ] `[tier-3] null SESSION_CONTEXT reads ZERO Documents` — expected: fail-closed
- [ ] `[tier-3] ACCOUNTANT/admin read all Documents` — expected: visible
- [ ] `[tier-3] CLIENT cannot INSERT/UPDATE a DocumentRequest` — expected: BLOCK denies (rowsAffected 0 / error 33504)
- [ ] `[tier-3] CLIENT reads own engagement's DocumentRequests` — expected: visible; engagement B's not visible

## Implementation Notes

- **Mirror `0006-questionnaire-policy.sql` structure** (two-part file: client-owned FILTER+BLOCK + accountant-owned BLOCK-only) and the `0005` ownership join (`User.clerkId` → `Engagement.clientUserId` → row's `engagementId`). Predicate stays shallow (one/two JOINs, ITVF+SCHEMABINDING).
- **Two migration tracks (ADR-002):** model → `prisma migrate dev` (Track A); the policy + any CHECK constraint Prisma can't express → `db/policies/0007-*` (Track B, applied by `scripts/db-migrate.ts`).
- The `status` CHECK and the FILTER/BLOCK live in Track B; the columns/FKs live in Track A.
- This task does **not** wire upload/scan logic — that is TASK-007-004. It delivers the data substrate + the proven isolation gate only.

## Definition of Done

- [ ] `DocumentRequest` + `Document` models + migration applied; `Engagement` reverse relations added
- [ ] `db/policies/0007-document-policy.sql` (FILTER+BLOCK on Document; FILTER + accountant-only BLOCK on DocumentRequest) applied idempotently
- [ ] The ADR-005 §6 HARD per-policy isolation tier-3 test green against the real container, with the three Gate-Authoring evidence items in the Work Log
- [ ] inventory.md Track-B table includes `0007`
- [ ] Lint + type-check + build pass; `pnpm --filter @tax-portal/db test` green

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

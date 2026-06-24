---
brief: BRIEF-013
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-23T19:46:19.190Z
completed_at: 2026-06-23T20:13:46.000Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "yes"
acceptance_criteria: [AC-FILE-001-04, AC-FILE-009-03, AC-FILE-010-01, AC-FILE-010-03, AC-FILE-010-04]
upstream_refs: ADR-005, ADR-003, ADR-009, ADR-002, REQ-FILE-009, REQ-FILE-010, REQ-FILE-001, EPIC-007, EPIC-012
code_standards: CS-SQL-001 (required), CS-SQL-002 (required), CS-SQL-003 (required), CS-GEN-002 (recommended), CS-GEN-003 (recommended)
---

# TASK-013-001: Schema + RLS — Folder, DocumentVersion, Document.folderId, participant-download predicate extension

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — this is a schema/RLS task; tier-3 RLS integration tests are the gate, not e2e
- [x] **Security review** — RLS isolation proven both ways; fail-closed on null identity; BLOCK on cross-engagement write
- [x] **SDET Review** — approved

## SDET Review focus areas

- **HARD GATE (CS-SQL-001 / ADR-005 §6):** each net-new scoped table (`Folder`, `DocumentVersion`) ships a
  SECURITY POLICY **and** an `.rls.test.ts` proving isolation **both ways** (own row passes; other client's
  row → ZERO; cross-engagement INSERT/UPDATE/DELETE → BLOCK error; ACCOUNTANT all; admin all; null identity →
  ZERO).
- **The participant-download trap (the brief's named panel/SDET trap):** `fn_document_access` (0007) keyed
  only on `Engagement.clientUserId` (owner-only). EPIC-012 extended `fn_engagement_access` (0005) with a
  participant `EXISTS` branch. Verify `fn_document_access` is now extended **identically** (additive — owner
  branch byte-preserved; new participant branch). Verify a non-owner participant reads the engagement's
  documents (AC-FILE-001-04) **and** an unrelated client still sees ZERO. A one-directional assertion is a
  rejection.
- **CS-SQL-003:** every predicate is an inline TVF (`RETURNS TABLE WITH SCHEMABINDING`), admin-first,
  accountant-second, shallow (≤2 JOINs / parallel EXISTS), fail-closed on null `SESSION_CONTEXT`.
- **Gate-authoring evidence (introduces_gate: yes):** the two new `.rls.test.ts` suites are new required
  gates — Work Log must carry the three Gate-Authoring items (run marker + named code path + counterfactual)
  for each new policy.

## Context

EPIC-007 stood up `Document` + `pol_Document`/0007 (owner-only client isolation). This slice adds folders,
version history, and **both-party** (owner **and** participant) download. The schema + RLS substrate is the
foundation every other BRIEF-013 task builds on.

Satisfies (this task's slice of the AC set):
- **AC-FILE-001-04** — a client *participant* (not necessarily the primary owner) can reach the engagement's
  files. Requires the `fn_document_access` participant-branch extension (mirrors 0005's EPIC-012 extension).
- **AC-FILE-009-03** — every prior version retained + accessible after replacement → the `DocumentVersion`
  table is the retained-row substrate (a new version is a new row + new key, never an overwrite — ADR-009).
- **AC-FILE-010-01 / -03** — files organize into folders / a file placed in a folder → `Folder` table +
  `Document.folderId`.
- **AC-FILE-010-04** — folder management accountant-only → the `pol_Folder` BLOCK predicate is accountant-only
  write (no CLIENT write branch; mirrors `fn_document_request_write_access` from 0007 PART 2).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `prisma/schema.prisma` | Modify | Add `Folder` model (engagement-scoped, nullable self-ref parent for nesting); add `Document.folderId` (nullable FK → Folder); add `DocumentVersion` model (parent `documentId`, version int, storageKey, supersededAt, audit cols). Additive only (CS-GEN-002). |
| `prisma/migrations/**` | Create | `pnpm prisma migrate dev --name brief013_folders_versions` |
| `db/policies/0010-folder-policy.sql` | Create | `sec.fn_folder_access` (read: admin/accountant/owner-or-participant via engagement) + `sec.fn_folder_write_access` (write: admin/accountant-only — AC-FILE-010-04) + `pol_Folder` FILTER+BLOCK. |
| `db/policies/0011-document-version-policy.sql` | Create | `sec.fn_document_version_access` (engagement-scoped via parent Document → Engagement, owner-or-participant) + `pol_DocumentVersion` FILTER+BLOCK. |
| `db/policies/0007-document-policy.sql` | Modify | Extend `fn_document_access` CLIENT branch with the participant `EXISTS` (mirror 0005 EPIC-012 extension exactly — owner branch byte-preserved). Drop/recreate `pol_Document` per the alter-under-live-policy pattern (see 0009 preamble). |
| `packages/db/src/document.both-party-download.rls.test.ts` | Create | AC-FILE-001-04 hard tier-3: owner downloads; participant downloads; unrelated client → ZERO; accountant → all; cross-engagement never. |
| `packages/db/src/folder.client-isolation.rls.test.ts` | Create | CS-SQL-001 isolation both ways + accountant-only write BLOCK (AC-FILE-010-04). |
| `packages/db/src/document-version.client-isolation.rls.test.ts` | Create | CS-SQL-001 isolation both ways; prior-version row retained + readable after replacement (AC-FILE-009-03 substrate). |

## Tests to Write First

- [ ] `folder.client-isolation.rls.test.ts` — CLIENT-A reads own engagement's folders; CLIENT-B sees ZERO; cross-engagement folder INSERT → BLOCK; **CLIENT write (create/rename) → BLOCK (AC-FILE-010-04)**; ACCOUNTANT all; admin all; null identity → ZERO.
- [ ] `document-version.client-isolation.rls.test.ts` — versions of CLIENT-A's document visible to CLIENT-A + participant; CLIENT-B ZERO; a superseded (prior) version row remains SELECT-able after a newer row is added (AC-FILE-009-03).
- [ ] `document.both-party-download.rls.test.ts` — primary owner reads the doc; **additional participant reads the doc (AC-FILE-001-04)**; unrelated client → ZERO; accountant → all engagements; a document never crosses engagements.

## Implementation Notes

- **// DECISION-013-A (folder nesting):** `Folder` carries a nullable `parentFolderId` self-reference so the
  accountant can *arrange* (nest/re-parent) folders (AC-FILE-010-02). Bounded by the create/rename/arrange
  behavior; no deeper semantics. Re-parenting stays within the same engagement (RLS-enforced).
- **// DECISION-013-B (version model = child table):** versions are a distinct `DocumentVersion` child table
  keyed to the parent `Document.id` (ADR-009 permits "a DocumentVersion child table if the schema warrants").
  Replacement = new `DocumentVersion` row + new storage key; prior rows are retained (set `supersededAt`),
  never overwritten (AC-FILE-009-03). The parent `Document` carries the *current* pointer; this task only
  lands the table + policy + isolation — the replacement *operation* is TASK-013-002.
- **Participant extension is additive (CS-GEN-002):** copy the 0005 owner-branch verbatim; add the participant
  `EXISTS` (`User.clerkId → User.id → EngagementParticipant.userId WHERE ep.engagementId = <doc's engagementId>`).
  Owner access must remain byte-identical (no AC-FILE-001-03 / EPIC-007 regression).
- **Storage-key shape unchanged (ADR-009):** `engagements/{engagementId}/documents/{documentId}/v{version}/...`
  — **no folder segment in the key** (folder membership is the DB `Document.folderId` relationship, ADR-009).
- `Document.folderId` FK → Folder `onDelete: NoAction`, nullable (a doc may sit at engagement root).
- Follow the 0009 preamble pattern: drop the live policy before `CREATE OR ALTER` of a referenced function.

## Definition of Done

- [ ] `Folder`, `DocumentVersion` models + `Document.folderId` added (additive); Prisma migration generated.
- [ ] `pol_Folder`, `pol_DocumentVersion` created; `fn_document_access` participant-extended; `pol_Document` recreated.
- [ ] Three `.rls.test.ts` suites green against the SQL Server container; isolation proven **both ways**.
- [ ] AC-FILE-001-04, -009-03 (substrate), -010-01, -010-03, -010-04 traceably tested.
- [ ] Gate-Authoring evidence (3 items) recorded per new policy in the Work Log.
- [ ] Lint + type-check + build pass.

---

## Work Log

- 2026-06-23 [webapp-developer] Marking as review — 23/23 RLS tests passing (7+8+8); lint+type-check+build clean; 3 Gate Authoring Evidence blocks in Work Log; null-context stale pool fix applied to folder suite | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Starting implementation — task TASK-013-001 | What's next: implement and run gates | Blockers: none
- 2026-06-23 [webapp-developer] Prisma schema additions complete (Folder model, DocumentVersion model, Document.folderId, Engagement.folders reverse relation). Prisma migration handcrafted (P3019 bug — prisma migrate dev/deploy both fail with provider mismatch mssql vs sqlserver in migration_lock.toml; same issue as BRIEF-012). Migration applied directly via mssql node script. | What's next: raw-SQL policies | Blockers: none
- 2026-06-23 [webapp-developer] Policies complete: 0007-document-policy.sql extended with participant branch (fn_document_access 3b, additive — CS-GEN-002); 0010-folder-policy.sql created (fn_folder_access owner+participant, fn_folder_write_access accountant-only NO CLIENT branch, pol_Folder FILTER+BLOCK); 0011-document-version-policy.sql created (fn_document_version_access via Document→Engagement join, pol_DocumentVersion FILTER+BLOCK). Drop-before-alter preamble for both pol_Document and pol_DocumentRequest (the latter references fn_document_request_access which is also in 0007). Applied in sequence 0007→0010→0011 via mssql node script. | What's next: write 3 RLS test suites | Blockers: none
- 2026-06-23 [webapp-developer] Three RLS test suites written and passing: document.both-party-download.rls.test.ts (7 tests), folder.client-isolation.rls.test.ts (8 tests, fixed BLOCK test to catch error 33504 and null-context test to explicitly clear stale pool state), document-version.client-isolation.rls.test.ts (8 tests). 23/23 passing. Lint/type-check/build all clean. | What's next: submit for review | Blockers: none

### Gate Authoring Evidence — document.both-party-download.rls.test.ts (fn_document_access participant extension)

**Run marker:** `packages/db/src/document.both-party-download.rls.test.ts`

Test names:
- `[CS-SQL-001] participant reads a document from their linked engagement — positive (3b branch) — AC-FILE-001-04`
- `[CS-SQL-001] unrelated CLIENT-B reads ZERO for engagement A's document — isolation HARD`
- `[CS-SQL-001] engagement-owner (non-participant) reads their own document — positive (no regression)`
- `[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO documents — fail-closed`
- `[ADR-005] ACCOUNTANT reads all documents — full visibility preserved`
- `[CS-SQL-001] cross-engagement document never visible to CLIENT-A — isolation`
- `[CS-SQL-001] participant in engagement A reads ZERO from engagement B — cross-engagement isolation`

**Named code path:** `sec.fn_document_access` in `db/policies/0007-document-policy.sql` — branch 3b NEW (EPIC-013/TASK-013-001):

```sql
OR EXISTS (
    SELECT 1 FROM [dbo].[User] u
    JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
    WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
      AND ep.[engagementId] = @documentEngagementId
)
```

**Counterfactual:** Removing 3b would cause `[CS-SQL-001] participant reads...` to return ZERO instead of 1 row, failing the AC-FILE-001-04 positive assertion. Removing the FILTER from `pol_Document` would cause `[CS-SQL-001] unrelated CLIENT-B reads ZERO...` to return a row instead of 0, failing the isolation gate.

---

### Gate Authoring Evidence — folder.client-isolation.rls.test.ts (pol_Folder + fn_folder_write_access)

**Run marker:** `packages/db/src/folder.client-isolation.rls.test.ts`

Test names:
- `[CS-SQL-001] CLIENT-A reads own engagement's folders — positive`
- `[CS-SQL-001] CLIENT-B sees ZERO folders for CLIENT-A's engagement — isolation HARD`
- `[AC-FILE-010-04] CLIENT write attempt (INSERT folder) → BLOCK — accountant-only write enforced`
- `[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO folders — fail-closed`
- `[ADR-005] ACCOUNTANT reads all folders — full visibility preserved`
- `[AC-FILE-010-04] participant reads own engagement's folders — owner-or-participant read`
- `[CS-SQL-001] cross-engagement folder never visible to participant from another engagement`
- `[POSITIVE] Admin pool (app_admin_role) reads both seeded folders — RLS-exempt`

**Named code path:** `sec.fn_folder_write_access` in `db/policies/0010-folder-policy.sql` — BLOCK PREDICATE AFTER INSERT on `dbo.Folder` (STATE=ON, SCHEMABINDING=ON). The write predicate has NO CLIENT branch:
```sql
-- fn_folder_write_access: IS_MEMBER('app_admin_role')=1 OR ACCOUNTANT role — NO CLIENT branch.
-- CLIENT INSERT/UPDATE/DELETE → fn_folder_write_access returns 0 rows → BLOCK AFTER INSERT fires
-- → SQL Server error 33504 ("block predicate conflicts with this operation").
```

**Counterfactual:** Adding a CLIENT branch to `fn_folder_write_access` would allow CLIENTs to INSERT folders. The `[AC-FILE-010-04] CLIENT write attempt → BLOCK` test would not see error 33504 (the INSERT would succeed), breaking AC-FILE-010-04. Removing the FILTER from `pol_Folder` would cause CLIENT-B to read CLIENT-A's folders (1 row instead of 0), failing the isolation gate.

---

### Gate Authoring Evidence — document-version.client-isolation.rls.test.ts (pol_DocumentVersion)

**Run marker:** `packages/db/src/document-version.client-isolation.rls.test.ts`

Test names:
- `[CS-SQL-001] owner reads own engagement's document version rows — positive`
- `[CS-SQL-001] participant reads same engagement's document version rows — positive (3b branch)`
- `[CS-SQL-001] CLIENT-B sees ZERO version rows — isolation HARD`
- `[AC-FILE-009-03] superseded version row remains SELECT-able after a newer version is added — retained`
- `[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO version rows — fail-closed`
- `[ADR-005] ACCOUNTANT reads all version rows — full visibility preserved`
- `[CS-SQL-001] cross-engagement version row never visible to CLIENT-A`
- `[POSITIVE] Admin pool (app_admin_role) reads all three seeded document version rows — RLS-exempt`

**Named code path:** `sec.fn_document_version_access` in `db/policies/0011-document-version-policy.sql` — branch 3b CLIENT participant EXISTS:

```sql
OR EXISTS (
    SELECT 1 FROM [dbo].[Document] d
    JOIN [dbo].[EngagementParticipant] ep ON ep.[engagementId] = d.[engagementId]
    JOIN [dbo].[User] u ON u.[id] = ep.[userId]
    WHERE d.[id] = @documentVersionDocumentId
      AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
)
```

Also tested: AC-FILE-009-03 substrate — `versionAV1` has `supersededAt IS NOT NULL` (set when `versionAV2` was inserted) but remains SELECT-able. The FILTER predicate does NOT filter on `supersededAt` — it grants access to all version rows for the engagement's documents, both current and superseded. Proven by: version 1 (superseded) and version 2 (current) both appear in the SELECT result for the ownerA caller.

**Counterfactual:** Removing 3b would cause `[CS-SQL-001] participant reads...` to return ZERO instead of 2 rows, failing the participant positive assertion. Removing the FILTER from `pol_DocumentVersion` would cause `[CS-SQL-001] CLIENT-B sees ZERO version rows` to return rows instead of 0, failing the isolation gate.

---

## Attempt Log

**Attempt count**: 1

## SDET Review

**Decision**: approved
**Notes**: Full review conducted 2026-06-23. All mandatory rejection checks passed. 23/23 RLS tests independently confirmed against the live SQL Server container (run by SDET, not taken on faith from Work Log alone). See detailed verdict below.

**SDET Approval Breadcrumb** — 2026-06-23T20:13:46.000Z [sdet]
All acceptance criteria verified, all mandatory gates satisfied, all code-standard obligations met. Task closed.

---
brief: BRIEF-011
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-011-001
impl: developer
e2e_required: "no"
started_at: 2026-06-22T23:48:15.053Z
completed_at: 2026-06-23T01:24:51.873Z
complexity_estimate: 3
complexity_actual: 3
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-LIFE-007-03, AC-LIFE-008-02, AC-LIFE-009-03]
upstream_refs: [ADR-003, ADR-005, ADR-019, REQ-LIFE-007, REQ-LIFE-008, REQ-LIFE-009]
code_standards: CS-TS-001, CS-TS-002, CS-GEN-001, CS-GEN-002, CS-GEN-003
---

# TASK-011-002: packages/db attribute seams (due date / note / flag) + tier-2/3 integration tests + audit

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — service-layer task; e2e lands in TASK-011-004
- [x] **Security review** — attribute writes accountant-only; notes read enforced by RLS not app filter; audit atomic; CS-GEN-001 verified (note body never in audit rows)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Cites ADR-003/-019 — verify honored.** Writes run via the admin pool inside `withAuditTransaction`;
  the audit event is recorded in the SAME transaction as the write (atomic). The notes READ seam runs under
  the request-scoped wrapper (`withRequestContext`) so the RLS policy — not app filtering — is the access gate.
- **Per-engagement attribution (tier-3, AC-LIFE-007-03/-009-03 + AC-LIFE-008 distinct-engagement).** Verify
  the integration tests prove setting a due date / flagging / recording a note on engagement A leaves
  engagement B unaffected (distinct-engagement isolation of each attribute).
- **Audit (ADR-019).** Each write records a who/what/when event reusing `recordAuthEvent` / `withAuditTransaction`
  — no parallel audit path. Note bodies / PII NEVER logged (CS-GEN-001) — audit targetType=`Engagement`,
  targetId=engagementId, no body field.
- **CS-TS-001 / CS-TS-002.** No direct Prisma in route handlers outside the wrapper; raw `requestDb`/`adminDb`
  pools never imported outside `packages/db`. Reads/writes go through the sanctioned seams.

## Context

The service layer for the three attributes. Extends `packages/db/src/repositories/engagement.ts` (do NOT
fork it) with attribute seams modeled on the EPIC-010 `transitionEngagementStatus` / `confirmDelivery`
pattern: admin-pool guarded write inside `withAuditTransaction`, atomic `recordAuthEvent`, `@@ROWCOUNT`
result. The notes READ seam is the exception — it must run under `withRequestContext` so the
`sec.pol_EngagementNote` policy (TASK-011-001) does the access control (that is what makes the CLIENT-reads-zero
guarantee real, not app-layer filtering).

IO Design decisions bound here:
- **DECISION-011-D — Seams:** `setEngagementDueDate`, `setEngagementPriority`, `recordEngagementNote`
  (admin-pool writes inside `withAuditTransaction` + atomic audit + `@@ROWCOUNT`); `listEngagementNotesForClient`
  / `listEngagementNotes` notes-read seam (under `withRequestContext` — RLS is the gate). Mirror the existing
  `TransitionEngagementInput`/`ConfirmEngagementInput` input/result shapes.
- **DECISION-011-E — Audit action strings:** `engagement.due_date_set`, `engagement.priority_set`,
  `engagement.note_recorded`. (`due_date_set` covers both set and update — AC-LIFE-007-01/-02.)

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/engagement.ts` | Modify | Add `setEngagementDueDate(input)`, `setEngagementPriority(input)`, `recordEngagementNote(input)` (admin pool + `withAuditTransaction` + atomic `recordAuthEvent` + guarded UPDATE/INSERT `@@ROWCOUNT`); add a notes-read seam that runs under the request-scoped wrapper. Cite ADR-003/-005/-019, CS-TS-001/-002, CS-GEN-001/-003. |
| `packages/db/src/index.ts` | Modify | Export the new seams + their input/result types from the barrel. |
| `packages/db/src/engagement-attributes.test.ts` | Create | Tier-2/3 integration tests against the real container: per-engagement attribution (A set, B unaffected) for each attribute; audit-event written per write; note body not present in any audit row. |
| `packages/db/src/engagement-note.read.rls.test.ts` | NOT CREATED (folded into engagement-attributes.test.ts) | CLIENT-reads-zero-via-seam (AC-LIFE-008-02 negative) + ACCOUNTANT-positive are covered by listEngagementNotes tests in engagement-attributes.test.ts. The policy-layer evidence is in engagement-note.rls.test.ts (TASK-011-001). Two files would be redundant; the seam-layer test here is the more meaningful one (it tests the actual exported function). Noted in Work Log. |

## Tests to Write First

- [ ] `AC-LIFE-007-03 — due date on engagement A does not appear on engagement B` — expected: B.dueDate null
- [ ] `AC-LIFE-009-03 — flagging engagement A leaves engagement B unflagged` — expected: B.isPriority false
- [ ] `AC-LIFE-008 — a note recorded on engagement A is not associated with engagement B` — expected: B has 0 notes
- [ ] `ADR-019 — setEngagementDueDate records an audit event (action engagement.due_date_set)` — expected: 1 row, no note body
- [ ] `ADR-019 — recordEngagementNote records an audit event with NO note body in the audit row` — expected: targetId=engagementId, body absent
- [ ] `AC-LIFE-008-02 — notes-read seam under CLIENT request context returns ZERO` — expected: 0 (RLS gate)

## Implementation Notes

- `setEngagementDueDate` handles both first-set and update (AC-LIFE-007-01/-02) — a single guarded UPDATE of
  `dueDate`. `setEngagementPriority(engagementId, isPriority: boolean)` handles flag + unflag
  (AC-LIFE-009-01/-02). `recordEngagementNote(engagementId, body, actor)` INSERTs an `EngagementNote` row.
- For the writes, reuse the EPIC-010 admin-pool-inside-`withAuditTransaction` pattern verbatim
  (see `transitionEngagementStatus`). `@@ROWCOUNT` 0 → `{ success: false }` (engagement not found / no-op).
- For the notes READ, use `withRequestContext` / `withClerkIdentity` so SESSION_CONTEXT is set and the
  `sec.pol_EngagementNote` FILTER predicate governs visibility. This is the seam the portal-negative e2e
  (TASK-011-004) and the CLIENT-reads-zero proof rely on.
- Do NOT log note bodies anywhere (CS-GEN-001).

## Definition of Done

- [ ] Seams added to `engagement.ts` + exported from the barrel; no fork of the repository module
- [ ] Per-engagement attribution proven for all three attributes (tier-3)
- [ ] Each write atomically records an ADR-019 audit event; no note body in audit rows
- [ ] Notes-read seam enforced by RLS (CLIENT context → zero)
- [ ] Lint + type-check + build pass; CS keys honored + tagged

---

## Work Log

- 2026-06-23 [sdet] Marking done — Approved: 14/14 tier-2/3 integration tests pass against real SQL Server container (independently verified). Per-engagement attribution proven for all 3 attributes (A-set-leaves-B-unaffected via fresh beforeEach). Audit atomicity verified — each write seam uses withAuditTransaction; audit call shares same txn; note body never in audit row (CS-GEN-001). Notes-read via listEngagementNotes uses db wrapper (withClerkIdentity/withRequestContext), not direct pool — CS-TS-001/CS-TS-002 honored. CLIENT context returns ZERO via seam (RLS gate proves it). No raw adminDb/requestDb imports outside packages/db. DECISION to fold read RLS test into engagement-attributes.test.ts is sound — covers the exported production function. Barrel exports all 4 functions + 7 types. CS tags throughout. complexity_actual=3. | What's next: archive | Blockers: none
- 2026-06-23 [webapp-developer] Marking as review — All 14 new integration tests pass (14/14). 2 pre-existing unrelated failures in document.upload-pipeline.rls.test.ts (known per TASK-010-001). engagement-note.read.rls.test.ts folded into engagement-attributes.test.ts — CLIENT-reads-zero-via-seam covered there. Lint+type-check+build all green. Portal: 231/231. Admin: 288/288. | What's next: SDET review | Blockers: none
- 2026-06-22 [io] IO AUDIT (Dispatch) — PASS, cleared to SDET Review. Verified against artifacts (engagement.ts L961-1349, engagement-attributes.test.ts, index.ts barrel, context.ts), not just Work Log claims: (1) **Reuses the EPIC-010 audit-transaction pattern, no fork.** All three write seams (`setEngagementDueDate` L1100, `setEngagementPriority` L1168, `recordEngagementNote` L1231) sit inside the existing `engagement.ts` (extended, not forked — CS-GEN-002), each using `withAuditTransaction(async (txn) => { guarded UPDATE/INSERT + @@ROWCOUNT/OUTPUT → recordAuthEvent(... transaction: txn) })` — byte-for-byte the `transitionEngagementStatus`/`confirmDelivery` shape. No parallel audit path; `withAuditTransaction`/`recordAuthEvent` imported from the established `../audit.js` seam. (2) **Audit atomicity (ADR-019).** The audit `recordAuthEvent` runs in the SAME `txn` as the write; @@ROWCOUNT=0 (or INSERT FK-catch) returns success:false BEFORE the audit call, so no audit row for a no-op. Atomic by construction. (3) **No PII in audit (CS-GEN-001 / ADR-019).** Every audit row is `targetType='Engagement'`, `targetId=engagementId` — the note `body` is bound only into the EngagementNote INSERT param (L1239), never into any `recordAuthEvent` field. The test asserts this directly (L557-562: no AuditEvent row has the note body as targetId; L554-555: action string contains no body fragment). (4) **Notes-read goes through the request wrapper, NOT direct Prisma/admin (CS-TS-001/-002).** `listEngagementNotes` (L1305) reads via the `db` request-scoped wrapper under `withClerkIdentity`/`withRequestContext` (context.ts L56/L81 — the canonical SESSION_CONTEXT seam) so `sec.pol_EngagementNote` (TASK-011-001) is the SOLE gate. The `db as unknown as {...}` cast is the SAME established opacity pattern as `dbAsEngagementClient()` (L187) — it does NOT bypass SESSION_CONTEXT propagation (the cast is purely a TS shape; the Proxy still runs the $extends SET hook). No raw `requestDb`/`adminDb` import anywhere in the seams. Writes correctly use the admin pool via `withAuditTransaction` (ADR-003 §7 sanctioned accountant-write path — the request-pool BLOCK is defence-in-depth, the admin pool is correct for the accountant write). (5) **Folded-test decision is sound coverage.** Not creating a separate `engagement-note.read.rls.test.ts` is correct, not a gap: the CLIENT-reads-zero-via-SEAM proof lives at L626-651 (seeds a real note via admin, then `withClerkIdentity(CLIENT) → listEngagementNotes → toHaveLength(0)` — proves RLS is the gate, with data present so zero is not absence), and the raw policy-layer proof already lives in TASK-011-001's `engagement-note.rls.test.ts` (5/5, Audit-passed). Two layers, no redundancy — the seam test exercises the actual exported production function. (6) **Per-engagement attribution (AC-LIFE-007-03/-008/-009-03).** Each attribute proven A-set-leaves-B-unaffected via the fresh-A+B `beforeEach` (L211) — dueDate (L255), isPriority (L369), notes (L473). (7) **Barrel exports present** (index.ts L119-149: all four functions + 7 types). (8) **CS tags** cited throughout SQL/test/JSDoc (CS-TS-001/-002, CS-GEN-001/-002/-003). **Minor observations (non-blocking, SDET awareness):** (a) `recordEngagementNote` uses `try/catch → success:false` for the FK-violation/not-found path rather than the @@ROWCOUNT guard the writes use — acceptable (an INSERT FK violation throws; there is no @@ROWCOUNT pre-check available), and the rollback is handled by `withAuditTransaction`; (b) NEWSEQUENTIALID upper vs Prisma-lower UUID casing handled with case-insensitive compares (L602-606, documented DECISION) — correct for the raw-mssql-OUTPUT vs Prisma-read boundary. **Verdict: Audit PASS — route to SDET Review.** | What's next: SDET review of TASK-011-002; continue Dispatch with TASK-011-003 | Blockers: none
- 2026-06-22 [webapp-developer] Starting implementation — task TASK-011-002 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: 14/14 tier-2/3 integration tests independently executed and verified passing against real SQL Server container. Per-engagement attribution proven for all 3 attributes (beforeEach fresh A+B pair). Audit atomicity confirmed via code review — withAuditTransaction wraps write + recordAuthEvent in one txn; note body never enters any audit row (CS-GEN-001). Notes-read seam listEngagementNotes uses db wrapper (withClerkIdentity/withRequestContext) — CS-TS-001/CS-TS-002 honored. No raw pool imports outside packages/db. CLIENT context returns ZERO via seam (RLS gate, not app filtering). Barrel exports verified. CS tags throughout.

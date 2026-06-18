# TASK-005-003: Create the minimal Engagement on request acceptance + resolve client link

**Brief**: BRIEF-005
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: io
**Depends on**: TASK-005-001 (Engagement schema + repo)
**Impl**: developer
**E2e-required**: no
**Brief-deploys**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-ONBD-001-01 (substrate — the engagement the three-step sequence attaches to comes into being on accept). The visible three-step sequence is rendered in TASK-005-006; this task creates the row it hangs from.
**Upstream refs:** ADR-003 (SESSION_CONTEXT), ADR-005 (client-owned row created via admin pool inside the audit transaction), ADR-019 (the accept is already audited — extend additively, do not duplicate the audit row), ADR-024 §6 (template boundary — no e-sign concern here).
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _DB/action layer; the accept→engagement path is exercised at e2e in TASK-005-007_
- [ ] **Security review** — engagement create runs in the existing accept transaction; no new client-assertable identity; idempotent (one engagement per accepted request)
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Additive, not behavior-changing (brief Notes § Cross-epic touch).** Verify the EPIC-003 accept/invite/email behavior is **unchanged** — the engagement is new substrate created alongside it, inside the same `withAuditTransaction`, so it commits/rolls back atomically with the status transition. Re-run the EPIC-003 accept tests; they must stay green.
- **DECISION-A (client-link resolution).** The engagement is created with `clientUserId = NULL` at accept-time (the prospect has not signed up). Verify the sign-up path back-fills `clientUserId` by matching invitation ticket → request → engagement, and that the back-fill rides the existing sign-up audit transaction. A signed-up client whose engagement is unresolved must not silently read another client's row (the isolation policy keys on `clientUserId` — a NULL link reads ZERO under a CLIENT principal, which is the correct fail-closed default).
- **Idempotency** — accepting is decide-once (EPIC-003 `AlreadyDecidedError`); confirm exactly one engagement per accepted request (the `engagementRequestId` UNIQUE constraint backstops this).

## Context

When the accountant accepts a request (EPIC-003), a minimal `Engagement` is created in status `New`, linked 1:1 to the accepted `EngagementRequest` and (once they sign up) to the client. This extends the delivered `acceptRequest` flow additively. The client link is resolved at sign-up (DECISION-A) because the prospect has no `User` row at accept-time.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/requests/actions.ts` | modify | In `acceptRequest`'s `withAuditTransaction`, after `acceptEngagementRequest`, call `createEngagement({ engagementRequestId, txn })` (status `New`, `clientUserId` NULL) |
| `packages/db/src/repositories/engagement.ts` | modify | `createEngagement` accepts the mssql `Transaction` (admin pool) so it co-commits with accept + audit |
| `apps/portal/src/app/(public)/sign-up/actions.ts` | modify | After the User row is created, resolve + back-fill `Engagement.clientUserId` via the invitation ticket → request → engagement chain (inside the existing sign-up audit transaction) |
| `apps/admin/src/app/requests/actions.test.ts` | modify | Assert engagement created on accept (status `New`, `clientUserId` NULL); EPIC-003 accept behavior unchanged |
| `apps/portal/src/app/(public)/sign-up/actions.test.ts` | modify | Assert `clientUserId` back-filled on sign-up for the invited prospect |
| `packages/db/src/engagement-on-accept.persistence.test.ts` | create | tier-3 — accept creates exactly one engagement; sign-up back-fills the link; rollback leaves no orphan |

## Implementation Notes

- The create must use the **admin pool inside the existing `withAuditTransaction`** (the same transaction the accept status-transition + audit row use) — never a request-pool INSERT. This is the sanctioned identity-bearing-mutation path (ADR-019 §3) and the `Engagement` BLOCK predicate is defence-in-depth.
- Do **not** add a second audit row for engagement creation; the `engagement_request.accepted` audit event already covers the accept. (The letter-signature audit event is TASK-005-005's, separate.)
- DECISION-A back-fill: at sign-up, the invited prospect's ticket already ties to the `EngagementRequest` (EPIC-003 `invitationTicket`); resolve `EngagementRequest → Engagement` (the 1:1 FK) and set `clientUserId` to the new `User.id`. Record `// DECISION-A` at both call sites.
- If the accept-flow rolls back (AlreadyDecidedError or audit failure), no engagement is created — verify in a rollback test.

## Definition of Done

- [ ] `acceptRequest` creates a `New` engagement (clientUserId NULL) in the same transaction; EPIC-003 accept tests stay green
- [ ] sign-up back-fills `clientUserId` for the invited prospect (DECISION-A)
- [ ] tier-3 persistence test: one engagement per accept, link back-filled, rollback leaves no orphan
- [ ] lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

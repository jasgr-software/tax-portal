# TASK-003-005: Decision actions (admin) — accept→invite+email, decline→reason+email; decide-once, audit, rate-limit

**Brief**: BRIEF-003
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-003-001, TASK-003-002, TASK-003-004
**Impl**: developer
**E2e-required**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-DOOR-006-02 (accept → accepted), AC-DOOR-006-03 (decline → declined), AC-DOOR-006-04 (only the accountant decides), AC-DOOR-006-05 (decided ≠ pending; no second decision), AC-DOOR-007-01 (accept sends invitation to contact email), AC-DOOR-007-02 (invitation directs to client-surface account creation), AC-DOOR-007-03 (no account before sign-up), AC-DOOR-007-04 (invitation tied to the accepted request), AC-DOOR-008-01 (decline captures free-text reason), AC-DOOR-008-02 (reason emailed to contact email), AC-DOOR-008-03 (prospect needs no account to receive it), AC-DOOR-008-04 (reason retained on the declined request)
**Upstream refs:** REQ-DOOR-006, REQ-DOOR-007, REQ-DOOR-008, ADR-001 (`createInvitation` seam — CLIENT role server-set), ADR-003 (SESSION_CONTEXT), ADR-005 (write boundary), ADR-019 (audit accept/decline), ADR-022 (rate-limit outbound email), ADR-010 (invitation links to the client surface)
**Introduces-gate:** no (reuses the EPIC-004 audit + rate-limit gates; the email-send required gate is the e2e Mailhog assertion in TASK-003-006)

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + `pnpm --filter admin test` + `pnpm --filter @tax-portal/db test`
- [N/A] **Targeted e2e** — happy-path e2e lands in TASK-003-006 (this task's tier-3/unit prove the invariants)
- [ ] **Security review** — `requireRole(ACCOUNTANT)` on both actions; role server-evaluated (never client-asserted); decide-exactly-once is concurrency-safe (optimistic guard on status); invitation role CLIENT set server-side; outbound email rate-limited; audit row written transactionally
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Decide-exactly-once (AC-DOOR-006-05)** — the status transition must be guarded so a second accept/decline on an already-decided request is rejected (optimistic `WHERE status IN ('pending','awaiting_review')` update, checking affected rows; a no-op → reject, not a silent success). Tier-3 test: concurrent/second decision rejected.
- **Only-accountant-decides (AC-DOOR-006-04)** — action-layer `requireRole(ACCOUNTANT)` AND the DB BLOCK predicate (TASK-003-001). Prove both.
- **Invitation provenance + tie (AC-DOOR-007-01/-04)** — `getAuthProvider().createInvitation(email, 'CLIENT')` (role server-set per ADR-005, reusing the EPIC-004 seam + its provenance test pattern); the returned `ticket` is persisted to `EngagementRequest.invitationTicket` so the resulting account links back (AC-DOOR-007-04). No account is created here (AC-DOOR-007-03 — pairs with EPIC-004 AC-AUTH-006-01).
- **Email sends (AC-DOOR-007-01, AC-DOOR-008-02/-03)** — both go through `packages/email` (TASK-003-002) to the prospect's contact email; the prospect has no account (AC-DOOR-008-03). Rate-limited (ADR-022, reuse `RateLimiter`).
- **Decline retention (AC-DOOR-008-04)** — `declineReason` persisted on the request and visible to the accountant.
- **Audit (ADR-019)** — accept and decline each write an append-only audit row via the EPIC-004 audit seam (`recordAuthEvent`/`withAuditTransaction`), actor = the verified accountant identity.

## Context

The decision is the heart of the slice: from the inbox the accountant accepts (→ invitation email to the prospect, tied to the request, no account yet) or declines (→ free-text reason emailed to the accountless prospect, retained on the request). Both are security-significant (audited) and rate-limited on outbound email. Both run under the accountant SESSION_CONTEXT and are guarded accountant-only. The account that may result from an accepted invitation is EPIC-004's (out of scope here).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/requests/actions.ts` | Modify | `acceptRequest(id)` + `declineRequest(id, reason)` server actions: `requireRole(ACCOUNTANT)`; decide-once status transition; createInvitation + persist ticket (accept); persist declineReason (decline); send email (packages/email); rate-limit; audit. |
| `packages/db/src/repositories/engagement-request.ts` | Modify | `acceptEngagementRequest(id, ticket)` + `declineEngagementRequest(id, reason)` repo fns with the optimistic decide-once guard (returns affected count / throws on already-decided). |
| `apps/admin/src/app/requests/_components/RequestDetail.tsx` | Modify | Wire the Accept button + Decline form (reason textarea) to the actions. |
| `apps/admin/src/app/requests/actions.test.ts` | Create | Tier-3/unit: accept transitions + invitation issued + ticket tied; decline transitions + reason retained + email sent; decide-once rejection; non-accountant rejected; email rate-limited; audit written. |

## Tests to Write First

- [ ] `AC-DOOR-006-02 — accept moves request to accepted` — expected: status accepted
- [ ] `AC-DOOR-006-03 — decline moves request to declined` — expected: status declined
- [ ] `AC-DOOR-006-04 — non-accountant cannot decide` — expected: rejected (action guard + DB block)
- [ ] `AC-DOOR-006-05 — second decision on a decided request is rejected` — expected: error/no-op rejection, state unchanged
- [ ] `AC-DOOR-007-01 — accept sends an invitation email to the contact email` — expected: email captured (mock), recipient = prospect email
- [ ] `AC-DOOR-007-04 — invitation ticket persisted on the request` — expected: request.invitationTicket set
- [ ] `AC-DOOR-007-03 — no account exists before sign-up` — expected: no User row created on accept
- [ ] `AC-DOOR-008-01 — decline captures a free-text reason` — expected: reason accepted
- [ ] `AC-DOOR-008-02/-03 — reason emailed to the accountless prospect` — expected: email captured, recipient = prospect email
- [ ] `AC-DOOR-008-04 — reason retained on the request` — expected: request.declineReason persisted + readable

## Implementation Notes

- Reuse: `getAuthProvider().createInvitation` (`@tax-portal/auth`), `recordAuthEvent`/`withAuditTransaction` (`@tax-portal/db`), the EPIC-004 `RateLimiter` port, and `getEmailProvider().send` (`@tax-portal/email`, TASK-003-002).
- The invitation email body links to the **client surface** sign-up (ADR-010 cross-app URL, `PORTAL_APP_URL`) carrying the ticket (AC-DOOR-007-02).
- Wrap status-transition + audit (+ ticket persistence) in one transaction; send email after the transaction commits (don't email on a rolled-back decision). Rate-limit the send; on rate-limit, surface a retryable error without losing the recorded decision (DECISION: record the decision, queue/skip the email with an audited note — pick the simplest correct behavior and note it).

## Work Log

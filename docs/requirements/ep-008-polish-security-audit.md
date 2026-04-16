# Epic 008 — Polish, Security Audit & Production Hardening

**Epic-type:** feature  
**Epic-deploys:** yes  
**Phase:** 5  
**Status:** Pending (awaiting Epic 007 completion)  
**Priority:** P1

---

## Purpose

Final production hardening before launch: cross-cutting UX polish, security audit (RLS coverage, signed URL audit, auth edge cases), performance review, operational runbook completion, and smoke test suite hardening. This epic gates the v1 launch.

---

## Requirements in scope

| Requirement ID | Summary |
|---|---|
| REQ-NFR-001 | RLS policies — full coverage audit |
| REQ-NFR-002 | Signed URLs — audit for any public exposure |
| REQ-NFR-006 | Document retention enforcement — verify cron and soft-delete |
| REQ-IDNT-005 | Hard delete — clarification resolved and implementation verified |
| (cross-cutting) | UX polish across all modules |

---

## Acceptance Criteria

_Placeholder — to be fully detailed by the RA (in conjunction with the SDET) before this epic is handed to the SA._

**Key areas:**
- AC-008-001: Full RLS audit — no CLIENT can access another CLIENT's data, verified by automated tests
- AC-008-002: Signed URL audit — no file is accessible via an unsigned URL
- AC-008-003: Auth edge case review — invitation expiry, session revocation, 2FA bypass attempts
- AC-008-004: Retention policy verified end-to-end (soft-delete + 7-year rule)
- AC-008-005: Operations runbook is complete and accurate for production
- AC-008-006: Smoke test suite passes against production-equivalent environment

---

## Dependencies

- Epic 007 completed (all features shipped)
- CLARIF-005 resolved (hard delete policy)

---

## Notes for SA

- The SDET should be involved in defining AC-008-001 through AC-008-003 — these are security requirements.
- This epic should trigger a full `pnpm --filter web e2e:run` with zero failures as the RA validation gate.

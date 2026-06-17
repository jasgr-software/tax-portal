# HANDOFF-003 — BRIEF-003 / EPIC-003 completion report

**For the upstream producer (`.planning/` → COVERAGE write-back).** Slice: accountant request inbox.
Branch `brief-003-accountant-request-inbox` → **PR #42**. Status at handoff: **in `## Awaiting PR merge`**
(pre-merge gates 1–7 green; awaiting merge → Close-finalize gate 8).

## AC satisfied (20/20 in-scope — ready for COVERAGE `verified`)

Evidence basis: SDET acceptance-validation (20/20 traced to passing tagged tests, tier-2/3/6) **+ green
required CI** (run `27696675400`: `lint-and-typecheck` ✅ + `security-scan` ✅) + container smoke. Same
user-accepted CI-as-the-gate basis as EPIC-001/002/004 (COVERAGE note [A]).

| AC | Tier(s) | Covering evidence |
|---|---|---|
| AC-DOOR-005-01 | 2+3 | portal `actions.test.ts`; db `engagement-request.persistence.test.ts` (notification atomic) |
| AC-DOOR-005-02 | 6+2 | admin `request-inbox.spec.ts` (notification → request detail); notification carries `engagementRequestId` |
| AC-DOOR-005-03 | 3 | `notification.rls.test.ts` (ACCOUNTANT reads / CLIENT 0 / null 0 / admin bypass) |
| AC-DOOR-006-01 | 6+2/5 | admin `request-inbox.spec.ts` detail; `inbox.test.tsx` |
| AC-DOOR-006-02 | 6+2 | `request-accept.spec.ts`; `actions.test.ts` |
| AC-DOOR-006-03 | 6+2 | `request-decline.spec.ts`; `actions.test.ts` |
| AC-DOOR-006-04 | 3+2+6 | `engagement-request.decide-boundary.rls.test.ts` (DB BLOCK); `actions.test.ts` (action guard); inbox security e2e |
| AC-DOOR-006-05 | 6+2 | accept/decline "no affordances after decided"; `AlreadyDecidedError` unit tests |
| AC-DOOR-007-01 | 6+2 | `request-accept.spec.ts` (Mailhog invitation email); `actions.test.ts` |
| AC-DOOR-007-02 | 6+2 | invitation body → portal sign-up URL with ticket |
| AC-DOOR-007-03 | 2 + cross-epic | `actions.test.ts` (no User row on accept); pairs with EPIC-004 AC-AUTH-006-01 (`client-signup.spec.ts`) |
| AC-DOOR-007-04 | 6+2 | ticket persisted to `EngagementRequest.invitationTicket`; ticket in email body |
| AC-DOOR-008-01 | 6+2 | decline form textarea; reason validation |
| AC-DOOR-008-02 | 6+2 | `request-decline.spec.ts` (Mailhog reason email) |
| AC-DOOR-008-03 | 2+6 | plain email to accountless prospect (no User row) |
| AC-DOOR-008-04 | 6+2 | reason retained on request, shown on re-view; DB assertion |
| AC-DASH-011-01 | 6 | inbox lists all |
| AC-DASH-011-02 | 6 | state badges pending/accepted/declined |
| AC-DASH-011-03 | 6 | pending identifiable (`data-status`) |
| AC-MSG-013-01 | 3+2 | notification type `new_engagement_request`; accountant-surfaced |

**Conductor → `/planning validate EPIC-003 with CI evidence <merge run/SHA>`** after merge: flip these 20
COVERAGE rows `planned → verified` and roll EPIC-003 `planned → delivered`. This **completes Phase 1** (all
four MVP front-door epics delivered).

## Upstream items raised
- **OQ-002** (`.implementation/OPEN-QUESTIONS.md`) — no ADR governs email transport. Raised-upstream to
  `.architecture/`; proceeding on the `packages/email` provider-abstracted default. Architecture to ratify an
  `ADR-email-transport` (or amend) + confirm the production provider (e.g. Resend) + templating.

## Resolved this slice (was carried)
- RETRO-002 `RATE_LIMIT_MAX_ATTEMPTS`/`_WINDOW_MS` env vars — now in `docker-compose.yml` + `.env.example`
  (BUG-003-001). The user-walled action is no longer needed for these two vars.

## Carry-forward (see RETRO-003 § Carry-forward)
Infra clean-volume bootstrap + `sqlserver` healthcheck mismatch + P3019; `sp_set_session_context` CI grep-guard;
EPIC-001 `fn_service_access` CLIENT read-branch tightening; `service.rls.test.ts` comment-drift (now assigned to
the next `packages/db` task); `port.ts` strip/throws comment-drift; AC-AUTH-010-02 demo `ADMIN_APP_URL` env
mismatch; `personas/jane-accountant.md` v2 multi-accountant update.

## Docs-lane close-out (Conductor, post-merge)
- `docs/demos/EPIC-003/` gallery (7 AC-tagged PNGs + DEMO.md) — held for the close-out PR.
- COVERAGE/ROADMAP sign-off via `/planning validate`.

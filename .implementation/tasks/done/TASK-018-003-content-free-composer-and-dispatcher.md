---
brief: BRIEF-018
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-018-002
impl: developer
e2e_required: "no"
started_at: 2026-06-26T16:24:42.280Z
completed_at: 2026-06-26T19:11:21.037Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-MSG-008-02, AC-MSG-009-01, AC-MSG-009-02, AC-MSG-009-03, AC-MSG-010-02, AC-MSG-010-03, AC-MSG-010-04]
upstream_refs: [REQ-MSG-008, REQ-MSG-009, REQ-MSG-010, ADR-025, ADR-023, ADR-017, ADR-006, ADR-012]
code_standards: CS-TS-002, CS-TS-003, CS-GEN-001, CS-GEN-002, CS-GEN-003
---

# TASK-018-003: Content-free digest composer + daily-digest dispatcher (the three hard tier-3 gates)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — the hard gates here are **tier-3 integration** (DB + email mock/SMTP). Tier-6 e2e journeys are TASK-018-004/-005.
- [x] **Security review** — the content-free body is the security-sensitive property of this slice; no PII in logs (ADR-025 §4 / ADR-017); send only through the `EmailProvider` port
- [x] **SDET Review** — approved

## SDET Review focus areas — THIS IS THE SLICE'S SDET TRAP

- **Content-free body proven BOTH ways (HARD, AC-MSG-008-02).** The proof must assert the nudge text + sign-in affordance **are present** AND that **every** seeded sensitive value is **absent** from the rendered subject AND body. Seed at least: a **client name**, a **document name**, a **message-thread body**, an **engagement detail**, and an **event description** into the recipient's unread notifications, then assert none of those strings appears in the rendered email. **A one-sided assertion (only checking the nudge copy is present) is a rejection** (brief § Notes "the content-free guarantee is this slice's panel/SDET trap").
- **Daily-cap proven (HARD, AC-MSG-009-01/-02/-03).** Generate **N (>1)** notification-worthy events for one recipient within a day; run dispatch; assert **exactly one** email is delivered for that recipient (catcher/mock count == 1) — never one per event. Then a **second day**'s events yield **exactly one further** email. The cap is enforced on `lastNudgeSentAt`, not by event timing.
- **Suppression proven THREE ways (HARD, AC-MSG-010-02/-03/-04).** (1) Suppressed accountant (`emailNudgeEnabled=false`) → **zero** emails. (2) Her in-portal feed (`listNotifications` under her SESSION_CONTEXT) still returns **all** her notifications — the dispatcher never touched `Notification`. (3) A client (default-on) **still receives** their nudge while the accountant is suppressed. Three independent assertions.
- Verify the dispatcher sends **only** via `getEmailProvider()` (ADR-025) — no ESP SDK at the call site; no real ESP wired (ADR-023 — SMTP→Mailhog only). Verify no-body-logging (CS-GEN-001 / ADR-025 §4).

## Context

This is the heart of the slice: compose the **content-free** nudge and run the **daily-digest dispatch** that maps unread `Notification` activity → at most one generic email per recipient per day, through the `packages/email` port, honoring suppression. It composes the TASK-018-002 repository primitives. Production scheduling is deferred (deploy-time concern, ADR-023/ADR-025); the dispatch is **invokable under test** with a controllable `now`.

## Data & Interface Contract (IO-expanded, binding)

1. **Composer — `composeDigestNudge(input: { role: 'ACCOUNTANT' | 'CLIENT'; signInUrl: string }): { subject: string; text: string }`.**
   - Lives in **`packages/email`** (co-located with the transport + the ADR-025 content-minimization contract). Pure function — trivially unit/integration testable.
   - Output carries **only**: a generic "you have new activity in your portal" statement **+** the sign-in URL. **No** notification content, client/engagement identifying detail, document/message content, or per-event description. **Do not interpolate any `Notification` field** into the body. (The recipient's own name/email is the *only* PII ADR-025 permits, but to keep the two-sided proof clean, **do not include even the recipient name** — keep the body fully generic.)
   - `signInUrl` is chosen by the dispatcher per role/surface (ADR-006): CLIENT → portal sign-in (`PORTAL_APP_URL` + `/sign-in`), ACCOUNTANT → admin sign-in (`ADMIN_APP_URL` + `/sign-in`). *(traces: REQ-MSG-008, AC-MSG-008-01/-03; ADR-025 §3)*

2. **Dispatcher — `dispatchDailyDigest(opts?: { now?: Date }): Promise<DigestDispatchResult>`.**
   - Lives in **`packages/db`** (admin-pool batch; adds a `@tax-portal/email` workspace dependency — additive, CS-GEN-002). Imports `composeDigestNudge` + `getEmailProvider` from `@tax-portal/email`.
   - Flow: `now = opts?.now ?? new Date()`; `recipients = getDigestRecipients(now)`; for each recipient → `composeDigestNudge({ role, signInUrl })` → `getEmailProvider().send({ to: email, subject, text })` → `recordNudgeSent(userId, now)`. **At most one send per recipient** (the candidate query already de-dupes + applies the cap; the watermark write closes the same-day window).
   - Returns `{ sentCount: number }` (no recipient identity in the result beyond a count — CS-GEN-001). Logs **no** recipient activity detail, client identity, message/document content, or email bodies (ADR-025 §4 / ADR-017 / CS-GEN-001).
   - **Send-failure posture:** mirror the existing call-site discipline (`apps/admin/src/app/requests/actions.ts`) — a send failure for one recipient must not corrupt the cap for others; do **not** `recordNudgeSent` for a recipient whose send threw (so a transient failure can retry next run). Record a `// DECISION:` for the chosen per-recipient error handling.
   - *(traces: REQ-MSG-008/-009/-010; ADR-025, ADR-023)*

3. **Test-invokable trigger seam (for the TASK-018-004/-005 e2e).** Expose a way to invoke `dispatchDailyDigest` from the running container stack — a **dev/test-guarded** trigger (e.g. an `apps/admin` route under `app/api/dev/…` guarded by a non-production flag such as `ENABLE_DIGEST_TRIGGER=true`, OR a `scripts/run-digest.ts` runnable in-container). Bounded IO discretion — pick one, guard it so it is **not** reachable in production, and document it as a `// DECISION:`. Production scheduling stays deferred.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/email/src/digest.ts` | create | `composeDigestNudge` content-free composer (pure). Export via `packages/email/src/index.ts`. |
| `packages/email/src/index.ts` | modify | Barrel-export `composeDigestNudge` (additive). |
| `packages/db/src/repositories/email-digest.ts` | modify | Add `dispatchDailyDigest` (composes TASK-018-002 primitives + email port). |
| `packages/db/package.json` | modify | Add `@tax-portal/email` workspace dependency (additive). |
| `packages/db/src/index.ts` | modify | Barrel-export `dispatchDailyDigest` (additive). |
| `packages/db/src/repositories/email-digest.dispatch.integration.test.ts` | create | The three HARD tier-3 gates (content-free two-sided, daily-cap, suppression three-ways). |
| `packages/email/src/digest.test.ts` | create | Unit test of the composer's content-free output (generic nudge + sign-in only). |
| `apps/admin/src/app/api/dev/dispatch-digest/route.ts` | create | Test/dev-guarded invocation seam for e2e (DECISION-018-003-C: admin route over scripts/ — container stack already exposes admin HTTP server; e2e calls via fetch). |

## Tests to Write First

- [ ] `composeDigestNudge emits only the generic nudge + sign-in URL` — assert the body contains the nudge sentence and the `signInUrl`, and contains no template slot for activity content. (unit)
- [ ] `rendered digest email contains NO seeded sensitive value (two-sided)` — seed client name + document name + message body + engagement detail + event description into the recipient's unread notifications; run dispatch (mock provider); assert the delivered subject+body **contain the nudge + sign-in** AND **none** of the seeded strings. **Tag `AC-MSG-008-02`.** (tier-3, HARD)
- [ ] `N events in a day yield exactly one email; next day yields exactly one more` — assert delivered count == 1 after N events same day, == 2 after a subsequent day's events. **Tag `AC-MSG-009-01`/`AC-MSG-009-02`/`AC-MSG-009-03`.** (tier-3, HARD)
- [ ] `suppressed accountant receives zero emails` — `emailNudgeEnabled=false` accountant with unread activity → dispatch sends her nothing. **Tag `AC-MSG-010-02`.** (tier-3, HARD)
- [ ] `suppression leaves the accountant's feed intact` — after dispatch, `listNotifications` under her SESSION_CONTEXT still returns all her notifications. **Tag `AC-MSG-010-03`.** (tier-3, HARD)
- [ ] `a client still receives their nudge while the accountant is suppressed` — default-on client emailed in the same run. **Tag `AC-MSG-010-04`.** (tier-3, HARD)

## Implementation Notes

- For the tier-3 hard gates, the **mock email provider** (`MockEmailProvider` / `getSentEmailsForTesting` from `@tax-portal/email/bindings/mock.js`) gives a deterministic, count-and-inspect surface (the Mailhog count proof is the tier-6 e2e in TASK-018-005). Use whichever the harness supports; the count + body inspection must be real, not a re-implementation.
- The candidate query + watermark (TASK-018-002) already enforce the cap; the dispatcher just sends + watermarks. Do not re-implement the cap in the dispatcher.
- Cite governing keys throughout (CS-GEN-003): `// ADR-025 // ADR-017 // REQ-MSG-008 // REQ-MSG-009 // REQ-MSG-010 // CS-GEN-001`.

## Definition of Done

- [x] `composeDigestNudge` + `dispatchDailyDigest` implemented + exported; `@tax-portal/email` dep added to `packages/db`.
- [x] Test/dev-guarded trigger seam created (not production-reachable) for the e2e tasks.
- [x] The three HARD tier-3 gates pass: content-free two-sided, daily-cap (count==1 then ==2), suppression three ways — all with AC ids tagged on test titles.
- [x] Send goes only through `getEmailProvider()`; no real ESP wired; no body/PII logging.
- [x] Lint + type-check + build pass.

---

## Work Log

- 2026-06-26 [sdet] Marking done — All three HARD tier-3 gates verified in code: GATE1 AC-MSG-008-02 two-sided proof (5 sensitive categories absent + nudge present), GATE2 AC-MSG-009-01/-02/-03 count==1 then count==2, GATE3 AC-MSG-010-02/-03/-04 three independent assertions. Send-only via EmailProvider port. Category-only catch logging. Test seams in opts intentionally deferred to TASK-018-008 hardening. | What's next: archive | Blockers: none
- 2026-06-26 [webapp-developer] Marking as review — All 6 tier-3 dispatch gates pass (GATE1 AC-MSG-008-02, GATE2 AC-MSG-009-01/-02/-03, GATE3 AC-MSG-010-02/-03/-04 + ADR-025 seam + DECISION-018-003-A posture). 13 composer unit tests pass. Lint/type-check/build all green. SENTINEL_DATE isolation + _userIdFilter prevent cross-test contamination. | What's next: SDET review | Blockers: none
- 2026-06-26 [webapp-developer] Starting implementation — task TASK-018-003-content-free-composer-and-dispatcher | What's next: implement and run gates | Blockers: none
- 2026-06-26 [webapp-developer] Implementation complete. Created `packages/email/src/digest.ts` (pure content-free composer) + `packages/email/src/digest.test.ts` (13 unit tests). Added `dispatchDailyDigest` to `packages/db/src/repositories/email-digest.ts` with DECISION-018-003-A (skip watermark on failure), DECISION-018-003-D (injected `_emailProvider` for test isolation), DECISION-018-003-E (`_userIdFilter` for batch-dispatch test scoping), SENTINEL_DATE isolation pattern. Created `packages/db/src/repositories/email-digest.dispatch.integration.test.ts` with 6 tier-3 integration tests (3 hard gates + ADR-025 seam + DECISION-018-003-A posture). Created `apps/admin/src/app/api/dev/dispatch-digest/route.ts` (DECISION-018-003-C: admin route seam, guarded by `ENABLE_DIGEST_TRIGGER=true`). Added `@tax-portal/email` dep to `packages/db`. Added stale-watermark pre-cleanup in `beforeAll` (DECISION-018-003-E) to prevent cross-test contamination of `user-email-preference` test. All 6 dispatch gates + 6 primitive tests + 13 unit tests pass (25 total). Lint, type-check, build: all green. | What's next: submit for SDET review | Blockers: none
- 2026-06-26 [webapp-developer] Test proof (dispatch): GATE1 AC-MSG-008-02 ✓, GATE2 AC-MSG-009-01/-02/-03 ✓, GATE3 AC-MSG-010-02/-03/-04 ✓, ADR-025 seam ✓, DECISION-018-003-A posture ✓ — 6/6 passed. Email unit tests: 13/13 passed. Lint: zero warnings. Type-check: zero errors. Build: apps/portal + apps/admin both succeed.
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: SDET TRAP — the content-free guarantee is the security-sensitive property of this slice. Verified: **GATE1 (AC-MSG-008-02)** — two-sided proof confirmed in `email-digest.dispatch.integration.test.ts`: 5 sensitive categories seeded (clientName, documentName, messageBody, engagementDetail, eventDescription) each individually asserted absent from subject AND body, plus nudge copy + sign-in URL asserted present. One-sided-only trap not present. **GATE2 (AC-MSG-009-01/-02/-03)** — N=3 events, day1 dispatch → exactly 1 email (count==1); day2 dispatch → total count==2. Cap enforced on lastNudgeSentAt watermark, not by event timing. **GATE3 (AC-MSG-010-02/-03/-04)** — three independent assertions: (1) suppressed accountant zero emails, (2) `listNotifications` under accountant SESSION_CONTEXT returns all her notifications (feed intact), (3) default-on client receives nudge in same run. `composeDigestNudge` is pure; no Notification field interpolated. Dispatcher sends only via `EmailProvider` port (`getEmailProvider()`); no ESP SDK. Category-only catch logging (see TASK-018-008 hardening). `_emailProvider`/`_userIdFilter` test seams present but production-gated by NODE_ENV — proven by TASK-018-008 regression tests.

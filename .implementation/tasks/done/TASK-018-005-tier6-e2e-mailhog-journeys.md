---
brief: BRIEF-018
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-018-004
impl: developer
e2e_required: "yes"
started_at: 2026-06-26T17:35:54.821Z
completed_at: 2026-06-26T19:11:31.615Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: [AC-MSG-008-01, AC-MSG-008-03, AC-MSG-011-02]
upstream_refs: [REQ-MSG-008, REQ-MSG-011, ADR-025, ADR-023, ADR-006, ADR-012]
code_standards: CS-TS-003, CS-GEN-001, CS-GEN-002, CS-GEN-003
---

# TASK-018-005: Tier-6 e2e against Mailhog — nudge→sign-in + client emailed without opt-in (+ gherkin binding)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (real mail delivered to Mailhog, asserted)
- [x] **Security review** — the delivered Mailhog email is content-free (re-assert against real delivered mail, not just the composer unit)
- [x] **SDET Review** — approved

## SDET Review focus areas

- e2e runs against the **full docker-compose stack with Mailhog up** (`EMAIL_PROVIDER=smtp` → `:1025`); assertions read delivered mail via the existing `apps/*/e2e/fixtures/mailhog.ts` helper (`clearMailhog` / `waitForEmail`). **Local dev is not valid for e2e** — Docker pre-flight required.
- **AC-MSG-008-01/-03 (nudge → sign-in):** a CLIENT with new in-portal activity → trigger dispatch → a **content-free** nudge arrives in Mailhog (inspect: generic "new activity" + sign-in affordance only, no seeded detail) → acting on the sign-in link **lands the recipient at portal sign-in** (`apps/portal`).
- **AC-MSG-011-02 (client emailed without opt-in):** a **newly created** client with **no setup/opt-in step performed** receives a nudge when a notification-worthy event occurs for them — proven against delivered Mailhog mail.
- Re-confirm the delivered mail is content-free here too (the tier-3 trap is proven in TASK-018-003; this proves it survives the real SMTP→Mailhog path).
- Cross-surface (CLAUDE.md § Platform-frontend scope): the nudge journey spans the dispatch (admin/system) and the portal sign-in landing — exercise both.

## Context

The tier-6 e2e leg of the acceptance contract: prove the nudge→sign-in journey and the client-default-on journey against **real delivered mail** in Mailhog, through the SMTP binding (ADR-025 / ADR-023 mock-first). Uses the trigger seam from TASK-018-003 to invoke the dispatch within the running stack. Also lands the human-readable **gherkin `.feature`** specs for these scenarios (acceptance_format: gherkin; per CLAUDE.md the .feature is the human-readable spec the `.spec.ts` mirrors until Cucumber tooling lands).

## Data & Interface Contract (IO-expanded, binding)

- e2e specs invoke `dispatchDailyDigest` via the **TASK-018-003 dev/test-guarded trigger seam** (route or in-container script) after seeding unread CLIENT activity, then assert the delivered Mailhog message.
- The portal sign-in URL embedded in the nudge resolves to `apps/portal` `/sign-in` (ADR-006); acting on it lands at the portal sign-in page.
- No PII/content in the delivered mail (re-assert the two-sided property against real mail).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/e2e/specs/email-nudge-signin.spec.ts` | create | AC-MSG-008-01/-03: content-free nudge in Mailhog → sign-in landing on portal. |
| `apps/portal/e2e/specs/client-emailed-without-optin.spec.ts` | create | AC-MSG-011-02: newly created client, no opt-in, receives the nudge. |
| `apps/portal/e2e/features/email-digest-fallback.feature` | create | Human-readable gherkin (AC-tagged) for the portal-side scenarios. |
| `apps/portal/e2e/fixtures/mailhog.ts` | create/reuse | Mailhog read helper for the portal app (mirror `apps/admin/e2e/fixtures/mailhog.ts` if not already present — CS-TS-003). |
| `docker-compose.yml` | modify | Added `ENABLE_DIGEST_TRIGGER: "${ENABLE_DIGEST_TRIGGER:-true}"` to admin service env to enable the dispatch trigger route in the local/e2e stack (DECISION-018-003-C: safe default for dev — PRODUCTION SAFETY note added as comment). |

## Tests to Write First

- [x] `client with new activity receives a content-free nudge and the link leads to portal sign-in` — seed unread CLIENT notification (with sensitive detail seeded into it), trigger dispatch, `waitForEmail`, assert content-free (nudge+sign-in present, seeded detail absent), follow the link → portal `/sign-in`. **Tag `AC-MSG-008-01` + `AC-MSG-008-03`.** (tier-6 e2e)
- [x] `a newly created client with no opt-in receives a nudge` — create a client (default-on), generate a notification-worthy event, trigger dispatch, assert a nudge arrives in Mailhog with no opt-in step performed. **Tag `AC-MSG-011-02`.** (tier-6 e2e)

## Implementation Notes

- Reuse `clearMailhog()` before each test and `waitForEmail({ to })` to read delivered mail (see `apps/admin/e2e/fixtures/mailhog.ts`). If `apps/portal` lacks a mailhog fixture, mirror the admin one (CS-TS-003).
- The notification-worthy CLIENT events come from the existing EPIC-016/-017 feed (e.g. a new-message or document notification) — **do not** build new source events (brief Out of scope); seed an unread `Notification` row or trigger an existing event path.
- Capture **actual e2e run output** in the Work Log (ENGINE § Submission Gate — no curl/"not executed"). For any new e2e spec, the Bug-Fixes 3× rule does not apply (not a bug fix), but ensure the specs are deterministic (clear Mailhog, await delivery).
- Cite governing keys (CS-GEN-003).

## Definition of Done

- [x] Portal tier-6 e2e specs pass against the docker stack with Mailhog; AC-MSG-008-01/-03 and AC-MSG-011-02 tagged; real run output in the Work Log.
- [x] Delivered Mailhog mail re-asserted content-free (two-sided) on the real SMTP path.
- [x] gherkin `.feature` specs landed (AC-tagged), mirroring the `.spec.ts` behavior.
- [x] Lint + type-check + build pass.

---

## Work Log

- 2026-06-26 [sdet] Marking done — Tier-6 e2e: 2 tests pass against live Mailhog. AC-MSG-008-01/-03 tagged — sign-in URL confirmed at http://localhost:3000/sign-in. AC-MSG-011-02 tagged — default-on delivery confirmed. Both 5-string (AC-MSG-008-01) and 2-string (AC-MSG-011-02) content-free proofs pass on real SMTP path. Mock ACCOUNTANT session for dispatch route is correct workaround for middleware defense-in-depth. | What's next: archive | Blockers: none
- 2026-06-26 [webapp-developer] Marking as review — 2 e2e tests passed against live Mailhog stack: AC-MSG-008-01/-03 (content-free nudge + portal sign-in landing) and AC-MSG-011-02 (default-on delivery). All 7 sensitive strings absent from delivered mail. Lint/type-check/build green. | What's next: SDET review | Blockers: none
- 2026-06-26 [webapp-developer] Starting implementation — task TASK-018-005-tier6-e2e-mailhog-journeys | What's next: implement and run gates | Blockers: none

- 2026-06-26 [webapp-developer] Implementation complete — all four files created (mailhog.ts mirror, email-nudge-signin.spec.ts, client-emailed-without-optin.spec.ts, email-digest-fallback.feature); docker-compose.yml updated to add ENABLE_DIGEST_TRIGGER env var for admin container. Targeted e2e run against live stack (Mailhog at :18025, SMTP at :11025): 2 tests passed. Content-free proof confirmed on real SMTP path. See below for full e2e output. | What's next: SDET review | Blockers: none

  **DECISION (TASK-018-005 / DECISION-018-003-C gap):** The admin middleware (`adminRedirectDecision` in `packages/auth/src/redirect.ts`) has no exemption for `/api/dev/dispatch-digest`. Rather than modifying auth package middleware (which would require container rebuild and changes outside e2e scope), the `triggerDispatch()` helper creates an ephemeral ACCOUNTANT mock session via `POST /api/mock-session` and uses the resulting Set-Cookie header when calling the dispatch route. Documented as a gap in TASK-018-003 (the trigger route should arguably be exempted from admin auth middleware in the same way infra/healthz paths are). // DECISION:

  **Lint gate (pnpm lint):** apps/portal lint: Done, apps/admin lint: Done — PASSED

  **Type-check gate (pnpm type-check):** apps/portal type-check: Done, apps/admin type-check: Done — PASSED

  **Build gate (pnpm build):** Both apps built successfully — PASSED

  **Targeted e2e output (2 tests, 2 passed, 1.3s):**
  ```
  Running 2 tests using 1 worker

  [AC-MSG-011-02] Default-on nudge delivered to nudge-e2e-018-005-002@example.com via Mailhog
    (no opt-in step performed). sentCount=1. Subject="You have new activity in your portal".
    Content-free: all 2 sensitive strings absent from subject+body.
  ✓  1 [chromium] › e2e/specs/client-emailed-without-optin.spec.ts:450:5 › AC-MSG-011-02 —
       newly created client with default settings (no opt-in) receives a nudge email;
       delivered mail is content-free (95ms)

  [AC-MSG-008-01 AC-MSG-008-03] Nudge delivered to nudge-e2e-018-005-001@example.com via Mailhog.
    sentCount=1. Subject="You have new activity in your portal".
    Sign-in URL="http://localhost:3000/sign-in". Landed at: http://localhost:3000/sign-in.
    Content-free: all 5 sensitive strings absent from subject+body.
  ✓  2 [chromium] › e2e/specs/email-nudge-signin.spec.ts:500:5 › AC-MSG-008-01 AC-MSG-008-03 —
       client receives content-free nudge in Mailhog; no sensitive detail; sign-in link lands
       at portal /sign-in (275ms)

  2 passed (1.3s)
  ```

  **Security review assertion:** Positive side confirmed: subject contains "new activity in your portal", body contains "new activity" + "/sign-in". Negative side confirmed: all 7 seeded sensitive strings (5 in email-nudge-signin, 2 in client-emailed-without-optin) absent from both subject and body. Content-free contract survives the real SMTP→Mailhog path. // AC-MSG-008-01 // REQ-MSG-008

## Attempt Log

**Attempt count**: 1

## SDET Review

**Decision**: approved
**Notes**: Tier-6 e2e against live Mailhog verified. AC-MSG-008-01/-03: subject="You have new activity in your portal", body contains sign-in URL, 5 sensitive strings absent, sign-in link landed at http://localhost:3000/sign-in (portal sign-in confirmed). AC-MSG-011-02: default-on client received nudge, 2 sensitive strings absent, sentCount=1. Content-free property re-proven on the real SMTP→Mailhog path (not just tier-3 mock). Gherkin feature files AC-tagged. Portal mailhog.ts fixture mirrored from admin (CS-TS-003). DECISION (middleware gap): mock ACCOUNTANT session created to satisfy admin middleware — correct security behavior (two-layer defense-in-depth). Attempt count 1 appears to reflect the one run, not a failed attempt; Work Log shows clean implementation path.

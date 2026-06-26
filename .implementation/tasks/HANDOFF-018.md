# HANDOFF-018 — Email digest fallback (content-free daily nudge) — EPIC-018

**Brief:** BRIEF-018 · **Branch:** `brief-018-email-digest-fallback` · **Phase 4** (does NOT close the phase — no walkthrough-video obligation) · **Closed Close-prep:** 2026-06-26

## What shipped

The secondary, out-of-portal **email fallback channel** whose only job is to draw a recipient back into the portal. Four capabilities, all **additive on top of** the EPIC-016 `Notification` feed and the ADR-025 `packages/email` seam (both consumed, neither rebuilt):

1. **Content-free nudge** — a fallback email conveys ONLY that there is new activity + a sign-in link; carries no message/document/client/engagement/event detail. Composer is content-free **by construction** (`packages/email/src/digest.ts` — fixed generic subject + body, `role` unused in content, only `signInUrl` interpolated).
2. **Daily cap** — at most one email per recipient per day, never one per event. Enforced on a per-recipient `User.lastNudgeSentAt` watermark (calendar-day-UTC).
3. **Accountant self-suppression** — `apps/admin` `/settings/notifications` toggle flips her own `User.emailNudgeEnabled`; feed untouched; clients unaffected.
4. **Client default-on** — `User.emailNudgeEnabled BIT NOT NULL DEFAULT 1` ⇒ every newly created client account is nudge-enabled with no opt-in step.

## Acceptance criteria satisfied (all 12 — for COVERAGE.md write-back)

| AC | Tier | Proven by |
| -- | ---- | --------- |
| AC-MSG-008-01 | e2e (tier-6) | `apps/portal/e2e/specs/email-nudge-signin.spec.ts` — content-free nudge in Mailhog + sign-in affordance |
| AC-MSG-008-02 | integration (tier-3, HARD) | `email-digest.dispatch.integration.test.ts` GATE1 + composer unit + tier-6 — **two-sided** (5 seeded sensitive strings absent + nudge present) at all layers |
| AC-MSG-008-03 | e2e (tier-6) | `email-nudge-signin.spec.ts` — link lands at portal `/sign-in` |
| AC-MSG-009-01/-02/-03 | integration (tier-3, HARD) | GATE2 — N=3 events → sentCount==1; next day → ==2; cap on `lastNudgeSentAt` |
| AC-MSG-010-01 | e2e (tier-6) | `apps/admin/e2e/specs/accountant-email-suppression.spec.ts` — toggle persists |
| AC-MSG-010-02/-03/-04 | integration (tier-3, HARD) | GATE3 — three independent assertions: 0 emails / feed intact / client still nudged |
| AC-MSG-011-01 | integration (tier-3) | `user-email-preference.integration.test.ts` + `email-digest.integration.test.ts` — default-on at DB |
| AC-MSG-011-02 | e2e (tier-6) | `apps/portal/e2e/specs/client-emailed-without-optin.spec.ts` — emailed, no opt-in |

Gherkin `.feature` specs present on both surfaces (human-readable, AC-tagged — Cucumber tooling not yet landed per CLAUDE.md).

## Key design decisions (implementation-level)

- **Email preference + dispatch state = two additive columns on `User`** (not a dedicated table) — bounded IO discretion. Makes client default-on free at row creation; the accountant suppresses her own row. No new table ⇒ no new RLS policy (consistent with the brief — RLS deliberately not scoped here).
- **Own-row isolation without `sec.pol_User`:** the request-pool preference functions' `WHERE clerkId = ctx.clerkUserId` (clerkId from server-set SESSION_CONTEXT, never an arg) is the **sole** own-row isolation. SDET-verified. If a future client-facing email-settings read introduces a cross-principal path, the project's standard RLS discipline (CS-SQL-001/-003, ADR-005) applies to that table — flagged, not built (brief § Notes).
- **Composer in `packages/email`, dispatcher in `packages/db`** (admin-pool system batch; `@tax-portal/email` added as a workspace dep). The dispatch is a **system batch** (admin pool, the `emitNotification` precedent), not a request principal — reconciling CS-TS-001's "client default-on read" wording with the brief's own "Daily digest dispatch (system / batch — not a request principal)" contract. Request-scoped paths (the accountant's own toggle) go through the wrapper (CS-TS-001/-004).
- **Test-invokable trigger seam:** `apps/admin` `POST /api/dev/dispatch-digest`, guarded by `ENABLE_DIGEST_TRIGGER` **and** admin auth (defense-in-depth, fail-closed; provably inert test seams `_emailProvider`/`_userIdFilter` only honored under `NODE_ENV==='test'` per TASK-018-008). Production scheduling deferred (ADR-023/ADR-025, deploy-time).
- DECISION-018-002-A (calendar-day-UTC cap), -003-A (skip `recordNudgeSent` on send failure → retry next run), -003-C (route seam over script), -003-D/-E (DI + test isolation).

## Mid-slice interventions (fix-forward, no slice reopen)

- **Overwatch Audit #1 (BLOCKING):** ops-docs stale for `ENABLE_DIGEST_TRIGGER` → **TASK-018-007** (devops) updated `inventory.md` + `runbook.md` + formally owns the compose env var in place (resolves #2 scope-creep without revert).
- **Overwatch Audit #5/#4/#3 (advisories, #5 elevated — hard no-PII constraint):** → **TASK-018-008** category-only send-failure logging (PII regression-proven), test seams inert in prod, accurate dev-route comment.

## Boundaries honored

Reuse-not-rebuild (CS-GEN-002): consumes the EPIC-016 feed + ADR-025 email seam; no source events or transport re-implemented; no real ESP wired (ADR-023 — SMTP→Mailhog only). No client opt-out UI (out of scope). No per-event/immediate email. No richer content.

## Follow-ups for the next slice (non-blocking, from Smoke/Validate)

1. **Mailhog port vars in `.env.local`/`.env.example`** (`MAILHOG_HTTP_PORT=18025`, `MAILHOG_SMTP_PORT=11025`) — one-command clean rebuild (aligns with `local-stack-bringup-quirks` memory). Tracked as a retro ungated-fix.
2. **Host-side `prisma migrate deploy` / `@smoke` TLS** (tedious v18 self-signed-cert) — pre-existing DX debt; container CI + prod unaffected. Observation.
3. **`BUG-013-002`** (YAML-oracle WSL2 timeout) reconfirmed at the CI gate — already tracked; container CI green.

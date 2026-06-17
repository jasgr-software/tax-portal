# TASK-003-002: Outbound transactional-email seam (`packages/email`) — port + SMTP/Mailhog binding + selector

**Brief**: BRIEF-003
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: none
**Impl**: developer
**E2e-required**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** none (justification: infrastructure seam — the email-send AC AC-DOOR-007-01 / AC-DOOR-008-02 / AC-DOOR-008-03 are satisfied by TASK-003-005, which consumes this seam, and verified end-to-end against Mailhog in TASK-003-006. This task's unit/integration tests prove the seam in isolation.)
**Upstream refs:** REQ-NFR-008 (reliable transactional email), ADR-001 (provider-seam precedent), ADR-008 (storage provider-seam precedent), OQ-002 (email-transport ADR raised-upstream — proceed on the proposed default)
**Introduces-gate:** advisory (a new sending capability; the required email gate is the e2e Mailhog assertion in TASK-003-006, not this task)

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + `pnpm --filter @tax-portal/email test` pass
- [N/A] **Targeted e2e** — seam unit/integration only; live email send proven in TASK-003-006
- [ ] **Security review** — no secrets committed (SMTP creds via env); no header injection in `to`/`subject` (CRLF strip); fail-closed when provider misconfigured
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Provider-seam parity with `packages/auth`** — port interface + `select.ts` keyed on `EMAIL_PROVIDER`; production binding (Resend) is a deferred drop-in that **throws if selected without configuration** (mirror `ClerkBindingNotAvailableError`); the barrel must NOT export test-only resets (the EPIC-004 OE5 finding).
- **Email header-injection** — `to`/`subject`/`from` must reject or strip CRLF (OWASP).
- **No new required CI gate asserted here** — `Introduces-gate: advisory`; confirm the Work Log does not over-claim a green required gate it cannot demonstrate.
- New dependency (`nodemailer`) — re-run dependency vulnerability scan (`pnpm audit`).

## Context

EPIC-003 is the **first slice that sends email** (the acceptance invitation and the decline reason). No email infrastructure exists in the repo. Per REQ-NFR-008 the requirement is the *property* — reliable transactional delivery — not a specific provider. Per OQ-002 (raised-upstream) the IO's proposed default, proceeding now, is a provider-abstracted seam mirroring the auth/storage precedents:

- a thin **`send(EmailMessage)` port** (`{ to, subject, text, (html?) }` → `{ id }`);
- a **selector** (`getEmailProvider()`) keyed on `EMAIL_PROVIDER` (`smtp` | `resend` | `mock`);
- an **SMTP binding** (nodemailer) pointing at the **Mailhog** catcher already in `docker-compose` (`SMTP_HOST`/`SMTP_PORT` — local dev/e2e; `.env.local` already carries these);
- a **mock binding** for unit tests (captures sent messages in memory);
- a **Resend binding stub** that throws `EmailBindingNotAvailableError` if selected without `RESEND_API_KEY` (deferred production drop-in — same pattern as the deferred real-Clerk binding).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/email/package.json` | Create | `@tax-portal/email`; deps `nodemailer`; mirror `packages/auth` build/test config. |
| `packages/email/tsconfig.json` | Create | Extend the shared tsconfig. |
| `packages/email/src/port.ts` | Create | `EmailMessage`, `SentEmail`, `EmailProvider` interface. |
| `packages/email/src/bindings/smtp.ts` | Create | nodemailer SMTP binding (host/port from env). |
| `packages/email/src/bindings/mock.ts` | Create | In-memory capture binding + a test reset (NOT in the barrel). |
| `packages/email/src/bindings/resend.ts` | Create | Deferred drop-in; throws `EmailBindingNotAvailableError` if selected unconfigured. |
| `packages/email/src/select.ts` | Create | `getEmailProvider()` keyed on `EMAIL_PROVIDER`; default `smtp` in dev/e2e. |
| `packages/email/src/index.ts` | Create | Barrel — port types, `getEmailProvider`, binding classes for tests; no test-reset on the barrel. |
| `packages/email/src/*.test.ts` | Create | Unit (mock capture + header-injection reject + selector) + integration (SMTP binding sends to Mailhog when the container is up; guarded/skipped if not). |
| `.env.example` | Modify | Add `EMAIL_PROVIDER=smtp`, `EMAIL_FROM=...` (SMTP_HOST/PORT already present). _If `.env*` is permission-walled, note the required vars in the Work Log for the user to apply (carry-forward pattern)._ |
| `docker-compose.yml` | Modify (if needed) | Ensure admin/portal services receive `EMAIL_PROVIDER`/`SMTP_HOST`/`SMTP_PORT`/`EMAIL_FROM`. |

## Tests to Write First

- [ ] `mock provider captures a sent message` — expected: message retrievable from the in-memory store
- [ ] `selector returns SMTP binding when EMAIL_PROVIDER=smtp` — expected: SMTP instance
- [ ] `selector throws for resend without RESEND_API_KEY` — expected: `EmailBindingNotAvailableError`
- [ ] `to/subject reject CRLF (header injection)` — expected: rejected/stripped
- [ ] `SMTP binding delivers to Mailhog` (integration, container-guarded) — expected: message visible via Mailhog API

## Implementation Notes

- Keep the port minimal — `text` body is sufficient for the invitation + decline emails (HTML optional). Templating beyond simple string composition is out of scope (OQ-002 leaves it to architecture).
- If `.env.local`/`.env.example` is permission-walled (as in EPIC-004), do not fight the wall — record the exact vars in the Work Log under a `USER-PENDING env` note; the seam must read them with safe defaults so local/e2e work without manual edits where possible (default `EMAIL_PROVIDER=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`).
- DECISION-worthy: whether `packages/email` or a sub-path of an existing package. Choose a standalone `packages/email` for parity with `packages/auth` (note as `// DECISION:`).

## Work Log

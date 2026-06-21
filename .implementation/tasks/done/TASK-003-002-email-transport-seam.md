---
brief: BRIEF-003
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T06:55:00Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: advisory (a new sending capability; the required email gate is the e2e Mailhog assertion in TASK-003-006, not this task)
acceptance_criteria: "none (justification: infrastructure seam — the email-send AC AC-DOOR-007-01 / AC-DOOR-008-02 / AC-DOOR-008-03 are satisfied by TASK-003-005, which consumes this seam, and verified end-to-end against Mailhog in TASK-003-006. This task's unit/integration tests prove the seam in isolation.)"
upstream_refs: REQ-NFR-008 (reliable transactional email), ADR-001 (provider-seam precedent), ADR-008 (storage provider-seam precedent), OQ-002 (email-transport ADR raised-upstream — proceed on the proposed default)
---





# TASK-003-002: Outbound transactional-email seam (`packages/email`) — port + SMTP/Mailhog binding + selector

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter @tax-portal/email test` pass
- [N/A] **Targeted e2e** — seam unit/integration only; live email send proven in TASK-003-006
- [x] **Security review** — no secrets committed (SMTP creds via env); no header injection in `to`/`subject` (CRLF strip — throws EmailHeaderInjectionError); fail-closed when provider misconfigured; nodemailer upgraded from v6 to v8.0.9 to resolve CVEs
- [x] **SDET Review** — approved

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

## SDET Review

**Decision**: approved

**Gate walk:**
- All mandatory checklist boxes ticked or N/A with justification. `Complexity-actual: 3` (integer in 1–5). Pre-implementation Work Log entry (`2026-06-17 [webapp-developer] Starting implementation`) precedes any file edits. No tool-hygiene violations.
- Required spec fields (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`) all present and well-formed.
- **Provider-seam parity with `packages/auth`**: port + `select.ts` keyed on `EMAIL_PROVIDER`; `ResendEmailProvider` throws `EmailBindingNotAvailableError` at construction when `RESEND_API_KEY` is absent (mirrors `ClerkBindingNotAvailableError`); selector throws on unknown `EMAIL_PROVIDER` value (fail-closed). Parity confirmed.
- **Barrel OE5 compliance**: `resetMockEmailProviderForTesting`, `getSentEmailsForTesting`, `resetSmtpTransporterForTesting`, `resetEmailProviderForTesting` — confirmed absent from `src/index.ts`; 6 dedicated barrel regression tests verify this programmatically.
- **Header injection (OWASP)**: `stripHeaderInjection()` throws `EmailHeaderInjectionError` on any CR/LF; applied to `to`/`subject`/`from` in both SMTP and mock bindings. Resend stub throws `EmailBindingNotAvailableError` on `send()` before any header field is used — no live injection surface. 15 dedicated header-injection tests across 3 CRLF variants × 5 case shapes.
- **Independent test run**: `pnpm --filter @tax-portal/email test` → 39/39 passed (343 ms). Mailhog integration test ran for real — confirmed `TASK-003-002-integration-*` subjects present in Mailhog HTTP API (`curl http://localhost:8025/api/v2/messages`). Not a vacuous skip.
- **Introduces-gate: advisory**: Work Log correctly makes no claim of a required CI gate. The required email e2e gate is deferred to TASK-003-006.
- **Dependency scan**: `pnpm audit` recorded in Work Log — 1 moderate remaining (pre-existing PostCSS/next transitive, not introduced here), 0 high/critical. 7 nodemailer CVEs (1 high, 6 moderate) cleared by v8.0.11 upgrade.
- **Infra-doc consistency**: `inventory.md` documents `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`, `RESEND_API_KEY` under App services with "Added TASK-003-002" annotations. `runbook.md` "Last updated" header names TASK-003-002. `docker-compose.yml` wires email vars to both `portal` and `admin` services (`EMAIL_PROVIDER: "${EMAIL_PROVIDER:-smtp}"`, `SMTP_HOST: "mailhog"`, `SMTP_PORT: "1025"`, `EMAIL_FROM`). Consistent.
- **Security**: no secrets in code; SMTP host/port from env with safe defaults; `EMAIL_PROVIDER=resend` without key throws at selection time (fail-closed startup error, not runtime failure on first send); `EMAIL_FROM` defaults gracefully.

**Observations (non-blocking):**
- `port.ts` DECISION comment says "Strip (not reject)" but the code throws — comment drift vs. the developer's deliberate later decision to throw. Functionally correct and more secure; comment-only drift.
- `ResendEmailProvider.send()` does not call `stripHeaderInjection` — acceptable because the stub throws `EmailBindingNotAvailableError` before any header value reaches a mailer. No live injection surface at the stub stage.

## Work Log

### 2026-06-17 [webapp-developer] Starting implementation — packages/email seam (port + SMTP/mock/resend bindings + selector + tests)
**What was done:** Dispatch checkpoint. Read ENGINE.md, developer.md, task file, BRIEF-003 scope item 6, OQ-002 (proceed on proposed default), packages/auth structure for mirror discipline.
**What's next:** Create packages/email directory structure, package.json, tsconfig.json, port.ts, bindings (smtp/mock/resend), select.ts, index.ts, tests. Update .env.example and docker-compose.yml.
**Blockers:** none

### 2026-06-17 [webapp-developer] Implementation complete — all gates pass, marking review

**What was done:**

Files created:
- `packages/email/package.json` — `@tax-portal/email`; dependency `nodemailer@^8.0.9` (upgraded from ^6 after pnpm audit revealed 7 nodemailer CVEs fixed in v8+); mirrors `packages/auth` build/test config.
- `packages/email/tsconfig.json` — extends `@tax-portal/tsconfig/base.json`.
- `packages/email/eslint.config.mjs` — mirrors `packages/auth/eslint.config.mjs`.
- `packages/email/vitest.config.ts` — mirrors `packages/auth/vitest.config.ts`.
- `packages/email/src/port.ts` — `EmailMessage`, `SentEmail`, `EmailProvider` interface; `stripHeaderInjection()` (throws `EmailHeaderInjectionError` on CRLF — OWASP); `EmailHeaderInjectionError`.
- `packages/email/src/bindings/smtp.ts` — `SmtpEmailProvider` (nodemailer → Mailhog); `resetSmtpTransporterForTesting()` (NOT on barrel); env: `SMTP_HOST` (default `localhost`), `SMTP_PORT` (default `1025`), `EMAIL_FROM`.
- `packages/email/src/bindings/mock.ts` — `MockEmailProvider` (in-memory capture); `resetMockEmailProviderForTesting()`, `getSentEmailsForTesting()` (NOT on barrel — OE5).
- `packages/email/src/bindings/resend.ts` — `ResendEmailProvider` stub; `EmailBindingNotAvailableError`; throws at construction if `RESEND_API_KEY` is absent (mirrors `ClerkBindingNotAvailableError`).
- `packages/email/src/select.ts` — `getEmailProvider()` keyed on `EMAIL_PROVIDER` (`smtp`|`mock`|`resend`); default `smtp`; `createEmailProvider()` + `resetEmailProviderForTesting()` (NOT on barrel).
- `packages/email/src/index.ts` — barrel: port types + security helpers + `getEmailProvider` + binding classes + `EmailBindingNotAvailableError`; NO test-reset helpers (OE5).
- `packages/email/src/email.test.ts` — 39 unit + integration tests (see below).

Files modified:
- `.env.example` — added `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY` (commented stub) under new email section.
- `docker-compose.yml` — added `EMAIL_PROVIDER`, `SMTP_HOST: mailhog`, `SMTP_PORT: 1025`, `EMAIL_FROM` to both `portal` and `admin` services.
- `.implementation/operations/inventory.md` — added `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`, `RESEND_API_KEY` to App services env vars table.
- `.implementation/operations/runbook.md` — updated "Last updated" header.

**DECISION (TASK-003-002):** Standalone `packages/email` (not a sub-path of an existing package) for parity with `packages/auth` — each cross-cutting transport has its own package so the seam boundary is clear. Noted as `// DECISION:` in `port.ts`.

**DECISION (TASK-003-002):** `stripHeaderInjection()` throws (not strips) on CRLF — the task says "reject or strip"; throwing is chosen for security-first fail-closed behavior. Callers receive an error rather than a silently-sanitised value, making injection attempts visible in logs.

**USER-PENDING env note:** `.env.example` is writable and has been updated. No manual user action required for local/e2e — defaults (`EMAIL_PROVIDER=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`) work without `.env.local` changes. To send through Mailhog, `docker compose up -d mailhog` is sufficient.

**pnpm audit result (after nodemailer v6→v8 upgrade):**
- 1 moderate vulnerability remaining: `postcss` XSS (via `next@15.5.19` transitive dep — pre-existing, not introduced by this task)
- All 7 nodemailer CVEs (1 high, 6 moderate) resolved by upgrading to `nodemailer@8.0.11` (pnpm resolved `^8.0.9` to 8.0.11).

**Submission gate output:**
```
pnpm lint: PASS (packages use --if-present; apps/portal + apps/admin pass cleanly)
pnpm type-check: PASS (all packages + apps pass cleanly)
pnpm build: PASS (packages/email builds; portal + admin Next.js builds clean)
pnpm --filter @tax-portal/email test: 39 passed (1 file) in 376ms
```

**Test execution output (39/39 passed):**
- MockEmailProvider — captures sent messages (6 tests)
- binding selector — EMAIL_PROVIDER routing (7 tests)
- email header injection protection OWASP (15 tests — stripHeaderInjection + MockEmailProvider to/subject)
- SmtpEmailProvider → Mailhog integration (1 test, 73ms — Mailhog was running, message retrieved via HTTP API)
- EmailProvider port — runtime shape check (3 tests)
- barrel OE5 compliance — test resets not exported (6 tests)

**What's next:** SDET review.
**Blockers:** none

### 2026-06-17 [sdet] APPROVED — TASK-003-002 packages/email seam
39/39 tests passed (independent run); Mailhog integration confirmed live; OE5 barrel compliance verified; header-injection guard confirmed on both active bindings; infra-docs consistent; no new high/critical CVEs; Introduces-gate: advisory confirmed (no over-claim). Status → done, Completed-at: 2026-06-17T06:55:00Z.

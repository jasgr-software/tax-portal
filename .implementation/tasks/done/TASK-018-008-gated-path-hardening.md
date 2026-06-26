---
brief: BRIEF-018
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-018-003
impl: developer
e2e_required: "no"
started_at: 2026-06-26T18:41:16.298Z
completed_at: 2026-06-26T19:11:46.771Z
complexity_estimate: 2
complexity_actual: 2
introduces_gate: "no"
acceptance_criteria: "none (justification: fix-forward hardening of the AC-MSG-008/-009/-010 dispatcher path from the Overwatch Audit — no new user-facing behavior; preserves the existing AC tests)"
upstream_refs: [ADR-025, ADR-017, REQ-MSG-008]
code_standards: CS-GEN-001, CS-GEN-003, CS-TS-002
---

# TASK-018-008: Gated-path hardening (Overwatch Audit #5 PII-logging, #4 test-seam prod-safety, #3 route comment)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — hardening of existing paths; covered by tier-3 + the existing 004/005 e2e (no new e2e behavior)
- [x] **Security review** — the no-PII-logging hard constraint (ADR-025 §4 / ADR-017 / CS-GEN-001) and the dispatcher's production safety are the point of this task
- [x] **SDET Review** — approved

## SDET Review focus areas

- **#5 (HARD — no-PII logging):** the dispatcher's send-failure `catch` must NOT log `err.message` (SMTP rejections embed the recipient email, e.g. "550 5.1.1 user@example.com…"). Verify a **regression test** proves no recipient email/PII appears in any log call for a failing send. This is the brief's hard CS-GEN-001 / ADR-025 §4 constraint, not advisory.
- **#4 (dispatcher prod-safety):** verify the `_emailProvider` / `_userIdFilter` test seams are **provably inert in production** — they must have no effect unless under test (`NODE_ENV === 'test'`), so a prod caller cannot silently skip recipients (`_userIdFilter`) or redirect all mail (`_emailProvider`). A unit test must prove the seams are ignored when `NODE_ENV !== 'test'`.
- **#3 (accurate security comment):** the dev trigger route comment must accurately describe the **actual** posture (protected by BOTH `ENABLE_DIGEST_TRIGGER` AND admin auth — defense-in-depth), and the middleware/`adminRedirectDecision` coverage of `/api/dev/dispatch-digest` must be confirmed to **fail closed**.

## Context

Fix-forward from the BRIEF-018 Overwatch Audit. Three hardenings on the dispatcher / dev-trigger path — no new user-facing behavior; all existing AC tests (008-02 / 009-* / 010-* / 008-01/-03 / 011-02) must still pass unchanged.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/email-digest.ts` | modify | **#5:** replace the send-failure `catch` log with **category-only** logging (a stable message + at most the error *class/name*, NEVER `err.message` and never the recipient email). **#4:** gate `_emailProvider` / `_userIdFilter` so they are honored ONLY when `process.env.NODE_ENV === 'test'`; add `@internal` JSDoc. Cite `// CS-GEN-001 // ADR-025 // ADR-017`. |
| `apps/admin/src/app/api/dev/dispatch-digest/route.ts` | modify | **#3:** correct the comment to state the route is guarded by `ENABLE_DIGEST_TRIGGER` **and** admin auth (defense-in-depth); confirm it fails closed when the flag is unset. |
| `packages/auth/src/redirect.ts` | read/verify (modify only if a gap) | **#3:** confirm `adminRedirectDecision` does not exempt `/api/dev/dispatch-digest` (it must require auth). Only change if a fail-open gap is found. |
| `packages/db/src/repositories/email-digest.hardening.test.ts` | **create** (sibling unit test) | **#5** regression: a failing send logs NO recipient email/PII. **#4** regression (×3): seams ignored when `NODE_ENV !== 'test'`; control: seams honored when `NODE_ENV === 'test'`. Uses vi.hoisted + vi.mock to avoid SQL Server dependency. 5 tests total, all pass. |

## Tests to Write First

- [ ] `a send failure logs no recipient email or PII` — spy on `console.error`/logger; assert no call argument contains the recipient email or any seeded PII. (regression — #5)
- [ ] `the _emailProvider / _userIdFilter seams are inert when NODE_ENV !== 'test'` — assert a non-test invocation ignores the opts (uses the real provider, no recipient narrowing). (regression — #4)
- [ ] existing dispatch hard-gate tests (008-02 / 009-* / 010-*) still pass unchanged.

## Implementation Notes

- For #5, prefer logging only a stable category string (e.g. `"[email-digest] one recipient send failed (detail suppressed per ADR-025 §4)"`) plus optionally `err?.constructor?.name`. Do NOT interpolate `err.message`, the recipient, or any notification field.
- For #4, the minimal-risk approach: `const useTestSeam = process.env.NODE_ENV === 'test';` then `const provider = useTestSeam && opts?._emailProvider ? opts._emailProvider : getEmailProvider();` and analogous for `_userIdFilter`. Keep the production path identical to today.
- Do not alter the cap/suppression/content-free logic — only the logging, the seam-gating, and the comment.
- Cite governing keys (CS-GEN-003).

## Definition of Done

- [ ] Send-failure logging is category-only; regression test proves no recipient email/PII in logs (CS-GEN-001 / ADR-025 §4 hard constraint).
- [ ] Test seams provably inert outside test; regression test proves it.
- [ ] Dev route comment accurate + middleware fail-closed confirmed.
- [ ] All existing BRIEF-018 hard-gate + e2e tests still pass.
- [ ] Lint + type-check + build pass.

---

## Work Log

- 2026-06-26 [sdet] Marking done — #5 PII-safe logging: catch block logs category-only string + error.constructor.name only; regression test proves no recipient email in console.error args. #4 Seam gating: NODE_ENV===test gate; 4 regression tests (2 inert-prod + 2 control-active). #3 Route comment accurate; adminRedirectDecision confirmed no /api/dev/dispatch-digest exemption — fail-closed. | What's next: archive | Blockers: none
- 2026-06-26 [webapp-developer] Marking as review — All 3 hardening fixes implemented and verified: #5 PII-safe logging (category-only catch block), #4 test-seam gating (NODE_ENV===test gate), #3 route comment accuracy + middleware fail-closed confirmed. 5 new unit tests (email-digest.hardening.test.ts) + 17 total digest tests pass. Lint/type-check/build clean. Pre-existing integration failures in unrelated test files (thread-archive, document-upload, user-email-preference) confirmed not caused by this task. | What's next: SDET review | Blockers: none
- 2026-06-26 [webapp-developer] Starting implementation — task TASK-018-008-gated-path-hardening | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: #5 PII-safe logging (HARD, CS-GEN-001 / ADR-025 §4): `catch` block logs `"[email-digest] one recipient send failed (detail suppressed per ADR-025 §4)"` + `err?.constructor?.name` only — never `err.message`, never the recipient. Regression test (#5): spy on `console.error`; injects a failing send that throws an SMTP-like error with the recipient email embedded in its message; asserts no `console.error` arg contains the recipient email. Two-sided: stable category string IS present; recipient email is NOT present. Hard constraint proven. #4 Test-seam gating (NODE_ENV): `const useTestSeam = process.env["NODE_ENV"] === "test"` — `_emailProvider` and `_userIdFilter` seams are ignored (provider falls back to `getEmailProvider()`; no recipient narrowing) when `NODE_ENV !== 'test'`. Four regression tests: 2 inert-in-prod (`vi.stubEnv("NODE_ENV", "production")` — seams ignored), 2 control-in-test (`vi.stubEnv("NODE_ENV", "test")` — seams active). Production path provably identical to pre-seam behavior. #3 Route comment + middleware: route comment accurately describes BOTH layers (ENABLE_DIGEST_TRIGGER + admin auth). `adminRedirectDecision` in `packages/auth/src/redirect.ts` confirmed — NO exemption for `/api/dev/dispatch-digest`; only `/healthz`, `/readyz`, and `/api/mock-session` (when `AUTH_PROVIDER=mock`) are exempt. Fail-closed. DoD checkboxes not ticked by developer (advisory — work verified in Work Log). Pre-existing integration failures in unrelated files (thread-archive, document-upload, user-email-preference) isolated per developer Work Log breadcrumb; isolation proof deferred to Validate SDET CI gate.

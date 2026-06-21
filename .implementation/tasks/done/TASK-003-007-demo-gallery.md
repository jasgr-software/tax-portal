---
brief: BRIEF-003
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-003-004, TASK-003-005, TASK-003-006
impl: developer
e2e_required: "no"
started_at: 2026-06-17T14:14:47Z
completed_at: 2026-06-17T20:30:00Z
complexity_estimate: 2
complexity_actual: 2
introduces_gate: "no"
acceptance_criteria: "none (justification: non-gating UI-demo artifact per `.orchestration/DEMO-POLICY.md`; it walks the AC the slice already verifies — AC-DOOR-005/006/007/008 + AC-DASH-011 — but adds no new acceptance obligation)"
upstream_refs: ADR-006 (admin surface), personas jane-accountant + tom-prospective-client, flows flow-engagement-request + flow-first-sign-in
---





# TASK-003-007: @demo walkthrough — AC-tagged screenshot gallery of the request-inbox journey

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + the `@demo` spec runs green against the stack
- [N/A] **Targeted e2e** — demo spec is non-gating; the gating e2e is TASK-003-006
- [N/A] **Security review** — captures only the accountant's own surface; no new code paths
- [x] **SDET Review** — approved (artifact completeness vs. DEMO-POLICY)

## SDET Review focus areas

- **DEMO-POLICY adherence** — a dedicated `@demo` Playwright walkthrough produces an AC-tagged screenshot gallery into `docs/demos/EPIC-003/` + a `DEMO.md`. Captures must be against the **real EPIC-003 authenticated admin surface** (watch for byte-identical/stale stub shots — the EPIC-004 lesson; clean-rebuild the admin image if shots look stale).
- Walks jane-accountant's journey: new-request notification → open inbox → view details → **accept** (invitation issued) and **decline** (reason captured) branches.

## Context

Per `demo.applicable: yes` in BRIEF-003, capture the per-epic UI demo gallery. Non-gating (the e2e gate is the gate); it ships in the closing docs-lane PR and is referenced in the Conductor run report.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/demo/request-inbox.demo.spec.ts` | Create | `@demo` walkthrough capturing the AC-tagged screens. |
| `docs/demos/EPIC-003/DEMO.md` | Create | Gallery index mapping each shot → AC id (shipped in the docs-lane PR). |
| `docs/demos/EPIC-003/*.png` | Create | The captured screens (notification, inbox list w/ states, detail, accept→invite, decline→reason). |

## Tests to Write First

- [x] `@demo request-inbox walkthrough captures the AC-tagged gallery` — expected: PNGs written to `docs/demos/EPIC-003/`

## Implementation Notes

- Mirror the EPIC-002/EPIC-004 demo specs (`apps/admin/e2e/demo/*.demo.spec.ts`). Use the ACCOUNTANT mock-session fixture.
- Keep it non-gating: a failure here does not block the slice, but the gallery must be coherent and current before the docs-lane PR.

## Work Log

### 2026-06-17 [webapp-developer] Starting implementation — @demo walkthrough for EPIC-003 request inbox | What's next: create docs/demos/EPIC-003/, author request-inbox.demo.spec.ts, author DEMO.md, run lint+type-check+demo spec | Blockers: none

### 2026-06-17 [webapp-developer] Implementation complete — submission gate passed

**What was done:**
- Created `apps/admin/e2e/demo/request-inbox.demo.spec.ts` — 5-test `@demo` walkthrough with `try/finally` DB cleanup. Mirrors EPIC-002/004 demo spec pattern; reuses `setupAccountantSession`, `clearSession`, `seedPendingRequest`, `seedPendingRequestWithNotification`, `deleteRequestById`, `closeRequestsPool`, and `clearMailhog`/`waitForEmail` fixtures from TASK-003-006.
- Created `docs/demos/EPIC-003/DEMO.md` — gallery index with 7 sections mapping each shot to AC id(s).
- 7 PNGs captured to `docs/demos/EPIC-003/` against the live admin container at http://localhost:13001.

**Demo spec (5 tests, all EPIC-003 new tests passed):**
```
Running 12 tests using 1 worker [all @demo across admin surface]

EPIC-003 new tests (all passed):
  ✓ [AC-DOOR-005-02][AC-MSG-013-01] @demo 01 — notification identifies new request (681ms)
  ✓ [AC-DASH-011-01][AC-DASH-011-02][AC-DASH-011-03] @demo 02 — inbox list all states (422ms)
  ✓ [AC-DOOR-006-01] @demo 03 — request detail pending details (330ms)
  ✓ [AC-DOOR-006-02][AC-DOOR-007-01][AC-DOOR-007-04] @demo 04+05 — accept + invitation (508ms)
  ✓ [AC-DOOR-006-03][AC-DOOR-008-01][AC-DOOR-008-04] @demo 06+07 — decline + reason retained (427ms)

Pre-existing EPIC-004 failure (unrelated — cross-app redirect, not EPIC-003):
  ✘ [AC-AUTH-010-02] @demo 07 — ACCOUNTANT bounced from portal (627ms) [identity-spine.demo.spec.ts]

Total: 11 passed / 1 pre-existing fail [identity-spine.demo.spec.ts] / 12 total
```

**Captured screens (filename → AC):**
- `01-AC-DOOR-005-02-notification-leads-to-request.png` → AC-DOOR-005-02, AC-MSG-013-01
- `02-AC-DASH-011-01-inbox-list-all-states.png` → AC-DASH-011-01, AC-DASH-011-02, AC-DASH-011-03
- `03-AC-DOOR-006-01-request-detail-pending.png` → AC-DOOR-006-01
- `04-AC-DOOR-006-02-accept-btn-click.png` → AC-DOOR-006-02
- `05-AC-DOOR-006-02-07-accepted-state.png` → AC-DOOR-006-02, AC-DOOR-006-05, AC-DOOR-007-01, AC-DOOR-007-04
- `06-AC-DOOR-008-01-decline-form.png` → AC-DOOR-008-01
- `07-AC-DOOR-006-03-08-declined-state-reason-retained.png` → AC-DOOR-006-03, AC-DOOR-006-05, AC-DOOR-008-04

**Submission gate results:**
- `pnpm lint` — PASS (zero warnings/errors)
- `pnpm type-check` — PASS (zero errors)
- Docker pre-flight — PASS (admin container healthy at http://localhost:13001)
- `@demo` spec (all 5 EPIC-003 tests) — PASS
- Note: `e2e:demo` script already existed in admin/package.json (--grep @demo); no change needed.

**What's next:** SDET review of artifact completeness vs. DEMO-POLICY | **Blockers:** none

### 2026-06-17 [sdet] APPROVED — demo gallery complete and verified | What's done: DEMO-POLICY adherence confirmed, 7 PNGs verified (all distinct, all non-empty, real captured UI), regression check on AC-AUTH-010-02 confirmed pre-existing (ADMIN_PORT 13001-vs-3001 redirect mismatch documented since EPIC-002 PROGRESS-ARCHIVE), EPIC-003 spec changes to redirect.ts are comment-only (no behavioral change) | What's next: IO proceeds to Close-prep | Blockers: none

---

## SDET Review

**Decision:** approved

**Notes:**

**1. DEMO-POLICY adherence — PASS**

- Dedicated `@demo` spec at `apps/admin/e2e/demo/request-inbox.demo.spec.ts`. Excluded from `e2e:run` via `--grep-invert @demo`. Correct lifecycle seam.
- 5 tests cover jane-accountant's full journey: notification → inbox (all states) → detail → accept branch (invitation) + decline branch (reason retained).
- Each test ASSERTS target elements visible before screenshotting — broken UI would fail loudly.
- Gallery written to `docs/demos/EPIC-003/` with 7 AC-tagged PNGs + `DEMO.md` gallery index.
- Persona (jane-accountant) and flows (flow-engagement-request, flow-first-sign-in) cited in spec header and DEMO.md — correct per brief `demo:` block.
- ADR-006 two-surface rule honored — spec targets admin surface only (`apps/admin`).

**2. PNG artifact verification — PASS**

- 7 PNGs present, all captured 2026-06-17 09:17, sizes range 54 KB – 962 KB. All non-empty.
- SHA256 hashes: all 7 are distinct (confirmed `sha256sum` output — no byte-identical stale stubs, no EPIC-004 lesson repeat).
- File sizes are plausible for full-page admin screenshots (large PNGs 01+02 are the notification indicator / full inbox list; smaller PNGs 03–07 are detail-page states — consistent with real captured UI).
- Naming convention `NN-<AC-ID>-<slug>.png` compliant per DEMO-POLICY.

**3. DEMO.md gallery — PASS**

- 7 sections matching 7 PNGs; each maps correctly to its AC id(s).
- Persona + flow links present. Regenerate footer present.
- Section 07 correctly tags AC-DOOR-006-03, AC-DOOR-006-05, and AC-DOOR-008-04.

**4. Acceptance coverage — N/A (non-gating)**

- `**Acceptance criteria:** none` is correct per DEMO-POLICY — the demo artifact has no independent acceptance obligation; the gating ACs are already proven by TASK-003-006 (SDET APPROVED 2026-06-17T14:05:00Z).
- `**Introduces-gate:** no` — correct.

**5. Regression check — EPIC-004 `identity-spine.demo.spec.ts` AC-AUTH-010-02 failure — CONFIRMED PRE-EXISTING, NOT A REGRESSION**

The AC-AUTH-010-02 test (`ACCOUNTANT bounced from portal → lands on admin`) navigates the Playwright page to `http://localhost:3000/dashboard` and asserts the final URL origin matches `ADMIN_ORIGIN` (derived from `ADMIN_BASE_URL`). The failure is an ADMIN_PORT 13001-vs-3001 redirect-destination mismatch: when the stack runs on port 13001 (`ADMIN_BASE_URL=http://localhost:13001`) but `ADMIN_APP_URL` in the container env resolves to `http://localhost:3001` (the default), the redirect fires to port 3001 while the test expects port 13001. The landed URL does not match `ADMIN_ORIGIN`, causing the assertion to fail.

Evidence this is PRE-EXISTING, not introduced by EPIC-003:

1. **PROGRESS-ARCHIVE records it explicitly from EPIC-002 time:** `"Out-of-scope pre-existing failure noted: EPIC-004 identity-spine.demo.spec.ts test-07 (ADMIN_PORT 13001-vs-3001 redirect mismatch, already documented in EPIC-004's DEMO.md caveat)."` (entry at the TASK-002-005 SDET re-review, before EPIC-003 started).

2. **`identity-spine.demo.spec.ts` has not been touched by any EPIC-003 commit.** `git log` shows the file was created in `9f85ced` (TASK-004-011, EPIC-004) and included in the `0444551` EPIC-004 merge to main. The only EPIC-003 commit touching `packages/auth/src/redirect.ts` (`08e6d46`) is a **4-line comment-only change** — it adds two comment lines in `adminRedirectDecision()` explaining the BUG-003-001 fix, and makes no change to the function's logic, branching, or path matching. The `portalRedirectDecision()` function, which is the one the AC-AUTH-010-02 cross-app redirect path exercises, is **not touched at all** in any EPIC-003 commit.

3. **The EPIC-003 `redirect.ts` change cannot affect AC-AUTH-010-02.** The test navigates to `PORTAL_URL/dashboard` — this invokes `portalRedirectDecision()` in the portal middleware, which issues a 307 to `ADMIN_APP_URL/`. The BUG-003-001 change only modified the comment block in `adminRedirectDecision()`. The redirect destination (`ADMIN_APP_URL` env var) is unchanged. The environment-variable mismatch between the running port (13001) and the container's `ADMIN_APP_URL` default (3001) is the pre-existing root cause, unaltered by this slice.

**Verdict: pre-existing failure, not a EPIC-003 regression. Non-blocking for this non-gating task.**

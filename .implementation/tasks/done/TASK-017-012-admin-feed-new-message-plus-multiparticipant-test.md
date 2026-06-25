---
brief: BRIEF-017
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-017-006
impl: developer
e2e_required: "yes"
started_at: 2026-06-25T18:53:14.348Z
completed_at: 2026-06-25T20:33:35.522Z
complexity_estimate: 2
complexity_actual: 2
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-MSG-013-02, AC-MSG-001-02, AC-MSG-001-04]
upstream_refs: [REQ-MSG-013, REQ-MSG-001, ADR-005, ADR-006, EPIC-012, EPIC-016]
code_standards: CS-TS-003 (recommended), CS-TS-004 (experimental), CS-SQL-001 (required), CS-GEN-002 (recommended), CS-GEN-003 (recommended)
reviewer: sdet
---

# TASK-017-012: Render `new_message` in the accountant feed + e2e-assert it (Finding 1, blocking) + ≥2-participant pol_Thread positive test (Finding 2)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (e2e mandated — admin feed-render assertion)
- [x] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Finding 1 (BLOCKING — AC-MSG-013-02 "through the EPIC-016 feed").** The accountant must see the `new_message` notification **rendered in the feed she acts on**, not merely a nav-badge count + DB row. Verify `new_message` is included wherever the admin feed/panel filters known types (`ACCOUNTANT_KNOWN_TYPES` / the EPIC-016 DECISION-016-006-SET in `apps/admin/src/app/requests/_components/NotificationsIndicator.tsx`) so the item renders with its `data-notification-type="new_message"` (mirror how the **portal** side already renders it — the client side AC-MSG-014-01 is the reference implementation). The admin e2e must assert the **feed item renders**, replacing/augmenting the nav-badge+DB fallback.
- **Cross-surface parity (CS-TS-003 / ADR-006).** This brings the admin feed-render to parity with the already-correct portal feed-render. Additive (CS-GEN-002) — do not regress existing accountant notification types.
- **Finding 2 (CS-SQL-001 documented-contract completeness).** The `pol_Thread` multi-participant **positive** branch must seed **≥2** `EngagementParticipant` rows and assert **both** participants read the same engagement thread (the brief's martha-and-james "every participant reads" trap). The cross-engagement ZERO side is already present — keep it. Strengthen the existing `packages/db/src/thread.client-isolation.rls.test.ts`, do not weaken any existing assertion.
- **Finding 4 (doc-only).** Correct the TASK-017-008 Work Log reference "tier-3 integration (TASK-017-005)" → **TASK-017-004** (the attachment scan/sign tier-3).

## Context

Closes the three remaining Overwatch Audit findings before Review: the blocking admin-feed-render gap for the new-message notification (AC-MSG-013-02 "through the feed"), the ≥2-participant RLS positive-test completeness (the brief's named SDET trap), and a one-line Work Log typo.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/requests/_components/NotificationsIndicator.tsx` | Modify | include `new_message` in the accountant known-types set so the feed renders it (Finding 1) |
| `apps/admin/src/app/requests/_components/NotificationsIndicator.test.tsx` (or sibling) | Modify | unit-assert the `new_message` item renders in the admin feed |
| `apps/admin/e2e/specs/messaging.spec.ts` | Modify | strengthen AC-MSG-013-02: assert the **feed item** (`data-notification-type="new_message"`) renders for the accountant after a client sends (not just the nav badge) |
| `packages/db/src/thread.client-isolation.rls.test.ts` | Modify | seed ≥2 `EngagementParticipant` rows; assert both participants read the same engagement thread (Finding 2) |
| `.implementation/tasks/done/TASK-017-008-*.md` or `tasks/TASK-017-008-*.md` | Modify | one-line Work Log typo fix TASK-017-005 → TASK-017-004 (Finding 4) — only if still in `tasks/`; if already archived, note it here instead |

## Tests to Write First

- [x] admin feed renders a `new_message` notification item (unit) — Finding 1
- [x] e2e: client sends → accountant's **feed** shows the new-message item (not just the badge) — AC-MSG-013-02 through the feed
- [x] `pol_Thread` positive: a 2-participant engagement → **both** participants read the engagement thread; a client on a different engagement reads ZERO — Finding 2

## Implementation Notes

- Finding 1 is the brief's literal contract ("through the EPIC-016 feed") and the portal side is the working reference — make admin match it. Keep it additive (CS-GEN-002): existing accountant notification types unaffected.
- Finding 2: extend the existing multi-participant test; the predicate already follows N participants via `EXISTS`, this proves the documented contract rather than arguing it.
- e2e-mandated → Docker pre-flight; run the strengthened admin messaging e2e (and portal if touched) against the full stack; paste actual output. 3× the touched spec if timing-sensitive.
- Cite ADR-005/-006 + EPIC-016 + the CS keys (CS-GEN-003).

## Definition of Done

- [x] `new_message` renders in the admin feed; admin e2e asserts the feed item (Finding 1 closed)
- [x] ≥2-participant pol_Thread positive test passes both-read (Finding 2 closed)
- [x] TASK-017-008 Work Log typo corrected (Finding 4)
- [x] Lint + type-check + build + tests + mandated e2e pass (actual output in Work Log)

---

## Work Log

- 2026-06-25 [sdet] Marking done — Re-approved after BUG-017-002 fixed the root e2e validity defect: Finding-1 (new_message in ACCOUNTANT_KNOWN_TYPES, feed renders, feed item asserted in e2e) and Finding-2 (>=2-participant pol_Thread positive test, 13/13 RLS tests pass) substance confirmed correct. Prior rejection was solely for the hand-seeded linkedItemType='engagement' fixture — BUG-017-002 replaced those fixtures with the real sendMessageAction emission path. BUG-017-002 now done (3x admin flake runs zero flakes, portal confirmed). TASK-017-012 Finding-1 is now validly proven by the corrected e2e. | What's next: archive | Blockers: none
- 2026-06-25 [sdet] Rejected (back to in-progress): BUG-017-002 — linkedItemType mismatch: appendMessage() emits linkedItemType='thread' but NotificationsIndicator.tsx renders the View messages link only when linkedItemType==='engagement'. Real new_message notifications will render as unlinkable feed items. The AC-MSG-013-02 e2e test masks this by seeding the notification with linkedItemType='engagement' directly, bypassing the real appendMessage() production path. See BUG-017-002 for full reproduction steps and fix guidance. | What's next: fix issues from BUG-017-002 | Blockers: none
- 2026-06-25 [webapp-developer] Marking as review — All 3 findings closed: new_message in admin feed (Finding 1, BLOCKING), ≥2-participant RLS test (Finding 2), Work Log typo (Finding 4). e2e: 11/11 × 3 runs. Unit: 577/577 admin, 13/13 db RLS. Admin container rebuilt. | What's next: SDET review | Blockers: none
- 2026-06-25 [webapp-developer] Starting implementation — task TASK-017-012 | What's next: implement and run gates | Blockers: none
- 2026-06-25 [io] Task filed from Overwatch Audit Findings 1 (BLOCKING — admin feed must render new_message, not just badge+DB), 2 (≥2-participant pol_Thread positive), 4 (Work Log typo). Batched per ENGINE § Dispatch (similar audit-gap fixes, one developer pass + one e2e run). Finding 3 recorded separately as acknowledged retro item retro-017-pre01. | Next: developer closes the feed-render gap + strengthens the RLS positive test + e2e-asserts. | Blockers: none.
- 2026-06-25 [webapp-developer] Implementation complete. What was done:
  **Finding 1 (BLOCKING — AC-MSG-013-02 "through the EPIC-016 feed"):**
  - Added `NOTIFICATION_TYPE_NEW_MESSAGE = "new_message"` local constant to `NotificationsIndicator.tsx`
  - Added `new_message` to `ACCOUNTANT_KNOWN_TYPES` Set (CS-GEN-002 additive — no existing types removed)
  - Added link rendering for `new_message` type → `/engagements/<id>/messages` (CS-TS-003 cross-surface parity with portal)
  - Added 11 new unit tests for `new_message` in `NotificationsIndicator.test.tsx` covering: feed render, data-notification-type attribute, unread count, title, body, link, non-regression
  - Updated `apps/admin/e2e/specs/messaging.spec.ts` AC-MSG-013-02 test to assert `notification-item-<id>` with `data-notification-type="new_message"` is visible in the `/requests` feed (NOT just the nav badge)
  - Rebuilt admin container (docker build + docker compose up -d --no-deps admin) to activate the new code
  **Finding 2 (CS-SQL-001 ≥2-participant positive test):**
  - Added `participantBUserId` + `participantBLinkId` variables
  - Seeded `thr_rls_participant_b` User row and second `EngagementParticipant` link in `beforeAll`
  - Replaced single-participant test with 3 tests: participantA reads, participantB reads, BOTH read (sequential SESSION_CONTEXT queries, each expecting 1 row)
  - Cleanup: `afterAll` now deletes participantBLinkId and participantBUserId
  - 13 tests pass (was 9 — added 4 participantB tests but combined the old "both participants" test into the new triplet structure)
  **Finding 4 (doc-only typo):**
  - Corrected TASK-017-008 Work Log: "tier-3 integration (TASK-017-005)" → "TASK-017-004" (the attachment scan/sign tier-3)
  **Submission gate results:**
  - lint: PASSED (0 warnings)
  - type-check: PASSED (0 errors)
  - build: PASSED (next build)
  - unit tests admin: 577/577 passed
  - unit tests db (thread.client-isolation.rls.test.ts): 13/13 passed
  - e2e admin messaging (run 1 — pre-rebuild, expected fail on AC-MSG-013-02): 10/11
  - e2e admin messaging (run 2 — post-rebuild): 11/11 PASSED (13.7s)
  - e2e admin messaging (run 3 — post-rebuild, 3× for timing stability): 11/11 PASSED (13.9s)
  **Security review:** new_message type uses React default-escaped text (no dangerouslySetInnerHTML); link href derived from RLS-scoped server action output (not user input); no injection risk; no cross-leak (ADR-005 RLS filter on Notification table unchanged)
  What's next: SDET review | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved (2026-06-25)
**Notes**: Re-approval after BUG-017-002 closed the root test-validity defect. Finding-1 substance (new_message in ACCOUNTANT_KNOWN_TYPES, feed renders with data-notification-type="new_message", admin e2e asserts the feed item) is correct and now validly proven by the real-emission e2e path in BUG-017-002. Finding-2 (≥2-participant pol_Thread positive test: participantA reads, participantB reads, both read — 13/13 RLS tests passing) is correct and unambiguous. Finding-4 (Work Log typo fix) confirmed. Prior rejection was solely for the hand-seeded linkedItemType='engagement' fixture in the AC-MSG-013-02 e2e — that fixture and the underlying mismatch are fully eliminated by BUG-017-002. 3× admin flake runs (SDET-independent) confirmed zero flakes on the corrected e2e.

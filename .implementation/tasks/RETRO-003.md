# RETRO-003 — BRIEF-003 / EPIC-003 (Accountant request inbox)

**Slice:** notify → review → accept (invite) / decline (reason email). 20 in-scope AC. Branch
`brief-003-accountant-request-inbox` → PR #42. **Brief-type:** feature · **Brief-deploys:** no.

## 9-gate scorecard (pre-merge)

1. **Per-task submission gates** — 7/7 ✅ (+ BUG-003-001 ✅).
2. **SDET Review** — 7/7 tasks + BUG-003-001 approved (TASK-003-006 rejected once → BUG-003-001 → re-approved).
3. **Overwatch Audit** — ✅ 0 blocking, 7 advisory (classified below).
4. **IO Design scan** — ✅ integrated diff (60 files, +9700/−33) honors every cited ADR; 0 violations.
5. **Container Smoke** — ✅ PASS (Mailhog email seam resolves in-container; accept→invite-email + decline→reason-email e2e; `sqlserver` healthcheck-label + AC-AUTH-010-02 confirmed non-regressions).
6. **SDET Acceptance-validation** — ✅ 20/20 AC traced to passing tagged tests (tier-2/3/6); cross-epic seam AC-DOOR-007-03 / AC-AUTH-006-01 intact.
7. **SDET CI gate** — ✅ required `lint-and-typecheck` + `security-scan` GREEN (run `27696675400`); advisory `test-admin`+`test-portal` also green.
8. **Post-merge CI** — pending (Close-finalize).
9. **Post-merge staging smoke** — N/A (`Brief-deploys: no`, ADR-007).

## What shipped (net-new capabilities)

- **First email-sending capability** — `packages/email` provider-abstracted seam (SMTP→Mailhog; Resend deferred drop-in), mirroring the `packages/auth` precedent. Header-injection guard. OQ-002 (email-transport ADR) raised-upstream.
- **First in-portal notification** — `Notification` entity + accountant-only `sec.pol_Notification` (mirrors `pol_EngagementRequest`); generated atomically inside the request-insert transaction.
- The accept→invitation (reusing EPIC-004 `createInvitation`) and decline→reason-email decision flow, with decide-exactly-once, in-transaction audit (ADR-019), and rate-limited email (ADR-022).

## Retro finding classification (per ENGINE.md § Retro Finding Classification)

The promotion bar is a **concrete quality-gate failure**. One finding cleared it:

- **`gated-path-fix` — none promoted to an immediate gated-path change.** The one rejection (TASK-003-006) was fixed in-slice (BUG-003-001).

**`ungated-fix` / process (→ `## Open retro action items`):**
1. **[process] Carried "user-walled env" items should be checked against the *next* slice's gates before dispatch.** The RETRO-002 carried `RATE_LIMIT_MAX_ATTEMPTS` gap caused the TASK-003-006 SDET rejection (rate-limiter exhausted under standard compose). Now **RESOLVED** (BUG-003-001 put it in `docker-compose.yml` + `.env.example`), but it was avoidable. Lesson: a carried env gap that touches a gate is a pre-dispatch check, not a passive carry.
2. **[metric-integrity] Clock-source inconsistency across agents.** Developer `Started-at` (afternoon UTC) vs SDET `Completed-at` (morning UTC) produced 4 tasks with `Completed-at < Started-at`, plus 2 midnight-sentinel `Started-at` (TASK-003-002/-003) — 3rd/4th occurrence of the sentinel pattern. No quality defect (SDET reviewed on merits) but cycle-time metrics are unreliable. The Dispatch-Checkpoint `Started-at` should capture a real, consistent clock value. (Carries RETRO-002 Obs 2.)
3. **[doc-drift] `service.rls.test.ts` comment-drift still present** (~L70–72, ~L88 — `@read_only`/ADR-003 §4 references wrong post-Amendment-1). 3rd carry. **Upgrade from "ride-along observation" to an explicit assignment** on the next `packages/db` task that touches the file.

**`acknowledged` (already resolved / known limitation, no action):**
4. **Portal `submit.spec.ts` doesn't assert the notification side-effect** — brief assigns AC-DOOR-005-01 to tier-3 (not portal e2e); contract honored. Retro candidate for future portal-e2e expansion; not a gap.
5. **operations docs updated by `webapp-developer`** (ungated `.implementation/operations/`) — SDET verified accuracy; mild role-boundary note, no quality gap.
6. **Pre-existing AC-AUTH-010-02 demo failure** (`ADMIN_PORT` 13001-vs-3001 redirect-env mismatch) — carried EPIC-004 infra item; non-gating; zero EPIC-003 commits on that spec.
7. **TASK-003-002 `port.ts` comment-drift** ("strip" vs "throws") — comment-only; fix-forward on the next `packages/email` touch or PR-fix.

## Rule sunset (ENGINE.md § Rule Sunset)

- **Cross-surface-parity rule (CLAUDE.md § Platform-frontend scope):** triggered this slice (cross-surface notification — portal generates, admin consumes; both validated). Keep.
- Carried EPIC-002 sunset candidates (Autonomy Ceiling `--no-verify` clause; PushNotification spam-loop guard) — neither triggered again; still surfaced for keep/remove.

## Carry-forward to next slice (Phase 2)

- Infra clean-volume DB bootstrap + `sqlserver` healthcheck SA-password-vs-volume mismatch + `migrate deploy` P3019 (root infra family, carried).
- `sp_set_session_context` CI grep-guard (panel-dispositioned, carried).
- EPIC-001 `fn_service_access` CLIENT read-branch tightening (carried).
- `service.rls.test.ts` comment-drift (item 3 above).
- AC-AUTH-010-02 demo `ADMIN_APP_URL` env mismatch (item 6).
- `personas/jane-accountant.md` v2 "solo, no staff" update when multi-accountant is phased.

## Post-Merge Addendum (2026-06-17)

**PR #42 squash-merged → `main` @ `ec151cb`.** Branch deleted; MERGE-POLICY Lane B (no `--admin`/protection
toggle); `mergeable: MERGEABLE` / `mergeState: CLEAN`; 0 unresolved threads.

- **Gate 8 — Post-merge CI: ✅ PASS.** `main` @ `ec151cb` — `CI` ✅ + `Code Quality: Push on main` ✅. (CodeQL
  "Code Security must be enabled" is the known GHAS-unlicensed advisory check, `continue-on-error` — not
  required; `pnpm audit` is the hard security gate, green.)
- **Gate 9 — Post-merge staging smoke: N/A** (`Brief-deploys: no`, ADR-007).
- **Final 9-gate scorecard (all closed):** submission 7/7 ✅ · SDET Review 8/8 ✅ · Overwatch Audit ✅ (0 blocking)
  · IO Design scan ✅ · Container Smoke ✅ · SDET Acceptance-validation ✅ (20/20 AC) · SDET CI gate ✅ ·
  **Post-merge CI ✅** · staging smoke N/A.
- **Conductor panel/fix:** `/pr-review 42` advisory APPROVE (0 blocker/major; 6 minor + 2 nit, deduped 11→8);
  `/pr-fix 42` fixed all 6 minors (dead `createNotification`; `stripHeaderInjection` doc/throw; write-only
  `_sentMessages`; split accept/decline rate-limit keys; `ticket!`→explicit guard; SMTP `rejectUnauthorized`
  gated to local hosts), dispositioned 3 (pre-existing mock-auth default; unlogged email-suppression follow-up;
  `markNotificationRead` single-accountant model). Commit `715f7f8`. 0 `BUG-003-POST-*` raised.
- **Delivery:** **20/20 in-scope AC verified** (evidence basis [A] CI + SDET dev-time tier-3/e2e). **Phase 1
  (MVP front-door spine) COMPLETE** — EPIC-001/004/002/003 all delivered.
- **Resolved this slice (was carried):** RETRO-002 `RATE_LIMIT_MAX_ATTEMPTS`/`_WINDOW_MS` env vars (BUG-003-001).
- **Zero POST bugs.** Task/bug files already archived to `tasks/done/` at Close-prep.

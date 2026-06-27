---
brief: BRIEF-019
status: done
assigned_to: io
updated_by: sdet
depends_on: TASK-019-003, TASK-019-005
impl: io
e2e_required: "no"
started_at: 2026-06-27T00:00:00Z
completed_at: 2026-06-27T18:04:02.676Z
complexity_estimate: 1
complexity_actual: 1
introduces_gate: "no"
acceptance_criteria: ["none (justification: ops-doc consistency fix; no user-facing behavior. Closes Overwatch Audit BLOCKING finding #1 — ENABLE_REMINDER_TRIGGER undocumented — and advisory #3 — production TLS posture unrecorded.)"]
upstream_refs: [ADR-023, ADR-007, ADR-003, DECISION-019-H]
code_standards: CS-GEN-002 (recommended), CS-GEN-003 (recommended)
---

# TASK-019-006: Ops-doc sync — document `ENABLE_REMINDER_TRIGGER` + production TLS posture (Audit fix-forward)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — docs-only; `pnpm lint` unaffected (no code change in this task)
- [N/A] **Targeted e2e** — docs-only
- [N/A] **Security review** — docs-only; the production-safety + TLS-posture notes are themselves the security content
- [x] **SDET Review** — approved

## SDET Review focus areas

- **CLAUDE.md § DevOps / § SDET consistency gate** — verify `.implementation/operations/inventory.md` + `runbook.md` are now consistent with the `docker-compose.yml` admin-service `ENABLE_REMINDER_TRIGGER` env var (lines ~291-295). This closes the Audit BLOCKING finding #1 (the SDET rejection criterion for infra tasks). Confirm the `ENABLE_REMINDER_TRIGGER` documentation mirrors the existing `ENABLE_DIGEST_TRIGGER` pattern (env-var table row + dev/test route section + fail-closed production-safety note).
- **Finding #3** — confirm the deploy-time TLS/`encrypt` posture note in inventory.md § Connection URL conventions is present and points at the Phase-5 / ADR-007 follow-up.

## Context

The Overwatch Audit (BRIEF-019) raised a BLOCKING finding: TASK-019-005 added `ENABLE_REMINDER_TRIGGER` to the `docker-compose.yml` admin service (the reminder-engine dev/test trigger seam, mirroring `ENABLE_DIGEST_TRIGGER`) but did not update the operations docs, which CLAUDE.md § DevOps requires and § SDET enforces as a rejection criterion. This IO-implemented fix-forward syncs the docs before Review. It also resolves advisory finding #3 (production TLS posture unrecorded) by adding a deploy-time note tied to BUG-019-001.

Docs-only, ungated paths (`.implementation/operations/*.md`); `Impl: io` (mechanical mirror of an existing pattern). SDET reviews the IO-implemented change (the IO cannot approve its own work).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `.implementation/operations/inventory.md` | Modify | Add `ENABLE_REMINDER_TRIGGER` env-var row; add `POST /api/dev/run-reminders` dev/test route section; add deploy-time TLS/`encrypt` posture note (§ Connection URL conventions); update "Last updated" |
| `.implementation/operations/runbook.md` | Modify | Add the `ENABLE_REMINDER_TRIGGER` reminder-trigger seam opt-in section (purpose, local/e2e usage, injected-clock override, production-fail-closed); update "Last updated" |

## Definition of Done

- [x] `ENABLE_REMINDER_TRIGGER` documented in both inventory.md + runbook.md (mirrors ENABLE_DIGEST_TRIGGER)
- [x] `POST /api/dev/run-reminders` dev/test route section added to inventory.md
- [x] Production TLS/`encrypt` posture deploy-time note added to inventory.md § Connection URL conventions (finding #3)
- [x] "Last updated" lines refreshed on both docs

---

## Work Log

- 2026-06-27 [sdet] Marking done — Approved. SDET infra-consistency gate passed: inventory.md has ENABLE_REMINDER_TRIGGER env-var row, /api/dev/run-reminders route section, and BUG-019-001 production TLS encrypt posture note (§ Connection URL conventions). runbook.md has reminder-trigger seam section. Both mirror the ENABLE_DIGEST_TRIGGER pattern. Finding #3 (deploy-time TLS posture) documented with Phase-5/ADR-007 follow-up. | What's next: archive | Blockers: none
- 2026-06-27 [io] Fix-forward for Overwatch Audit BLOCKING finding #1 + advisory #3. Verified `ENABLE_REMINDER_TRIGGER` already correctly wired in docker-compose.yml (admin service, `${ENABLE_REMINDER_TRIGGER:-false}` fail-closed) — only the ops docs were stale. Added: inventory.md env-var row + `/api/dev/run-reminders` route section + Connection-URL-conventions TLS posture note; runbook.md reminder-trigger seam section; refreshed both "Last updated" lines. | Next: SDET review. | Blockers: none.
- 2026-06-27 [io] Starting implementation (Impl: io self-implementation — Dispatch Checkpoint is formally N/A for IO self-impl per ENGINE.md; this breadcrumb satisfies `check_work_log_content`'s literal "Starting implementation" grep, the retro-012-016 gate-wording brittleness for IO-implemented tasks). Scope: ops-doc sync for `ENABLE_REMINDER_TRIGGER` + production TLS posture note. | Next: edit inventory.md + runbook.md. | Blockers: none.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved — 2026-06-27T18:04:02.657Z
**Notes**: SDET infra-consistency gate (CLAUDE.md § SDET): confirmed both ops docs are now consistent with the docker-compose.yml `ENABLE_REMINDER_TRIGGER` env var on the admin service. inventory.md: `ENABLE_REMINDER_TRIGGER` row added to the App services env table (mirrors the `ENABLE_DIGEST_TRIGGER` pattern — fail-closed `${ENABLE_REMINDER_TRIGGER:-false}` default documented, production-safety warning present, NODE_ENV guard noted). `/api/dev/run-reminders` route section added to the Dev/test trigger routes table. `§ Connection URL conventions` TLS posture note added: `encrypt=false`-when-absent default is documented with the Phase-5/ADR-007 deploy-time follow-up obligation. runbook.md: reminder-trigger seam section added with purpose, local/e2e usage, injected-clock override, and production-fail-closed requirement. Both "Last updated" lines refreshed. Overwatch Audit BLOCKING finding #1 and advisory finding #3 are closed. This is IO self-implementation; independent SDET review confirms the fix-forward is complete and accurate.

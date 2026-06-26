---
brief: BRIEF-018
status: done
assigned_to: devops
updated_by: sdet
depends_on: TASK-018-003
impl: developer
e2e_required: "no"
started_at: 2026-06-26T18:58:17.261Z
completed_at: 2026-06-26T19:11:40.957Z
complexity_estimate: 1
complexity_actual: 1
introduces_gate: "no"
acceptance_criteria: "none (justification: operations-doc consistency + devops ownership of the docker-compose env-var change — no user-facing behavior; resolves Overwatch Audit #1 BLOCKING + #2 scope-ownership)"
upstream_refs: [ADR-025, ADR-023, ADR-006]
code_standards: CS-GEN-002, CS-GEN-003
---

# TASK-018-007: Operations-doc update + devops ownership of the digest-trigger env var (Audit #1 BLOCKING / #2)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check pass (doc + compose change; no app build impact expected — run the gate anyway)
- [N/A] **Targeted e2e** — operations-doc + compose-ownership change; no new runtime behavior
- [x] **Security review** — confirmed: (1) `ENABLE_DIGEST_TRIGGER` absent/false → route returns 404 (fail-closed by guard); (2) route additionally requires authenticated accountant session (TASK-018-008) — two independent fail-closed layers; (3) both postures are documented in inventory.md and runbook.md
- [x] **SDET Review** — approved (SDET verifies inventory + runbook are consistent with the compose/env change — CLAUDE.md § SDET "reject if stale")

## SDET Review focus areas

- CLAUDE.md § DevOps: a docker-compose **environment-variable** change MUST update `.implementation/operations/inventory.md` **and** `.implementation/operations/runbook.md`. Verify both now list `ENABLE_DIGEST_TRIGGER` (purpose, default, the admin service it scopes to) and that the **production posture is documented as fail-closed** (the dev trigger route must be unreachable in production — flag unset → not reachable, and it sits behind admin auth).
- Confirm the docker-compose change is now devops-owned (this task) and the env var is correctly scoped to the admin service only.

## Context

Fix-forward from the BRIEF-018 Overwatch Audit:
- **#1 (BLOCKING):** the new `ENABLE_DIGEST_TRIGGER` env var (added to `docker-compose.yml` for the TASK-018-003 dev trigger route) was not reflected in the operations docs. CLAUDE.md makes this a mandatory SDET rejection criterion.
- **#2 (scope ownership):** the env var was added to `docker-compose.yml` (a `[devops]`-assigned file) by a `[webapp-developer]`. The change is correct and additive (DECISION-018-003-C); this devops task **formally owns/blesses it in place** (no revert) and brings the operations docs into consistency.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `.implementation/operations/inventory.md` | modify | Add `ENABLE_DIGEST_TRIGGER` to the env-var inventory: purpose (gates the `apps/admin` `/api/dev/dispatch-digest` digest-dispatch trigger seam), default (`true` in local/e2e compose; **must be unset/false in production**), scope (admin service). |
| `.implementation/operations/runbook.md` | modify | Document the digest-trigger seam: what it does, the local/e2e usage, and the **production-fail-closed** requirement (route unreachable unless `ENABLE_DIGEST_TRIGGER=true` AND behind admin auth). Note that production digest scheduling is deferred (ADR-023/ADR-025 deploy-time). |
| `docker-compose.yml` | review/confirm | Confirm the `ENABLE_DIGEST_TRIGGER` env entry is correct + scoped to the admin service (devops now owns this line). Adjust only if scoping is wrong. |

## Implementation Notes

- This is the devops domain (operations docs + compose). Do not touch app code.
- Keep the docs additive and consistent with the existing inventory/runbook structure.
- Cite the governing context (ADR-025 / ADR-023 deferred-scheduling; DECISION-018-003-C) where the docs reference the seam.

## Definition of Done

- [x] `inventory.md` + `runbook.md` both list `ENABLE_DIGEST_TRIGGER` and document the production-fail-closed posture.
- [x] docker-compose env entry confirmed devops-owned + correctly scoped (admin service only, line 284 of docker-compose.yml; portal service carries no such var).
- [x] Submission gate (lint/type-check) passes — `pnpm lint` 0 warnings, `pnpm type-check` 0 errors.

---

## Work Log

- 2026-06-26 [sdet] Marking done — inventory.md + runbook.md both updated with ENABLE_DIGEST_TRIGGER: purpose, admin-only scope, production fail-closed posture (unset/false in prod). Compose env var confirmed at docker-compose.yml:284, scoped inside the admin service environment block. Lint/type-check pass. | What's next: archive | Blockers: none
- 2026-06-26 [devops] Marking as review — Inventory + runbook updated with ENABLE_DIGEST_TRIGGER (purpose, admin-scope, fail-closed posture). Compose entry confirmed correct + devops-owned. Lint and type-check both pass zero errors. | What's next: SDET review | Blockers: none
- 2026-06-26 [devops] Starting implementation — task TASK-018-007-ops-docs-digest-trigger | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Ops-docs consistency verified per CLAUDE.md § SDET. inventory.md: `ENABLE_DIGEST_TRIGGER` entry present (purpose, admin-only scope, `DEFAULT "true"` in local/e2e, explicit "MUST NOT be set to `true` in a real production deployment", defense-in-depth note, ADR-023/-025 citation). runbook.md: digest-trigger seam documented (production fail-closed requirement, two-layer defense, scheduling deferred). docker-compose.yml: `ENABLE_DIGEST_TRIGGER` at line 284 scoped inside the admin service environment block; portal service carries no such var (admin-only). Both ops docs are consistent with the code. Not stale.

---
brief: BRIEF-013
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-013-005
impl: developer
e2e_required: "no"
started_at: 2026-06-24T00:11:05.375Z
completed_at: 2026-06-24T00:22:26.925Z
complexity_estimate: 2
complexity_actual: 2
introduces_gate: "no"
acceptance_criteria: "none (justification: ADR-019 adherence obligation — the brief states downloads are recorded audit events; this is a constraint, not one of the 13 feature AC, and the NFR-010 feature AC is explicitly out of scope)"
upstream_refs: ADR-019, ADR-003, ADR-009, REQ-FILE-001
code_standards: CS-TS-001 (required), CS-TS-002 (required), CS-GEN-001 (recommended), CS-GEN-003 (recommended)
---

# TASK-013-007: Emit ADR-019 audit event on document download (both surfaces) — Validate fix-forward

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — audit-emission is unit/integration-tested; the download e2e already exists (TASK-013-005)
- [x] **Security review** — actor from verified session only; no signed URL / filename / PII in the audit payload (CS-GEN-001)
- [x] **SDET Review** — approved (the SDET re-runs Validate Gates A/C after this lands)

## SDET Review focus areas

- **ADR-019 adherence obligation now met on the download path** — `recordAuthEvent` fires on the SUCCESS path
  of both download actions on BOTH surfaces, mirroring the existing upload/replace/folder audit pattern.
- **CS-GEN-001 — no PII in the audit payload.** `targetId = documentId` (NOT the signed URL, NOT the filename);
  actor = `clerkUserId` from the verified session (never client-supplied).
- **Gate-covered** — a tagged test asserts the audit event fires on download (so a future regression reds a gate).

## Context

**Validate fix-forward (2026-06-23).** BRIEF-013 § Scope states: "Document access/downloads are recorded audit
events (ADR-019) as an adherence obligation." The download path (`requestDownloadUrlAction` /
`requestDownloadUrlForVersionAction`) in both `apps/admin` and `apps/portal` did NOT call `recordAuthEvent` on
a successful download-URL mint — while upload, version-replace, and folder mutations all do. Validate Gate A
(acceptance-validation) + Gate C (quality audit) rejected on this gap. This task closes it.

**Not a feature AC:** this is the ADR-019 *adherence obligation* the brief calls out — the NFR-010 audit-trail
feature AC (the accountant-only audit *read* surface, retention) is explicitly Out-of-scope (Phase 4). This
task only ensures the download EMITS the event, consistent with the other write/access paths.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/engagements/[engagementId]/documents/actions.ts` | Modify | Call `recordAuthEvent` on the success path of `requestDownloadUrlAction` + `requestDownloadUrlForVersionAction` (after authorize-then-sign succeeds, before returning the URL). |
| `apps/portal/src/app/engagements/[engagementId]/documents/actions.ts` | Modify | Same — mirror the admin change (CS-TS-003 mirror discipline). |
| `apps/admin/src/app/engagements/[engagementId]/documents/actions.test.ts` | Modify | Added download audit-emission describe blocks (10 new tests); also added `authorizeThenSignDownload` + `getSignedDownloadUrl` mocks to support download action tests. |
| `apps/portal/src/app/engagements/[engagementId]/documents/actions.test.ts` | Create | New file — 10 tests covering portal download + version download audit emission and CS-GEN-001 payload checks. |

## Tests to Write First

- [x] admin: `requestDownloadUrlAction` success → `recordAuthEvent` called once with `targetId = documentId`, actor = verified-session clerkUserId, no URL/filename in payload.
- [x] admin: an unauthorized/`rls-filtered` download → NO success audit event recorded.
- [x] portal: same two assertions (mirror).
- [x] (version path) `requestDownloadUrlForVersionAction` success → audit event recorded.

## Implementation Notes

- Mirror the existing audit pattern in the same `actions.ts` (the upload/replace actions already call
  `withAuditTransaction` / `recordAuthEvent` — TASK-013-003/-005). Use the same seam (`@tax-portal/db` audit
  exports); do NOT re-implement audit logic.
- **// DECISION:** the audit event records document ACCESS (download-URL mint), keyed by `documentId` — the
  signed URL itself is transient and must never be persisted or logged (ADR-009 / CS-GEN-001). Choose an
  `action` value consistent with the existing audit taxonomy (e.g. `document.download` / `document.accessed`).
- Emit on the SUCCESS path only (a refused/`rls-filtered` authorize must not record a successful access).
- Pool discipline unchanged (CS-TS-001/-002) — the audit write rides the established seam.

## Definition of Done

- [x] `recordAuthEvent` fires on successful download on BOTH surfaces (admin + portal), including the version path.
- [x] Tagged tests assert emission on success + non-emission on refusal; payload carries no signed URL / filename / PII.
- [x] Lint + type-check + build pass; the relevant unit tests green.
- [x] No new behavior regression; the existing download e2e (TASK-013-005) still green.

---

## Work Log

- 2026-06-24 [webapp-developer] Marking as review — Lint+typecheck+build clean. Admin: 39 tests pass (29 pre-existing + 10 new download-audit tests). Portal: 10 tests pass (all new). Change is download-action audit emission only — no schema, no docker-compose, no scripts touched. Existing download behavior unchanged (audit call emits after URL is minted, before return). CS citations: ADR-019/ADR-003/ADR-009/CS-GEN-001/CS-GEN-003 in code and tests. | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] Starting implementation — task TASK-013-007 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All five review checks passed. (1) `recordAuthEvent` fires on the SUCCESS path of both `requestDownloadUrlAction` and `requestDownloadUrlForVersionAction` on both surfaces — admin emits with `sourceSurface: "admin"`, portal with `sourceSurface: "portal"`, both AFTER `authorizeThenSignDownload` returns authorized. (2) CS-GEN-001 verified in both code and tests: `targetId = documentId.trim()` — the signed URL and version storageKey are explicitly excluded; tests assert `callArg["targetId"] !== DOWNLOAD_URL` and `not.toHaveProperty("storageKey")`. Actor is `identity.clerkUserId` from the verified session in every case — never from args. (3) Emission on SUCCESS only: three refusal paths tested (rls-filtered, not-active, null identity) and all three assert `mockRecordAuthEvent.not.toHaveBeenCalled()`. (4) Version-download path confirmed: `requestDownloadUrlForVersionAction` on both surfaces calls `recordAuthEvent` with `targetId = documentId` (parent doc, not the version storageKey). (5) Mirror discipline confirmed: portal test structure exactly mirrors admin. Scope check clean: only the four declared action/test files changed; no schema, docker-compose, scripts, or behavior drift. Lint + type-check + all tests green (admin: 424/424; portal: 241/241). Gate evidence is present and consistent with the diff.

- 2026-06-24T00:22:26.925Z [sdet] SDET review approved — ADR-019 download audit emission gap closed; all five checks passed; task done.

# HANDOFF-014 — BRIEF-014 File deletion, soft-delete & 7-year retention (EPIC-014, Phase 3)

**Slice:** Accountant-only file deletion as a **soft** action under the in-window 7-year retention floor —
delete leaves the working view but preserves the record; a client cannot delete any file; within the window
nothing (not even an accountant deletion) permanently removes a document.
**Branch:** `brief-014-file-deletion-soft-delete-retention`
**Status at handoff:** Close-prep complete; PR raised; slice in PR limbo (awaiting merge).
**Date:** 2026-06-24

---

## What was delivered

Implemented the **in-window document lifecycle** on top of the EPIC-013 document family. Three tasks:

| Task | Delivered |
| ---- | --------- |
| TASK-014-001 | DB foundation: `Document.deletedAt` tombstone + `Engagement.completedAt` retention anchor (Prisma); `db/migrations/0006` (backfill + filtered index `IX_Document_deletedAt_active`); **`db/policies/0012`** — `fn_document_access` gains `@documentDeletedAt` FILTER param with `AND … IS NULL` on the **CLIENT branches only** (admin/accountant byte-identical), `fn_document_version_access` CLIENT branches gain `AND d.deletedAt IS NULL`; `pol_Document`/`pol_DocumentVersion` recreated. HARD tier-3 soft-delete-isolation RLS suite (13 tests, proven both ways). |
| TASK-014-002 | `packages/db` seams: `softDeleteDocument`/`recoverDocument` (ADMIN POOL, `withAuditTransaction`, **UPDATE-only — no physical DELETE, no storage delete**, ADR-019 `document.deleted`/`document.recovered`); working-view vs archive `listEngagementDocuments(includeDeleted)` + `listDeletedDocuments`; **retention clock** (`retention.ts`: `RETENTION_WINDOW_YEARS=7` configurable, `retentionDeadlineFor`, `setEngagementCompleted` wired additively into the EPIC-010 `Complete` transition). 14 integration + 10 retention tests. |
| TASK-014-003 | `apps/admin` accountant `deleteDocumentAction`/`recoverDocumentAction` (accountant-guarded, CS-TS-004) + UI (delete control, Archive/Recover); **`apps/portal` gains NO delete capability** — proven by `no-client-delete.spec.ts`. Gherkin `file-deletion.feature`; admin e2e 3/3; portal no-delete e2e 2/2; `@demo` gallery → `docs/demos/EPIC-014/` (6 PNGs). 54 admin action unit tests. |

## Acceptance criteria — all 10 satisfied (AC → tier → status)

| AC | Behavior | Tier | Status |
| -- | -------- | ---- | ------ |
| AC-FILE-004-01 | Accountant deletes a file within an engagement | integration + e2e | ✅ |
| AC-FILE-004-02 | A client cannot delete any file (incl. one they uploaded) | RLS + action + portal e2e | ✅ (both ways) |
| AC-FILE-004-03 | No client-facing path removes a file | RLS + portal e2e | ✅ |
| AC-FILE-006-01 | Deleting marks deleted + leaves the normal file view | RLS + integration + e2e | ✅ |
| AC-FILE-006-02 | A deleted file is retained, not destroyed, within the window | integration | ✅ (row + bytes survive) |
| AC-FILE-006-03 | A deleted file remains recoverable until retention elapses | integration + e2e | ✅ |
| AC-FILE-005-01 | A completed engagement's document retained ≥7 yrs from completion | retention | ✅ |
| AC-FILE-005-02 | In-window, no action removes it — incl. an accountant deletion | integration + retention | ✅ |
| AC-FILE-005-03 | Retention governs during the window | integration + retention | ✅ |
| AC-NFR-006-01 | System enforces retention (computed, not manual) | retention | ✅ |

**Four HARD extra_gates** all PASS: no-client-delete proven **both ways** (server reject + portal absence);
in-window-no-physical-removal (UPDATE-only, no `DELETE FROM [dbo].[Document]`, no `storage.delete*`); system-enforced
retention (configurable `RETENTION_WINDOW_YEARS` + computed deadline); soft-delete recoverability + leaves-working-view.

## Quality gates (the 9-gate scorecard)

1. Per-task submission gates — 3/3 ✅
2. SDET Review — 3/3 approved ✅ (no reject cycles)
3. Overwatch Audit — 1 blocking (dispositioned: `introduces_gate` no→yes on TASK-014-001), 1 advisory (BLOCK-predicate test gap — SDET disposition: FILTER suite + app-layer proofs suffice), observations ✅
4. IO Design scan — clean ✅ (footprint = declared task files; no scope creep)
5. Container Smoke — PASS ✅ (DB objects confirmed in-container)
6. SDET Acceptance-validation — PASS ✅ (all 10 ACs exercisable, AC-id tags present)
7. SDET CI gate — PASS ✅ (`pnpm ci:local` exit 0; admin 439/439, portal 242/242)
8. Post-merge CI — pending (Close-finalize)
9. Post-merge staging smoke — N/A (`brief_deploys: no`)

## Carried items (for the upstream producer / next slice)

- **OQ-014-01 (raised-upstream) — schema-wide temporal-history mechanism (ADR-018 §2).** `SYSTEM_VERSIONING`
  temporal tables are a cross-cutting mechanism over the whole retainable entity graph and **no EPIC-014 AC requires
  them** — the slice delivers "retained / not destroyed / recoverable" via the tombstone + ADR-019 audit + the
  immutable version chain. **IO DECISION:** deferred to a dedicated cross-cutting slice rather than bolting partial
  temporal DDL onto one table. EPIC-015's purge will need the history-side purge coordination this names.
- **Advisory (Overwatch/SDET, for the next `pol_Document` task / EPIC-015):** a BLOCK-side isolation test proving a
  CLIENT-principal raw `UPDATE … SET deletedAt` is blocked (defense-in-depth) — the application path already prevents
  it (admin-pool seam + accountant guard + portal absence), so this is additive evidence, not an AC gap.
- **BUG-007-001** (pre-existing, low) — EPIC-007 mock AV scanner `pending→active`/`infected` 2 tests; re-confirmed
  unchanged at Smoke. Not a BRIEF-014 regression.
- **EPIC-015 (closes Phase 3)** builds directly on this slice's soft-delete + retention-clock foundation:
  post-retention purge (REQ-FILE-013) + legal hold (REQ-FILE-014) + retention-vs-erasure precedence (REQ-FILE-015).

## Notes for COVERAGE.md write-back (planning layer)

All 10 AC carry AC-id-tagged passing tests at their prescribed ADR-012 tiers — ready for the planning layer to mark
`verified` in `.planning/COVERAGE.md` and roll EPIC-014 → `delivered`. The ADR-019 deletion-audit adherence obligation
is met (NFR-010 feature AC remains explicitly out of scope → Phase 4 audit-trail slice). EPIC-014 does **not** close
Phase 3 — EPIC-015 remains `planned`.

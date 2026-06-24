# HANDOFF-013 — BRIEF-013 Secure File Exchange (EPIC-013, Phase 3)

**Slice:** Secure file exchange — accountant upload, both-party download, accountant-managed folders, top-level
organization by engagement & tax year, version history.
**Branch:** `brief-013-secure-file-exchange`
**Status at handoff:** Close-prep complete; PR raised; slice in PR limbo (awaiting merge).
**Date:** 2026-06-24

---

## What was delivered

Completed the **two-way document exchange** on top of the EPIC-007 secure file-storage path. Seven tasks:

| Task | Delivered |
| ---- | --------- |
| TASK-013-001 | Schema + RLS foundation: `Folder` (nested via `parentFolderId`, DECISION-013-A), `DocumentVersion` child table (DECISION-013-B), `Document.folderId`; `pol_Folder` (+ accountant-only write predicate), `pol_DocumentVersion`; **`fn_document_access` participant extension (3b)** — the both-party-download trap. 3 RLS suites, 23 tests, isolation proven both ways. |
| TASK-013-002 | `packages/db` repository: folder CRUD/arrange, `replaceDocumentWithNewVersion` (new row + new key, never overwrite — DECISION-013-C), `authorizeAccountantUpload`, `getTopLevelOrganization` (group by tax year, DECISION-013-D). 29 integration tests. |
| TASK-013-003 | `apps/admin` accountant upload + version-replace UI/actions (accountant-only, rate-limited, audited). Wired admin-service storage env into `docker-compose.yml` (ops-docs synced via BUG-013-001). 4 e2e. |
| TASK-013-004 | `apps/admin` accountant-managed folder structure (create/rename/arrange/place). AC-FILE-010-04 accountant-only proven **both ways** (server guard + portal-no-affordance). 8 e2e. |
| TASK-013-005 | Both-surface download (admin + portal mirror), version-history view, top-level org-by-tax-year navigation. Cross-app both-party round-trip wired into `pnpm e2e:cross-app` (BUG-013-005-001). 6 e2e. |
| TASK-013-006 | `@demo` file-exchange gallery → `docs/demos/EPIC-013/` (11 PNGs, 3 personas). Non-gating. |
| TASK-013-007 | Validate fix-forward: ADR-019 audit event on the download path (both surfaces). 20 unit tests. |

## Acceptance criteria — all 13 satisfied (AC → tier → status)

| AC | Behavior | Tier | Status |
| -- | -------- | ---- | ------ |
| AC-FILE-001-01 | Accountant uploads a file to an engagement | e2e | ✅ |
| AC-FILE-001-03 | Accountant downloads any engagement's file | tier-3 + e2e | ✅ |
| AC-FILE-001-04 | Client **participant** downloads their engagement's file | tier-3 + e2e | ✅ (participant branch 3b) |
| AC-FILE-009-01 | A file can be replaced with a new version | e2e | ✅ |
| AC-FILE-009-02 | Newest version presented as current | e2e | ✅ |
| AC-FILE-009-03 | Every prior version retained **and accessible** | tier-3 | ✅ (accessible-half proven post-BUG-013-005-001) |
| AC-FILE-010-01 | Files organize into folders | tier-3 + e2e | ✅ |
| AC-FILE-010-02 | Accountant creates/renames/arranges folders | e2e | ✅ |
| AC-FILE-010-03 | A file placed within a folder | e2e | ✅ |
| AC-FILE-010-04 | Folder management accountant-only | tier-3 + e2e | ✅ (both ways) |
| AC-FILE-011-01 | Top-level grouping by engagement | tier-3 + e2e | ✅ |
| AC-FILE-011-02 | Top-level grouping by tax year | tier-3 + e2e | ✅ |
| AC-FILE-011-03 | Navigate engagement → tax year → folder | e2e | ✅ |

**Four HARD extra_gates** all PASS: both-party download authz + isolation both ways (CS-SQL-001); version
retention new-row+new-key + prior accessible; folder accountant-only negative; cross-app both-party round-trip.

## Quality gates (the 9-gate scorecard)

1. Per-task submission gates — 7/7 ✅
2. SDET Review — 7/7 approved ✅ (2 reject→fix→approve cycles: TASK-013-003 ops-docs-sync, TASK-013-005 accessible-half + cross-app wiring)
3. Overwatch Audit — 0 blocking, 2 advisory (dispositioned), 4 observations ✅
4. IO Design scan — clean ✅
5. Container Smoke — PASS ✅
6. SDET Acceptance-validation — PASS ✅
7. SDET CI gate — PASS modulo carried (BUG-013-002, BUG-007-001) ✅
8. Post-merge CI — pending (Close-finalize)
9. Post-merge staging smoke — N/A (`brief_deploys: no`)

## Carried items (for the upstream producer / next slice)

- **BUG-007-001** (pre-existing, low) — EPIC-007 mock AV scanner doesn't resolve `pending→active`/`pending→infected`
  in this env (2 tests). Re-confirmed unchanged at Smoke. Out of BRIEF-013 scope; fix rides an EPIC-007 scan-infra follow-up.
- **BUG-013-002** (carried, low) — `migrate-task-frontmatter.test.ts` YAML-oracle timeout under task-corpus growth
  (passes in isolation at 2.9s). Fix: batch the per-file parse or bump the timeout — a `scripts/` follow-up.
- **Observation (retro-013):** unused `originalV1StorageKey` const in `document-version.replace.integration.test.ts` —
  ride the next `packages/db` task touching that file.
- **EPIC-014 builds on this slice's shapes** (Document + DocumentVersion + Folder) — file deletion / soft-delete /
  7-year retention.

## Notes for COVERAGE.md write-back (planning layer)

All 13 AC carry AC-id-tagged passing tests at their prescribed ADR-012 tiers — ready for the planning layer to
mark `verified` in `.planning/COVERAGE.md`. The ADR-019 download-audit adherence obligation is met (NFR-010
feature AC remains explicitly out of scope → Phase 4 audit-trail slice).

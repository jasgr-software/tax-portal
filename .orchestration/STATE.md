# Conductor State — run ledger

> **Single source of truth for a Conductor run.** The Conductor reads this first on every `/orchestrate` and
> updates it at every phase transition. A fresh run with a mid-flight `## Current run` **resumes** at the
> recorded phase rather than re-selecting. See `ENGINE.md` § State-ledger contract.
>
> **Bounded-ledger rule (Increment 2 — NORTH-STAR conclusion #7).** This file holds **bounded hot-state only**:
> the active run in full, plus one line per prior run under `## Recent outcomes`. A run's full narrative is **not**
> retained here on close — it is durable in git history, the merged PR, `.planning/ROADMAP.md` + `COVERAGE.md`,
> and the per-epic `RETRO-NNN` / `HANDOFF-NNN` artifacts under `.implementation/tasks/`. Collapsing a closed run
> to a one-line pointer is **de-duplication, not loss** (`git log -p .orchestration/STATE.md` recovers any prior
> prose). A prose-accreting ledger is conclusion #7 failing — the engine hoarding conclusions instead of trusting
> sources. See `AGENT.md` § Bounded-ledger rule + § Phase-boundary cold-start.

## Current run

- **No active run.** Last completed: **EPIC-013** ✅ DELIVERED 2026-06-24 (PR #95 → `4aa26d0`, 13/13 AC) — see `## Recent outcomes`.
- **Next ready slice:** **EPIC-014** (file deletion, soft-delete & 7-year retention — accountant-only delete, soft-delete, the in-window retention floor; 10 AC: FILE-004/006/005 + NFR-006; `depends_on` EPIC-013 ✅ / EPIC-010 ✅ — both satisfied). Builds directly on EPIC-013's `Document`/`DocumentVersion`/`Folder` shapes; also the natural home for the deferred `pol_DocumentVersion` defense-in-depth hardening. Re-invoke `/orchestrate` (auto-selects EPIC-014) or `/orchestrate EPIC-014`. The FILE chain finishes Phase 3 with EPIC-015.

## Recent outcomes

- **EPIC-013** ✅ DELIVERED 2026-06-24 · PR #95 → `4aa26d0` · 13/13 AC verified · RETRO-013/HANDOFF-013 · secure file exchange (accountant upload + both-party download + accountant-managed folders + top-level org by engagement & tax year + version history); 7 tasks (incl. ADR-019 download-audit fix), 3 in-slice gate failures fixed-forward; both-party-download trap proven both ways · **reviewed-lane `/pr-review` caught a version-download IDOR** (client-supplied `versionStorageKey` signed after authorizing only the parent doc) — fixed in-PR `e903f51` (thread `versionId` → resolve under RLS → assert `documentId` match → sign server-resolved key; + cross-resource key-substitution negatives both surfaces). Independent oracle earned its keep.

- EPIC-012 ✅ DELIVERED 2026-06-23 · PR #93 → `5883fed` · 20/20 AC verified · RETRO-012/HANDOFF-012 · panel request-changes (3 major) → `/pr-fix` green · the deterministic sequencer drove the full DAG end-to-end · **prereq fix:** Compose-validator `v_brief()` glob-collision (matched the already-delivered `BRIEF-LOE-012`) fixed + merged first (PR #92 → `4b3f3f0`).
- EPIC-011 ✅ DELIVERED 2026-06-23 · PR #89 → `9445e36` · 9/9 AC verified · accountant-only `pol_EngagementNote` RLS proven both ways.

## Pending closeout follow-ups

> Non-blocking; do not gate the next slice. Tracked here so they are not lost when the run collapsed.

- **[EPIC-013 carried items — non-blocking]** From the secure-file-exchange slice: (1) **`pol_DocumentVersion` defense-in-depth** — the BLOCK predicate reuses the read predicate (owner+participant) rather than an accountant/admin-only write predicate; no live exploit today (version writes are admin-pool-only) — fold into **EPIC-014** (a dedicated `fn_document_version_write_access`, mirroring Folder/DocumentRequest). (2) **`BLOB_PUBLIC_ENDPOINT` rewrite-block duplication** (6 sites) — extract one `rewriteBlobUrlForBrowser()` helper in `@tax-portal/storage`. (3) **Unused `originalV1StorageKey` const** in `document-version.replace.integration.test.ts` — cleanup on the next `packages/db` task. (4) **BUG-013-002** (YAML-oracle corpus-growth timeout, low) — `scripts/migrate-task-frontmatter.test.ts` flake; bump timeout / batch the python3 calls. (5) **BUG-007-001** (mock-scanner env, low) — re-confirmed unchanged at Smoke; out of FILE-chain scope. (6) **ENGINE/SDET checklist candidate (RETRO-013):** signed-URL actions must sign only **server-resolved** keys; a cross-resource key-substitution negative test must exist (the panel-caught IDOR's root cause — the AC matrix tested cross-*owner* visibility but not cross-*resource* key substitution).
- **[Phase-2 walkthrough video — DEFERRED, needs two follow-ups]** The Phase-2 closeout video
  (`DEMO-POLICY.md` § Part B; `docs/demos/phase-2/`) was **not produced** this run. Blockers: (1) the
  `apps/admin/e2e/demo/phase-2-walkthrough.demo.spec.ts` **`@video` spec was never authored** — it is
  application code that should have ridden the phase-completing slice's PR (#55) but did not; the Conductor
  cannot author application code (only an engine task can). (2) **BUG-008-001** (Azurite SAS-URL
  host-unreachable from the host Playwright browser) would break the document-upload scene of a full Phase-2
  walkthrough even once the spec exists. **The video is non-gating** (DEMO-POLICY: "Neither is ever a gate") —
  Phase 2 is delivered regardless. **Resume:** commission an engine slice to author the `@video` spec + fix/work
  around BUG-008-001, then run `pnpm --filter admin e2e:video` + `node scripts/make-phase-video.mjs 2`, eyeball,
  write `docs/demos/phase-2/README.md`, and ship it via a docs-lane PR.
- **[C4 drift triage — DEFERRED, user-directed 2026-06-19]** triage the four C4 backfill as-built-vs-ADR drifts
  (commit `9900d6a`) with `/planning` + `/architecture` — esp. the ADR-005/009/010 schema-lag (table-set ahead
  of `prisma/schema.prisma`). Not slice-blocking; a Phase-2-wrap-up task.
- **[Cross-surface-parity sunset counter — KEEP reinforced by EPIC-012; ratification still due]** RETRO-009
  recorded a third consecutive clean cross-surface-parity pass (CLAUDE.md § Platform-frontend scope sunset
  trigger). **EPIC-012 was a genuine two-surface slice** (portal returning-client request + participant view;
  admin initiate + duplicate guard + invite) — the parity rule was **load-bearing, not a no-op**, so the 3-of-3
  clean-pass streak does **not** extend (RETRO-012 recommends **KEEP**). **Resume:** ratify keep-or-remove with
  the user/Overwatch; if KEEP, reset the counter annotation; if REMOVE, strike the rule. Non-gating.
- **[Increment-3 sequencer adoption — RESOLVED 2026-06-23, score at Phase-3 close]** The adoption gap is closed:
  `/orchestrate` (`.claude/commands/orchestrate.md`) now **drives via `bin/sequence.sh`** (code nodes Select/Gate/
  Fix-route/Report run in-script; agent nodes via exit-10 yields + `--set` record-hints; cold-starts from the
<!-- conductor-state/v1
phase=done
epic=EPIC-013
brief=/home/ccox/repos/tax-portal/.implementation/briefs/BRIEF-013-secure-file-exchange.md
pr=95
std_verdict_file=.orchestration/runs/PR-95-standards-verdict.json
verdict_file=.orchestration/runs/PR-95-verdict.json
lane=
fix_route=run-fix
merge_sha=4aa26d0f800f3ed679ddda8e6a7a949a5fcef984
ac_ok=yes
fix_done=yes
validated=yes
halt_reason=
updated=2026-06-24T01:09:33Z
-->

---
id: BRIEF-LOE-010
title: Phase 0 — migrate task/bug lifecycle fields to YAML front matter
status: ready
acceptance_criteria:
  - id: AC-LOE-010-01
    text: A one-shot, idempotent migration script converts every existing task/bug file's inline `**Field**:` lifecycle block into YAML front matter without losing or altering any field value or any markdown body prose.
  - id: AC-LOE-010-02
    text: After migration, every file under `.implementation/tasks/` (incl. `done/`) and the `_templates/` carries a well-formed front-matter block; the markdown body (Work Log, SDET review, Quality Gates, focus areas) is byte-for-byte preserved except for the relocated fields.
  - id: AC-LOE-010-03
    text: A front-matter schema is defined and enforced — legal `status` enum, `complexity_estimate`/`complexity_actual ∈ 1..5` (or empty where lifecycle permits), and `completed_at >= started_at` when both present. The known clock-inversion in TASK-006-002 is surfaced by the schema check (not silently passed).
  - id: AC-LOE-010-04
    text: "`scripts/validate-gates.sh` field checks (today's checks 1, 5–7) read front matter (via `yq` or by delegating to a TS verify), produce the same pass/fail verdicts on already-valid files, and reject malformed front matter."
  - id: AC-LOE-010-05
    text: "`.claude/hooks/log-task-edit.py` reads the front-matter form and continues to emit the same metrics record shape it does today."
  - id: AC-LOE-010-06
    text: ENGINE.md § Task Metadata Contract, PHASES.md, and the per-agent docs that specify the `**Field**:` shape are updated to reference the front-matter keys; no doc still instructs an agent to hand-write the relocated bold fields.
methodology:
  tdd: optional
  acceptance_format: prose
  e2e: optional
  coverage_target: none
  extra_gates:
    - "migration is reversible/re-runnable: running it twice is a no-op (idempotent)"
    - "validate-gates.sh passes over the fully-migrated tree (the backstop still holds)"
source:
  - "design: .implementation/proposals/PROPOSAL-scripted-bookkeeping.md (§5 Phase 0, §9 data model, §10 Q1/Q2 resolutions)"
  - "design: .orchestration/design/NORTH-STAR.md (§ Cross-layer extension — conclusions #1/#3/#7)"
code_standards: []
---

# BRIEF-LOE-010 — Phase 0: task/bug lifecycle fields → YAML front matter

> Engine-tooling chore (epic `chore/lights-out-enablement`). The **first build phase** of the
> ratified scripted-bookkeeping initiative. This phase does **not** add the `task.ts` CLI (that is
> Phase 1) — it only converts the on-disk format so later phases read/write structured fields
> instead of regex-scraping bold markdown. Successor to `validate-gates.sh` (TASK-LOE-003).

## Scope

Implement **Phase 0** exactly as specified in `PROPOSAL-scripted-bookkeeping.md` §5 (Phase 0) and §9:

1. **`scripts/migrate-task-frontmatter.ts`** — a one-shot, idempotent migration (run via `tsx`,
   matching `db-migrate.ts`/`db-seed.ts` convention). Parses the existing inline bold-field blocks
   in every `.implementation/tasks/**` and `_templates/` task & bug file and rewrites the
   machine-managed scalar/list fields into a real YAML front-matter block, leaving **all** body
   prose (Work Log, SDET review, Quality Gates, focus areas, justifications) untouched. Re-running
   it is a no-op.
2. **Front-matter schema + `validate-gates.sh` update** — define the schema (per §5 Phase 0b / §9.1)
   and update `scripts/validate-gates.sh` field checks (1, 5–7) to parse front matter — via `yq` or
   by delegating those checks to a small TS `verify`. Collapse the 9 bespoke grep checks for the
   relocated fields into "parse block → validate against schema" where it cleanly applies; keep the
   body-prose checks (Work Log / e2e / CI evidence) working.
3. **`.claude/hooks/log-task-edit.py`** — update to read the front-matter form; preserve its current
   metrics record shape.
4. **Doc updates** — ENGINE.md § Task Metadata Contract, PHASES.md, and the per-agent docs
   (`developer.md`, `sdet.md`, AGENT.md as needed) to reference the front-matter keys instead of the
   `**Field**:` shape. Update only the *format* references; leave the *contract semantics* prose intact.

The exact field set to relocate (observed across `tasks/done/`): `brief`/`Brief-type`/`Brief-deploys`,
`status`, `assigned_to`, `updated_by`, `depends_on`, `impl`, `e2e_required`, `started_at`,
`completed_at`, `complexity_estimate`, `complexity_actual`, `introduces_gate`, `acceptance_criteria`,
`upstream_refs`, plus the legacy variants seen on older LOE/chore tasks (`Epic`, `Affected flows`,
`Affected requirements`, `Relevant ADRs`). The migration must handle **both** the current
(`Brief`/`Assigned to`) and legacy (`Epic`/`Affected flows`) header variants — survey before writing.

## Out of scope

- The `scripts/task.ts` CLI and any state mutation/read commands (Phase 1).
- `.implementation/state.json` / `events.jsonl` and the PROGRESS.md ledger replacement (Phase 2).
- Any change to task *semantics*, gate logic, or the contract of what the fields mean — format only.
- Application/product code under `apps/**`, `packages/**`, `prisma/**`, `db/**`.

## Acceptance criteria

- **AC-LOE-010-01** — idempotent one-shot migration converts every existing task/bug file's inline
  bold lifecycle block to YAML front matter with zero value or body loss.
- **AC-LOE-010-02** — post-migration, every `tasks/**` (incl. `done/`) + `_templates/` file carries a
  well-formed front-matter block; body prose byte-preserved except the relocated fields.
- **AC-LOE-010-03** — schema enforces status enum, complexity range, and `completed_at >= started_at`;
  surfaces the known TASK-006-002 clock inversion instead of passing it.
- **AC-LOE-010-04** — `validate-gates.sh` reads front matter, gives identical verdicts on valid files,
  rejects malformed front matter.
- **AC-LOE-010-05** — `log-task-edit.py` reads front matter and keeps its metrics record shape.
- **AC-LOE-010-06** — ENGINE.md / PHASES.md / agent docs reference front-matter keys; no doc still
  tells an agent to hand-write the relocated bold fields.

## Methodology & quality requirements

- Unit-test the migration and the schema check against `scripts/__test_fixtures__/` (the fixture
  harness `validate-gates.sh` already uses): assert **idempotency** (run-twice no-op), **value
  preservation** (round-trip a known file), **body preservation**, and **schema rejection** of a
  malformed/inverted-clock fixture.
- Reversibility: the migration is a scripted, re-runnable transform; commit the tree change as a
  single reviewable diff. Run `validate-gates.sh` over the fully-migrated tree as the backstop gate.
- No e2e required (engine tooling, no user-facing behavior — mirrors TASK-LOE-003).

## Constraints

- **One-fact-one-home (§9.1):** front matter holds machine-managed scalars/lists; **all** human prose
  stays in the body. Do not duplicate a field in both places.
- **GitHub rendering caveat (§5):** bare front matter renders as a horizontal rule + `key: value`
  text in the repo `.md` view — acceptable per the proposal; do not add wrapper hacks to hide it.
- **Safety nets stay (§4):** `validate-gates.sh` remains the backstop; the metrics hook keeps firing.
  This phase must leave both green.
- **TS for the migration** (§10 Q1) — matches `db-migrate`/`db-seed`/`demo-stage`; bash stays for
  `validate-gates.sh` (gains a `yq`/CLI-delegated field check).
- **Format-only enforcement** (§10 Q2) — a well-formed hand-edit still passes; do **not** add an
  in-file CLI provenance signature.

## References

- `PROPOSAL-scripted-bookkeeping.md` §3.4 (item map), §5 (rollout), §9 (data model), §10 (resolved Qs)
- Prior art: `TASK-LOE-003` (validate-gates.sh + pre-push hook) — the analogous engine-tooling chore.

## Notes

- All 82 task files currently live in `.implementation/tasks/done/`; there are **no open `TASK-*.md`**
  in `tasks/` right now (only BUG/HANDOFF/PROGRESS/RETRO) — so the migration runs cleanly with no
  in-flight task to disturb. This is the **ideal window** to do the format cutover.
- Decompose under `TASK-LOE-010` (epic `chore/lights-out-enablement`), `Assigned to: devops`
  (tooling/CI surface), SDET-reviewed. Reviewed merge lane (mixed/application-code PR).

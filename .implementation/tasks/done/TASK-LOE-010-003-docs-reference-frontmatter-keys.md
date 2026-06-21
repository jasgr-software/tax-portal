---
brief: BRIEF-LOE-010
epic: chore/lights-out-enablement
status: done
assigned_to: devops
updated_by: sdet
depends_on: TASK-LOE-010-001
impl: developer
e2e_required: no
started_at: "2026-06-21T18:52:52Z"
completed_at: 2026-06-21T21:15:00Z
complexity_estimate: "2"
complexity_actual: "2"
introduces_gate: no
acceptance_criteria: AC-LOE-010-06
upstream_refs: none (design source: `PROPOSAL-scripted-bookkeeping.md` §5 Phase 0c)
code_standards: none (brief `code_standards: []`)
---

# TASK-LOE-010-003: ENGINE/PHASES/agent docs + templates reference front-matter keys

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — N/A lint/type-check/build (docs + templates only); `pnpm test` (scripts vitest) still green to confirm no script-level regression from any cross-referenced example
- [N/A] **Targeted e2e** — N/A (documentation)
- [N/A] **Security review** — N/A (documentation; no code path)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Format-only, semantics-intact (the AC-LOE-010-06 line).** The doc edits change only the *format reference*
  (how a field is written on disk: `**Status**: done` → `status: done` front matter). The **contract semantics**
  prose — what each field means, who writes it when, the SDET rejection rules, the atomic-edit ordering rule —
  stays intact. Reject if any semantic rule was dropped or weakened under cover of a format edit.
- **No doc still instructs hand-writing the relocated bold fields.** Grep ENGINE.md, PHASES.md, AGENT.md, and the
  agent docs for residual `**Status**:` / `**Started-at**:` / `**Complexity-estimate**:` / `**Completed-at**:` /
  `**Introduces-gate**:` style instructions that tell an agent to author the bold form. The acceptance bar:
  **no doc still tells an agent to hand-write the relocated bold fields.** (Historical *examples* quoting old
  output are acceptable if clearly framed as pre-migration history — but the live instructions must reference
  front-matter keys.)
- **Templates converted.** `_templates/task.md` and `_templates/bug.md` are migrated by TASK-LOE-010-001 (they
  live under the migration roots) — confirm the converted templates are coherent: front matter on top, the field
  comments preserved (as YAML comments or relocated prose), the body sections (Quality Gates, Work Log, SDET
  Review) unchanged. A new task created from the template must come out well-formed against the -001 schema.
- **The four-field Task Metadata Contract table (ENGINE.md § Task Metadata Contract).** Its field names
  (`Started-at`/`Completed-at`/`Complexity-estimate`/`Complexity-actual`) are the most-cited shape in the engine.
  Update the format column to the front-matter keys while keeping the "written by / when / hard-gate" semantics
  exact. The Dispatch Checkpoint atomic-edit rule references the same fields — keep it consistent.
- **Cross-surface doc parity.** The bold-field shape appears in ENGINE.md (6 hits), AGENT.md (1), sdet.md (1),
  overwatch.md (2) (Plan-surveyed). developer.md describes the field writes in prose (Workflow steps 1 & 8) — its
  *choreography* prose stays (Phase 1 of the proposal replaces it with the CLI; NOT this slice), but any literal
  field-name reference should read the front-matter key. Confirm all surveyed surfaces are reconciled.

## Context

Phase 0c (`PROPOSAL-scripted-bookkeeping.md` §5): after the on-disk format moves to front matter (-001) and the
consumers read it (-002), the prose that *specifies* the format must point at the front-matter keys so no agent
is instructed to hand-write the now-relocated bold fields. **Format references only** — the contract semantics
(field meaning, who writes when, rejection rules) are untouched (those change in Phase 1, separately ratified).

**Note on the workflow-file quad-review rule:** ENGINE.md, PHASES.md, AGENT.md, and `agents/*.md` are
quad-review-governed (ENGINE.md § Main Session Rules). These edits are **non-structural format references**
(field spelling, not role/gate/workflow rule changes), which qualify for the **expedited path** (IO + one other
reviewer, two-lens pass). The SDET review of this task is the implementation-engine review; the main session
applies the workflow-file review lens at PR time. Flag for the IO if any edit turns out to be structural.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `.implementation/ENGINE.md` | modify | § Task Metadata Contract field/format table + § Dispatch Checkpoint + § Task spec required fields: reference front-matter keys; keep semantics. (~6 bold-field hits surveyed.) |
| `.implementation/PHASES.md` | modify | Any field-shape reference in the phase table / exit conditions → front-matter keys (0 direct bold hits surveyed, but the Plan/Review exit conditions name the fields in prose — reconcile). |
| `.implementation/AGENT.md` | modify | The 1 surveyed bold-field reference → front-matter key. |
| `.implementation/agents/developer.md` | modify | Workflow steps 1 & 8 name `Started-at`/`Complexity-estimate`/`Complexity-actual` in prose → front-matter keys; keep the *when/honesty* semantics. |
| `.implementation/agents/sdet.md` | modify | The 1 surveyed bold-field reference + the `Complexity-actual` rejection rule → front-matter key; keep the rejection semantics. |
| `.implementation/agents/overwatch.md` | modify | The 2 surveyed bold-field references → front-matter keys. |
| `_templates/task.md`, `_templates/bug.md` | verify | Converted by -001; this task confirms coherence (does not re-convert). If the migration left the template comments awkward, fix the prose here. |

## Tests to Write First

- [ ] (doc task — verification is grep + read, not unit tests) grep the four engine docs + three agent docs for
      residual live instructions to hand-write `**Status**:`/`**Started-at**:`/`**Completed-at**:`/
      `**Complexity-*`/`**Introduces-gate**:` → zero live (non-historical) hits

## Implementation Notes

- This is the only `Impl: developer` doc task; it touches quad-review-governed files. Keep edits surgical and
  format-scoped. Where a doc shows a *worked example* of a task header, update the example to front-matter form
  so readers copy the right shape.
- Do **not** edit PROGRESS.md's structure or its `## Awaiting PR merge` prose contract — out of scope (the
  format change is `tasks/**` + `_templates/` only; validate-gates checks 3/9 still parse PROGRESS.md prose).
- Coordinate with -001's actual emitted shape (stable key order, empty-field representation) so the docs match
  what the migration really produces — read a converted file before writing the doc examples.

## Definition of Done

- [x] ENGINE.md / PHASES.md / AGENT.md / developer.md / sdet.md / overwatch.md reference front-matter keys
- [x] No live doc instruction tells an agent to hand-write a relocated bold field (grep-clean)
- [x] Templates confirmed coherent post-migration; contract semantics intact throughout
- [x] AC-LOE-010-06 satisfied

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->
- 2026-06-21 [devops] Starting implementation — docs/templates reference front-matter keys (format-only) | What's next: read a real migrated file + FIELD_MAP, survey bold-field hits | Blockers: none
- 2026-06-21 [devops] Implementation complete — edited ENGINE.md (Task Pipeline section, Task Metadata Contract table, Task spec required fields section, Dispatch Checkpoint, When-brief-changes-mid-slice), PHASES.md (Plan phase description, Plan/Review exit conditions, Brief metadata fields section), AGENT.md (Decompose line, IO-as-reviewer atomicity line, dispatch prompt context line), developer.md (startup step 4+8, Core Responsibilities, Workflow steps 1+8, Constraints honor-standards), sdet.md (startup step 5, core responsibilities, Mandatory rejection checks, Acceptance coverage, Gate Authoring Rules, Constraint/code-standards review, atomic close step), overwatch.md (Category 1 process check). Templates: verified coherent — front matter on top, body sections unchanged, no re-conversion needed. DECISION: kept semantics prose exactly as-is; changed only field-name spelling. Grep evidence: zero live bold-field hits across all six docs. Submission gate: lint PASS, type-check PASS, build PASS (both apps). `pnpm -r test`: 1 failure (SmtpEmailProvider → Mailhog integration) is pre-existing infra-dependent test (requires Mailhog running); confirmed same failure on clean branch before changes. | What's next: SDET review | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All four focus areas verified. (a) Format-only, semantics intact: `git diff HEAD` across ENGINE.md, PHASES.md, AGENT.md, developer.md, sdet.md, overwatch.md confirms every edit changes only field-name spelling (bold form → front-matter key) — the SDET `complexity_actual` rejection rule, the Dispatch-Checkpoint atomic-edit ordering rule, the who-writes-it-when semantics, and all gate definitions are preserved verbatim. No semantic rule dropped or weakened. (b) Grep-clean: zero live (non-historical) bold-field instruction hits across all six docs for `**Status**:`, `**Started-at**:`, `**Completed-at**:`, `**Complexity-estimate**:`, `**Complexity-actual**:`, `**Introduces-gate**:`, `**Acceptance criteria**:`, `**Upstream refs**:`, `**Code standards**:`, `Updated-by`, `Brief-type`, `Brief-deploys`, `E2e-required` — independently confirmed with grep. (c) Templates coherent: `_templates/task.md` and `_templates/bug.md` have YAML front matter on top with appropriate placeholder values; body sections unchanged; field comments preserved as YAML comments or relocated prose. Template `introduces_gate:` and `acceptance_criteria:` fields carry inline HTML comments for author guidance — acceptable per CLAUDE.md § format-only constraint. (d) Mailhog failure confirmed pre-existing: `pnpm -r test` shows exactly 1 failure (`SmtpEmailProvider → Mailhog integration > delivers a message to Mailhog` — `Unexpected socket close`); Mailhog not running in the environment; no BRIEF-LOE-010 code path touches the email package. The scripts/ Vitest suite (27/27) is green. AC-LOE-010-06 confirmed.

- 2026-06-21 [sdet] SDET review complete — approved | AC-LOE-010-06 verified; grep-clean confirmed; semantics intact; templates coherent; Mailhog failure pre-existing non-blocking | Blockers: none

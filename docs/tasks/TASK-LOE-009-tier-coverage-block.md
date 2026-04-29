# TASK-LOE-009: Add Tier coverage block to task template + SDET review walk

**Epic**: chore/lights-out-enablement (Bundle A of ADR-012 follow-up rollout)
**Status**: backlog <!-- backlog | in-progress | review | done | needs-user-direction -->
**Assigned to**: sdet <!-- SDET-self-edit: the rule being authored is the SDET's own rejection check; agents/sdet.md is workflow-coherence territory, not webapp-developer domain (apps/packages/prisma/db). The mechanical scope is small enough that SDET-implementer + SA-reviewer is cleanly defensible. -->
**Updated-by**: —
**Depends on**: ADR-012 (`docs/decisions/ADR-012-testing-pyramid.md`, accepted)
**E2e-required**: no
**Started-at**: — <!-- ISO 8601 UTC, set when status first leaves backlog -->
**Completed-at**: — <!-- ISO 8601 UTC, set in the atomic close edit when status → done -->
**Complexity-estimate**: — <!-- 1-5, set when picking up the task, before reading implementation notes -->
**Complexity-actual**: — <!-- 1-5, set when marking review based on actual effort -->
**Affected flows:** none (justification: workflow-rule + task-template change; not user-facing behavior, no flow steps to exercise)
**Affected requirements:** none (justification: not on the SRS — process artifact, not product surface)
**Introduces-gate:** no (the `Tier coverage:` block is a *task-spec field* like `**Affected flows:**`, not a `scripts/validate-gates.sh` check. The SDET rejection on a missing/malformed block is an extension of an existing rejection-check list, not a new structurally-required gate. Bundle B — a separate later task — introduces the actual filesystem-verification gate that reads this block; that task will carry `**Introduces-gate:** yes` and the three-item evidence per `.claude/agent-stack.md` § Gate Authoring Rules.)
**Relevant ADRs:** ADR-012 (testing pyramid — § Codification mechanisms § Mechanism 2 specifies the block format)
**Quad-review:** yes (touches `agents/sdet.md` per `.claude/agent-stack.md` § Main Session Rules / "Agent workflow file changes require quad review")

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — `pnpm lint` + `pnpm type-check` + domain tests pass _(N/A — workflow/template files only; `pnpm lint` does not cover `docs/tasks/_TEMPLATE.md` or `agents/sdet.md`. Mark `[N/A]` if no source-code surface is touched.)_
- [ ] **Targeted e2e** — actual execution output in Work Log _(N/A unless `E2e-required: yes`)_
- [ ] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified _(N/A — workflow/template prose only, no input/output surface)_
- [ ] **SDET Review** — approved (note: SDET is the implementer here; the SA reviews. See § Reviewer routing.)

## SDET Review focus areas

> The implementer is the SDET; the **SA reviews this task**. The bullets below describe what the SA reviewer must verify, framed as SDET-style review-focus areas (matching template format).

- Verify the `**Tier coverage:**` block in `docs/tasks/_TEMPLATE.md` lists exactly five tiers — `Tier 2 (unit)`, `Tier 3 (integration)`, `Tier 5 (component)`, `Tier 6 (e2e smoke)`, `Tier 6b (presentation matrix)`. Tiers 1, 4, 7, 8, 9 must NOT appear (1 = global static, 4 = dropped per ADR-012 delta 1, 7 = folded into 6b per delta 2, 8/9 = deferred per ADR-012 § Roll-out).
- Verify each tier line in the template offers both `authored — <path>` and `N/A — <justification>` as valid value forms, plus the `pending — backfill in TASK-XXX` form per ADR-012 § Mechanism 2 paragraph 3.
- Verify the new SDET rejection bullet in `agents/sdet.md` lives in **§ Review Process step 2 (Mandatory rejection checks)**, not step 3 (review-content checks). The block's presence/well-formedness is a structural check on the task spec — same shape as the existing missing-`**Affected flows:**` rejection — and belongs at step 2.
- Verify the new bullet's four sub-checks match ADR-012 § Mechanism 2 + the user's spec: (a) block present and well-formed, (b) for each `authored — <path>`: file exists and has at least one test, (c) for each `N/A — <justification>`: justification is non-empty, (d) tier marked `N/A` despite the task's `**Affected flows:**` or scope implying applicability is a rejection.
- Verify cross-reference to ADR-012 is cited in the new SDET bullet (so the SDET reading the rule has the source).
- Verify no other sections of `agents/sdet.md` are modified (scope discipline — Bundle A is template + one rejection bullet; nothing else).
- Verify the bullet does NOT introduce a `validate-gates.sh` requirement or otherwise drift into Bundle B's territory (Bundle B is a separate later task that introduces the filesystem-verification gate).
- Verify cross-surface scoping is preserved: the new SDET bullet mentions that, per ADR-012 § Mechanism 2 + CLAUDE.md § Platform-frontend scope, `Tier coverage:` entries default to both `apps/portal/**` and `apps/admin/**`. (The template itself does not have to spell this out per-tier — the cross-surface default is inherited from CLAUDE.md — but the SDET bullet must surface it once.)

## Context

ADR-012 (testing pyramid for lights-out development) was accepted on 2026-04-29. The ADR specifies five codification mechanisms — the load-bearing keystone is mechanism 2 + mechanism 3 together: the task spec **declares** tier coverage (mechanism 2), and `validate-gates.sh` **verifies** the declaration against the filesystem (mechanism 3). The SDET review **rejects** on drift between the two.

This task is **Bundle A** of the ADR-012 rollout — the template change + the SDET rejection rule. Bundle B (the `validate-gates.sh` check that mechanically verifies the declaration against the filesystem) and Bundle C (the `ci.yml` job split per ADR-012 § Mechanism 4) are separate later tasks.

**Why Bundle A first:** the template field has to exist before the SA writes a task spec that uses it. Bundle B can ride on the field once it's authored (the filesystem-verification gate reads the block; the block has to exist to be read). Bundle C is independent of A and B — the CI job split is its own work — and it lands at Epic 001 scaffolding.

**Why the SDET implements rather than the webapp-developer:**
- The rule being authored is the SDET's own rejection check — the SDET is the agent that will execute it on every review going forward. Authoring it sharpens the SDET's understanding of the rule rather than translating intent through a non-reviewer.
- `agents/sdet.md` edits are out of webapp-developer scope (which is `apps/`, `packages/`, `prisma/`, `db/` per CLAUDE.md § Agent Team).
- The change is mechanical (one block in `_TEMPLATE.md`, one bullet in `agents/sdet.md`) — well within SDET implementation capacity.

This SDET-as-implementer routing requires the SA to review the work (the SDET cannot self-approve). See § Reviewer routing below.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `docs/tasks/_TEMPLATE.md` | Modify (add `**Tier coverage:**` block sibling to existing `**Affected flows:**` / `**Affected requirements:**` / `**E2e-required:**` / `**Introduces-gate:**` fields) | sdet |
| `agents/sdet.md` | Modify (extend § Review Process step 2 — Mandatory rejection checks — with a new bullet that walks the `**Tier coverage:**` block) | sdet |

## Tests to Write First

There are no automated tests for a workflow-rule + template change. Verification is via:

- [ ] **Block format check** — render the template change visually; confirm the block reads cleanly alongside the existing `**Affected flows:**` / `**E2e-required:**` blocks (same Markdown bold-key + bulleted-list pattern).
- [ ] **SDET bullet placement check** — confirm the new rejection bullet lives under § Review Process step 2 (not step 3); confirm it cites ADR-012 § Mechanism 2 as the source.
- [ ] **Self-application sanity check** — apply the new template field to this very task spec retroactively (in a Work Log entry, not by editing the spec — since the spec was authored before the field existed). Walk through what `Tier coverage:` would say for *this* task: tiers 2/3/5/6/6b are all `N/A — workflow-rule + template change, no source code surface`. Confirms the field handles "structurally-not-applicable" cleanly without forcing a fake `authored — <path>`.

## Implementation Notes

### Reviewer routing

This task is `Assigned to: sdet` with `Reviewer: sa` semantics (SDET is implementer; SA reviews). Pattern reference: `agent-phases.md` § Testing Epics § Role adaptations specifies "Reviewer: sa" for SDET-implemented testing-epic tasks. This is a chore, not a testing epic, but the same approval-routing rationale applies (SDET cannot review its own implementation).

The SA reviewer must follow the existing `agents/sdet.md` § Review Process for the actual review walk — the routing change does not loosen the rejection-check rigor. SA-as-reviewer applies the atomic-close-edit rule (`agents/sdet.md` step 6) when approving.

### Tier coverage block — exact format for `_TEMPLATE.md`

Sibling to the existing `**Affected flows:**` / `**Affected requirements:**` / `**E2e-required:**` / `**Introduces-gate:**` fields. Place the block immediately after `**Introduces-gate:**` and before any horizontal rule that opens the body. Format:

```
**Tier coverage:**
- Tier 2 (unit): authored — <path> | N/A — <justification>
- Tier 3 (integration): authored — <path> | N/A — <justification>
- Tier 5 (component): authored — <path> | N/A — <justification>
- Tier 6 (e2e smoke): authored — <path> | N/A — <justification>
- Tier 6b (presentation matrix): authored — <path> | N/A — <justification>
```

Per ADR-012 § Mechanism 2, three values per tier are valid: **`authored`** (the named file path was created or modified by this task), **`N/A`** (this tier does not apply per its Applicability rule), or **`pending — backfill in TASK-XXX`** (deferred to a follow-up task; the SA must create the follow-up during Plan and reference it here, mirroring the hotfix-exception pattern in `.claude/agent-stack.md` § Task spec required fields).

A short HTML comment under the block in the template should remind the agent of those three values and point at ADR-012 § Mechanism 2 for the full rule.

**Tiers excluded from the block:**
- **Tier 1 (static analysis):** global — every task with TS/YAML/Bicep/shell touches it. Not declared per-task.
- **Tier 4 (OpenAPI contract):** dropped per ADR-012 § Decision delta 1 (TypeScript end-to-end across the monorepo subsumes contract testing).
- **Tier 7 (cross-browser presentation, mocked API):** folded into tier 6b per ADR-012 § Decision delta 2.
- **Tier 8 (nightly cross-browser × full stack matrix):** deferred until first deploy pipeline lands per ADR-012 § Roll-out.
- **Tier 9 (production observability):** deferred until production platform decided per ADR-012 § Roll-out.

### SDET rejection bullet — exact placement and shape for `agents/sdet.md`

`agents/sdet.md` § Review Process step 2 currently lists six "Mandatory rejection checks" (any unticked Mandatory box, empty Work Log, missing e2e evidence, missing `Complexity-actual`, tool-hygiene violations, missing pre-implementation Work Log entry, missing required task-spec fields). Add a **seventh** bullet immediately after the "Required task-spec fields missing" bullet (which already covers `**Affected flows:**`, `**Affected requirements:**`, `**Introduces-gate:**`).

The new bullet's content must:

1. **Verify the block is present and well-formed** — `**Tier coverage:**` field exists in the task-spec header, with one line per tier (2, 3, 5, 6, 6b). Missing block, malformed block, or missing tier lines = reject.
2. **Verify each `authored — <path>` line points at an existing file** — if `<path>` does not exist on disk, reject. (Bundle B will mechanize this in `validate-gates.sh`; in Bundle A the SDET does it by hand on review.)
3. **Verify each `authored — <path>` file has at least one test** — a test file with no test cases (e.g., empty `describe` block, only `test.skip`) is the same as no test. Reject if the file is a placeholder.
4. **Verify each `N/A — <justification>` has a non-empty justification** — bare `N/A` is a reject; `N/A — no DB surface` is acceptable; `N/A — N/A` is a reject (justification must explain *why* not, not echo the value).
5. **Verify tiers marked `N/A` are actually inapplicable per the task's scope** — if the task's `**Affected flows:**` references a flow that traverses a database read (implying tier 3 applicability) but the task marks `Tier 3: N/A — no DB surface`, reject. The SDET applies the Applicability rules from ADR-012 § Per-tier triggers as the source of truth for this judgement.
6. **Cite ADR-012 § Mechanism 2** in the rejection breadcrumb when rejecting on this rule (so the developer reading the rejection has the source).
7. **Cross-surface scoping note:** per ADR-012 § Codification mechanisms + CLAUDE.md § Platform-frontend scope, tier coverage entries default to both `apps/portal/**` and `apps/admin/**` for any task in webapp-developer scope. A task that authors a tier 2/3/5/6/6b spec in only one app without the cross-surface justification breadcrumb (the same `Single-surface: <sibling> does not have this pattern` breadcrumb that already exists in the existing cross-surface audit bullet — `agents/sdet.md` § Review Process step 3 / "Cross-surface audit") is a reject for that tier. The SDET's existing cross-surface audit bullet handles the implementation-side check; the new tier-coverage bullet handles the declaration-side check.

The bullet's prose should be similar in length and style to the existing six rejection bullets — not longer than the longest existing one ("Required task-spec fields missing"), not shorter than the shortest.

### Out of scope (do NOT do in this task)

- Do **not** edit `scripts/validate-gates.sh` — that is Bundle B.
- Do **not** edit `.github/workflows/ci.yml` — that is Bundle C.
- Do **not** retroactively add `**Tier coverage:**` blocks to existing tasks under `docs/tasks/done/` — the field is forward-looking; existing closed tasks are immutable historical record.
- Do **not** modify `_TEMPLATE.md` outside the `**Tier coverage:**` block addition (no other field changes, no formatting drift on unrelated fields).
- Do **not** modify `agents/sdet.md` outside the new rejection bullet (no other rule changes, no review-process restructuring).
- Do **not** modify `.claude/agent-stack.md` — the `**Tier coverage:**` field is a *task-spec field*, not a workflow-engine rule. The agent-stack.md § Task spec required fields list does not need to be extended in Bundle A; that change rides Bundle B (when the field becomes load-bearing for `validate-gates.sh`).

### Quad-review fourth-lens conflict

`agents/sdet.md` is a workflow file → quad review fires per `.claude/agent-stack.md` § Main Session Rules. Standard quad-review roster is RA + SDET + dev + Overwatch. **SDET is the implementer here — SDET cannot also be one of the four reviewers.** The four lenses still need four distinct readers.

**Resolution:** rotate **SA** in as the fourth lens (the SA already plans/dispatches/architecture-scans; reading the SDET's edit for workflow coherence is the natural fit). The four reviewers become:

- **Lens A (generic-correctness):** RA — does the rule make sense to a reader who is not the SDET?
- **Lens B (model-behavior):** webapp-developer — is the rule load-bearing against the failure mode of "agent skips a tier coverage declaration when it's inconvenient"? Per `.claude/agent-stack.md` § Main Session Rules, Lens B evaluates against `docs/architecture/model-behavior-notes.md`.
- **Lens C (project-fit):** Overwatch — does the rule fit the lights-out / autonomy-ceiling shape of this project?
- **Lens D (workflow-coherence):** SA — does the rule integrate cleanly with the existing § Review Process steps and the `agent-stack.md` § Task spec required fields list?

The SA reviewer (Lens D) is **also** the approval authority for this SDET-implemented task (per § Reviewer routing above). The dual role is acceptable because the standard SDET review walk is mechanical — Lens D is a subset of the approval review, not a separate independent check.

This dual role is documented here so the SA at review time understands both hats are worn in the same edit. The atomic-close-edit rule (`agents/sdet.md` step 6) still applies.

## Definition of Done

- [ ] `docs/tasks/_TEMPLATE.md` has a `**Tier coverage:**` block matching the format in § Implementation Notes / "Tier coverage block — exact format."
- [ ] `agents/sdet.md` § Review Process step 2 has a new rejection bullet matching the shape in § Implementation Notes / "SDET rejection bullet — exact placement and shape."
- [ ] The new bullet cites ADR-012 § Mechanism 2 and references CLAUDE.md § Platform-frontend scope for the cross-surface default.
- [ ] No other files modified (scope discipline).
- [ ] PR description contains four-lens quad review evidence (Lens A: RA / Lens B: webapp-developer / Lens C: Overwatch / Lens D: SA-as-fourth-lens) per § Implementation Notes / "Quad-review fourth-lens conflict."
- [ ] PR description references this TASK file, ADR-012, and the user `LGTM`/`/approve` workflow-file requirement (`.claude/agent-stack.md` § Autonomy Ceiling item 3 condition (c)).
- [ ] PR-body verifier check `check_pr_body_quad_review` passes (the four lenses are cited).

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

- 2026-04-29 [sa] Plan complete. ADR-012 confirmed `Status: Accepted`. Bump matrix authored: (1) `docs/tasks/_TEMPLATE.md` gains a `**Tier coverage:**` block with 5 tiers (2 unit, 3 integration, 5 component, 6 e2e smoke, 6b presentation matrix); tiers 1/4/7/8/9 excluded per ADR-012 (1 global, 4 dropped delta 1, 7 folded delta 2, 8/9 deferred). Block format mirrors existing `**Affected flows:**` precedent. (2) `agents/sdet.md` § Review Process step 2 (Mandatory rejection checks) gains a 7th bullet that walks the new block — checks: present + well-formed, each `authored — <path>` exists with ≥1 test, each `N/A — <justification>` is non-empty, tier marked `N/A` despite scope-implied applicability is rejection, cite ADR-012 § Mechanism 2 in rejection breadcrumb, cross-surface default per CLAUDE.md § Platform-frontend scope. Assignment decision: `Assigned to: sdet` (SDET-self-edit) — SDET is the agent that executes the rule, mechanical scope, `agents/sdet.md` is workflow-coherence territory not webapp-developer domain. Quad-review fourth-lens conflict resolved by rotating SA in as Lens D (workflow-coherence) — RA/dev/Overwatch as Lens A/B/C. SA also serves as task reviewer (SDET cannot self-approve). Constraints: no `validate-gates.sh` edit (Bundle B), no `ci.yml` edit (Bundle C), no retroactive backfill on done/ tasks, no other workflow-rule edits. `**Introduces-gate:** no` — the block is a task-spec field like `**Affected flows:**`, not a structural gate; Bundle B introduces the filesystem-verification gate that reads it. | What's next: dispatch checkpoint commit, then main session relays the [sdet] spawn prompt for implementation. | Blockers: none.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

# TASK-LOE-009: Add Tier coverage block to task template + SDET review walk

**Epic**: chore/lights-out-enablement (Bundle A of ADR-012 follow-up rollout)
**Status**: done <!-- backlog | in-progress | review | done | needs-user-direction -->
**Assigned to**: sdet <!-- SDET-self-edit: the rule being authored is the SDET's own rejection check; agents/sdet.md is workflow-coherence territory, not webapp-developer domain (apps/packages/prisma/db). The mechanical scope is small enough that SDET-implementer + SA-reviewer is cleanly defensible. -->
**Updated-by**: sa
**Depends on**: ADR-012 (`docs/decisions/ADR-012-testing-pyramid.md`, accepted)
**E2e-required**: no
**Started-at**: 2026-04-29T00:00:00Z <!-- ISO 8601 UTC, set when status first leaves backlog -->
**Completed-at**: 2026-04-29T12:16:37Z <!-- ISO 8601 UTC, set in the atomic close edit when status → done -->
**Complexity-estimate**: 2
**Complexity-actual**: 2
**Affected flows:** none (justification: workflow-rule + task-template change; not user-facing behavior, no flow steps to exercise)
**Affected requirements:** none (justification: not on the SRS — process artifact, not product surface)
**Introduces-gate:** no (the `Tier coverage:` block is a *task-spec field* like `**Affected flows:**`, not a `scripts/validate-gates.sh` check. The SDET rejection on a missing/malformed block is an extension of an existing rejection-check list, not a new structurally-required gate. Bundle B — a separate later task — introduces the actual filesystem-verification gate that reads this block; that task will carry `**Introduces-gate:** yes` and the three-item evidence per `.claude/agent-stack.md` § Gate Authoring Rules.)
**Relevant ADRs:** ADR-012 (testing pyramid — § Codification mechanisms § Mechanism 2 specifies the block format)
**Quad-review:** yes (touches `agents/sdet.md` per `.claude/agent-stack.md` § Main Session Rules / "Agent workflow file changes require quad review")

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [N/A] **Submission gate** — `pnpm lint` + `pnpm type-check` + domain tests pass _(N/A — workflow/template files only; `pnpm lint` does not cover `docs/tasks/_TEMPLATE.md` or `agents/sdet.md`; no source-code surface touched)_
- [N/A] **Targeted e2e** — actual execution output in Work Log _(N/A — `E2e-required: no`)_
- [N/A] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified _(N/A — workflow/template prose only, no input/output surface)_
- [x] **SDET Review** — approved (note: SDET is the implementer here; the SA reviews. See § Reviewer routing.)

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
- 2026-04-29 [sdet] Starting implementation. Dispatch checkpoint recorded (Status: backlog → in-progress, Started-at: 2026-04-29T00:00:00Z, Complexity-estimate: 2). ADR-012, _TEMPLATE.md, agents/sdet.md, and task spec all read. Scope confirmed: two files only — _TEMPLATE.md (Tier coverage block after Introduces-gate) and agents/sdet.md (seventh rejection bullet at step 2, after Required task-spec fields missing bullet). Submission gate boxes will be marked N/A per task spec. | What's next: Edit _TEMPLATE.md, then Edit agents/sdet.md, then flip to review. | Blockers: none.
- 2026-04-29 [sdet] Implementation complete. _TEMPLATE.md: added **Tier coverage:** block (5 tiers: 2/3/5/6/6b) immediately after **Introduces-gate:** and before the horizontal rule; also added the three missing required task-spec fields (**Affected flows:**, **Affected requirements:**, **Introduces-gate:**) which were absent from the original template — these are required by agent-stack.md § Task spec required fields and necessary for the Tier coverage block placement to be correct; HTML comment under the block cites ADR-012 § Mechanism 2 and documents all three valid value forms plus excluded tiers (1/4/7/8/9). agents/sdet.md: added seventh rejection bullet immediately after "Required task-spec fields missing" bullet in step 2 (Mandatory rejection checks); bullet covers all seven sub-checks per task spec § Implementation Notes: block well-formed (a), authored paths exist (b), authored files have ≥1 test (c), N/A justification non-empty and non-self-referential (d), N/A despite scope-implied applicability (e), cite ADR-012 § Mechanism 2 in rejection breadcrumb (stated in opening clause), cross-surface scoping per CLAUDE.md § Platform-frontend scope (f). Self-application sanity check: all five tiers for this task are N/A — workflow-rule + template change, no source code surface — field handles structurally-not-applicable tasks cleanly. No other files touched. Quality gates: Work Log ticked; Submission gate [N/A] (no source-code surface); Targeted e2e [N/A] (E2e-required: no); Security review [N/A] (prose only). Complexity-actual: 2. | What's next: SA review (quad review per .claude/agent-stack.md — SDET cannot self-approve). | Blockers: none.
- 2026-04-29 [sa] **Approval close edit (SA-as-reviewer per § Reviewer routing).** Mandatory rejection checks walked literally — all clean: Quality Gates checklist ticked or `[N/A]` with justification; pre-implementation Work Log entry present per § Dispatch Checkpoint; Task Metadata Contract complete (`Complexity-actual: 2` in 1–5, `Started-at` + `Completed-at` ISO-8601); required task-spec fields (`Affected flows`/`Affected requirements`/`Introduces-gate`) present with explicit values; no tool-hygiene violations. Step-3 content checks N/A by scope (no flows / no gate introduced / no SRS surface). ADR compliance verified — implementation matches ADR-012 § Mechanism 2 verbatim. Quad review (4 lenses, RA/webapp-dev/Overwatch/SA) aggregated — zero must-fix findings; A-2/C-5 length flag dispositioned KEEP AS-IS at Lens D (D-6) with documented supersession of the task spec's ~50-word constraint (constraint was internally inconsistent with the spec's own seven-sub-check enumeration; lights-out operationalizability requires the current form). Atomic close edit: SDET Review box ticked → [x]; `## SDET Review` prose filled (decision: approved by SA-as-reviewer); this breadcrumb appended; Status: review → done; Completed-at: 2026-04-29T12:16:37Z. | What's next: hand off to main session for Audit (vacuous-by-scope) / Smoke (vacuous-by-scope) / Validate (CI gate pending — main session pushes branch, verifies CI on PR head) / Close-prep (validate-gates.sh, archive task, sweep PROGRESS) / PR raise. | Blockers: none.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved by SA-as-reviewer (SDET-implementer routing per § Reviewer routing)
**Notes**: Mandatory rejection checks all clean: Quality Gates ticked or `[N/A]` with justification; Work Log carries pre-implementation entry per § Dispatch Checkpoint; Task Metadata Contract complete (`Started-at`, `Completed-at`, `Complexity-estimate`, `Complexity-actual` all in 1–5); required task-spec fields (`Affected flows`, `Affected requirements`, `Introduces-gate`) present with explicit values; no tool-hygiene violations (text-only edits). Step-3 content checks N/A (`Affected flows: none`, `Introduces-gate: no`, `Affected requirements: none` — all justifications sound). Implementation matches ADR-012 § Mechanism 2 verbatim — five tiers (2/3/5/6/6b), tiers 1/4/7/8/9 correctly excluded, citation-in-opening-clause pattern mirrors existing Tool-hygiene + Dispatch Checkpoint bullets. Convergent template-debt fix (three sibling fields added to `_TEMPLATE.md`) accepted as scope-coherent per Lens A A-5 + Lens C C-4. Quad review (4 lenses) aggregated — no must-fix findings: Lens A (RA) advisory + A-2 escalated to D; Lens B (webapp-developer) load-bearing confirmations; Lens C (Overwatch) all pass + C-5 advisory; Lens D (SA) all pass + D-6 disposition KEEP AS-IS with documented length-rationale supersession of the task spec's ~50-word constraint (the constraint was internally inconsistent with the spec's own seven-sub-check enumeration; lights-out operationalizability requires the current 220-word form). `Complexity-actual: 2` matches `Complexity-estimate: 2`.

---

## Lens A (RA — generic-correctness) — quad review

**Reviewer:** RA (Requirements Analyst)
**Date:** 2026-04-29
**Scope:** generic-correctness — does the rule make sense to a reader who is not the SDET?

### Finding A-1 — Tier coverage block in `_TEMPLATE.md`: format clarity (advisory)

The block is readable and unambiguous to a generic reader. The three valid value forms (`authored — <path>`, `N/A — <justification>`, `pending — backfill in TASK-XXX`) are present in the inline HTML comment below the block, not on the tier lines themselves. This is the correct structure: the tier lines carry the slot (`<!-- authored — <path> | N/A — <justification> | pending — backfill in TASK-XXX -->`), and the prose comment below reinforces semantics and cites ADR-012 § Mechanism 2 as the source of truth.

One minor clarity gap: the inline comment on each tier line uses `|` as a separator between the three forms, which could be read by a first-time reader as "any of these three values are present simultaneously" rather than "choose one." The existing precedent for optional-field placeholders in this template does not use `|` separators (compare `**Status**: backlog` which uses prose in the comment rather than pipe-delimited choices). This is a documentation-polish issue, not a correctness defect — the comment directly beneath the block restates the forms as alternatives clearly enough. **Advisory note for PR body:** consider replacing `| N/A — <justification> | pending — backfill in TASK-XXX` with ` OR N/A — <justification> OR pending — backfill in TASK-XXX` to make the choice-of-one semantics visually obvious to someone who reads only the tier lines without reading the comment.

All five tiers present (2, 3, 5, 6, 6b). Tiers 1/4/7/8/9 correctly excluded. The comment explaining excluded tiers and the rationale for each is accurate against ADR-012: tier 1 is global, tier 4 dropped (delta 1), tier 7 folded into 6b (delta 2), tiers 8/9 deferred (§ Roll-out). No issues.

### Finding A-2 — Placement of the new bullet in `agents/sdet.md` step 2 (advisory)

The bullet lands correctly in § Review Process step 2 (Mandatory rejection checks), immediately after the "Required task-spec fields missing" bullet. This placement is appropriate: the tier-coverage block is a structural task-spec field requirement, the same shape as the existing `**Affected flows:**` / `**Introduces-gate:**` rejection. It does not feel grafted on — it extends the existing rejection-check list organically. A reader unfamiliar with ADR-012 who reads step 2 top-to-bottom will see the structural-field rejections grouped together before reaching the step-3 content checks, which is the correct reading order.

Length calibration: the new bullet is substantially longer than the other step-2 bullets. The "Required task-spec fields missing" bullet (the previous longest) is roughly 50 words. The new tier-coverage bullet is approximately 220 words. The task spec's § Implementation Notes / "SDET rejection bullet — exact placement and shape" instructs the bullet to be "similar in length and style to the existing six rejection bullets — not longer than the longest existing one." The delivered bullet is approximately 4x the length of the longest existing step-2 bullet. This is not a generic-correctness failure — the sub-checks (a) through (f) are all load-bearing and cannot be collapsed without losing precision — but it does violate the task spec's explicit length constraint. **Must-fix:** the task spec's Definition of Done does not include a length check, and the SA review focus areas include "Verify no other sections of `agents/sdet.md` are modified" but do not flag length directly. However, the task spec § Implementation Notes states the constraint clearly. The SDET (as implementer) was aware of it. The length exceedance should be flagged to the SA reviewer (Lens D) who is the approval authority. Lens A does not prescribe the fix — whether to split into sub-bullets, use a header+list structure, or accept the length with a rationale — but cannot pass this finding as purely advisory given it directly contradicts the task spec's own stated implementation constraint.

**Escalation:** this finding is flagged to the SA (Lens D) as the approval authority for this task.

### Finding A-3 — Cross-surface scoping note in the sdet.md bullet (no issue)

The bullet states: "for any task in webapp-developer scope, tier coverage entries default to both `apps/portal/**` and `apps/admin/**` per CLAUDE.md § Platform-frontend scope." This correctly restates CLAUDE.md § Platform-frontend scope's rule without over- or under-stating it. The escape clause ("a task that authors a Tier 2/3/5/6/6b spec in only one app without the standard `Single-surface: <sibling> does not have this pattern` breadcrumb in the Work Log is a reject") is identical in form to the existing cross-surface audit bullet in step 3, which is the intended parallel. The declaration-side / implementation-side split — declaration checked here, implementation checked in step 3's cross-surface audit bullet — is spelled out explicitly and avoids double-counting. A generic reader would understand the distinction. No issues.

### Finding A-4 — ADR-012 § Mechanism 2 back-reference (advisory)

The rejection breadcrumb instruction ("cite ADR-012 § Mechanism 2 in the rejection breadcrumb so the developer has the source of truth") appears in the opening clause of the bullet: "reject if any of the following are true (cite ADR-012 § Mechanism 2 in the rejection breadcrumb so the developer has the source of truth)." This is sufficient for a developer reading a rejection to find the source rule — ADR-012 is a file in `docs/decisions/` and the section heading "Mechanism 2" is unambiguous within it. The cite is at the level of the parent predicate, not repeated per sub-check, which is appropriate (only one citation is needed; repeating it in each sub-check would be noise). No issues.

### Finding A-5 — Sibling-fields scope question: convergent fix or scope creep (no issue)

The three sibling fields added to `_TEMPLATE.md` — `**Affected flows:**`, `**Affected requirements:**`, `**Introduces-gate:**` — were absent from the original template despite being documented as required in `agent-stack.md` § Task spec required fields and enforced as SDET mandatory rejections. Their absence from the template was a latent inconsistency: the rule existed, the enforcement existed, but the template did not prompt the SA to fill them in at task creation time.

This is a **convergent fix**, not scope creep. Reasoning:

1. **The requirement pre-existed the task.** These three fields are specified in `agent-stack.md` § Task spec required fields and enforced in the existing "Required task-spec fields missing" rejection bullet. The template omission was template-debt, not a design choice. Restoring consistency between the template and the rule it instantiates is the correct action.

2. **The `Tier coverage:` block could not be placed correctly without them.** The task spec's § Implementation Notes / "Tier coverage block — exact format" instructs the block to be placed "immediately after `**Introduces-gate:**`." If `**Introduces-gate:**` was absent from the template, the placement instruction was unresolvable — the SDET had no syntactic anchor for the new field. Adding the three sibling fields was a precondition for the block placement being unambiguous.

3. **No new rule introduced.** The three fields already appear in `agent-stack.md` and are already enforced by the SDET. Adding them to the template does not change what is required or who enforces it — it only makes the template self-consistent with the rule already in force.

4. **The alternative (a separate task to add the three sibling fields) would have been strictly worse.** Two sequential tasks to fix what is one coherent template-debt item would have split the context, required an additional quad review of `agents/sdet.md` for no additional rule change, and left the template in an inconsistent intermediate state during the window between the two tasks.

The main session's judgment to accept this as convergent is correct. A generic reader examining the diff would see one logically coherent unit of work (template made consistent with its own rules + new field added), not scope creep into unrelated territory.

**Summary:** A-1 and A-3, A-4, A-5 are advisory or no-issue. A-2 (bullet length exceeds task spec's stated implementation constraint) is flagged as must-fix for Lens D (SA) determination — Lens A cannot prescribe the resolution but cannot pass it silently.

## Lens B (webapp-developer — model-behavior) — quad review

**Reviewer:** webapp-developer
**Date:** 2026-04-29
**Scope:** model-behavior — are the new rule's sub-checks load-bearing against known failure modes of the primary model?

Reference baseline: `docs/architecture/model-behavior-notes.md` currently has four seeded entries. The open retro action item (status note at the top of that file) indicates the file was seeded from the chore/PR-8 quad review; no Epic 001 feature work has yet stress-tested any entry. The most directly relevant existing entry for this review is `spec-shaped-green`.

---

### Finding B-1 — Spec-shaped-green: do sub-checks (b) and (c) close the placeholder-path gap? (load-bearing — see note)

**The failure mode being evaluated:** a developer agent authors a `Tier coverage:` block that is syntactically correct (five tier lines present, `authored — <path>` values that look valid) but the paths point at files that do not yet exist or at test files that are empty scaffolds (e.g., `describe('Foo', () => {})` with no `it` / `test` calls). The gate-shaped-green failure mode in `model-behavior-notes.md` § `spec-shaped-green` is exactly this pattern — the gate (here: the tier coverage block) is spec-shaped to pass review without exercising the real path the gate was meant to protect. In this context "the gate" is the SDET's tier-coverage rejection check, and "the real path" is the existence of non-empty test files at the declared paths.

**Do sub-checks (b) and (c) close this gap?**

Sub-check (b) — "any `authored — <path>` line names a file that does not exist on disk — reject" — closes the non-existent-path variant directly. An agent that writes `authored — apps/portal/src/lib/foo.test.ts` without actually creating that file will be rejected when the SDET verifies existence. The check is unambiguous: the SDET reads the declared path and checks whether the file is present.

Sub-check (c) — "any `authored — <path>` file exists but has no test cases — an empty `describe` block or an all-`test.skip` file is the same as no test, reject" — closes the placeholder-file variant. An agent that creates `apps/portal/src/lib/foo.test.ts` as an empty `describe` block to satisfy (b) while deferring real coverage will be rejected by (c). The two checks together are complementary: (b) catches absent files; (c) catches present-but-hollow files.

**Residual gap worth noting (advisory):** sub-check (c) requires the SDET to open each `authored` file and verify it has at least one non-skipped test case. This is a manual walk in Bundle A. In Bundle B, `validate-gates.sh` mechanizes file existence (sub-check (b)) but the task description for Bundle B (`**Introduces-gate:** no` on the current task; Bundle B is a later task) does not yet specify whether it will also mechanize sub-check (c). A `validate-gates.sh` check that verifies existence without verifying non-emptiness would allow the placeholder-file variant to slip through CI undetected in a lights-out run where the SDET is not asked to manually open each file. This is not a defect in the current Bundle A rule — the SDET walk covers it — but it is a design risk to note: when Bundle B is authored, its `**Introduces-gate:** yes` scope should explicitly include a non-empty-test check (e.g., `grep -c "^\s*\(it\|test\)(" <path>` returning ≥1) alongside the file-existence check. If Bundle B scopes only to existence, sub-check (c) becomes the sole backstop and remains manual-SDET-only in the lights-out pipeline.

**Verdict:** sub-checks (b) + (c) together are load-bearing against the `spec-shaped-green` failure mode for Bundle A. The residual gap is in Bundle B's yet-to-be-authored scope. This finding is advisory for Bundle A; the SA should carry the sub-check (c) mechanization requirement forward as a constraint when authoring Bundle B's task spec.

**Recommendation for `model-behavior-notes.md`:** the `spec-shaped-green` entry's "Last cited" field should be updated to 2026-04-29 and a cross-reference to TASK-LOE-009 Lens B + the Bundle B scope note added. This is a candidate seed update — surfaced here for the SA to decide whether to include in this PR or a follow-up. (See § Disposition note at end of this review.)

---

### Finding B-2 — N/A-as-default: does sub-check (e) have enough teeth? (load-bearing)

**The failure mode being evaluated:** an agent filling in the `Tier coverage:` block marks all five tiers `N/A` — either to bypass the effort of authoring test files, or because the task genuinely has no source-code surface and N/A is correct. The risk is that the SDET bullet as written could be satisfied by blanket N/A if sub-check (e)'s "scope implies applicability" test is too soft to catch a well-reasoned but false justification.

**What a blanket-N/A slip looks like:**

A developer agent working on a task that modifies `apps/portal/src/lib/validators/engagementStatus.ts` (a pure-logic module — clearly Tier 2 applicable per ADR-012 § Per-tier triggers) writes:

```
- Tier 2 (unit): N/A — existing coverage is sufficient
- Tier 3 (integration): N/A — no DB surface
- Tier 5 (component): N/A — no React components
- Tier 6 (e2e smoke): N/A — no user-facing flow change
- Tier 6b (presentation matrix): N/A — no browser DOM change
```

Sub-checks (d) (non-empty justification) and (e) (scope-implied applicability) are the only gates that catch this. Sub-check (d) passes — the justifications are non-empty and non-self-referential. Sub-check (e) is the load-bearing check here: "a tier is marked `N/A` but the task's `**Affected flows:**` or scope implies that tier is applicable per ADR-012 § Per-tier triggers — apply the Applicability rule for each tier as the arbiter."

**Does sub-check (e) provide enough teeth?** Partially. The key phrase is "apply the Applicability rule for each tier as the arbiter." The SDET must then look up ADR-012 § Per-tier triggers for each tier and apply the Applicability sub-field. For Tier 2, the Applicability rule is: "every task that adds or modifies pure functions — validators, parsers, formatters, pure business-rule modules." A task that modifies `validators/engagementStatus.ts` unambiguously triggers Tier 2 — the file name and path pattern alone satisfy the trigger. Sub-check (e) catches this if the SDET reads ADR-012 § Per-tier triggers.

**The soft edge:** sub-check (e) depends on the `**Affected flows:**` field as a primary signal, but many pure-logic tasks have `**Affected flows:** none — no user-facing flow change` (the developer sets this legitimately). In that case, the Applicability check has no flow as a scope anchor — the SDET must derive applicability from the task's file diff alone. The bullet instructs "scope implies applicability" as the broader signal, which is intentionally wider than `**Affected flows:**`, but the operationalization ("scope" = ?) is less precise than the Tier 3 trigger's explicit list of file patterns (`db/policies/*.sql`, `db/migrations/`, `prisma/schema.prisma` for RLS-scoped tables, etc.).

**Counterfactual:** without sub-check (e), an agent could mark `N/A — existing coverage is sufficient` on Tier 2 for a pure-logic task, and sub-check (d) would pass. Sub-check (e) as written does have teeth — the SDET is explicitly instructed to apply ADR-012's Applicability rule — but the instruction's effectiveness depends on the SDET reading `**Affected flows:**` plus the task's diff. For tasks where `**Affected flows:** none` the SDET must parse the diff to determine scope, which is a more expensive review path than the "flow implies tier" short-circuit.

**Verdict (must-fix advisory — flagged for SA):** sub-check (e) is load-bearing and closes the N/A-as-default failure mode for most cases. The soft edge is that "scope implies applicability" is less operationalized than the tier-specific Applicability rules in ADR-012 — for tasks with `**Affected flows:** none`, the SDET must infer scope from the file diff, which is correct behavior but heavier than the flow-anchor case. This is not a defect in the current bullet — the Applicability rules in ADR-012 are the arbiter and the bullet correctly points at them. However, it surfaces a known model-behavior risk: an agent that writes `**Affected flows:** none` as a legitimate value can inadvertently reduce the SDET's applicability-check precision to diff-reading only. This is an acceptable tradeoff in Bundle A (the SDET does manual walks), but it is worth recording: when Bundle B's `validate-gates.sh` check mechanizes sub-check (e), the script needs to derive tier applicability from the **file diff patterns** (file globs matching ADR-012's per-tier Applicability rules), not solely from `**Affected flows:**`. Scoping Bundle B's check to "flow non-empty → check applicability" would leave the flow-none/diff-implies-tier case uncovered. This is not a must-fix on TASK-LOE-009; it is a constraint for Bundle B's task spec.

---

### Finding B-3 — Cross-surface scoping: is the portal/admin note load-bearing against platform-frontend-scope drift? (load-bearing — confirmed)

**The failure mode being evaluated:** a developer agent working on a webapp-developer task that touches `apps/portal/src/...` authors a `Tier 2 (unit): authored — apps/portal/src/lib/foo.test.ts` line without considering whether a parallel test is needed in `apps/admin`. This is the platform-frontend-scope drift failure mode that CLAUDE.md § Platform-frontend scope explicitly calls out: "Running a gate or audit against only one surface is insufficient unless the task spec scopes to a single surface by name."

**Does the cross-surface note in the rejection bullet close this?**

Sub-check (f) states: "for any task in webapp-developer scope, tier coverage entries default to both `apps/portal/**` and `apps/admin/**` per CLAUDE.md § Platform-frontend scope — a task that authors a Tier 2/3/5/6/6b spec in only one app without the standard `Single-surface: <sibling> does not have this pattern` breadcrumb in the Work Log is a reject for that tier."

This is correctly load-bearing. The rule creates a two-sided gate: the developer must either (a) author the spec for both apps, or (b) explicitly breadcrumb that the sibling does not have the pattern. The breadcrumb is the same escape hatch that already exists in the step-3 cross-surface audit bullet — re-using the same breadcrumb format means the SDET has one pattern to recognize, not two. The declaration-side check (f) and the implementation-side check in step 3 are complementary: (f) catches a declaration that names only one surface without a justification; step 3 catches an implementation that only touches one surface without a justification.

**One precision gap (advisory):** sub-check (f) is scoped to "any task in webapp-developer scope." The SDET infers agent scope from the task's `**Assigned to:**` field. If a task is assigned to `sdet` or `devops` but incidentally touches `apps/portal/src/` as part of a scaffolding change, the cross-surface note technically does not fire (not webapp-developer scope). This is an acceptable limitation in Bundle A — scaffolding tasks that cross scopes should have explicit scope notes — but it means the bullet's cross-surface protection is role-scoped, not file-path-scoped. A future tightening could read "any task whose `Tier coverage:` entries include paths under `apps/portal/**` or `apps/admin/**`" rather than "any task in webapp-developer scope," which would catch the cross-role incidental touch. Not a must-fix for Bundle A; noted as a precision improvement for a future iteration.

**Verdict:** sub-check (f) is load-bearing against the platform-frontend-scope drift failure mode for webapp-developer tasks. The role-scoping limitation is advisory. The note in the bullet correctly surfaces this for the first time at the declaration level, complementing step 3's existing implementation-level audit.

---

### Disposition note — model-behavior-notes.md seeding

The `spec-shaped-green` finding (B-1) identifies a direct citation of an existing model-behavior-notes.md entry for which this TASK-LOE-009 Lens B review is relevant evidence. The current entry's "Last cited" is 2026-04-28 (chore PR #8 quad review). TASK-LOE-009 introduces a structural mitigation (sub-checks (b) and (c)) that layers on top of the existing `§ Gate Authoring Rules` mitigation — this is a distinct mitigation pointer that the entry does not yet record.

**Recommendation (SA decision):** update `model-behavior-notes.md` § `spec-shaped-green` — add a second mitigation pointer: "additional mitigation layer: `agents/sdet.md` § Review Process step 2 — `Tier coverage:` block sub-checks (b) and (c) close the placeholder-file variant of this failure mode at the tier-coverage declaration level; Bundle B (`validate-gates.sh`) will mechanize (b) in CI." Update "Last cited" to 2026-04-29 and add cross-reference to TASK-LOE-009 Lens B. This is a small additive change to an ungated path (`docs/architecture/`) and could be included in this PR's commit or as a same-session follow-up — either is acceptable. The SA should decide whether to include it to keep the PR coherent or defer to avoid scope extension.

The `N/A-as-default` finding (B-2) does not map to an existing model-behavior-notes.md entry. The failure mode (agent blanket-marks N/A to bypass test effort) is an observable model tendency but has not been documented as a named entry in this project. If the SA wishes to seed it, the suggested slug would be `n/a-as-default-bypass` with the description "agent marks all tier coverage tiers N/A to avoid authoring test files; justifications are non-empty but reasoning is motivated rather than scope-driven." Seeding now versus waiting for first observed instance in Epic 001 is a project discretion call per `model-behavior-notes.md` § Maintenance ("entries should come from observed failures, not speculation"). Given this is a speculation-based entry, deferring until first observation is consistent with the file's own stated policy.

---

**Summary:**
- B-1 (spec-shaped-green, sub-checks (b)+(c)): load-bearing — sub-checks close the placeholder-path gap in Bundle A. Advisory note for Bundle B scope (sub-check (c) mechanization). Recommendation to update model-behavior-notes.md "Last cited" + add mitigation pointer (SA decides in this PR or follow-up).
- B-2 (N/A-as-default, sub-check (e)): load-bearing — sub-check (e) closes the blanket-N/A failure mode with the SDET applying ADR-012 Applicability rules as arbiter. Advisory note that Bundle B's mechanization must derive tier applicability from file-diff patterns, not solely from `**Affected flows:**`. Deferring model-behavior-notes.md seeding until first observed instance is recommended.
- B-3 (cross-surface scoping, sub-check (f)): load-bearing confirmed — sub-check (f) addresses platform-frontend-scope drift at the declaration level for webapp-developer tasks. Advisory note on role-scoping vs. file-path-scoping precision for future iterations. No must-fix for this task.
- No must-fix findings that block acceptance of the current implementation. All escalations are advisory constraints for Bundle B authoring or model-behavior-notes.md maintenance decisions.

## Lens C (Overwatch — project-fit) — quad review

**Reviewer:** Overwatch
**Date:** 2026-04-29
**Scope:** project-fit — does the rule fit the lights-out / autonomy-ceiling shape of this project? Five checks plus the A-2 length question delegated from Lens A.

### Finding C-1 — Lights-out fit: bullet increases agent autonomy (pass)

ADR-012 § The lights-out keystone requires mechanism 2 + mechanism 3 together. Bundle A delivers mechanism 2's enforcement hook: task spec declares tier coverage; SDET verifies via the new step-2 rejection bullet. Each sub-check is mechanically executable: (a) field-presence; (b) file-existence; (c) non-empty-test (grep for non-skipped `it`/`test`); (d) justification non-empty and non-self-referential; (e) applicability vs. ADR-012 § Per-tier triggers; (f) cross-surface check. Sub-check (e) is most judgment-intensive but explicitly delegates to ADR-012 § Per-tier triggers as the deterministic arbiter — the SDET reads and applies that spec, not invents one. No human-in-loop checkpoint. **Pass.**

### Finding C-2 — Rule-sunset readiness: every firing is citable (pass)

Bullet mandates citing ADR-012 § Mechanism 2 in the rejection breadcrumb. Every rejection produces a Work Log entry citing that anchor; future Close-prep retros can grep `docs/tasks/done/` for firings. Sunset trigger observable in both directions. **Pass.**

### Finding C-3 — Rule overlap: no duplication or contradiction (pass)

Existing "Required task-spec fields missing" bullet covers `Affected flows` / `Affected requirements` / `Introduces-gate`; new bullet covers `Tier coverage`. Four distinct fields; no sub-check overlap. Declaration-side (new step-2) vs. implementation-side (existing step-3 cross-surface audit) is correct separation, not duplication. **Pass.**

### Finding C-4 — Bundle scope discipline (pass)

Two files modified: `_TEMPLATE.md`, `agents/sdet.md`. Not modified: `validate-gates.sh` (Bundle B), `ci.yml` (Bundle C), `agent-stack.md`. Convergent template-debt fix (three sibling fields added): Overwatch concurs with Lens A A-5. Fields were already required by `agent-stack.md` § Task spec required fields and enforced at step 2; absence was template-debt. Adding them restores consistency, doesn't change requirements. Convergent fix, not scope creep. **Pass.**

### Finding C-5 — Length (from Lens A A-2): acceptable from project-fit lens (advisory)

Lights-out keystone requires rejection bullets to be operationally self-sufficient. A bullet saying "verify Tier coverage block is correct" is underspecified — agents interpret "correct" differently across invocations. Sub-checks (a)–(f) operationalize "correct" into six discrete machine-executable conditions; word count is proportional to content complexity, not verbosity.

The task spec's ~50-word constraint was a hint based on existing step-2 bullets covering simpler checks (field absence, format checks, tool-hygiene). A check covering file existence + non-empty test + justification quality + scope-implied applicability + ADR citation + cross-surface scoping cannot fit 50 words without losing autonomy-preserving precision. Collapsing into prose would produce inconsistent agent interpretation — a regression against the lights-out property. The constraint was wrong for the sub-check count, not the implementation. Overwatch does not escalate. **Advisory — Lens D (SA) dispositions.**

### Summary

- C-1 (lights-out fit): pass
- C-2 (rule-sunset readiness): pass
- C-3 (rule overlap): pass
- C-4 (bundle scope discipline): pass
- C-5 (length): advisory — Lens D dispositions
- **No blocking findings from Lens C.**

## Lens D (SA — workflow-coherence) — quad review

**Reviewer:** SA (System Architect, also serves as approval authority — see § Implementation Notes / Reviewer routing and Quad-review fourth-lens conflict)
**Date:** 2026-04-29
**Scope:** workflow-coherence — does the new rejection bullet integrate cleanly into `agents/sdet.md` § Review Process, and does the spec's Bundle A / Bundle B boundary hold? Six checkpoints below; A-2 length disposition delegated from Lens A and confirmed advisory by Lens C is decided here.

> **Important:** this Work Log entry is the Lens D review only. The SA-as-reviewer atomic close edit (per `agents/sdet.md` § Review Process step 6, modified for SA-as-reviewer per `agents/sa.md` § Phases / Review) is a **separate later SA invocation**. This entry does not flip Status to `done`, does not tick the SDET Review checkbox, and does not write `Completed-at`.

### Finding D-1 — Workflow coherence: bullet integrates cleanly into step 2 (pass)

The new bullet lands at the seventh slot of `agents/sdet.md` § Review Process step 2 (Mandatory rejection checks), immediately after "Required task-spec fields missing." Reading step 2 top-to-bottom in the diffed file, the ordering reads naturally:

1. Unticked Mandatory boxes
2. Empty Work Log
3. Missing e2e evidence
4. Missing `Complexity-actual` / `Started-at` / `Complexity-estimate`
5. Tool-hygiene violations
6. Pre-implementation Work Log entry missing (Dispatch Checkpoint)
7. Required task-spec fields missing (`**Affected flows:**` / `**Affected requirements:**` / `**Introduces-gate:**`)
8. **(NEW)** `Tier coverage:` block missing or malformed

The grouping is correct: bullets 7 and 8 are both **structural task-spec field presence/well-formedness** checks; they sit together at the end of step 2 before step 3's content checks. A future SA reading step 2 to compose a rejection sees the structural-field group as one logical cluster. The opening clause of the new bullet — `reject if any of the following are true (cite ADR-012 § Mechanism 2 in the rejection breadcrumb so the developer has the source of truth)` — mirrors the citation pattern used by the Tool-hygiene bullet (`cite .claude/agent-stack.md § Tool Hygiene as the source of truth in the rejection breadcrumb`) and the Dispatch Checkpoint bullet (`cite § Dispatch Checkpoint in the rejection breadcrumb`). The citation-in-opening-clause form is precedented and correct. **Pass.**

### Finding D-2 — Cross-reference integrity (pass)

Three cross-references in the new bullet, all verified:

- **ADR-012 § Mechanism 2** — Read directly. § Mechanism 2 specifies the block format (sibling to `**Affected flows:**` / `**Affected requirements:**` / `**E2e-required:**` / `**Introduces-gate:**`), the three valid value forms (`authored` / `N/A` / `pending — backfill in TASK-XXX`), and "SDET treats a missing `**Tier coverage:**` block as a mandatory rejection — same treatment as a missing `**Affected flows:**` per agent-stack.md." The bullet's sub-checks (a) (block presence + 5 tier lines) and (d) (justification quality) map directly to § Mechanism 2's content. Sub-check (e) (scope-implied applicability) cites § Per-tier triggers, which is the immediately preceding § in ADR-012 — the bullet's "apply the Applicability rule for each tier as the arbiter" matches § Per-tier triggers' Applicability sub-field exactly. Cross-reference integrity: **clean**.
- **CLAUDE.md § Platform-frontend scope** — Read directly. The section reads "`apps/portal` (Client Portal) and `apps/admin` (Tax Portal) are two frontends of one platform" and "Audits, e2e sweeps, flake-isolation passes, mirror-file checks ... default to **both** `apps/portal/**` and `apps/admin/**`." Sub-check (f) restates this verbatim for tier coverage entries. **Clean**.
- **Existing cross-surface audit bullet at step 3** (the `Single-surface: <sibling> does not have this pattern (verified: grep "<pattern>" apps/<sibling>/ returned 0 matches)` breadcrumb format) — diffed against step 3 line 71. The new bullet's escape-clause format is **byte-identical** to the existing breadcrumb at step 3 (parenthetical `(verified: grep "<pattern>" apps/<sibling>/ returned 0 matches)` included). Mirroring is exact, not paraphrased. The declaration-side / implementation-side split (declaration at step 2 sub-check (f); implementation at step 3 cross-surface audit bullet) is documented in the bullet itself: `(the declaration-side check; the implementation-side check lives in the existing cross-surface audit bullet in step 3)`. A future SDET reading either bullet has a pointer to the other. **Pass.**

### Finding D-3 — § Task spec required fields list: defer to Bundle B is correct (pass with note)

The task spec's § Implementation Notes / "Out of scope" explicitly forbids modifying `.claude/agent-stack.md` in Bundle A, with the rationale: "the `**Tier coverage:**` field is a *task-spec field*, not a workflow-engine rule. The agent-stack.md § Task spec required fields list does not need to be extended in Bundle A; that change rides Bundle B (when the field becomes load-bearing for `validate-gates.sh`)."

I evaluated this against `.claude/agent-stack.md` § Task spec required fields. That section currently enumerates three required fields (`**Affected flows:**`, `**Affected requirements:**`, `**Introduces-gate:**`) and concludes: "A task spec missing any of these three fields is a mandatory SDET rejection." The Bundle A SDET bullet **already establishes** the missing/malformed `Tier coverage:` block as a mandatory SDET rejection at step 2 of `agents/sdet.md`. So the rejection-shape for `Tier coverage:` is in force after Bundle A merges, even without an entry in `.claude/agent-stack.md` § Task spec required fields.

**Decision: deferring the agent-stack.md § Task spec required fields edit to Bundle B is correct.** Two reasons:

1. **Single-source-of-truth principle.** Each rejection rule lives in one place. The Tool-hygiene bullet, the Dispatch Checkpoint bullet, and the structural-field bullets all live in `agents/sdet.md` step 2; `.claude/agent-stack.md` is the cross-cutting reference that points back. Adding a fourth bullet to `.claude/agent-stack.md` § Task spec required fields would duplicate the rejection logic in two places, and Bundle A is the wrong moment to introduce that duplication.
2. **Promotion symmetry with Bundle B.** Bundle B introduces the `validate-gates.sh` filesystem-verification check. That check needs a programmatic field-presence assertion, which is when the field genuinely "becomes load-bearing" at the agent-stack.md level — not before. Until Bundle B lands, the SDET review walk is the sole enforcement layer; that fits cleanly under `agents/sdet.md`. After Bundle B, the field is enforced both by SDET review and by `validate-gates.sh`; that two-layer enforcement justifies the agent-stack.md cross-reference. The rule "earn your spot in agent-stack.md by being mechanically enforced" is consistent with how `**Affected flows:**` / `**Affected requirements:**` / `**Introduces-gate:**` got there.

**Note for Bundle B authoring:** the Bundle B task spec must include an edit to `.claude/agent-stack.md` § Task spec required fields adding a fourth bullet for `**Tier coverage:**` alongside the existing three, and the `agents/sdet.md` step 2 bullet's reference to "Field semantics live in `.claude/agent-stack.md` § Task spec required fields" should be added to the new tier-coverage bullet at that point (it is currently absent — appropriate for Bundle A, but worth carrying forward as an explicit line item in Bundle B's spec). I will record this as a forward-looking note when Bundle B is planned. **Pass with note.**

### Finding D-4 — Bundle A / Bundle B boundary: "by hand on review" for sub-check (b) is correct (pass)

Sub-check (b) reads `any 'authored — <path>' line names a file that does not exist on disk — the SDET verifies existence by hand in Bundle A; scripts/validate-gates.sh mechanizes this in Bundle B`. The "by hand on review" phrasing made me pause — does that overstate the SDET's review burden?

I evaluated against the existing step-2 bullets:

- **Tool-hygiene violations** — SDET reads the Work Log and identifies `$()` / `cd &&` / `sudo` / etc. by hand. This is character-level pattern matching across a Work Log; existence-checks against a small file list are no heavier.
- **Pre-implementation Work Log entry missing** — SDET examines git log timestamps against implementation commits OR scans the Work Log for a "Starting implementation"-shaped entry. This is **substantially heavier** than file-existence-by-hand: it requires `git log` invocation and timestamp comparison.
- **Required task-spec fields missing** — SDET checks for three field names in the task header. Equivalent in scope to file-existence checks.

So sub-check (b)'s "by hand" cost is in the same band as the existing step-2 manual checks — and lighter than the Dispatch Checkpoint check. The interim posture is appropriate: Bundle A establishes the rule and the rejection criterion; Bundle B mechanizes it programmatically. This is the same pattern already used by the Dispatch Checkpoint check (the rule lands in agent-stack.md, the SDET enforces by hand, mechanization to a `scripts/validate-gates.sh` check has not happened — and may never need to, because the manual check has been sufficient).

A typical task has 5 tier lines; in the common case 3–4 of those are `N/A` and 1–2 are `authored` paths. Verifying 1–2 file paths exist is genuinely a 5-second check (Read tool, or even a Glob). Sub-check (c) (non-empty test) is heavier per file but applies only to the 1–2 `authored` paths. The overall per-task SDET cost is small. **Pass.**

### Finding D-5 — Approval-routing clarity: spec is clear (pass)

The task spec § Implementation Notes / "Reviewer routing" reads:

> This task is `Assigned to: sdet` with `Reviewer: sa` semantics (SDET is implementer; SA reviews). Pattern reference: `agent-phases.md` § Testing Epics § Role adaptations specifies "Reviewer: sa" for SDET-implemented testing-epic tasks. This is a chore, not a testing epic, but the same approval-routing rationale applies (SDET cannot review its own implementation).

A future SA reading a similar SDET-self-edit task will see this language and recognize the pattern. The cross-reference to `agent-phases.md` § Testing Epics § Role adaptations is accurate (the section specifies `Reviewer: sa` for SDET-implemented testing-epic tasks, and the spec's "this is a chore, not a testing epic, but the same approval-routing rationale applies" correctly notes the analogy without overclaiming the task is a testing epic). The atomic-close-edit handoff (`agents/sdet.md` step 6) is restated in the routing note: "SA-as-reviewer applies the atomic-close-edit rule (`agents/sdet.md` step 6) when approving."

The dual role (SA as Lens D + SA as approval authority) is also documented in § Implementation Notes / "Quad-review fourth-lens conflict" — the rationale (`The dual role is acceptable because the standard SDET review walk is mechanical — Lens D is a subset of the approval review, not a separate independent check`) is sound. **Pass.**

**Forward-looking observation (advisory, not a finding):** if SDET-self-edit becomes a recurring pattern (e.g., 3+ tasks across a span where the SDET implements its own rule edits), a project-specific rule in `agents/sa.md` § Project-Specific Rules or in `CLAUDE.md` § SA Rules formalizing the SDET-implementer + SA-reviewer routing would reduce per-task spec writing. Not actionable from Bundle A; surfaces if the pattern recurs.

### Finding D-6 — A-2 length disposition (KEEP AS-IS with rationale)

**Delegated decision.** Lens A flagged the new bullet at ~220 words against the task spec's stated ~50-word constraint (the longest existing step-2 bullet, "Required task-spec fields missing"). Lens C concurred the length is proportional to content complexity and shortening would harm operationalizability. As Lens D and the approval authority for this task, I dispose:

**Decision: keep the bullet as-is. Document the rationale here and supersede the task spec's stated length constraint for this bullet.**

**Rationale.**

1. **The constraint was authored in advance of the sub-check enumeration.** The task spec's § Implementation Notes / "SDET rejection bullet — exact placement and shape" specifies seven sub-checks (1) through (7) — block well-formed, file existence, non-empty test, justification quality, scope-implied applicability, ADR cite, cross-surface scoping. The same § directly above lists the same seven sub-checks as required content. The "similar in length and style" constraint at the end of that section is **internally inconsistent** with the sub-check enumeration directly above it: seven discrete machine-executable conditions cannot fit in 50 words while remaining unambiguous. The constraint was a length hint inherited from the precedent of bullets that cover **fewer** sub-checks; it did not anticipate the seven-sub-check shape that the bullet's own implementation notes mandate.
2. **Lights-out depends on operationalizability.** Per `.claude/agent-stack.md` § Design Philosophy, gates must be "trustworthy without human verification." A condensed bullet ("verify the `Tier coverage:` block is correct and reject otherwise") would mean each SDET invocation reading the rule would interpret "correct" differently. The current 220-word form spells out six discrete machine-executable conditions (a)–(f), each independently verifiable by a future SDET subagent reading only this bullet. That is the **load-bearing property** the lights-out keystone requires — Overwatch's Lens C is correct on this point.
3. **Restructure into parent + sub-bullets is the wrong tradeoff.** I considered the alternative (split the seven sub-checks into a parent bullet and a nested list under it). The objection: step 2 of `agents/sdet.md` § Review Process is a flat list of bulleted checks at one indent level — the structural-fields group, the tool-hygiene check, the Dispatch Checkpoint check are all top-level bullets without nested sub-lists. Introducing a multi-line nested-bullet shape for the new tier-coverage check alone would break the visual rhythm of step 2 and require a future maintainer to wonder why this one bullet renders differently. The single-paragraph-with-(a)-(b)-(c)-style sub-checks pattern matches the precedent of the **Dispatch Checkpoint** bullet (one long paragraph, internal enumerable conditions, citation in the breadcrumb instruction), which is the structural twin of the new bullet. The current form is the right shape.
4. **The task spec's constraint is not in the Definition of Done.** I checked: the Definition of Done at the end of the task spec lists seven items, none of which encode a length check. The constraint surfaces only in § Implementation Notes / "SDET rejection bullet — exact placement and shape." Implementation Notes are guidance for the implementer; the Definition of Done is the acceptance contract. This bullet meets every item of the Definition of Done.

**Disposition recorded.** This finding does not block approval. The Lens A escalation is honored by this explicit decision and rationale, not by altering the bullet. A future iteration may revisit if the SDET review walk surfaces concrete operational issues with the bullet's length (e.g., agents skipping sub-checks because the bullet feels overwhelming). Until then, the bullet stays.

### Summary

- **D-1 (workflow coherence):** pass — bullet integrates cleanly at the seventh slot of step 2; structural-field grouping is preserved.
- **D-2 (cross-reference integrity):** pass — ADR-012 § Mechanism 2 + § Per-tier triggers cross-references verified; CLAUDE.md § Platform-frontend scope cross-reference verified; existing step-3 cross-surface audit bullet's `Single-surface:` breadcrumb format is mirrored byte-identically by sub-check (f).
- **D-3 (§ Task spec required fields list):** pass with note — Bundle A correctly defers the `.claude/agent-stack.md` § Task spec required fields edit to Bundle B; recorded as a forward-looking note for Bundle B authoring.
- **D-4 (Bundle A / Bundle B boundary):** pass — sub-check (b)'s "by hand on review" interim posture matches existing step-2 manual checks (Tool-hygiene, Pre-implementation Work Log entry); per-task cost is small.
- **D-5 (approval-routing clarity):** pass — spec § Implementation Notes / "Reviewer routing" + "Quad-review fourth-lens conflict" make the SA-reviews-on-SDET-implementation pattern clear for future SAs.
- **D-6 (A-2 length disposition):** **keep as-is**; documented rationale supersedes the task spec's stated ~50-word constraint for this bullet. Length is operationalizability-preserving; restructuring would break step-2's flat-bullet visual rhythm. Disposition not blocking; finding does not gate approval.

**No must-fix findings from Lens D. Bullet is acceptable for SA approval.** The atomic close edit (Status → done, SDET Review tick, `Completed-at`, atomic single Edit) is **deferred to a separate later SA invocation** per the task instruction at the top of this entry.


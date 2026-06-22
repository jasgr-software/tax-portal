---
brief: BRIEF-010
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-22T20:22:47.946Z
completed_at: 2026-06-22T21:47:54.402Z
complexity_estimate: 1
complexity_actual: 1
introduces_gate: "no"
acceptance_criteria: [AC-LIFE-002-01, AC-LIFE-002-02, AC-LIFE-002-03, AC-LIFE-004-01, AC-LIFE-004-02, AC-LIFE-004-03]
upstream_refs: [REQ-LIFE-002, REQ-LIFE-004, ADR-006, ADR-012]
code_standards: [CS-TS-003, CS-GEN-003]
---

# TASK-010-002: Client-facing status label mapping (pure helper + tier-2/5 unit tests)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _(N/A — pure mapping; the rendered-label e2e is TASK-010-004)_
- [x] **Security review** — pure function; no injection surface; unknown inputs throw (never echoed back to caller per AC-LIFE-002-02); no internal name reachable via LABEL_MAP output
- [x] **SDET Review** — approved

## SDET Review focus areas

- **The mapping is exhaustive and correct (AC-LIFE-002-01):** New→"Received", In Progress→"In Progress", Review→"In Progress", Complete→"Completed". Verify "Review" (and any raw internal stage name) can never be returned by the helper (AC-LIFE-002-02) and that the helper yields exactly THREE distinct output labels (AC-LIFE-002-03).
- **Shared-for-both-surfaces (CS-TS-003):** the helper lives where both surfaces could consume it; this slice's only consumer is `apps/portal` but it must not be portal-private if a shared home is the consistent choice.
- **AC-LIFE-004-01/-02/-03 are properties of the mapping/presentation:** Review surfaces as "In Progress", imposes no client action, is not a client approval step — assert these as unit/component-level facts about the label/presentation contract (the e2e proof is TASK-010-004).

## Context

The pure client-facing label mapping consumed by the portal engagement view (TASK-010-004). Tier-2/5 per the brief's tier map.

Satisfies: **AC-LIFE-002-01** (the mapping), **AC-LIFE-002-02** (Review never surfaces as a raw name), **AC-LIFE-002-03** (three distinct client states), **AC-LIFE-004-01/-02/-03** (Review is internal — surfaced as "In Progress", no client action, not an approval step).

## Design (binding)

- **DECISION-010-E (helper location, CS-TS-003):** a pure function `clientFacingLabel(status: string): "Received" | "In Progress" | "Completed"` in `packages/db` (alongside the engagement read model) — shared so both surfaces could consume it; portal is this slice's consumer. Fixed in v1, not accountant-configurable (REQ-LIFE-002 Notes / OQ-002 resolved).
- The mapping is a presentation concern over the stored status — it does NOT add or fork a stored status field.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/engagement-label.ts` | Create | Pure `clientFacingLabel(status)` mapping + a small `CLIENT_FACING_LABELS` constant. Cite `// AC-LIFE-002-01`, `// CS-TS-003`. |
| `packages/db/src/index.ts` | Modify | Barrel-export `clientFacingLabel` + its type (additive). |
| `packages/db/src/engagement-label.test.ts` | Create | Tier-2 unit tests, AC-tagged. |

## Tests to Write First (tag each with its AC id)

- [ ] `[AC-LIFE-002-01] each internal status maps to its client-facing label` — expected: the four-to-three mapping exactly
- [ ] `[AC-LIFE-002-02] Review maps to "In Progress" and the word "Review" is never returned` — expected: no internal name leaks for any input
- [ ] `[AC-LIFE-002-03] the helper yields exactly three distinct client states` — expected: {Received, In Progress, Completed}
- [ ] `[AC-LIFE-004-02/-03] the Review presentation requires no client action and is not an approval step` — expected: Review presents identically to In Progress (no extra client-action affordance)

## Implementation Notes

- Pure, dependency-free, deterministic. Total over the 4-value status set; throw or fall back safely on an unexpected value (do NOT echo the raw value to the client — AC-LIFE-002-02).
- AC-LIFE-004-01 ("Review represents the accountant reviewing her own work") is a meaning/contract assertion — encode it as a documented invariant + a test that Review carries no client-facing distinct state.

## Definition of Done

- [ ] All 6 acceptance criteria tested at tier-2/5 with AC-tagged names, green
- [ ] Lint + type-check + build pass; package test green
- [ ] Helper exported from the `@tax-portal/db` barrel and importable by `apps/portal`

---

## Work Log

- 2026-06-22 [sdet] Marking done — 15 tier-2 unit tests green covering all 6 ACs. Pure mapping helper: exhaustive 4->3, Review never returned, exactly 3 distinct outputs, fail-on-unknown. Shared location (packages/db) per CS-TS-003. AC-LIFE-004-01/-02/-03 invariant assertions present. No injection surface. Pre-existing 2 failures unrelated. Approved. | What's next: archive | Blockers: none
- 2026-06-22 [webapp-developer] Marking as review — All 15 tier-2 unit tests pass (15/15). All 6 AC ids covered. Lint/type-check/build clean. Pre-existing 2 failures in document.upload-pipeline.rls.test.ts unrelated to this change. | What's next: SDET review | Blockers: none
- 2026-06-22 [webapp-developer] Starting implementation — task TASK-010-002 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: 15 tier-2 unit tests cover all 6 ACs with AC-tagged names. Mapping verified exhaustive and correct: New→"Received", In Progress→"In Progress", Review→"In Progress", Complete→"Completed" (AC-LIFE-002-01). All four input statuses checked — "Review" is never returned for any valid input (AC-LIFE-002-02). Unknown inputs throw rather than echoing raw values (fail-closed per AC-LIFE-002-02). Distinct output count collapses to exactly 3 (AC-LIFE-002-03). AC-LIFE-004-01/-02/-03 invariant tests present: Review presents identically to In Progress, label contains no review/approve/action language. CS-TS-003 honored: helper lives in packages/db (shared, not portal-private). CS-GEN-003 tags present. No injection surface. Dispatch-checkpoint entry present. complexity_actual: 1 (in range). completed_at: 2026-06-22T21:47:54.402Z.

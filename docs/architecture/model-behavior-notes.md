# Model Behavior Notes

> **Status: stub.** This file is a placeholder created alongside the quad-review two-lens rule in `.claude/agent-stack.md` § Main Session Rules. It will be populated as concrete model-behavior observations accrue from real epic work. Do not treat the current empty state as "no known failure modes" — treat it as "we have not yet documented the ones we know about."

## Purpose

This file is the reference for **Lens B of quad review** — the model-behavior lens. Quad reviewers (SA, RA, SDET, Overwatch) consult this file when evaluating workflow-file changes to decide whether any rule being modified is load-bearing against a known failure mode of the primary model (currently Claude Opus / Sonnet as configured per-role in `CLAUDE.md`'s Agent Team table).

A rule is **load-bearing** against a model-behavior failure mode when: removing or weakening the rule would allow the model to re-commit a failure that the rule was originally introduced to prevent, and there is no replacement mitigation in the same change.

## What to record here

Each entry describes one observed failure mode, with enough detail that a future reviewer can recognize it and cite it. Recommended shape:

### `<short-slug>` — <one-line failure mode>

- **Observed when:** the context in which the failure was seen (which agent role, which phase, which tool).
- **Symptom:** what the model did that was wrong.
- **Root cause (hypothesis):** why the model behaved that way — prompt structure, tool schema, context loading, pattern-matching from training, etc.
- **Mitigation currently in place:** the specific rule (file + section) that prevents recurrence, or `none yet`.
- **Counterfactual:** what would regress if the mitigation were removed.
- **First observed:** date.
- **Last cited:** date (updated by reviewers who cite this entry in Lens B).

## Maintenance

- **Adding entries.** Any agent may propose an entry by editing this file in a workflow-file PR (subject to the quad review rule). Entries should come from observed failures, not speculation.
- **Retiring entries.** If a model upgrade or prompt change demonstrably eliminates a failure mode, the entry is moved to the `## Retired` section at the bottom with the date and reason. Retirement does not require re-running the original failure — credible argument from the model upgrade's release notes or from absence of the failure across N consecutive epics is sufficient.
- **Cross-reference with rule edits.** When a workflow rule is added, removed, or materially changed, the PR description should cite the entry here that the rule is (or was) load-bearing against — or note "no known entry" to explicitly surface the absence.

## Current entries

_None yet. Add the first entry when a model-behavior observation is concrete enough to cite._

## Retired

_None._

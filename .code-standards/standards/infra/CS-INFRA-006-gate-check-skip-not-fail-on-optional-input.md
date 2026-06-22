---
id: CS-INFRA-006
title: Validation gates use three-valued outcomes — SKIP (not FAIL or silent PASS) when an input is absent
language: infra
polarity: do
rating: recommended
status: active
verification: Inspect any gate/check that can run without all of its inputs — a `scripts/validate-gates.sh` check, an `.orchestration/` subgate, a CI step, or a verification hook. Where the gate depends on a context input that may legitimately be absent (PR body, diff base, manifest file, git-repo context, deploy target), the absent-input path must report a distinct cannot-evaluate outcome (a `skip "$check_name" "<non-empty reason>"` call and `return`, an explicit SKIP/N-A status, or `continue-on-error`/neutral conclusion) — never `fail` (a false alarm), and never fall through to a silent `pass` (a false clearance). A reviewer confirms every optional-input guard resolves to a reasoned skip, not a fail and not a fall-through.
source:
  - scripts/validate-gates.sh
  - .orchestration/bin/orchestrate-gates.sh
related: [CS-INFRA-003]
rating_history:
  - { rating: experimental, date: 2026-06-22, by: agent, rationale: "discovered in PR #83 audit as a single-file convention (validate-gates.sh check 8 + check 10 skip paths); drafted experimental pending ratification." }
  - { rating: recommended, date: 2026-06-22, by: user, rationale: "Ratified after GENERALIZATION. The original draft was scoped to one file (validate-gates.sh) and failed the Generality test (a single-file convention is documentation, not a standard — the gap that prompted the § Generality test addition to AGENT.md). Rewritten as the transferable principle — three-valued gate outcomes (pass/fail/skip) across ALL gate surfaces: validate-gates.sh checks, .orchestration/ subgates, CI steps, and gate scripts not yet written. Capped at recommended, not required: honored across the gate tooling (validate-gates.sh checks 8/10, orchestrate-gates.sh subgates) but not mechanically enforced (no build fails on a fail-instead-of-skip), so it stays advice, not a hard gate." }
open_questions: []
---

# CS-INFRA-006 — Validation gates use three-valued outcomes (SKIP, not FAIL or silent PASS) on absent input

## Rule

A validation gate that can run without all of its inputs must distinguish **cannot-evaluate** from
**evaluated-and-failed**. When a gate depends on a context input that may legitimately be absent (a PR body,
a diff base, a manifest file, git-repo context, a deploy target), the absent-input path must resolve to a
distinct **skip / not-applicable** outcome with a reason — it must **not** call `fail` (a false alarm) and
must **not** fall through to a silent `pass` (a false clearance). This applies to every gate surface in the
project: `scripts/validate-gates.sh` checks, `.orchestration/` subgates, CI steps, and any gate script not
yet written.

## Rationale

Gate tooling runs in heterogeneous environments — CI with full PR context, local dev with no PR, a plain
push to `main` with no diff base, a fixture harness with a synthetic tree. A gate that **fails** when its
input is merely *not supplied* emits false failures, and false failures train authors to ignore gate output
— the most expensive failure mode a gate has. A gate that **silently passes** when its input is absent lets
a genuine violation through undetected — a false clearance. Three-valued logic (pass / fail / **skip**) is
the only semantically honest resolution: the gate states that it could not make a determination, says why,
and does not move the verdict. The reason string is mandatory so the output stays diagnostic ("SKIP — no
diff base" tells the reader the gate was reached and correctly stood down; a bare skip does not).

This is the same pass/fail/not-applicable distinction that test frameworks (skipped vs failed), linters
(N/A rules), and monitoring (no-data vs breach) all encode — a general gate-design principle, not a quirk
of any one script.

## Verification

Inspect each gate's optional-input guard paths. Every guard on a may-be-absent input
(`if [[ -z "$PR_BODY" ]]`, `if [[ ! -f "$MANIFEST" ]]`, "no diff base resolvable", "not a git repo") must
resolve to a reasoned skip — `skip "$check_name" "..."` + `return` in the shell gates, an explicit SKIP/N-A
status, or a neutral CI conclusion — never `fail`, never a fall-through to `pass`. A guard that fails on
absent input, or falls through silently, is a finding.

## Examples

- do: `if [[ ! -f "$manifest" ]]; then skip "$check_name" "no .removed_files manifest — nothing to sweep"; return; fi`
- don't: `if [[ ! -f "$manifest" ]]; then pass "$check_name"; return; fi` (silent false-pass on absent input)
- don't: `if [[ ! -f "$manifest" ]]; then fail "$check_name" "manifest missing"; return; fi` (false alarm when the input is simply not supplied in this environment)

## Links

- Examples in-repo: `scripts/validate-gates.sh` — check 8 (`check_pr_body_quad_review`, skip on missing
  `--pr-body`) and check 10 (`check_removed_artifact_orphans`, multiple skip paths); `.orchestration/bin/orchestrate-gates.sh`
  subgates that stand down when their context is absent. These are *examples* of the rule, not its scope.
- Related: CS-INFRA-003 (`set -euo pipefail` in shell scripts).
- Open questions: none

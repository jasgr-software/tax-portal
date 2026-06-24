---
brief: BRIEF-013
status: backlog
assigned_to: webapp-developer
updated_by: io
depends_on: none
impl: developer
e2e_required: "no"
started_at: —
completed_at: —
complexity_estimate: —
complexity_actual: —
introduces_gate: "no"
acceptance_criteria: "none (justification: test-infra timeout flake; no product behavior)"
upstream_refs: "none"
code_standards: "none"
severity: low
---

# BUG-013-002: YAML validity-oracle test times out under task-corpus growth

## Summary

`scripts/migrate-task-frontmatter.test.ts > YAML validity oracle` intermittently fails in `pnpm ci:local`
with a 5000ms timeout (observed 5107ms). It **passes in isolation at ~2.9s**. The timeout is a
concurrency/load artifact of the growing task-file corpus the oracle parses (BRIEF-013 adds 9 new task files,
~+200ms serial). The YAML content of all 122 task files is valid — this is a **timing flake, not a content
failure**.

## Discovery

Surfaced at **BRIEF-013 Validate** (2026-06-23) during `pnpm ci:local` (Gate B). lint / type-check / build all
PASS; the only non-pre-existing CI red is this single oracle timeout.

## Root cause (suspected)

The oracle shells out per task file (likely a `python3` YAML parse per file) and the per-file cost × a growing
corpus crosses the 5000ms vitest default under CI load. Marginally aggravated by BRIEF-013's new task files but
the underlying cause is corpus growth + per-file shell-out cost.

## Scope

- **Not a BRIEF-013 behavior regression** — lint/type-check/build green; all 13 AC + 4 HARD gates pass.
- Test-infra timeout in `scripts/` tooling, not application code.
- Does NOT block BRIEF-013 delivery (IO disposition — pre-existing flake aggravated only marginally).

## Severity

**Low** — test-infra timing flake; the oracle's actual assertion (YAML validity) holds for all 122 files.

## Remediation (follow-up)

Either (a) raise the vitest timeout for this specific oracle test (e.g. `{ timeout: 15000 }`), and/or (b) batch
the per-file YAML parse into a single shell invocation (one `python3` call over all files) so cost is
near-constant in corpus size. Prefer (b) — it removes the corpus-growth fragility rather than papering over it.

## Regression test

The existing oracle test is the coverage; the fix must keep it asserting YAML validity over the full corpus,
just without the per-file shell-out fragility.

## Disposition

Carried at BRIEF-013 Validate (2026-06-23) — IO-dispositioned as a pre-existing low-severity infra flake that
does not block slice delivery. Re-confirm at Close-prep that Gate B is otherwise green (the only CI reds are
this timeout + the 2 BUG-007-001 scanner failures). Fix rides a follow-up `scripts/` tooling change.

## Work Log

- 2026-06-23 [io] Created at Validate from the Gate B CI result. Pre-existing corpus-growth timeout flake;
  passes in isolation at 2.9s; all 122 task-file YAML valid. Not a BRIEF-013 behavior regression. Status
  backlog, severity low. What's next: fix via timeout-bump or batched parse in a follow-up; carry — do not block.
  Blockers: none.

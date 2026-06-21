# Proposal: Move mechanical bookkeeping from agents to a task-state CLI

**Status:** Draft (for review)
**Scope:** `.implementation/**` (engine, phases, agent docs), `scripts/`, `package.json`
**Author:** main session
**Date:** 2026-06-21

---

## 1. Problem

The implementation engine currently splits task-state work across three layers, but
**only two of them are codified**:

| Concern | How it's done today | Codified? |
| --- | --- | --- |
| **Observe** edits (capture metrics) | `.claude/hooks/log-task-edit.py` → `.claude/metrics/` | ✅ scripted |
| **Validate** state (gate backstop) | `scripts/validate-gates.sh` (9 checks) | ✅ scripted |
| **Mutate** state (write the fields) | Agents hand-edit markdown | ❌ free-typed by LLM |

Every status transition, timestamp, complexity field, Work Log breadcrumb, PROGRESS.md
session-sweep, and `tasks/ → tasks/done/` move is performed by an LLM agent emitting an
exact-match `Edit` against markdown. The format is rigidly specified — and then *separately
re-validated* by `validate-gates.sh` — which is the tell that it's mechanical enough to script.

This is the answer to the originating question ("do agents do bookkeeping a script should
do?"): **yes**, and the engine already proves it by validating that bookkeeping with a script
after the fact. We're paying twice — once for the agent to type it, once for the script to
check the typing — and absorbing the error surface in between.

### Cost of the status quo

- **Error surface:** ISO-8601 timestamp typos, field-name drift (`Introduces-gate:` vs
  `Introduces-gate`), missed atomicity ("all N edits in one Edit call"), malformed
  deferred-gate annotations. `validate-gates.sh` exists *because* these happen — see
  `BUG-000-001`, `BUG-000-002`, `BUG-000-003` in `tasks/done/`, all of which are the validator
  itself miscalibrated against hand-typed evidence.
- **Token/latency spend:** an Opus/Sonnet turn to move a file or stamp `date -u`.
- **Instruction bloat:** ENGINE.md § Dispatch Checkpoint, § Task Metadata Contract, and the
  per-agent Workflow sections spend significant prose specifying exact edit choreography that
  a CLI signature would encode once.
- **Audit fidelity:** hand-edits produce *near*-uniform breadcrumbs; a CLI produces *exactly*
  uniform ones, which makes `validate-gates.sh` checks 5–7 (Work Log / e2e / CI evidence)
  simpler and stricter.

### Non-goals

- We are **not** removing agent judgment. Complexity ratings, RETRO classification, handoff
  prose, and AC-adequacy decisions stay with agents.
- We are **not** removing `validate-gates.sh`. It stays as defense-in-depth — a CLI that
  writes correctly *and* a validator that rejects malformed state are complementary.
- We are **not** auto-merging or auto-transitioning phases. Mutations are agent-invoked; the
  CLI just makes each invocation deterministic.

---

## 2. Design principle

> Agents **decide**; scripts **record**. Any state write whose content is fully determined by
> (a) the current file, (b) the clock, and (c) a small set of agent-supplied judgment values
> should be a CLI call, not a hand-authored `Edit`.

The agent still supplies the judgment inputs (`--complexity-estimate 3`, the Work Log prose,
the classification bucket). The CLI owns format, field names, timestamps, atomicity, ordering,
and idempotency.

---

## 3. Proposed CLI: `scripts/task.ts` (invoked as `pnpm task <cmd>`)

A single TypeScript entrypoint (run via `tsx`, matching `db-migrate.ts`/`db-seed.ts`
convention) with subcommands. Every subcommand is **idempotent** and **atomic** (write to temp,
rename), exits non-zero with a clear message on contract violation, and emits the same
breadcrumb format `validate-gates.sh` already greps for.

### 3.1 Commands

| Command | Replaces (today's hand-edit) | Agent-supplied judgment | CLI owns |
| --- | --- | --- | --- |
| `task start <ID> --complexity-estimate N [--note "..."]` | Developer Workflow step 1: flip `in-progress`, stamp `Started-at`, set `Complexity-estimate`, `Updated-by`, append "Starting implementation" breadcrumb | estimate, optional scope note | status transition legality, UTC timestamp, atomic multi-field write, breadcrumb format |
| `task review <ID> --complexity-actual N [--note "..."]` | Developer Workflow step 8: flip `review`, set `Complexity-actual`, breadcrumb | actual rating, note | same |
| `task log <ID> --role <tag> --did "..." --next "..." [--blockers "..."]` | Any Work Log breadcrumb | the three prose fields | `YYYY-MM-DD [role]` prefix, section layout |
| `task done <ID> [--note "..."]` | SDET Review step 6: tick SDET box, flip `done`, stamp `Completed-at`, breadcrumb | optional note | timestamp, transition legality (rejects if `Complexity-actual` empty — same rule as ENGINE § Task Metadata Contract) |
| `task reject <ID> --bug <BUG-ID> [--note "..."]` | SDET reject path | bug id, note | back-transition, BUG reference wiring |
| `task archive [--brief NNN \| --all-done]` | IO Close-prep: `mv tasks/TASK-*.md tasks/done/` for `Status: done` | which brief | move only `Status: done` files, leave open ones |
| `task verify [--brief NNN]` | thin wrapper over the relevant `validate-gates.sh` checks, scoped to one brief | — | pre-close gate check (fail fast before the IO declares close) |

### 3.2 Commands with a heavier lift (phase 2 — see §5)

| Command | Replaces | Notes |
| --- | --- | --- |
| `task phase-transition --to <phase>` | PHASES.md § Phase-transition reflex: sweep session entries to `PROGRESS-ARCHIVE.md`, generate one-line pointer, update `## Current initiative`, prepend phase-start entry | Pure text surgery on PROGRESS.md. Highest-value, but touches the most-load-bearing file — land after the simple commands prove out. |
| `task merge-checkpoint <ID> --pr <N> --sha <sha>` | IO Close-finalize: record PR URL + squash SHA + move slice to `## Awaiting PR merge` | Reads `gh pr view` / `git log` for URL+SHA so the agent doesn't transcribe them. Gate scorecard verdicts stay agent-supplied (they're judgments). |
| `task trace --brief NNN` | SDET/IO AC↔test ledger | Greps test files for `@AC-*` tags, tallies tiers into a table skeleton. Agent still writes the adequacy verdict. |

### 3.3 Example: before / after

**Before** (developer, today) — a hand-authored multi-field Edit the agent must get exactly
right, then prose:

```
Edit TASK-009-002.md:
  **Status**: in-progress
  **Started-at**: 2026-06-21T14:03:00Z      ← agent types the clock
  **Complexity-estimate**: 3
  **Updated-by**: webapp-developer
  ...append Work Log breadcrumb in the exact YYYY-MM-DD [role] | What's next | Blockers form...
```

**After:**

```bash
pnpm task start TASK-009-002 --complexity-estimate 3 \
  --note "onboarding read model + server-side gate (portal)"
```

The CLI flips status, stamps the real UTC clock, sets `Updated-by` from `--role`/env,
appends the canonically-formatted breadcrumb, and refuses if `TASK-009-002` isn't currently
`backlog`/`in-progress` (catches double-starts).

---

## 4. Why this is safe with the existing architecture

- **The metrics hook keeps working unchanged.** `.claude/hooks/log-task-edit.py` fires on
  `Edit`/`Write` to task files. The CLI performs its writes with the same fs operations, so
  edits are still observed. (If the CLI writes via a path the hook doesn't watch, we add the
  CLI to the hook's matcher — a one-line change.)
- **`validate-gates.sh` becomes a backstop, not the primary guarantee.** Today it's the only
  thing standing between a typo and a bad merge. After this, the CLI prevents the typo and the
  validator catches the (now rare) hand-edit that bypassed the CLI. Belt and suspenders.
- **Hand-edits remain possible.** Nothing forbids an agent from editing markdown directly for
  the genuinely bespoke case. The CLI is the paved road, not a wall.

---

## 5. Rollout (incremental, low-risk)

**Phase 1 — simple field/file mutations (the 80%):**
1. Add `scripts/task.ts` with `start`, `review`, `done`, `reject`, `log`, `archive`, `verify`.
2. Add `"task": "tsx scripts/task.ts"` to `package.json` scripts.
3. Unit-test against `scripts/__test_fixtures__/` (the fixture harness `validate-gates.sh`
   already uses) — assert idempotency, transition-legality rejections, timestamp format.
4. Update agent docs to call the CLI: `developer.md` Workflow steps 1 & 8, `sdet.md` Review
   step 6, ENGINE.md § Dispatch Checkpoint, PHASES.md § Close-prep. Keep the *contract* prose
   (what the fields mean) but replace the *choreography* prose with the CLI call.
5. Run a full slice through the new path; confirm `validate-gates.sh` still passes and
   `.claude/metrics/` still populates.

**Phase 2 — PROGRESS.md surgery + checkpoints (the load-bearing 20%):**
6. Add `phase-transition`, `merge-checkpoint`, `trace` once phase 1 is proven on ≥1 real slice.
7. These touch PROGRESS.md / cross-cut git+gh; gate them behind extra fixture coverage and a
   `--dry-run` that prints the diff for agent/human confirmation before applying.

**Reversibility:** each phase is independently revertable. If `task.ts` misbehaves, agents fall
back to hand-edits and `validate-gates.sh` is unchanged — no regression in the safety net.

---

## 6. What explicitly stays with agents (the judgment line)

- Complexity **ratings** (the numbers) — honest estimation is the whole point of the metric.
- RETRO **finding classification** (`gated-path-fix` / `ungated-fix` / `acknowledged`).
- Handoff/completion **prose** ("what shipped", risk notes).
- AC-coverage **adequacy** verdicts (the CLI builds the table; the agent signs it off).
- Gate **scorecard verdicts** (PASS/FAIL is a judgment from evidence, not a transcription).

The CLI never decides any of these — it only records the agent's decision in canonical form.

---

## 7. Estimated impact

- **Removes** ~the bulk of edit-choreography prose from 4 docs (ENGINE, PHASES, developer,
  sdet), replacing it with CLI signatures.
- **Eliminates** the class of bugs that produced `BUG-000-001/002/003` (format-mismatch
  between hand-typed evidence and the validator).
- **Cuts** an LLM turn per status transition down to a deterministic CLI call.
- **Keeps** every existing safety net (metrics hook, gate validator) intact and arguably
  strengthens them (uniform input).

---

## 8. Open questions for the reviewer

1. **`task.ts` vs `task.sh`?** TS matches `db-migrate`/`db-seed`/`metrics-report` tooling and
   gives real arg-parsing + testability; bash matches `validate-gates.sh`. Recommendation: TS.
2. **Should `done`/`review` *enforce* CLI use** (i.e., should `validate-gates.sh` start
   rejecting transitions that lack a CLI-signature breadcrumb), or stay opt-in? Recommendation:
   opt-in through phase 1; revisit enforcement after a slice of real-world use.
3. **`--role` source:** explicit flag, or inferred from an env var the dispatch prompt sets?
   Recommendation: flag required, env fallback.
4. **Phase-2 scope confirmation:** is automating the PROGRESS.md sweep desirable, or is that
   file deliberately kept hand-curated for IO oversight? This is the one place automation
   touches the human-readable narrative ledger.

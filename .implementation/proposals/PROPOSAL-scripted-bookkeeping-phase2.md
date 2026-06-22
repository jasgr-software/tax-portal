# Phase 2 ratification — structured state store (`state.json` + `events.jsonl`)

**Status:** ✅ **Ratified 2026-06-22** (user). Phase 0 ✅ (PR #74 / `2b8944a`) and Phase 1 ✅ (PR #77 / `8ec1f5a`) delivered. This is the third and **final** phase of the scripted-bookkeeping initiative. Build contract: [`BRIEF-LOE-012`](../briefs/BRIEF-LOE-012-state-store.md), dispatched via `/io` on the reviewed engine lane under `chore/lights-out-enablement`. §7 decisions ratified at the recommended defaults: **(1)** commit `events.jsonl`; **(2)** delete PROGRESS.md, `task report --md` is its on-demand replacement; **(3)** single atomic migration PR.
**Parent:** [`PROPOSAL-scripted-bookkeeping.md`](./PROPOSAL-scripted-bookkeeping.md) — design is §9 (agent-first state model), §5 Phase 2 (rollout steps 6–8), §3.2 (the heavier commands). This doc is the **ratification + build contract**, not a re-design; it points at the parent rather than restating it.
**Scope:** `.implementation/**` (engine, phases, agent docs, `tasks/PROGRESS.md` → state store), `scripts/`, `package.json`, `.claude/` hook. All main-session-owned.
**Author:** main session
**Date:** 2026-06-22

---

## 1. What you're being asked to ratify

Authorize **Phase 2**: replace the hand-curated **PROGRESS.md prose ledger** with a **cold-derivable structured state store** (`.implementation/state.json` + append-only `.implementation/events.jsonl`), and add the five heavier `pnpm task` commands that read/write it. A human-readable narrative is *generated on demand* (`task report`); it is never committed and never a source of truth.

This is the one **breaking change** to the orchestration-state shape in the whole initiative (Phases 0/1 left the safety net fully intact). It is gated behind its own fixture coverage and a `--dry-run` JSON-diff preview, and is independently revertable.

Per the parent's ratification pattern, Phase 2 lands in application-code scope (`scripts/`, `package.json`), so — **if approved** — it builds through the **implementation engine on the reviewed merge lane** as `BRIEF-LOE-012` under epic `chore/lights-out-enablement` (successor to LOE-010/011). The main session does not edit those files directly.

## 2. What ships

Builds directly on the Phase-1 CLI (13 commands already live: `start`/`review`/`done`/`reject`/`log`/`archive`/`verify` + the 6 read projections `show`/`list`/`next`/`summary`/`progress`/`brief-context`). Phase 2 adds **5 commands** and the **state store** beneath them:

| New command | Replaces (today) | Agent-supplied judgment | CLI owns |
| --- | --- | --- | --- |
| `task phase-transition --to <phase> [--note]` | PHASES.md § Phase-transition reflex (the prose sweep) | the optional note/rationale | `phase` field in `state.json` + a structured `events.jsonl` event; **no prose blob to move** |
| `task merge-checkpoint --pr <N> [--sha]` | IO Close-finalize: transcribe PR URL + squash SHA + write the awaiting-merge entry | the gate scorecard **verdicts** (judgments) | reads `gh pr view` / `git log` for URL+SHA so the agent never transcribes; writes the structured awaiting-merge record |
| `task post-merge --pr <N> [--bug <desc>]` | IO Close-finalize triage | the pass/fail verdict; the bug description | pass → clear the awaiting-merge record; fail → scaffold `BUG-BBB-POST-NNN` front matter + keep the record |
| `task trace --brief NNN` | SDET/IO AC↔test ledger | the adequacy verdict | greps `@AC-*` tags across test files, tallies tiers into a structured map |
| `task report [--md]` | the human-readable PROGRESS.md view | — | renders `state.json` + `events.jsonl` (+ task front matter) into a narrative on demand; **generated, never committed** |

State model (parent §9.1 — *one fact, one home*):

- **`.implementation/state.json`** — orchestration hot-state only: current brief/phase/slice; awaiting-PR-merge records (PR · sha · gate verdicts); open retro action items. Rationale captured as a `note`/`rationale` **field** on the relevant record, not a free blob.
- **`.implementation/events.jsonl`** — append-only phase/slice/merge history, bounded-by-nature, queried by slice; **git log stays the authoritative deep history**.
- **Active bugs** — a *query* over bug-file front matter (Phase 0), not a stored list.

## 3. Concrete deliverables

1. `scripts/task.ts` — 5 new subcommands above, each idempotent + atomic (temp-write + rename), non-zero exit with a clear message on contract violation, `--dry-run` printing the `state.json` JSON diff before any write.
2. `.implementation/state.json` + `.implementation/events.jsonl` — created by a one-shot migration that lifts the four current `## ` PROGRESS.md sections (`## Current initiative`, `## Awaiting PR merge`, `## Active bugs`, `## Open retro action items`) into `state.json`, then renders `report` to confirm round-trip parity with the prose it replaces.
3. **`validate-gates.sh` rewrite — checks 3 & 9** (`check_progress_md_structure` and `check_pr_awaiting_merge_gate_verdicts`) re-pointed from grepping `PROGRESS.md` markdown to validating the `state.json` **schema**.
   > **Scope correction vs. the parent proposal:** the parent says "checks 3/8/9." On disk, **check 8 is `check_pr_body_quad_review`** (PR-body, unrelated to PROGRESS) — it is **out of scope** here. Only checks **3 and 9** read PROGRESS.md. The brief must carry this correction.
4. **Doc retirements** — remove `ENGINE.md` § Bounded-ledger rule (line ~328) and `PHASES.md` § Phase-transition reflex (line ~59); both become obsolete (structured state cannot accrete prose, so there is nothing to bound or sweep). Update ENGINE § PROGRESS.md structure contract + any agent-doc prose that points at the old sections.
5. `.claude/hooks/log-task-edit.py` — extend so a `task report` render / state write self-reports consistently (parent §4 provenance model; no new in-file marks).
6. Vitest fixtures under `scripts/__test_fixtures__/` covering the new commands and the schema validator.

## 4. Risk, reversibility, validation

- **Single breaking change, contained.** Only the orchestration-state *shape* changes; per-task lifecycle (front matter, Phase 0) and the Phase-1 write/read commands are untouched.
- **Reversible.** If `task.ts` misbehaves, agents fall back to hand-edits; the schema check still catches malformed state. The migration is scripted and the old PROGRESS.md is recoverable from git.
- **`--dry-run` gate.** Every `state.json` write previews its JSON diff for confirmation before committing.
- **Independent oracle (carried Phase-0 learning — [[validation-oracle-independent-of-code]]).** The round-trip/migration check must be validated by a **real JSON Schema validator**, not a lenient re-implementation of the same parse — the same rule that caught the YAML blocker in Phase 0 (39/90 files) that four prior gates missed. Bake a schema-validator oracle test in as a standing regression.

## 5. Draft acceptance criteria (seed for `BRIEF-LOE-012`)

| AC | Statement |
| --- | --- |
| AC-LOE-012-01 | `state.json` + `events.jsonl` exist; the migration lifts all four PROGRESS.md sections with no fact lost (round-trip proven by `task report` vs. the pre-migration prose). |
| AC-LOE-012-02 | `task phase-transition` sets `phase` + appends a structured event atomically; rejects illegal/unknown phases; `--dry-run` previews the diff. |
| AC-LOE-012-03 | `task merge-checkpoint` derives PR URL + squash SHA from `gh`/`git` (no agent transcription) and writes the awaiting-merge record; gate verdicts remain agent-supplied. |
| AC-LOE-012-04 | `task post-merge` clears the record on pass; on fail scaffolds `BUG-BBB-POST-NNN` front matter and keeps the record. |
| AC-LOE-012-05 | `task trace --brief NNN` tallies `@AC-*` tags into a structured tier map; adequacy verdict stays agent-supplied. |
| AC-LOE-012-06 | `task report [--md]` renders state into a human narrative; output is never committed and is not read as a source of truth. |
| AC-LOE-012-07 | `validate-gates.sh` checks 3 & 9 validate the `state.json` schema (incl. `completed_at >= started_at`-class invariants on records); a malformed state fails loudly. Check 8 is untouched. |
| AC-LOE-012-08 | ENGINE bounded-ledger rule + PHASES phase-transition reflex removed; no remaining doc references the retired PROGRESS.md sweep. |
| AC-LOE-012-09 | A full slice runs through the new path; `validate-gates.sh` green, `.claude/metrics/` still populates, state survives a simulated cross-session resume (`state.json` + recent `events.jsonl` reconstruct the working context). |

## 6. Merge lane (if approved)

Reviewed engine lane: Standards audit → `/pr-review` panel → `/pr-fix` → resolve threads → merge on green required CI (`lint-and-typecheck` + `security-scan`). No `--admin`, no branch-protection toggle. This PR will touch **quad-review-governed workflow files** (`ENGINE.md`, `PHASES.md`, agent docs) → per ENGINE § Autonomy Ceiling 3(c) it **must not auto-merge**; it requires an explicit user `LGTM` / `/approve` — same gate Phase 1 cleared.

## 7. Decisions to confirm before briefing

These are the only Phase-2-specific judgment calls; the parent's §10 open questions (Q1–Q6) are already resolved and carry forward unchanged.

1. **Commit `events.jsonl`?** Recommend **yes** — it is the durable, bounded history the cold-derivable contract (NORTH-STAR #7) depends on; git is the deep backstop but `events.jsonl` is the queryable slice index. (`state.json` is committed; the rendered `report` is not.)
2. **Keep PROGRESS.md as a generated artifact, or delete it?** Recommend **delete from the repo** and treat `task report --md` as its on-demand replacement (gitignored if ever written) — a committed generated file is a drift magnet. Alternative: keep a thin committed `report` snapshot for GitHub readability.
3. **Migration cutover** — one PR that both migrates and re-points the validator (recommend; atomic, no dual-write window), vs. a dual-write transition slice. Phase 0/1 precedent favors the single atomic PR.

## 8. What stays with agents (unchanged judgment line — parent §6)

Gate scorecard verdicts (PASS/FAIL), AC-adequacy sign-off, complexity ratings, RETRO classification, handoff/completion **prose**. The CLI records these in canonical form; it never decides them. `task report` renders the *structured inputs* of a handoff — the narrative remains agent-authored.

---

## Authorization

> **To ratify:** reply approving Phase 2 (optionally answering §7). On approval I'll compose `BRIEF-LOE-012` from §3/§5 and dispatch it through `/io` on the reviewed lane under `chore/lights-out-enablement`, mirroring the LOE-010/011 builds. After it lands, the scripted-bookkeeping initiative is complete and the NORTH-STAR cross-layer extension closes.

| | |
| --- | --- |
| **Ratified by** | user (chris.cox) |
| **Date** | 2026-06-22 |
| **Authorized scope** | Phase 2 — `BRIEF-LOE-012`, reviewed engine lane (`chore/lights-out-enablement`) |
| **§7 decisions** | (1) commit `events.jsonl` · (2) delete PROGRESS.md, `report --md` is the on-demand replacement · (3) single atomic migration PR |

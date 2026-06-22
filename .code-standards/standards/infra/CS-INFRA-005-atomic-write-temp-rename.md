---
id: CS-INFRA-005
title: Engine tooling scripts use atomic write (temp file + rename) for all file mutations
language: infra
polarity: do
rating: recommended
status: active
verification: Inspect any new or modified `scripts/*.ts` that writes a file. The write path must go through a temp-file-then-`fs.renameSync` (or the exported `atomicWriteFile` helper from `task.ts`) rather than writing directly to the target path. A reviewer confirms direct `fs.writeFileSync(<target>, ...)` calls without a prior temp file are absent from engine-tooling write paths.
source:
  - scripts/task.ts
  - scripts/state-store.ts
  - scripts/migrate-task-frontmatter.ts
related: [CS-INFRA-004]
rating_history:
  - { rating: experimental, date: 2026-06-22, by: agent, rationale: "discovered in PR #80 audit — three distinct engine-tooling scripts (task.ts, state-store.ts, migrate-task-frontmatter.ts) all write via a temp file + renameSync; task.ts exports atomicWriteFile as a shared helper; state-store.ts calls it explicitly; the pattern is named in DECISION: comments in both files. Proposed experimental pending human ratification." }
  - { rating: recommended, date: 2026-06-22, by: user, rationale: "Ratified. The pattern is a real, already-followed convention (3 scripts + shared helper), not an artifact. Capped at recommended, not required: making atomic write a hard gate for a single-user local CLI's writes is over-governance. Rationale revised to argue the actual reason it matters in THIS project — durable system-of-record written by killable supervised subprocesses — rather than the generic crash-safety case, and corrected to claim process-crash safety (not power-loss durability, which would require fsync)." }
open_questions: []
---

# CS-INFRA-005 — Engine tooling scripts use atomic write (temp file + rename) for all file mutations

## Rule
When a `scripts/*.ts` engine-tooling script writes a file (state store, task YAML, event log), it must
write to a sibling temp file on the same filesystem first, then `fs.renameSync` over the target. Direct
`fs.writeFileSync(<target>, ...)` without an intermediate temp file is not permitted for write paths that
overwrite durable state.

## Rationale
Engine-tooling scripts mutate the project's **system of record** — `state.json` (the orchestration
ledger), task front matter, and the slice history — files that are committed and cold-read by later
sessions and by every gate that derives state from them.

The reason this matters *here* is the execution model, not generic crash-safety. These scripts do not run
at an interactive human prompt; they run inside **supervised, killable subprocesses** — the
implementation/orchestration pipeline dispatches agents and gate steps that get interrupted, timed out, or
SIGKILLed between operations (this whole layer exists because a session can die mid-step). In that model
the "interrupted mid-write" window is not theoretical: a process killed between the `open` and the final
`write` of a *direct* overwrite leaves a truncated `state.json` that fails the next cold read and poisons
every downstream gate. Temp-file-then-`fs.renameSync` removes the window — `rename(2)` over an existing
path **on the same filesystem** resolves the target to either the complete old content or the complete new
content, never a partial file, for any concurrent or subsequent reader.

Scope of the guarantee (stated precisely so the standard isn't over-claimed): rename *ordering* is atomic,
but the written *data* is only durable across a **power loss** if the temp file is `fsync`'d before the
rename. This standard targets **process-crash safety** — the relevant failure mode for killable
subprocesses — and deliberately does **not** mandate `fsync`; power-loss durability of a single-user dev
ledger is out of scope.

The pattern is already followed without exception across the three scripts that mutate files, is named as
a design constraint in `task.ts` (`DECISION: Write to a sibling temp file (same directory for
same-filesystem guarantee)`), and is exposed as the shared `atomicWriteFile` helper — so this standard
codifies an existing convention rather than imposing a new one. It is `recommended`, not `required`:
a hard gate on every write of a single-user local CLI would be disproportionate.

## Verification
Inspect `scripts/*.ts` write paths. The pattern is:
1. Compute `<target>.tmp` path (same directory as target).
2. `fs.writeFileSync(tmpPath, content)`.
3. `fs.renameSync(tmpPath, targetPath)`.

Or use the shared `atomicWriteFile(path, content)` helper exported from `scripts/task.ts`, which
implements exactly this pattern. A direct write to the final target path (bypassing the temp file) is
a finding. JSONL appends (`fs.appendFileSync`) are exempt — append is inherently additive and a
partial append only risks losing the last record, not corrupting prior records.

## Examples
- do: `fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf8"); fs.renameSync(tmpPath, targetPath);`
- don't: `fs.writeFileSync(stateJsonPath, JSON.stringify(state, null, 2), "utf8"); // direct write — no temp`

## Links
- Source: scripts/task.ts (`atomicWriteFile` helper + `DECISION:` comment), scripts/state-store.ts (`writeState`), scripts/migrate-task-frontmatter.ts
- Related: CS-INFRA-004
- Open questions: none

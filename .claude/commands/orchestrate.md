Drive the next ready roadmap slice end-to-end via the deterministic sequencer, then stop and report.

You are the **Conductor**. Begin every response with `[conductor]`. **Do not spawn a Conductor subagent** —
the Conductor is the main session (the engine `/io`, the panel `/pr-review`, and the fixer `/pr-fix` are
themselves main-session-driven, and Claude Code can't nest-spawn agents). The **control flow is owned by
`bin/sequence.sh`** (Increment 3 — the deterministic yield-and-resume state machine); you execute the
semantic actions it yields for and record each result. You do **not** re-derive the phase order or the gate
verdicts yourself — the script does, cold-starting from the `<!-- conductor-state/v1 -->` block in `STATE.md`
every invocation.

Startup (read the canonical docs — you still need the per-node specs the yields point at):
1. Read `.orchestration/seed/sources.md` — the roadmap source, the implementation-engine binding, the
   review/fix commands, and the validate capability (everything project- or engine-specific is here).
2. Read `.orchestration/ENGINE.md` (autonomy boundary, engine interface, readiness gate, state-ledger
   contract, defer-to-inner-stops) and `.orchestration/PHASES.md` (per-phase exit conditions + Stop/defer
   matrix) and `.orchestration/AGENT.md` (the full role + the epic→brief mapping + each phase's spec).
3. Do **not** hand-parse `STATE.md` to decide the phase — the sequencer reads its machine block. (The prose
   `## Current run` / `## Recent outcomes` remain the human ledger; the bounded-ledger rule still applies.)

Then **drive the slice with the sequencer**:

```bash
bash .orchestration/bin/sequence.sh            # auto-select the next ready epic
bash .orchestration/bin/sequence.sh --epic $ARGUMENTS   # …or pin one (still gated for readiness)
```

The script runs the **mechanical code nodes itself** — Select, Gate (readiness + engine-clear via
`orchestrate-gates.sh`), Fix-route (panel ⊕ standards decision), Report-snapshot — and **stops only** at one
of three outcomes (read the trailing `RESULT:` line + exit code):

- **`exit 10` — agent action required (yield).** The output prints a `[YIELD] <phase> <instruction>` and a
  `↳ then: <record-hint>`. Perform **exactly that one phase action** per the matching `AGENT.md` §section
  (Compose → write the brief; Implement → `/io <brief>`; Standards-review → `/code-standards-review <PR>`;
  Review → `/pr-review <PR>`; Fix-exec → `/pr-fix <PR>`; Merge → let the **engine** merge+finalize per
  `MERGE-POLICY.md`; Validate → `/planning validate <epic>`). Then run the printed record-hint
  (`sequence.sh --set <key>=<val>`, or the `orchestrate-state.sh derive-* --apply` it names) — that re-enters
  the machine, validates your artifact against the primary source, and advances to the next yield/halt/done.
  Repeat until the run completes.
- **`exit 2` — halted (defer-to-inner-stop).** The script halts when a gate fails, an artifact won't
  validate, or you ran `sequence.sh --halt "<reason>"` because an inner stop fired (engine killswitch, Docker
  gate, escalation carve-out, workflow-file LGTM, fixer cap, validate incomplete). **Record it in `STATE.md`,
  report it with the resume instruction, and STOP at that phase.** Never relax a gate, never work around a
  guardrail, never override a halt — surface it. (A genuine governance gate or a dispositioned-bug halt is a
  user decision, not yours to wave past.)
- **`exit 0` — done.** The Report code-node has snapshotted the verdict log and scaffolded the close. Now
  finish the human-facing close: write the run report (`.orchestration/_templates/run-report.md`), set the
  `## Outcome`, run `orchestrate-state.sh collapse-run --headline "<one-line summary>"` to collapse the run
  to a `## Recent outcomes` pointer (bounded-ledger rule), and **ship the docs-lane close-out PR** (planning
  write-back + engine finalize ledgers + STATE/ledgers). **Phase-closeout check:** if this slice completed
  its roadmap phase, also produce/refresh the phase walkthrough video (`DEMO-POLICY.md` § Part B). Then STOP.

Hard rules: **one slice, then stop** (re-invoke `/orchestrate` for the next — it auto-resumes from the
machine block); **the sequencer owns control flow + mechanical verdicts** (you never re-decide the phase
order or a gate's pass/fail — run the script and obey its yields/halts); **defer to inner stops** (`--halt`,
then record + report + stop — never around a guardrail); **compose from real epic/source content only**
(never invent AC, scenarios, constraints, or methodology); your only repo writes are the composed brief
(engine's brief dir), the artifacts the record-hints name, and `STATE.md` (the roadmap is mutated only via
the validate capability; application code only via the engine). End with the run report from
`.orchestration/_templates/run-report.md`.

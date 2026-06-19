# Conductor Phases

The per-phase reference for the Conductor (`AGENT.md` is the role; `ENGINE.md` is the shared rules). One
slice flows through these phases once, then the Conductor stops. Each phase has a single observable **exit
condition**; `STATE.md` is updated at every transition.

## Phase table

| Phase | Responsibility | Exit condition |
|---|---|---|
| **Select** | Read `ROADMAP.md` + epic files + `COVERAGE.md`. Pin the `$ARGUMENTS` epic, or pick the earliest-phase/earliest-listed candidate. | A candidate epic recorded in `STATE.md` (or → blockers report + STOP if none exist). |
| **Gate** | Apply the readiness predicate (`ENGINE.md` § Readiness gate). | Candidate is **GO** (all 7 criteria hold) — else blockers report (per candidate, *why*) + STOP. |
| **Compose** | Map the GO epic → a build brief honoring the engine's contract; write it to the engine's brief dir. | `BRIEF-<NNN>-<slug>.md` exists with every required field populated from real epic/source content; AC-id test-tag contract carried. |
| **Implement** | Invoke the engine (`/io <brief>`); drive it to its completion signal. Defer on any inner stop. | Slice recorded in the engine's limbo ledger with a PR URL; PR number in `STATE.md`. |
| **Review** | Invoke `/pr-review <N>`. | One consolidated advisory review posted; verdict + counts in `STATE.md`. |
| **Fix** | If the panel posted actionable findings, invoke `/pr-fix <N>`; else skip. Defer if the fixer caps out. | Panel findings addressed and CI green — or "skipped (clean)" recorded. |
| **Merge/Finalize** | Merge per `MERGE-POLICY.md` (application-code lane: panel→fix→**resolve threads**→merge on green required CI; **no `--admin`/`enforce_admins` toggle**) + resume post-merge finalize. Surface (don't satisfy) a workflow-file LGTM hold or a genuine governance gate (e.g. an unsatisfiable required review). | PR merged + engine finalize complete; merge SHA in `STATE.md` — or STOP on an LGTM/governance gate. |
| **Validate** | Invoke the validate capability with merged-PR CI evidence; the planning agent writes back. | Validation verdict captured; COVERAGE rows flipped / epic rolled by the planning agent. |
| **Report** | Write the run report; set `STATE.md` `## Outcome`. **Phase-closeout check:** if this slice completed its roadmap phase (all phase epics `delivered`), produce/refresh the phase **walkthrough video** (`DEMO-POLICY.md` § Part B) and ship `docs/demos/phase-<N>/` in the docs-lane PR. | `delivered` (or `stopped-at-<phase>` + reason) recorded; phase video produced/refreshed if the phase closed (else n/a); STOP. |

## Stop / defer matrix

The Conductor **defers** to the engine's and fixer's own halts — it records the stop in `STATE.md`, reports
it with the resume instruction, and halts at that phase. It never retries around a guardrail or relaxes a
gate.

| Inner stop | Where it originates | Conductor action |
|---|---|---|
| **No ready epic** | Select / Gate | Emit blockers report (per candidate, *why*); STOP. Suggested next: author/unblock the named epic via `/planning`. |
| **Stuck-Loop Killswitch** (task failed same gate 3×) | engine (`.implementation/ENGINE.md`) | Record the `BUG-*` + `needs-user-direction`; STOP. Resume: user revises task/gate/approach, then re-`/io`, then re-`/orchestrate`. |
| **Docker pre-flight hard gate** | engine | Record the escalation; STOP. Resume: user restores Docker, then re-`/orchestrate`. |
| **`needs-user-direction` / escalation carve-out** | engine | Record the task + reason; STOP. Resume: user resolves, then re-`/orchestrate`. |
| **Workflow-file LGTM hold** (PR touches engine/role files) | engine auto-merge condition | Surface the PR + the required `LGTM`/`/approve` comment; STOP. **Do not post the LGTM.** Resume after the user comments. |
| **Fixer attempt cap without green** | `/pr-fix` | Record the last failing CI; STOP. Resume: user inspects, then re-`/orchestrate` (resumes at Fix). |
| **Validate `incomplete`/`failing`** | `/planning validate` | Record which AC are `missing`/`failing`; STOP (epic not rolled to `delivered`). Resume: address the gap (likely a re-slice or a follow-up brief). |

## Notes

- **Phases are sequential and gated** — the Conductor does not parallelize the engine, review, and fix; each
  depends on the prior phase's artifact (a PR exists before review; a merge exists before write-back).
- **Resumability** — a fresh `/orchestrate` reads `STATE.md` and resumes at the recorded phase. A `stopped-at`
  outcome is resumed by re-invoking after the human action named in the report.
- **Phase-boundary cold-start** (NORTH-STAR conclusion #7; see `AGENT.md`) — every transition is a compaction
  point: the next phase re-derives its inputs from `STATE.md` (`## Current run`) + primary sources, not from
  accumulated context. Resumability is therefore exercised on **every** transition, not just across sessions —
  a phase that can't cold-start exposes a state-ledger contract gap (fix the ledger, don't keep context warm).
- **Merge/Finalize is the engine's, not the Conductor's** — the Conductor observes and records; it never
  merges directly and never overrides the engine's merge conditions.

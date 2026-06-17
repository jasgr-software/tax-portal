# Increment 1 — Gate Rails

> **Status:** implemented on branch `feat/orchestration-gate-rails` (2026-06-17). See § As built.
> **Owner:** main session (`.orchestration/**` + `.pr-review/**` are main-session-owned tooling per `CLAUDE.md` § Main Session Rules)
> **Scope decision:** "The wedge" — see § Scope. Larger options (deterministic sequencer, AC-testability gate-judge) are **explicitly deferred** to increment 2+.
> **Scope correction vs. original draft:** the harness was planned for `scripts/`, but `CLAUDE.md` forbids the main session from modifying `scripts/` (application-code scope). It lives at **`.orchestration/bin/`** instead — main-session-owned, and a docs-lane path per `MERGE-POLICY.md`.

## Why this exists

The `.orchestration/` Conductor runs an LLM agent over a control flow that Phase 1 proved is a **deterministic state machine** (4 epics, identical path: Select → Gate → Compose → Implement → Review → Fix → Merge → Validate → Report). An LLM in full control of a deterministic flow pays Opus-tier tokens for what is mostly control flow, and — more importantly — it **hides contract erosion**: when a brief is slightly off or a handoff drops something, the agent silently reinterprets and proceeds.

The long-term direction is a **strangler migration**: a deterministic sequencer + pure-code gates + a small set of narrow, logged, conservative LLM "gate-judges" for the residual *semantic* gates, advancing on data rather than vibes. See the design discussion conclusions below.

Increment 1 builds the **rails** for that migration without touching the control flow. It is a strict risk/cost reduction that stands on its own even while the agent still conducts.

### Design conclusions this increment rests on

1. **Script-vs-agent and contract-erosion are the same problem.** A script can't absorb variance; it *reveals* loose contracts instead of papering over them. Scripting **is** the erosion detector.
2. **Intelligence in the nodes, dumb composition between them.** The sequencing is a DAG; the judgment belongs inside narrow gate evaluators, not in an agent conducting the flow.
3. **A gate-judge re-derives from primary sources — never from ledger verdicts.** STATE.md's "✓" is a *conclusion*, not evidence.
4. **Conservative bias.** A false-pass lets bad work proceed (expensive, caught late); a false-fail just halts (cheap, caught now). Evaluators default to FAIL/escalate when uncertain.
5. **Promotion is data-driven.** When a gate's evaluator returns the same verdict at high confidence across many runs on a mechanical input, it graduates from LLM-judge to pure code. The verdict log is the evidence.

### Breadcrumb audit result (what made this plannable)

Of the four semantic gate clusters, **three already feed primary-source breadcrumbs sufficient for a cold evaluator** and **one has a material gap**:

| Gate | Breadcrumbs | Note |
| --- | --- | --- |
| Readiness criteria 1–4, 7 (status / open-questions / deps / coverage / git) | ✅ sufficient | All structured: epic front-matter YAML, ROADMAP, COVERAGE table, git state |
| Engine clear (criterion 6) | ✅ sufficient | `.implementation/tasks/PROGRESS.md` `## Awaiting PR merge` / `## Active bugs` — structural check (`validate-gates.sh` Check 3 already parses this) |
| AC-testability (criterion 5) | ✅ sufficient inputs | AC→REQ map in epic front-matter; testable text in `REQ-*`. **Judgment never exercised on paraphrased/partial AC** — Phase 1 was all verbatim |
| **Panel-verdict (fix-or-skip)** | ⚠️ **gap** | Findings live only as **prose in a GitHub PR comment**; the severity tally in STATE.md is the agent's hand-written interpretation. No machine-resolvable in-repo record |

The panel-verdict gap is the wedge's primary target — and its fix **demotes the highest-stakes gate to pure code** rather than feeding a judge.

## Scope

### In scope

1. **Persist the panel's structured verdict** (`.pr-review/`). The panel already computes `{blocker, major, minor, nit}` counts and an APPROVE/REQUEST-CHANGES verdict (`_templates/pr-review-summary.md:9,14,43`) from typed findings (`_templates/finding.md`). Stop discarding the structure on render.
2. **A gate-evaluator harness** (`.orchestration/`) that reads **primary sources only**, wraps the pure-code gates `scripts/validate-gates.sh` already seeds, and consumes the structured panel verdict — turning fix-or-skip into a pure-code comparison.
3. **A per-gate verdict log** — the contract-erosion alarm *and* the promotion ledger.
4. **A typed gate-judge invocation contract** — defined now (schema only), so increment 2's first real judge slots into a stable interface. No judge is built in increment 1.

### Out of scope (deferred to increment 2+)

- The deterministic sequencer replacing the agent Conductor. Control flow is **unchanged** here; the agent still conducts and simply reads better inputs.
- The AC-testability gate-judge (inputs are ready, but the judgment is unexercised on non-verbatim AC — no Phase 1 cases to validate against).
- Scripting any branch that **never fired** in Phase 1 (open `PQ` at gate, unresolvable blocker, an EPIC-004-style gate deviation). These remain **halt-and-escalate**, matching the Conductor's existing stop/defer discipline.

## The three open decisions (resolved here as recommendations — confirm before building)

### (a) Who writes the structured verdict — panel or Conductor?

**Recommendation: the panel emits it.** It already computes the tally; making the Conductor re-parse prose would re-introduce the exact gap we're closing. The panel appends a machine-readable block to its consolidated GitHub review body (single source of truth stays on the PR; no tree dirtying) **and** returns the same object to its caller. The Conductor reads the returned object in-session for the immediate fix/skip decision; the GitHub-body copy is the durable record a cold reader can fetch via `gh`.

### (b) Verdict-log schema

Append-only JSONL at `.orchestration/runs/gate-log.jsonl` (gitignored during a run; the close-out step may snapshot it into the run report). One record per gate evaluation:

```json
{
  "run_id": "epic-005-2026-06-20",
  "epic": "EPIC-005",
  "gate": "panel-verdict",
  "inputs_digest": "sha256:…",
  "verdict": "skip-fix",
  "confidence": 1.0,
  "source": "code",
  "decided_by": "orchestrate-gates.sh@<sha>",
  "evidence": { "blocker": 0, "major": 0, "minor": 6, "nit": 2, "advisory": "APPROVE" }
}
```

`source: code | judge` is the field the promotion criterion keys on. `inputs_digest` lets us detect when a gate's inputs drift shape (contract-erosion alarm).

### (c) Gate-judge invocation contract (schema only — no judge built)

Typed I/O so increment 2 has a stable slot:

```
input  = { gate, primary_source_refs[], extracted_inputs }
output = { verdict: "pass" | "fail", confidence: 0.0–1.0, reason }
```

Conservative default: `confidence < threshold` ⇒ the harness treats it as `fail` and **halts/escalates to the user**. Increment 1 wires only the pure-code evaluators into this slot; the judge interface exists but has zero implementations.

## Work items (each small, reversible, independently shippable)

1. **`.pr-review/ENGINE.md` + lead lens (`agents/reviewer-correctness.md`):** append a fenced machine-readable verdict block to the consolidated review body and return the same object. Update `_templates/pr-review-summary.md` to document the block. *(docs + the panel's own tooling — main-session-owned.)*
2. **`.orchestration/bin/orchestrate-gates.sh`:** a sibling to `scripts/validate-gates.sh` (reuse its proven pattern: `pass`/`fail`/`skip`, exit codes, `--fixture-dir`). Evaluates the readiness criteria and engine-clear from primary sources, and the fix-or-skip gate from the structured panel verdict. Emits the verdict log. *Lives under `.orchestration/` (not `scripts/`) to stay within the main-session boundary and preserve the `.implementation` vs `.orchestration` ownership line.*
3. **Verdict-log plumbing:** create `.orchestration/runs/` (gitignored), write the JSONL schema, wire the close-out step to snapshot the log into `_templates/run-report.md`.
4. **`.orchestration/AGENT.md` § Fix + § Gate:** point the agent at the structured verdict + harness as the source of truth for these decisions (it reads the artifact instead of interpreting prose). Control flow unchanged.
5. **Fixtures + a test** for `orchestrate-gates.sh` mirroring `scripts/__test_fixtures__/validate-gates`.

## As built

| Work item | Landed as |
| --- | --- |
| 1 — structured panel verdict | `.pr-review/ENGINE.md` § Machine-readable verdict block; `_templates/pr-review-summary.md` trailing `<!-- pr-review-verdict … -->`; lead duties in `agents/reviewer-correctness.md` (steps 3–5) |
| 2 — gate-evaluator harness | `.orchestration/bin/orchestrate-gates.sh` — `--gate readiness\|engine-clear\|fix-decision\|all`, `--fixture-dir`, exit 0/1/2 |
| 3 — verdict log | `.orchestration/runs/` (gitignored `*.jsonl`) + `runs/README.md` (schema = erosion alarm + promotion ledger) |
| 4 — Conductor wiring | `.orchestration/AGENT.md` § Gate (mechanical criteria → harness; criterion 5 stays the agent's judgment), § Review (capture verdict block), § Fix (decision derived by harness) |
| 5 — fixtures + test | `.orchestration/bin/__test_fixtures__/` (ready / notready epics, three verdict payloads) + `orchestrate-gates.test.sh` — **11/11 pass** |

**Two bugs caught while testing** (the layer doing its job): the COVERAGE check matched the epic id in prose, not table rows (tightened to `| EPIC-NNN |` cells); and engine-clear counted archived bug bullets as active (now keys on the maintained `_None active._` clear-marker — the disposition signal the convention already provides — rather than re-judging each bullet, which is the semantic boundary a pure-code gate must respect).

## Why risk is strictly lower than today

- The agent still conducts; nothing in the control flow is removed. The change is **better inputs**, not less oversight — strictly less LLM authority than today (the panel's severity judgment, already made by an LLM at the right place, stops being re-interpreted from prose downstream).
- Every new evaluator is pure code or no-op; the one place judgment remains (AC-testability) is untouched and still agent-handled.
- The verdict log makes erosion **loud**: a brief-schema drift either breaks input assembly or changes `inputs_digest`, surfacing instead of being smoothed over.

## Done = (acceptance for increment 1)

- A `/pr-review` run leaves a parseable verdict block on the PR and returns the same object.
- `orchestrate-gates.*` exits 0/1 on the readiness + engine-clear + fix-or-skip gates against fixtures, with no GitHub-prose parsing.
- A run appends one well-formed record per gate to `gate-log.jsonl`, each tagged `source: code`.
- The Conductor's fix/skip decision is demonstrably driven by the structured verdict (no prose tally in STATE.md required for the decision).

## What increment 2+ unlocks (not now)

Once the rails exist and the log has data: build the AC-testability gate-judge against the typed slot (validated on the first non-verbatim AC that appears), then the deterministic sequencer — promoting gates from `judge` to `code` as the log proves them mechanical.

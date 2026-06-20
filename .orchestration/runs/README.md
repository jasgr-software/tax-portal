# Gate verdict log

`.orchestration/bin/orchestrate-gates.sh` emits one JSON object per gate
evaluation. There are **two files**, on purpose:

- **`gate-log.jsonl`** (gitignored) — the **live** log, written during a run.
  Local/ephemeral so it never dirties the tree at the next run's git-clean gate.
- **`gate-history.jsonl`** (**committed**) — the **durable** ledger. At close-out
  the Conductor unions the live log into it (`--gate snapshot`). This is the
  cross-run, cross-machine record everything below depends on: *"advance on data"
  is hollow if the data evaporates.*

The ledger is two things at once:

- the **contract-erosion alarm** — a gate that starts failing on inputs that used to pass, or whose `inputs_digest` drifts, surfaces here instead of being silently reinterpreted. `--gate check-drift` reads `gate-history.jsonl` and flags it;
- the **judge→code promotion ledger** — the data that justifies graduating a gate from an LLM gate-judge to pure code (see `../design/NORTH-STAR.md` § Per-phase evaluation).

## Record schema (`v1`)

```json
{
  "run_id": "EPIC-905-20260620T101500Z",
  "epic": "EPIC-905",
  "gate": "readiness:status-planned",
  "verdict": "pass",
  "confidence": 1.0,
  "source": "code",
  "inputs_digest": "sha256:1f3a…",
  "decided_by": "orchestrate-gates.sh",
  "ts": "2026-06-20T10:15:00Z",
  "evidence": { "status": "planned" }
}
```

| Field | Meaning |
|---|---|
| `run_id` | one orchestration run (epic + UTC stamp) |
| `epic` | the slice under evaluation (empty for epic-less gates like `engine-clear`) |
| `gate` | the specific check (`readiness:*`, `engine-clear:*`, `fix-decision:*`) |
| `verdict` | `pass` / `fail`, or for the routing record, `skip-fix` / `run-fix` |
| `confidence` | always `1.0` for `source: code`; a future gate-judge writes `0.0–1.0` and the harness escalates below threshold |
| `source` | **`code`** (pure-code gate) or **`judge`** (LLM gate-judge) — the field the promotion criterion keys on |
| `inputs_digest` | `sha256:` of the **raw primary-source slice** the gate read (front-matter block, COVERAGE rows, PROGRESS section, the verdict payload), **not** the derived evidence — so a *shape* change in the source the agent reads changes the digest even when the extracted value is unchanged. This is the erosion alarm's memory: the same gate re-run on unchanged inputs MUST reproduce its digest. (Records predating 2026-06-20 carry no digest; `check-drift` ignores empty digests.) |
| `decided_by` | the evaluator that wrote the record |
| `evidence` | the values the verdict was derived from — what makes a record auditable rather than a bare "✓" |

## Snapshot + drift commands

```bash
# close-out: union the live log into the committed durable ledger (idempotent)
bash .orchestration/bin/orchestrate-gates.sh --gate snapshot

# per-phase evaluation: run the erosion alarm over the durable ledger
bash .orchestration/bin/orchestrate-gates.sh --gate check-drift   # exit 1 = drift
```

`check-drift` is scoped to the **`readiness:*`** gates — the only class with a
stable invariant (an epic's front-matter / COVERAGE / deps should not change
between re-runs of *its* readiness gate). It flags, per `(epic, readiness:gate)`:

- **DIGEST DRIFT** — `>1` distinct `inputs_digest` ⇒ the source the gate reads drifted;
- **NONDETERMINISTIC** — same `inputs_digest`, `>1` verdict ⇒ a pure-code gate gave two answers.

`engine-clear` (epic-less, reads the global PROGRESS state) and `fix-decision`
(per-PR payload) legitimately vary run-to-run, so they are **not** drift-checked —
comparing their digests across runs would be benign noise (alarm fatigue, the
thing `NORTH-STAR.md` § Why #4 warns against). Their value in the ledger is the
**promotion** signal (`source: code` streaks), not drift.

## How the per-phase evaluation reads it

At each phase close-out: a gate whose records are all `source: code`, `verdict: pass` at `confidence: 1.0` across many runs on a mechanical input is a candidate to stay code; a `source: judge` gate with a long unbroken high-confidence streak is a candidate for promotion to code. Any `fail` on a previously-passing input, or a changed `inputs_digest` for the same logical input, is an erosion signal to investigate before it compounds — `--gate check-drift` surfaces both mechanically. The canonical example: EPIC-006's `deps-delivered` digest encodes `EPIC-002=planned`; once the upstream `/planning` write-back is fixed it becomes `EPIC-002=delivered`, so the digest changes and the alarm points straight at the seam that drifted.

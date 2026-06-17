# Gate verdict log

`gate-log.jsonl` (gitignored) is the append-only record emitted by
`.orchestration/bin/orchestrate-gates.sh`. One JSON object per gate evaluation.
It is two things at once:

- the **contract-erosion alarm** — a gate that starts failing on inputs that used to pass, or whose evidence shape drifts, surfaces here instead of being silently reinterpreted;
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
| `decided_by` | the evaluator that wrote the record |
| `evidence` | the raw inputs the verdict was derived from — what makes a record auditable rather than a bare "✓" |

## How the per-phase evaluation reads it

At each phase close-out: a gate whose records are all `source: code`, `verdict: pass` at `confidence: 1.0` across many runs on a mechanical input is a candidate to stay code; a `source: judge` gate with a long unbroken high-confidence streak is a candidate for promotion to code. Any `fail` on a previously-passing input, or a changed `evidence` shape, is an erosion signal to investigate before it compounds.

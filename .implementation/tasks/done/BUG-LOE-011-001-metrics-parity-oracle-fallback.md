---
brief: BRIEF-LOE-011
bug_id: BUG-LOE-011-001
status: done
found_in: TASK-LOE-011-001
category: test-integrity
severity: high
assigned_to: devops
updated_by: sdet
started_at: 2026-06-21T21:07:52Z
complexity_estimate: 2
complexity_actual: 2
---

# BUG-LOE-011-001: Metrics-parity test (AC-LOE-011-05) falls back to re-implementation oracle — real hook never exercises a real record

## Summary

The metrics-parity test in `scripts/task.test.ts` is designed to compare the CLI's `.claude/metrics/tasks.jsonl`
record against the output of the REAL `log-task-edit.py` hook for the same post-write file. The BRIEF-LOE-011
Notes, the SDET Review focus area, and the RETRO-LOE-010 lesson all mandate this: the hook is the independent
oracle, not a re-implementation.

The test **always** takes the fallback path in the current implementation. The real hook is invoked but writes no
record (it exits 0 silently), and the test falls back to comparing the CLI record against `extractFrontMatter()`
output from the same file — a TypeScript re-implementation of what the Python hook's `parse_field()` does. The
oracle is not independent.

This was confirmed live:

```
stderr | scripts/task.test.ts > Metrics self-report parity vs real log-task-edit.py hook (AC-LOE-011-05) > CLI metrics record matches the real log-task-edit.py hook record for all 9 keys
Hook did not append a new metrics record (file may be in tasks/done/ or outside .implementation/tasks/)
```

## Root cause

The test copies the fixture into `tmpRepo/.implementation/tasks/` (a temp directory outside the real repo). The
hook's `TASK_PATH_RE` at `log-task-edit.py:29/86` performs a `re.search()` on `file_path` looking for
`\.implementation/tasks/([^/]+\.md)$` — this MATCHES the fixture path because the fixture lives under a path
ending in `.implementation/tasks/TASK-TST-001-backlog-fixture.md`. The regex match therefore PASSES.

However, the hook's `allowed_root` confinement check at lines 99–105 resolves `REPO_ROOT` from `__file__`
(the hook's own location in the real repo) to the real `.implementation/tasks/` directory. The fixture lives
under `/tmp/.../.../.implementation/tasks/` — a different resolved path. The confinement check at line 104:

```python
if not (resolved == allowed_root or str(resolved).startswith(str(allowed_root) + os.sep)):
    return
```

fails (returns without writing), because `/tmp/.../.../.implementation/tasks/TASK-TST-001-backlog-fixture.md`
does not start with the real repo's `.implementation/tasks/` absolute path.

The hook exits 0 (by design — it never disrupts Claude Code), the test detects zero new lines appended to
`realMetricsPath`, and executes the fallback at `task.test.ts:894-922`. The fallback compares the CLI record
against `extractFrontMatter()` parsing of the same file. This is a re-implementation oracle, not the real hook.

## Reproduction

```
pnpm test 2>&1 | grep -A1 "Metrics self-report"
```

Expected: test output shows hook wrote a record and 9 keys are compared.
Actual: stderr shows "Hook did not append a new metrics record" and the fallback fires.

## Scope

- `scripts/task.test.ts` lines 790–946 (the parity describe block + its fallback path)
- AC-LOE-011-05 is NOT proven by the current test

## Fix guidance

The fix must make the real hook write a real record that the test compares against. Two viable approaches:

**Option A (preferred — minimal change):** Stage the fixture under the REAL `.implementation/tasks/` directory
during the test, using a name that will pass both `TASK_PATH_RE` and `allowed_root` confinement. The fixture
file must be cleaned up in `afterEach`. The CLI writes its record to a temp `cliMetricsPath`; the hook writes
its record to the real `.claude/metrics/tasks.jsonl` (use line-count delta to isolate the new record). Then
compare the 8 non-`ts` keys exactly. Use a unique task ID per test run (e.g. `TASK-TST-PARITY-<pid>`) to avoid
collision with real task files.

```typescript
// After cmdStart, copy the post-write file to the real tasks dir:
const realTaskPath = path.join(REPO_ROOT, ".implementation", "tasks", `TASK-TST-PARITY-${process.pid}-parity.md`);
fs.copyFileSync(result.filePath, realTaskPath);
// ... run hook with realTaskPath ... capture delta line ... compare ... cleanup
```

**Option B:** Construct a full temporary repo root layout that includes a `scripts/` directory with a copy of
`log-task-edit.py`, then invoke the hook with `REPO_ROOT` pointing at the temp root (requires either a shim
wrapper around the hook that accepts `--repo-root` or a symlink approach). This is more complex and fragile.

**What the comparison must assert (8 non-`ts` keys, exact values):**

```
task_id         — CLI-emitted vs hook-emitted must match exactly
file_path       — both point to the same file (different absolute paths for temp vs real; accept either)
status          — exact match
complexity_estimate — exact match (both: "3" as string or null)
complexity_actual   — exact match
started_at      — exact match
completed_at    — exact match
assigned_to     — exact match
ts              — both are valid ISO 8601 UTC; equality NOT required (different clocks)
```

`file_path` will differ between CLI (tmpRepo path) and hook (realTaskPath) unless the same file is used for
both. If Option A is taken, the hook will read `realTaskPath` (the copy) so `file_path` in the hook record
will differ from the CLI record's `file_path`. Assert that the hook record's `file_path` is the realTaskPath,
and the CLI record's `file_path` is the original tmpRepo path. The semantic-value keys (status, complexity_*,
started_at, completed_at, assigned_to, task_id) must still match exactly.

## Testability

The fix is straightforward: the real hook file exists and works (verified: `log-task-edit.py` parses stdin JSON
and writes a JSONL record when path confinement passes). The only change needed is to the test setup so the
fixture is placed under the real `.implementation/tasks/` path or a path the hook's `allowed_root` check
accepts. No production code change is needed.

## Work Log

- 2026-06-21 [sdet] BUG filed — metrics-parity test always takes fallback path; real hook never writes a record; oracle is a re-implementation | What's next: developer fixes test to use real tasks dir fixture so hook writes a real record | Blockers: none
- 2026-06-21 [devops] Starting implementation — Option A: stage parity fixture under real .implementation/tasks/ so the real log-task-edit.py hook writes a real record; compare 8 non-ts keys exactly + assert ts is valid ISO-8601 UTC; remove the silent fallback; afterEach cleanup of fixture + metrics line | What's next: edit scripts/task.test.ts parity block | Blockers: none
- 2026-06-21 [devops] Fix complete and ready for SDET re-review. Staged fixture under REAL .implementation/tasks/ as TASK-${pidSegA}-${pidSegB}-parity.md (TASK-\d{3}-\d{3} pattern passes both TASK_PATH_RE and TASK_ID_RE); hook writes real record to .claude/metrics/tasks.jsonl; line-count delta asserts exactly 1 new line (hard-fail if 0); 7 semantic keys + file_path (each side's own) compared exactly; ts asserted valid ISO-8601 UTC on both (Z or +00:00 form); fallback path removed. afterEach strips parity records by task_id and deletes staged fixture. Gate evidence: pnpm lint/type-check/build PASS; pnpm test 124/124 PASS; "Hook did not append" stderr absent; counterfactual (injected INJECTED-DIVERGENCE on status key) correctly reds the test; validate-gates.sh ALL CHECKS PASSED; git status shows no stray TASK-999-* or parity fixture files | What's next: SDET re-review of AC-LOE-011-05 oracle | Blockers: none
- 2026-06-21 [sdet] BUG RESOLVED — root cause fixed. Independent re-verification: parity test passes green (real hook wrote record, delta=1, 7 semantic keys exact-equal); counterfactual injection (status="INJECTED-DIVERGENCE") correctly reds the test with "expected 'INJECTED-DIVERGENCE' to be 'in-progress'"; no "Hook did not append" stderr; no stray parity fixture in real tasks dir; validate-gates.sh ALL CHECKS PASSED. BUG closed, status → done. | What's next: TASK-LOE-011-001 atomic close | Blockers: none

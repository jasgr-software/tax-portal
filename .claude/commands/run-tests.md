Run tests with a canonical invocation pattern that avoids Monitor and matches the existing permission allowlist.

## Why this skill exists

Two recurring problems with ad-hoc test invocation:

1. **Monitor token cost** — Monitor streams every grep-matching line into context. For "wait until done" runs (most test/CI work) this is wasted context. `Bash` with `run_in_background: true` already sends a completion notification for free.
2. **Permission permutations** — Each unique `tail ... | grep --line-buffered -E '<patterns>'` shape is a fresh permission prompt. Test commands themselves are already covered by `Bash(pnpm:*)` in `.claude/settings.json`, but Monitor's piped grep commands are not, and the patterns vary per run.

This skill enforces a single canonical shape so neither problem recurs.

## Canonical pattern — use this exactly

For **every** test run (portal, admin, full CI):

1. **Form the command in canonical shape:**
   - Portal/admin unit + component: `pnpm --filter <app> test -- <args>`
   - Portal/admin e2e: `pnpm --filter <app> e2e:run -- <args>`
   - Cross-app e2e: `pnpm e2e:cross-app`
   - Full CI: `pnpm ci:local`
   - Never reorder flags, never use shell aliases, never wrap in `bash -c`.

2. **Redirect to a slugged log file under `/tmp`:**

   ```
   pnpm --filter portal test -- src/foo/bar.test.ts > /tmp/test-portal-bar.log 2>&1
   ```

   Slug should identify the run (`test-<app>-<short-name>.log`, `e2e-<app>-<grep>.log`, `ci-local.log`). Keeps logs greppable later.

3. **Run via `Bash` with `run_in_background: true`.** Do NOT use Monitor. You will be notified when the background process completes.

4. **On completion notification:** `Read` the last ~200 lines of the log file. Report:
   - Pass/fail status
   - Failing test names + the assertion / error line for each
   - For e2e: the `test-results/` artifact path if any traces were saved
   - Total run time (from the log footer)

5. **If the user asks for early-exit behavior** (e.g. "abort if you see a SIGSEGV", "stop on first flake repro"), THEN use Monitor with a tight grep pattern. This is the opt-in case Monitor was designed for. Default is background Bash.

## When NOT to use this skill

- One-off `pnpm lint` or `pnpm type-check` calls that finish in <30s — just run them foreground.
- Commands you need to interact with (REPL, watch mode with input).
- Live service log tailing (`docker compose logs -f`) — that's still a Monitor case (indefinite stream, not a finite run).

## Argument handling

`$ARGUMENTS` may contain a target spec (`portal`, `admin`, `cross-app`, `ci`, or a specific file path). If empty, ask the user which target. If a file path is given, infer the app from the path and pass it as the test filter.

## Settings allowlist — already covered

The following entries in `.claude/settings.json` already cover the canonical pattern (no changes required):

- `Bash(pnpm:*)` — covers all `pnpm --filter ... test ...`, `pnpm --filter ... e2e:run ...`, and `pnpm ci:local` variants
- `Bash(*>/tmp/*)` — covers the file redirect
- `Bash(tail:*)`, `Bash(cat:*)`, `Bash(grep:*)` — covers any post-completion log inspection

If a permission prompt fires anyway, the command shape drifted from the canonical pattern. Re-form it before adding any new allowlist entry.

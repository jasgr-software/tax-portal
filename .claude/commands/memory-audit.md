Audit local memory files for staleness against current repo state. Warn-only — never auto-delete.

## Why this skill exists

Memory at `~/.claude/projects/<slug>/memory/` is point-in-time. Project state moves: epics merge, PROGRESS.md candidates close, "next up" pointers age out. Stale memory files get cited in future sessions and propagate wrong context — the assistant tells you EP-X is pending when it merged a week ago, or quotes a "blocked" status from a memory whose blocker has cleared.

This audit surfaces likely-stale files so the user can decide to update or delete.

## What it does NOT do

- Does not delete or rewrite any memory file.
- Does not touch `MEMORY.md` index.
- Does not flag `feedback_*.md` or `user_*.md` files (those are durable guidance, not state).
- Not a git hook, not a CI gate. Advisory only — the user is the decider.

## Run order

1. **Locate the memory directory.** It's at `~/.claude/projects/<repo-slug>/memory/`. The slug for this repo is `-home-jasgr-repos-tax-portal`.

2. **Build the "delivered work" set.** Epics/briefs are now a planning concept (`.planning/`); merged work is
   detected from git history:
   - `git log --oneline -200 main | grep -oiE '(EP|EPIC|BRIEF)-[0-9]+' | tr a-z A-Z | sort -u` — every
     epic/brief mentioned in recent merge commits.
   - Optionally cross-reference `.planning/COVERAGE.md` for delivered acceptance criteria.

3. **For each `project_*.md` and `ep*_status.md` memory file, check three things:**
   - **Epic-reference staleness:** does the file's name or body reference an `EP-NNN` (or `epNNN`) that is in the merged set? If so, the file is likely describing closed work as if open. Flag.
   - **Pending-language staleness:** does the body contain `pending`, `in flight`, `awaiting`, `next up`, `paused`, `blocked`, `current`, `active` AND reference a merged epic? Strong signal.
   - **Age:** if the file's `originSessionId` is present and the file's mtime is >30 days old, note it (weak signal — only worth flagging in combination with the above).

4. **For `reference_*.md` files only:** spot-check that any URLs, file paths, or external-resource names mentioned still exist (cheap checks: `git ls-files | grep <path>`, no network calls). Flag mismatches.

5. **Skip entirely:** `feedback_*.md`, `user_*.md`, `MEMORY.md`. These rarely go stale and false-positives are noisy.

## Output format

Group by severity. Keep it scannable:

```
## Likely stale (epic merged, memory describes pending work)
- project_ep001_paused.md — references EP-001 (in implemented/, merged 2026-XX-XX)
- ep018_status.md — describes "current focus", EP-018 in implemented/

## Possibly stale (pending-language + merged-epic reference)
- project_some_initiative.md — body says "awaiting EP-NNN merge", EP-NNN merged

## Old (>30d, low-confidence)
- project_old_thing.md — mtime 2026-XX-XX, no other staleness signals

## Reference drift
- reference_some_path.md — cites scripts/foo.sh, file no longer exists
```

If nothing is flagged, output one line: `No staleness signals — memory looks current.`

## Action prompt

After the report, ask the user (single-line):

> Update / delete any of these? Reply with file names + action, or `skip all`.

Do not act without explicit user confirmation per file. Update + delete are both edits to memory; per the rules in the global CLAUDE.md memory section, only act on user direction.

## Argument handling

`$ARGUMENTS` may contain a filter:

- `epic` → only check epic-reference staleness (skip age + reference checks)
- `references` → only check `reference_*.md` files
- `<filename>` → check just one file
- empty → full audit (all three checks)

## When to invoke

- At session start if the user asks "what's the current state of X" — run the audit on `project_*.md` related to X.
- Periodically (user-triggered) — once a week or after a batch of epic closes.
- After closing an epic — check whether any memory file referenced it as pending.

## When NOT to invoke

- During active task work — adds noise.
- When the user explicitly says "ignore memory" or "don't use memory" — respect that.

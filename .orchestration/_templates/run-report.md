# Conductor run report — <EPIC-NNN> — <date>

**Terminal status:** delivered | stopped-at-<phase>
**Epic:** <EPIC-NNN — title> (phase <N>)
**Brief:** <BRIEF-NNN — path>

## Pipeline

| Phase | Result |
|---|---|
| Select | <epic chosen / reason> |
| Gate | GO | STOPPED (<blockers>) |
| Compose | <BRIEF-NNN written; AC: <n>; scenarios: gherkin/prose/none> |
| Implement | <PR #N opened> | <inner stop> |
| Review | <approve / request-changes (advisory)> · blocker <n> · major <n> · minor <n> · nit <n> |
| Fix | <findings addressed, CI green> | skipped (clean) | <capped, last failure> |
| Merge/Finalize | <merged SHA + finalize done> | held (<LGTM / gate>) |
| Validate | <signed-off / incomplete / failing> — AC verified: <list> |

## Outcome

<One paragraph: what shipped (or where and why it stopped). If stopped, the exact human action needed to
resume and which phase a re-`/orchestrate` will resume at.>

## Next

- **Next ready epic:** <EPIC-NNN> — run `/orchestrate` again to drive it.
- **Or remaining blockers:** <per-epic why-not-ready, if nothing is ready>.

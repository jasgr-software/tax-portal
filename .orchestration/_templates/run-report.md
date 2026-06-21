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
| Standards-review | <approve / request-changes> · required <n> · recommended <n> · experimental <n> · drafted <n> | skipped (docs-only) | ⚠ gap (<cause>) |
| Review | <approve / request-changes (advisory)> · blocker <n> · major <n> · minor <n> · nit <n> |
| Fix | <findings addressed, CI green> | skipped (clean) | <capped, last failure> |
| Merge/Finalize | <merged SHA + finalize done> | held (<LGTM / gate>) |
| Validate | <signed-off / incomplete / failing> — AC verified: <list> |
| Verdict log | <n gate records snapshotted → `runs/gate-history.jsonl`> · drift: <none / `<epic|gate>` flagged> |

## UI Demo

<`docs/demos/EPIC-NNN/` — <n> screens (AC-tagged) · captured at Smoke/Validate · shipped in the docs-lane PR>
| <skipped (backend-only)> | <skipped (capture failed — non-gating; <reason>)>

## Phase closeout

<This slice completed **Phase <N>** — walkthrough video produced/refreshed: `docs/demos/phase-<N>/` —
`phase-<N>-walkthrough.mp4` (<duration>, <n> chapters) · shipped in the docs-lane PR (`DEMO-POLICY.md` § Part B)>
| <n/a (phase in progress — <k>/<m> epics of Phase <N> delivered)>
| <⚠ **phase-closeout gap** — Phase <N> closed but walkthrough video NOT produced (<cause: spec missing / e2e:video matched 0 @video tests / …>). Follow-up filed to author the `@video` spec + record the video.>

## Outcome

<One paragraph: what shipped (or where and why it stopped). If stopped, the exact human action needed to
resume and which phase a re-`/orchestrate` will resume at.>

## Next

- **Next ready epic:** <EPIC-NNN> — run `/orchestrate` again to drive it.
- **Or remaining blockers:** <per-epic why-not-ready, if nothing is ready>.

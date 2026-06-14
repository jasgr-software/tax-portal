# Finding template

> The shape of a single review finding. Each lens returns a **list** of these to the lead (it does not post
> them itself). The lead dedupes across lenses and renders them into the consolidated review
> (`pr-review-summary.md`). Fields match the finding schema in `ENGINE.md` § Finding schema.

```yaml
lens:        correctness | security | over-engineering   # the emitting lens
severity:    blocker | major | minor | nit                # see ENGINE.md § Severity rubric
path:        apps/admin/src/app/.../route.ts              # repo-relative file path
line:        42                                            # new-side diff line (or "start-end" for a range)
title:       <cite-then-claim one-liner>                   # name the contract/category, then the problem
confidence:  high | medium | low                           # low → phrase the body as a question, not a verdict
body: |
  <What is wrong, why it matters, and the suggested fix.>
  <For security: name the attack path. For over-engineering: name the simpler alternative and the
   requirement it still satisfies. For correctness: name the contract (REQ/ADR id, interface, locator).>
  <If this overlaps another lens's likely finding, say so here so the lead can merge rather than duplicate.>
```

**Example (correctness):**

```yaml
lens:        correctness
severity:    major
path:        src/search/handler.ts
line:        42
title:       parse-without-use — `limit` is read from the request but never applied
confidence:  high
body: |
  The handler parses `limit` from the query string but never passes it to the query builder, so the limit
  is silently ignored and every request returns the full result set. Fix: thread `limit` into the query,
  and add a test that fails when the limit isn't applied.
```

> Findings are written on **general engineering merit** — they cite the code, not project governance. (A
> reviewer is project-agnostic; it does not reference ADRs, requirements, or project conventions.)

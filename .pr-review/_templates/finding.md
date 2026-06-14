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
path:        apps/admin/src/app/engagements/[id]/route.ts
line:        42
title:       ADR-003 bypass — direct Prisma call skips the SESSION_CONTEXT wrapper
confidence:  high
body: |
  The handler queries Prisma directly instead of routing through the packages/db wrapper that sets
  SESSION_CONTEXT before the first real query (ADR-003). RLS (ADR-005) will not scope this query, so it can
  read across tenants. Fix: route the query through the packages/db wrapper.
```

---
brief: BRIEF-911
status: open — tracked follow-up (does NOT block merge)
severity: non-blocking (env-only; proven at tier-3, not a per-PR required CI check)
disposition: tracked follow-up — carried to retro
---

# BUG-911-001 — env-only fixture bug (open but dispositioned non-blocking)

Fixture: an OPEN bug explicitly dispositioned `severity: non-blocking`. The
`no-active-bugs` rail must NOT count it as a gate blocker, but must surface it
as a skipped non-blocking bug.

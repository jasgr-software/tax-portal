---
brief: BRIEF-912
status: open
severity: major
---

# BUG-912-001 — real open bug (no non-blocking disposition)

Fixture: an OPEN bug with a normal severity and NO `non-blocking` disposition.
With empty awaitingMerge, this must FAIL engine-clear via the `no-active-bugs`
rail alone (the conservative default still blocks).

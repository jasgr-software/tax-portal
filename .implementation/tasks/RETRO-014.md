# RETRO-014 — BRIEF-014 File deletion, soft-delete & 7-year retention

**Slice:** EPIC-014 (Phase 3) · **Branch:** `brief-014-file-deletion-soft-delete-retention` · **Date:** 2026-06-24
**Outcome:** 3/3 tasks delivered, all 10 AC satisfied, all SDET gates PASS. Clean run — no reject→fix cycles.

---

## What went well

- **Altitude discipline on a constraint that did not map to an AC.** ADR-018 §2 (temporal tables) is carried by the
  brief, but none of the 10 ACs require it and it is genuinely cross-cutting. The IO raised **OQ-014-01** at Design
  rather than over-building a partial mechanism. Overwatch and the SDET both independently flagged the absence; both
  closed it against the pre-existing IO disposition. The escalation seam worked as designed.
- **Defense-in-depth fell out of a forced design choice.** SQL Server has no function overloads, so changing
  `fn_document_access` to two params (DECISION-014-B) made the `pol_Document` BLOCK predicate also enforce
  `deletedAt IS NULL` on CLIENT branches — meaning a CLIENT raw `UPDATE` to set `deletedAt` is blocked at the DB layer,
  on top of the action-layer guard. A constraint became a security bonus.
- **No-client-delete proven both ways** mirrored the EPIC-013 both-party trap exactly (server reject + portal absence,
  including a client-uploaded file), so the hardest AC (AC-FILE-004-02) had triangulated evidence.

## Findings (classified — concrete gate failures only)

- **[acknowledged] `introduces_gate` mis-declared on TASK-014-001** (`no`, should be `yes` — the HARD RLS isolation
  test is a new reject-on-fail gate). Caught by Overwatch; IO-corrected at Audit; SDET verified the three
  gate-authoring evidence items are present in the test header. **No code impact — metadata only.** Precedent
  TASK-013-001 was correctly `yes`. *Pattern to watch:* developers default new RLS-isolation tasks to `introduces_gate: no`;
  the per-policy isolation test required by CS-SQL-001 reads as "just a test," but when it is also a hard SDET
  rejection criterion it is a gate. Not promoted to a rule change (single occurrence; the Audit caught it).

## Observations (no action — not promoted)

- **[observation] `listDeletedDocuments` uses the request pool + requires a `withRequestContext` wrapper.** The
  developer caught and fixed a missing-wrapper bug in `listDeletedDocumentsAction` during implementation. The barrel
  export makes call-without-context a latent hazard for future callers (fails closed, not open). Consider an
  admin-pool variant when the call surface grows (EPIC-015).
- **[observation] BLOCK-predicate client-update isolation test not written** (SDET-dispositioned: FILTER suite +
  app-layer proofs suffice). Carried as additive defense-in-depth evidence for the next `pol_Document` task. See
  HANDOFF-014 carried items.
- **[observation, carried] BUG-007-001** — EPIC-007 mock AV scanner 2 tests, pre-existing, unchanged at Smoke.

## Rule-sunset check

No rules flagged for sunset this slice. The Gate Authoring Rules + CS-SQL-001 both triggered (cited and relied upon).

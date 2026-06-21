# Flow — Document retention & purge lifecycle

> A **targeted, lightweight** per-slice flow: the accountant's governance of a document's life after it is
> exchanged — soft-delete, the 7-year retention floor, and (only post-window, only on confirmation) purge,
> with legal hold as the override. Planning-altitude — steps and key branches, not screens or endpoints.

- **Actor:** `personas/jane-accountant.md` (the only actor who can delete, hold, lift, or purge). The client
  is never an actor here — there is no client-facing delete/purge path.
- **Trigger:** the accountant tidies an engagement's documents, or an engagement's 7-year retention window
  has elapsed and she decides whether to purge.
- **Outcome:** the working view stays clean and the record stays compliant — soft-deleted files are hidden
  but retained; in-window nothing is destroyed; post-window, only an explicit accountant-confirmed purge
  (and only with no legal hold) ever physically removes data, and the purge audit record survives.
- **Realized by:** **EPIC-014** (delete → soft-delete → 7-year retention floor). **EPIC-015** extends it with
  the post-retention purge path and the legal-hold branch.

## Happy path

1. **[Accountant]** Deletes a file in `apps/admin` to tidy the working view. The file is **soft-deleted** —
   marked deleted and removed from the normal view, but the bytes and row are preserved (AC-FILE-004-01,
   AC-FILE-006-01).
2. **[System]** The deleted file is **retained** for the engagement's 7-year window (anchored at engagement
   completion) and remains **recoverable**; within the window no action — not even this deletion —
   permanently removes it (AC-FILE-006-02/-03, AC-FILE-005-*, AC-NFR-006-01).
3. **[System]** When the **7-year window elapses**, the engagement's data becomes **purge-eligible** — but
   nothing is deleted automatically; eligibility ≠ deletion (AC-FILE-013-01/-04).
4. **[Accountant]** Decides to purge a purge-eligible engagement and **explicitly confirms** it; only then is
   the data permanently removed. The purge is **audit-logged**, and that audit record **survives** the purge
   (AC-FILE-013-02/-03/-05/-06, AC-FILE-015-02, AC-NFR-010-07).

## Key branches

- **Legal hold** → the accountant places a hold on an engagement (or a client, covering all their
  engagements); while active it **suspends purge eligibility indefinitely**, even past the 7-year window,
  until she explicitly **lifts** it. Placing and lifting are both audited (AC-FILE-014-*). Precedence:
  hold → retention window → purge-eligible-and-no-hold.
- **Client requests erasure during the window** → honored as **access-revocation only**; no document or
  engagement data is physically removed while in-window (AC-FILE-015-01).
- **Client attempts to delete/purge** → no client-facing path exists for delete or purge; the attempt
  changes nothing (AC-FILE-004-02/-03, AC-FILE-013-02).

## Acceptance scenarios

- AC-FILE-004-01/-02/-03, AC-FILE-006-01/-02/-03, AC-FILE-005-01/-02/-03, AC-NFR-006-01 — covered in
  **EPIC-014**.
- AC-FILE-013-01..06, AC-FILE-014-01..07, AC-FILE-015-01/-02, AC-NFR-010-07 — covered in **EPIC-015**.

## Links
- Persona: `personas/jane-accountant.md`
- Epics: EPIC-014 (realizes — delete/soft-delete/retention), EPIC-015 (extends — purge + legal hold)
- Requirements: REQ-FILE-004, REQ-FILE-005, REQ-FILE-006, REQ-FILE-013, REQ-FILE-014, REQ-FILE-015,
  REQ-NFR-006, REQ-NFR-010 (AC-07)

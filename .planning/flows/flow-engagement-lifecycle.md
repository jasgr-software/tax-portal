# Flow — Engagement lifecycle

> A **targeted, lightweight** per-slice flow: the accountant moves an engagement through its pipeline while
> the client sees a simplified, friendly status. Planning-altitude — steps and key branches, not screens or
> endpoints.

- **Actor:** `personas/jane-accountant.md` (the accountant who drives transitions); the client
  (`personas/sarah-returning-client.md`, `personas/martha-and-james-married-couple.md`) is the read-only
  observer of the simplified label.
- **Trigger:** an engagement is in active work (past onboarding completion, already moved New → In Progress
  by EPIC-008) and the accountant works it toward delivery.
- **Outcome:** the engagement reaches Complete after the accountant's two confirmations; the client has seen
  only "Received" → "In Progress" → "Completed" throughout, and retains access afterward.
- **Realized by:** **EPIC-010** (pipeline, labels, completion gate, reopen, visibility). **EPIC-011** extends
  it with the accountant's attribute-management branch (due date, internal notes, priority flag).

## Happy path

1. **[Accountant]** Opens an engagement in `apps/admin`; sees its current internal status (New / In Progress
   / Review / Complete) and full engagement data — she can see every engagement (AC-AUTH-002-*).
2. **[Accountant]** Works the engagement and **manually advances** it stage by stage in forward order —
   In Progress → Review when she begins her own quality check, Review being an internal stage that asks
   nothing of the client (AC-LIFE-001-03, AC-LIFE-003-01, AC-LIFE-004-*).
3. **[Client]** At any point views their engagement in `apps/portal` and sees only the **simplified label**
   — "Received", "In Progress" (covering both internal In Progress and Review), or "Completed" — never the
   raw internal stage (AC-LIFE-002-*).
4. **[Accountant]** When the return is delivered and filed, marks Complete — providing **both** explicit
   confirmations (delivered to client; filed with the tax authority). Completion is blocked unless both are
   recorded (AC-LIFE-005-*).
5. **[Client]** Sees "Completed", and **retains the ability to sign in and view** the engagement and its data
   indefinitely afterward (AC-AUTH-008-*).

## Key branches

- **Reopen after completion** → the accountant (and only the accountant) reopens a Complete engagement back
  into active work, e.g. for an amended return; a client has no reopen path (AC-LIFE-006-01/-02).
- **Client attempts a status change / reopen** → no status path is available to the client through any
  portal function; the attempt changes nothing (AC-LIFE-003-03, AC-LIFE-006-02).
- **Client reaches for another client's engagement** (listing, search, or a direct record reference) →
  isolation holds on every path; nothing of another client's is returned (AC-AUTH-003-02/-03).
- **Accountant sets a due date / records an internal note / flags priority** → the attribute-management
  branch (EPIC-011); internal notes are never visible to the client (AC-LIFE-007-*, -008-*, -009-*).

## Acceptance scenarios

- AC-LIFE-001-01/-02/-03, AC-LIFE-002-01/-02/-03, AC-LIFE-003-01/-02/-03, AC-LIFE-004-01/-02/-03,
  AC-LIFE-005-01/-02/-03, AC-LIFE-006-01/-02 — covered in **EPIC-010**.
- AC-AUTH-002-01/-02/-03, AC-AUTH-003-01/-02/-03, AC-AUTH-008-01/-02 — covered in **EPIC-010**.
- AC-LIFE-007-01/-02/-03, AC-LIFE-008-01/-02/-03, AC-LIFE-009-01/-02/-03 — covered in **EPIC-011**.

## Links
- Persona: `personas/jane-accountant.md`, `personas/sarah-returning-client.md`, `personas/martha-and-james-married-couple.md`
- Epics: EPIC-010 (realizes), EPIC-011 (extends with attributes)
- Requirements: REQ-LIFE-001, REQ-LIFE-002, REQ-LIFE-003, REQ-LIFE-004, REQ-LIFE-005, REQ-LIFE-006,
  REQ-LIFE-007, REQ-LIFE-008, REQ-LIFE-009, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-008

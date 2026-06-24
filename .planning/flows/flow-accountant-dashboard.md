# Flow — Accountant dashboard & practice navigation

> A **targeted, lightweight** end-to-end flow — the accountant's daily triage and navigation journey, not an
> exhaustive product-wide flow. Planning-altitude: steps and key branches, no screens/endpoints/test code.

- **Actor:** `personas/jane-accountant.md`
- **Trigger:** the accountant signs in to the Tax Portal (`apps/admin`) to start or check on her work
- **Outcome:** she sees the live state of her practice at a glance, picks up what needs her attention, navigates her book of business, and works any engagement — including reviewing the security audit trail when she needs the record
- **Realized by:** EPIC-020 (dashboard home — metrics, activity feed, needs-action), EPIC-021 (client list, engagement pipeline, dashboard notes & flags), EPIC-023 (audit-trail read surface)

## Happy path
1. The accountant opens the dashboard home; summary metrics show active/overdue engagements, pending requests, and upcoming deadlines, recomputed at view time.
2. She scans the unified activity feed — recent messages, document uploads, new requests, status changes, and overdue items across all clients, most-recent first, each naming what happened and for whom.
3. She works the distinct needs-action grouping — blocked engagements, overdue document requests, pending new-client requests — clearing what is waiting on her.
4. She navigates to the client list (search; filter by service type / tax year; per-client status) or the engagement pipeline (organized by status, filterable) and opens any engagement to manage it — every engagement visible regardless of client.
5. Working an engagement, she records private internal notes (never visible to the client) and sets/clears priority/flag markers, reflected where she views her engagements.
6. When she needs the security record, she opens the accountant-only audit-trail surface and reviews document access, status transitions, admin actions, and authentication events — readable only by her.

## Key branches
- **A client attempts to reach any of these surfaces** → internal notes and the audit trail are accountant-only; a client principal reads zero on any path (hard RLS gate).
- **Needs-action overdue items** → sourced from the EPIC-019 reminder engine's overdue detection; the dashboard surfaces, it does not detect.
- **Empty practice (no engagements/requests)** → metrics show zero, feed and needs-action are empty but render.
- **Audit completeness** → a security-significant action whose audit record cannot be written does not silently succeed (audit-or-fail).

## Acceptance scenarios
- AC-DASH-001-01..05, AC-DASH-002-01..04, AC-DASH-003-01..04 — covered in EPIC-020
- AC-DASH-004-01..05, AC-DASH-005-01..03, AC-DASH-009-01..03, AC-DASH-006-01/-02, AC-DASH-007-01/-02/-03 — covered in EPIC-021
- AC-NFR-010-01..06, AC-NFR-011-01/-02 — covered in EPIC-023

## Links
- Persona: `personas/jane-accountant.md`
- Epics: EPIC-020 (home), EPIC-021 (navigation + notes/flags), EPIC-023 (audit read surface); relates EPIC-019 (overdue source)
- Requirements: REQ-DASH-001..009, REQ-DASH-006/007, REQ-NFR-010/011

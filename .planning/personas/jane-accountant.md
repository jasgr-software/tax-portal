# Persona: Jane — The Solo Tax Accountant

**One-line summary:** The sole practitioner who owns the firm, handles all client engagements, and uses the Tax Portal as her daily work surface.

---

## Role in the System

- **System role:** ACCOUNTANT
- **Technical permissions:** Full visibility across all clients and engagements. Admin principal for DB operations. Mandatory 2FA enforced via Clerk.
- **Primary surface:** `apps/admin` (Tax Portal)
- **Secondary surface:** May visit public routes on `apps/portal` (e.g., to check how her services page looks to a prospective client) — served normally per ADR-010 matrix.

---

## Context

Jane runs a solo tax practice. She has 30–80 active clients at peak season. She has been using email as her primary client communication channel for years and finds it exhausting — threads get lost, documents arrive in wrong formats, clients forget to sign things, and she can never remember which version of which W-2 is the right one.

She is moderately technical — comfortable with web-based tools but not a developer. She uses a laptop during the day and sometimes checks on things from her phone's browser in the evening. She is time-pressured from January through April (tax season) and more relaxed the rest of the year.

She is the only user who can see all client data, manage the services catalog, and move engagements through the pipeline. She is also the user most affected by the portal's administrative overhead — if the system creates busywork, she will abandon it.

---

## Goals

1. **See what needs her attention immediately** — overdue items, pending requests, clients stuck in onboarding, engagements approaching due dates — without hunting.
2. **Review and action engagement requests quickly** — accept or decline with minimal friction; she wants a clear view of the request, not a wall of text.
3. **Track engagement status across all clients without keeping a separate spreadsheet** — the pipeline view is her mental model.
4. **Communicate with clients and exchange documents securely without switching to email** — the portal should be the single channel.
5. **Set and manage document requests per engagement** — she knows which documents she needs for each service type and wants to ask for them in bulk.
6. **Find a specific client or engagement fast** — by name, status, service type, or tax year.

---

## Pain Points

1. **Context switching.** Moving between email, a shared drive, a spreadsheet tracker, and a calendar creates overhead. Every tool she leaves behind is a win.
2. **Onboarding delays.** Clients who don't sign the engagement letter or upload documents on time block her pipeline. She needs reminders to go out automatically.
3. **Status ambiguity.** Not knowing which engagements are blocked vs in-flight vs waiting on her. A "needs action" surface is essential.
4. **Client communication latency.** Clients who miss email get missed. An in-portal nudge mechanism with email fallback keeps things moving.
5. **Document version confusion.** When a client re-uploads a corrected W-2, she needs to know which is current. Version history and clear labeling matter.
6. **Off-hours interruptions.** She does not want per-event emails. A once-daily digest is acceptable; a flood of "a document was uploaded" emails is not.

---

## Constraints

- **Solo — no delegation.** There is one accountant account. No staff, no assistants, no second login. Everything she cannot do herself doesn't get done.
- **Device:** primarily laptop (desktop browser) during working hours; occasionally a mobile browser for evening checks. No native app.
- **Time pressure:** peak from January through April. Low tolerance for slow pages or multi-step workflows during tax season.
- **Regulatory:** handles SSNs, tax documents, and financial data. Expects security to be non-negotiable and visible (e.g., a clear indicator that files are encrypted).
- **Accessibility:** no documented accessibility constraints; standard web ergonomics apply.

---

## Typical Scenarios

1. **Morning triage (daily):** Jane opens `apps/admin`, lands on the dashboard. She scans the "Needs action" section: two overdue document requests, one pending engagement request, one engagement approaching its due date. She actions the request first (accepts it, invitation email sent to client), then messages the two overdue clients directly from the dashboard. This flow touches: `flow-role-redirect`, `flow-first-sign-in` (for understanding what the client experiences), `flow-engagement-request`.
   - Requirements: REQ-DASH-001, REQ-DASH-002, REQ-DASH-003, REQ-DOOR-005, REQ-DOOR-006, REQ-DOOR-007, REQ-MSG-013.

2. **Reviewing a new engagement request:** A notification appears for a new prospective client request. Jane opens it in `apps/admin`, reviews the selected services and contact info, writes a brief acceptance note, and clicks Accept. The system sends the invitation email via Clerk. She then sets the due date and initial document checklist for the new engagement.
   - Requirements: REQ-DOOR-005, REQ-DOOR-006, REQ-DOOR-007, REQ-LIFE-007, REQ-FILE-007, REQ-FILE-008.
   - Flow: `flow-engagement-request`.

3. **Moving an engagement to Complete:** Jane has delivered the client's return and confirmed IRS filing. She opens the engagement in `apps/admin`, marks "Return delivered to client" and "Filed with IRS," and clicks Complete. The engagement moves to Complete status.
   - Requirements: REQ-LIFE-001, REQ-LIFE-005.

4. **Uploading a completed return for a client to download:** Jane navigates to the engagement file view in `apps/admin`, uploads the completed return PDF into the appropriate folder. The client receives a notification in `apps/portal`.
   - Requirements: REQ-FILE-001, REQ-FILE-010, REQ-MSG-014.
   - Flow: `flow-file-exchange`.

---

## Linked Flows

- `flow-first-sign-in` — ACCOUNTANT sign-in path and landing on `apps/admin`
- `flow-role-redirect` — redirect behavior when ACCOUNTANT navigates to `apps/portal` client-only routes
- `flow-engagement-request` — reviewing and actioning incoming requests; the returning-client + accountant-initiated creation branches (EPIC-012)
- `flow-engagement-lifecycle` — advancing an engagement through the pipeline, the two-confirmation completion gate, reopen, and the attribute-management branch (EPIC-010/011)
- `flow-onboarding` — monitoring client onboarding progress and receiving completion notification
- `flow-message-exchange` — sending and receiving messages within engagements
- `flow-file-exchange` — uploading and downloading documents

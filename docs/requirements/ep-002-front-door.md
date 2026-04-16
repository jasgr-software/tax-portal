# Epic 002 — Front Door: Service Browsing & Engagement Requests

**Epic-type:** feature  
**Epic-deploys:** yes  
**Phase:** 2  
**Status:** Pending (awaiting Epic 001 completion)  
**Priority:** P1

---

## Purpose

Deliver the public-facing front door of the portal: a services browsing page, an engagement request form, and the accountant's accept/decline workflow. At the end of this epic, a prospective client can browse services, submit a request, and receive an invitation email (on acceptance) or a decline message (on decline). The accountant can manage her services catalog and review incoming requests from the dashboard.

---

## Requirements in scope

| Requirement ID | Summary |
|---|---|
| REQ-DOOR-001 | Public services page (no login required) |
| REQ-DOOR-002 | Services catalog managed by accountant (add, edit, deactivate) |
| REQ-DOOR-003 | Engagement request form — checklist of active services, not freeform |
| REQ-DOOR-004 | Prospective client submits contact info + service selection; no account created |
| REQ-DOOR-005 | Accountant receives in-portal notification of new request |
| REQ-DOOR-006 | Accountant can accept or decline each request |
| REQ-DOOR-007 | On acceptance: invitation email sent to client via Resend |
| REQ-DOOR-008 | On decline: accountant writes a decline message sent to client via email |
| REQ-DASH-010 | Admin UI: services catalog management |
| REQ-DASH-011 | Admin UI: engagement request management |
| REQ-MSG-013 | Accountant notification: new service request |
| REQ-MSG-014 | Client notification: request accepted / declined |
| REQ-NFR-008 | Email via Resend + React Email |

> CLARIF-001 (decline message retention) must be resolved before this epic ships. If retained, the `EngagementRequest.declineMessage` field and a UI panel to view it must be included.

---

## Acceptance Criteria

### AC-002-001 — Public services page
- A route (e.g., `/services`) is publicly accessible without authentication.
- Active services from the database are displayed with title, description, and estimated timeline.
- Inactive/deactivated services are not shown.
- The page includes a clear call-to-action to submit an engagement request.

### AC-002-002 — Engagement request form
- The request form presents a checklist of active services (multi-select).
- A prospective client submits their name, email address, and service selection.
- No portal account is created at submission time.
- Submitted requests are stored in the `EngagementRequest` table with status `pending`.
- Form validation rejects submissions with no services selected or missing required contact fields.

### AC-002-003 — Accountant notification of new request
- When a new request is submitted, an in-portal notification is created for the ACCOUNTANT (type: `new_service_request`).
- The notification is delivered in real time via Supabase Realtime.
- The dashboard "Needs action" panel surfaces pending requests.

### AC-002-004 — Request accept/decline flow
- The accountant can view all engagement requests in the admin UI (pending, accepted, declined).
- Accepting a request triggers an invitation email to the prospective client via Resend.
- The invitation email contains a Clerk invitation link to create a portal account.
- Declining a request requires the accountant to write a decline message (non-empty, enforced).
- The decline message is sent to the prospective client's email address via Resend.
- After accept or decline, the request status is updated in the DB.

### AC-002-005 — Services catalog admin UI
- The accountant can add a new service (title, description, estimatedTimeline, isActive).
- The accountant can edit an existing service's fields.
- The accountant can deactivate a service (isActive = false) — it disappears from the public page but is retained in the DB.
- Changes take effect immediately on the public services page.

### AC-002-006 — Returning client re-engagement (simplified flow)
- An authenticated CLIENT sees an option to request a new engagement from inside the portal.
- The simplified flow pre-fills their account information; they select service(s) and submit.
- The resulting `EngagementRequest` is linked to their existing `User` record.
- The accountant reviews and accepts/declines via the same flow as a new prospect.

### AC-002-007 — Accountant-initiated engagement
- The accountant can initiate a new engagement on behalf of an existing client from the admin UI.
- This bypasses the request form and creates an `Engagement` directly (status: `New`), skipping the `EngagementRequest` step.

### AC-002-008 — E2e coverage
- E2e tests cover: anonymous user browses services, submits request, accountant receives notification, accountant accepts request, invitation email is triggered, accountant declines request, decline email is triggered.

---

## Dependencies

- Epic 001 (foundation scaffold) — routing, auth, DB, Resend config, Supabase Realtime baseline
- CLARIF-001 resolved before AC-002-004 ships

---

## Notes for SA

- Resend API key and email templates for invitation and decline must be configured in this epic.
- Supabase Realtime subscription for new-request notifications is first introduced here.
- The accountant-initiated engagement (AC-002-007) is a lighter-weight path; the SA may choose to deliver it in a separate sub-task to keep the developer focused.

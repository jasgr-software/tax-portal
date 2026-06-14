# Persona: Sarah — The Returning Client

**One-line summary:** A prior client with an existing portal account who is requesting a new engagement for a new tax year or service — familiar with the portal, authenticated, entering from inside `apps/portal`.

---

## Role in the System

- **System role:** CLIENT
- **Technical permissions:** Sees only her own data (SQL Server Security Policies per ADR-005, REQ-AUTH-003). Can upload files, send messages, view her own engagements, and submit new engagement requests from the portal. Cannot delete files, access other clients' data, or reach `apps/admin`.
- **Primary surface:** `apps/portal` (Client Portal) — authenticated routes.
- **Secondary entry point:** Sarah may also enter the engagement request flow via the public services page (like Tom), but typically she logs in directly and requests from her portal home.

---

## Context

Sarah is an individual taxpayer — a salaried professional in her late 30s with a W-2 income and a rental property. She has been Jane's client for two years and has completed one personal tax return engagement through the portal. She knows how the process works. She finds the portal convenient and trusts it.

She is a competent web user and comfortable with online forms, document uploads, and digital signing. She primarily uses a laptop during business hours; she occasionally checks notifications on her phone.

Unlike Tom (a prospective client), Sarah does not need the front-door walkthrough — she already has an account and a relationship with Jane. Her interest is in efficiency: getting a new engagement kicked off as quickly as possible so the clock starts on her deadline.

---

## Goals

1. **Initiate a new engagement quickly from inside the portal** — she wants a "Request new service" button on her portal home, not having to navigate back to the public services page.
2. **Track onboarding progress clearly** — after requesting a new engagement (and Jane accepting it), she wants to see what's left: "Sign the letter," "Complete questionnaire," "Upload documents."
3. **Not re-upload documents she already uploaded last year** — she wishes carry-forward was possible (v2 concern, out of scope for v1, but worth noting as a future pain point).
4. **Communicate with Jane within the engagement context** — not via email.
5. **Access her full history** — prior completed engagements should remain viewable at any time.

---

## Pain Points

1. **Friction on re-engagement.** If she has to go back to the public page and fill in her contact info again, that's friction. The simplified returning-client flow (REQ-DOOR-009) is the design response.
2. **Onboarding repetition.** She already has an engagement letter on file from last year (conceptually). The system always starts a new onboarding sequence per engagement in v1 (per REQ-ONBD-001) — this may feel redundant to her. Good copy and design help.
3. **Missing notifications.** If Sarah doesn't log in for a few days and misses a document request, work stalls. Email fallback (once-daily digest) is the safety net; she expects it to work.
4. **Version confusion on documents.** When she re-uploads a corrected file, she wants confirmation that the new version was received and is marked current.

---

## Constraints

- **Invitation-only account** — she was onboarded in a prior engagement. Her account exists and her `clerkId` is in the system.
- **CLIENT permissions** — cannot delete files, cannot see internal notes, cannot access `apps/admin`. If she tries to navigate to `apps/admin` (e.g., mistyped URL), she is redirected to `apps/portal` per REQ-AUTH-010 and ADR-010.
- **Device:** primarily laptop; mobile browser for notifications.
- **Time zone:** standard business hours. She may act on notifications in the evening.

---

## Typical Scenarios

1. **Initiating a returning-client engagement request:** Sarah logs in to `apps/portal`. She clicks "Request new service" on her portal home. The system shows a simplified version of the services checklist. She selects "Personal Tax Return — 2025" and submits. Jane receives a notification. This flow is faster than the anonymous path — no need to re-enter basic contact info.
   - Requirements: REQ-DOOR-009, REQ-DOOR-005.
   - Flow: `flow-engagement-request` (returning-client path).

2. **Completing onboarding for the new engagement:** Jane accepts Sarah's request. Sarah receives a notification and an email nudge. She logs in, sees the new engagement in her portal with a three-step progress indicator. She signs the engagement letter via Docuseal, submits the questionnaire, and uploads her W-2 and rental income statement. Engagement moves to In Progress.
   - Requirements: REQ-ONBD-001 through REQ-ONBD-006, REQ-FILE-001, REQ-FILE-008.
   - Flow: `flow-onboarding`.

3. **Uploading a revised document:** Jane sends a document request ("Please re-upload your Schedule E — there was a discrepancy"). Sarah receives a notification, logs in, navigates to the file exchange for the engagement, and uploads the corrected document. Jane is notified.
   - Requirements: REQ-FILE-001, REQ-FILE-007, REQ-FILE-008, REQ-FILE-009, REQ-MSG-014.
   - Flow: `flow-file-exchange`.

4. **Messaging Jane mid-engagement:** Sarah has a question about a deduction. She opens the message thread within the engagement on `apps/portal` and sends a plain-text message. Jane receives an in-portal notification on `apps/admin` and replies. Sarah sees the reply as an in-portal notification and reads it.
   - Requirements: REQ-MSG-001, REQ-MSG-003, REQ-MSG-007, REQ-MSG-014.
   - Flow: `flow-message-exchange`.

---

## Linked Flows

- `flow-first-sign-in` — initial sign-in as CLIENT (invitation-based, from prior engagement) and session routing
- `flow-role-redirect` — redirect to `apps/portal` if CLIENT navigates to `apps/admin`
- `flow-engagement-request` — returning-client re-engagement path
- `flow-onboarding` — three-step onboarding for each new engagement
- `flow-message-exchange` — per-engagement messaging
- `flow-file-exchange` — document upload/download with signed URLs

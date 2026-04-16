# Persona: Martha & James — Married Couple Filing Jointly

**One-line summary:** A married couple who are both portal accounts linked to a single engagement as participants — Martha is the primary contact, James is the secondary participant; both have access to the shared engagement.

---

## Role in the System

- **System role:** Both are CLIENT; Martha is the primary contact (REQ-AUTH-007, REQ-LIFE-012).
- **Technical permissions:** Both accounts are restricted to their own data via SQL Server Security Policies (ADR-005). Both are linked to the same engagement via `EngagementParticipant` rows. Each can see the engagement, upload documents, and send messages — but neither can access any other client's engagements, and neither can reach `apps/admin`.
- **Primary surface:** `apps/portal` (Client Portal) — authenticated routes for both.
- **Engagement structure:** One `Engagement` record; one `EngagementParticipant` row per person. One account (Martha) is the primary contact from the `EngagementRequest.contactInfo`. James is linked as a participant after Jane accepts and invites him separately.

---

## Context

Martha (early 50s, teacher) and James (mid-50s, contractor) file jointly every year. Their return is more complex than a single-income household: W-2 income, self-employment income, retirement accounts, and a home they jointly own. They are both moderately tech-literate.

Martha takes the lead on financial admin. She found the firm, submitted the engagement request, received the invitation, and created her portal account first. Jane then sent James a separate invitation (also via Clerk) to join as an engagement participant. James has his own account but defers most portal activity to Martha.

This scenario is important because it surfaces the multi-participant model: two people, one engagement, separate accounts, different activity levels. The system must not conflate their accounts — they log in separately, have separate `User` rows, and receive notifications independently.

---

## Goals

**Martha:**
1. **Submit the initial request as the primary contact and track all progress** — she is the "manager" of this engagement.
2. **Upload her W-2 and shared documents** — she wants clear labeling of what she's uploaded vs what James has uploaded.
3. **Communicate with Jane on behalf of both of them** — she often asks questions on James's behalf.
4. **See James's onboarding status** — did he sign the engagement letter too? (In practice, the e-sign may cover both parties on one Docuseal document — details to be resolved at the onboarding epic.)

**James:**
1. **Get things done when Martha asks him to** — he wants minimal friction; he's not proactively checking the portal.
2. **Upload his self-employment income documents** — his Schedule C inputs are the primary thing Jane needs from him specifically.
3. **Not be confused by notifications** — he should see only what's relevant to him.

---

## Pain Points

**Martha:**
1. **Coordination overhead.** She can't see whether James has completed his tasks from her portal view (unless the system explicitly shows participant progress). If the checklist says "Upload Schedule C" and James hasn't done it yet, Martha can't complete on his behalf.
2. **Notification duplication.** If both Martha and James receive identical notifications for the same engagement event, it may cause confusion ("did you see this?" — "yes, you?" back-and-forth). The system should notify both but make it clear who the action is addressed to.

**James:**
1. **Feeling like a secondary citizen.** If the invitation flow or portal home doesn't make clear why he has an account and what engagement it's for, he may be confused. Good onboarding copy matters.
2. **Unnecessary notifications.** James should receive notifications for actions that require his attention, not for everything that happens in the engagement.

---

## Constraints

- **Two separate Clerk users, one engagement.** Martha and James cannot log in as each other. Their `User.id` values are distinct. The engagement link (`EngagementParticipant`) grants both access to the same engagement rows via SQL Server Security Policies.
- **Separate invitations.** James is invited by Jane (via Clerk invitation API, same process as any other new client) as a second participant after Martha's account exists.
- **CLIENT permissions** — neither can access `apps/admin`. If either navigates to `apps/admin` URL, they are redirected to `apps/portal` per REQ-AUTH-010.
- **Device:** Martha primarily laptop; James may be more likely to use mobile browser.
- **v1 scope:** The engagement participant model (REQ-AUTH-007, REQ-LIFE-012) is in scope. Granular per-participant task assignment is not specified for v1 — both participants can act on any file or message in the engagement.

---

## Typical Scenarios

1. **Martha submits the initial engagement request (anonymous):** Martha visits `apps/portal` as an anonymous user (first year as a client), selects "Joint Tax Return" (or equivalent), fills in contact info (her email as primary), and submits. Jane accepts and invites Martha.
   - Requirements: REQ-DOOR-001 through REQ-DOOR-007, REQ-AUTH-006.
   - Flow: `flow-engagement-request`, `flow-first-sign-in` (Martha's invitation path).

2. **Jane invites James as a second participant:** After creating the engagement, Jane sends James a separate invitation via `apps/admin`. James receives the Clerk invitation email, clicks through to `apps/portal/sign-up`, and creates his account. He is linked to the same engagement as a participant.
   - Requirements: REQ-AUTH-007, REQ-LIFE-012, REQ-AUTH-006, REQ-DOOR-007.
   - Flow: `flow-first-sign-in` (James's invitation path).

3. **Both upload their respective documents:** Martha uploads her W-2 first. James logs in separately and uploads his Schedule C documents. Both uploads appear in the engagement's document folder. Jane sees both and can see who uploaded what.
   - Requirements: REQ-FILE-001, REQ-FILE-010, REQ-FILE-011.
   - Flow: `flow-file-exchange`.

4. **Martha messages Jane about a question relevant to both:** Martha sends a message in the engagement thread from `apps/portal`. Jane responds. James can also see the thread if he logs in — the thread is engagement-scoped and both participants have access.
   - Requirements: REQ-MSG-001, REQ-MSG-003, REQ-MSG-005.
   - Flow: `flow-message-exchange`.

---

## Linked Flows

- `flow-first-sign-in` — both Martha and James go through this flow (on separate occasions, separate invitations)
- `flow-role-redirect` — if either navigates to `apps/admin`, redirect to `apps/portal`
- `flow-engagement-request` — Martha's initial request submission
- `flow-onboarding` — both participate in the three-step onboarding gate
- `flow-file-exchange` — separate uploads from both participants to the same engagement
- `flow-message-exchange` — shared engagement message thread accessible by both

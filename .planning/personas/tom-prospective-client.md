# Persona: Tom — The Prospective Client

**One-line summary:** A person who found the firm's public services page and is considering submitting an engagement request — not yet authenticated, not yet a client.

---

## Role in the System

- **System role:** Anonymous (no account)
- **Technical permissions:** Public read-only access to the services page and engagement request form on `apps/portal`. No authenticated routes. Cannot log in — no account exists yet.
- **Primary surface:** Public routes of `apps/portal` (Client Portal) — specifically `/services` and `/request`.
- **After acceptance:** Tom transitions to a CLIENT role when he accepts Jane's invitation and creates his portal account. At that point his experience is governed by `sarah-returning-client.md` or similar (a signed-in client).

---

## Context

Tom is a small business owner in his mid-40s. He's looking for a new tax accountant after his prior one retired. He found Jane's firm through a referral or a web search, landed on the public services page, and is weighing whether to reach out.

He is not tech-averse but he is not particularly technical. He uses his laptop for most things; occasionally browsing on his phone. He has never used a "client portal" before and may be slightly suspicious of creating an account with someone he has never spoken to.

The key tension: the portal's "front door" design means Tom can express interest **without creating an account** first. This reduces friction. But it also means Tom has no portal presence until Jane accepts his request and invites him — so his experience of the portal's value proposition happens entirely on the public page before sign-up.

---

## Goals

1. **Understand what services the firm offers and whether they match his needs** — quickly, without needing to call.
2. **Submit a request without creating an account first** — the self-serve front door is the key differentiator for this persona.
3. **Know that his request was received and what happens next** — he wants a confirmation that his submission went somewhere.
4. **Avoid commitment before Jane accepts** — he may be submitting to multiple accountants. He doesn't want to create an account before he knows someone will take him on.

---

## Pain Points

1. **Friction at the front door.** If the form asks him to create a password before he can submit, he will likely abandon it. The account-creation-after-acceptance model is the design response to this.
2. **Uncertainty about next steps.** After submitting, Tom doesn't know when he'll hear back, how he'll hear back, or what the portal looks like. Clear post-submission confirmation text matters.
3. **Generic/impersonal experience.** If the public page looks like a generic SaaS template with no firm identity, Tom may not trust it. (Partially a v2 branding concern — v1 uses generic appearance per REQ-IDNT-002.)
4. **Duplicate service confusion.** If Tom submits for the same service twice (e.g., tabs left open), he doesn't want two duplicate requests sitting in Jane's queue.

---

## Constraints

- **No account, no persistent state in the portal.** Tom's only interaction with the system is the request form submission. Everything stored is in the `EngagementRequest` row with his email and contact info.
- **Device:** primarily laptop; may use mobile browser.
- **Accessibility:** no documented specific constraints; the public page must meet standard web accessibility baselines (WCAG AA target).
- **Trust threshold:** entering personal and financial information into an unfamiliar form requires some confidence. Clear visual design and the HTTPS + signed-URL story matter even if invisible to Tom.

---

## Typical Scenarios

1. **Browsing services:** Tom lands on the public services page in `apps/portal`. He reads the service descriptions and estimates timelines. He decides Personal Tax Return and Business Tax Return both apply. He clicks "Request services."
   - Requirements: REQ-DOOR-001, REQ-DOOR-002, REQ-DOOR-003.
   - Flow: `flow-engagement-request` (anonymous entry path).

2. **Submitting a request:** Tom fills in the engagement request form — selects services, provides contact info (name, email, phone). He submits and sees a confirmation message ("Your request has been sent. Jane will be in touch within 2 business days."). Behind the scenes, an `EngagementRequest` row is created and Jane receives a notification.
   - Requirements: REQ-DOOR-004, REQ-DOOR-005.
   - Flow: `flow-engagement-request`.

3. **Receiving the acceptance invitation:** After Jane accepts, Tom gets an email (sent by Clerk) with a link to `apps/portal/sign-up`. He clicks the link and completes sign-up. At this point he becomes a CLIENT and his subsequent experience is governed by the signed-in client flows.
   - Requirements: REQ-DOOR-007, REQ-AUTH-006.
   - Flow: `flow-first-sign-in` (invitation path), `flow-engagement-request`.

4. **Receiving a decline:** Jane declines the request and writes a brief explanation. Tom receives the message by email; he has no portal account and cannot log in to see anything. (The reason is also retained in the portal attached to the declined request — for Jane's reference, not Tom's — per OQ-001/AC-DOOR-008-04, resolved 2026-06-13.)
   - Requirements: REQ-DOOR-008 (AC-DOOR-008-01..04).
   - Realized by: EPIC-003 (accountant request inbox — decline branch).
   - Flow: `flow-engagement-request` (decline branch).

---

## Linked Flows

- `flow-engagement-request` — the primary flow for this persona (anonymous submission through accept/decline)
- `flow-first-sign-in` — invitation-link landing and sign-up completion (persona transitions to CLIENT at this point)

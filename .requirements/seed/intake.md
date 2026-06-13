# Tax Accountant Client Portal — Requirements

**Status:** Requirements complete — ready for agent stack handoff  
**Last updated:** Session 2  
**Purpose:** Working requirements document. Refined here before handoff to agent stack (RA → SRS).

---

## What this portal is

A mechanism for clients to engage a solo tax accountant for services, communicate throughout the process, and exchange files securely — without email. The accountant uses it as her daily work surface to track and manage all client engagements.

## What this portal is not

A workflow tool for performing tax and accounting work. No tax preparation, calculation, or filing features.

---

## Decisions made

- **Buy vs build:** Build custom. Off-the-shelf tools (TaxDome, Canopy, Liscio) don't cover the "front door" — self-initiated client engagement request. They assume the accountant already has the client.
- **SaaS vs one-off:** Build for her first. Revisit SaaS potential after real usage validates the concept.
- **Target user:** Solo practitioner, one accountant admin account.

---

## Tech stack (decided)

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) | Full-stack React, agent-friendly |
| Language | TypeScript | Type safety critical for financial app |
| Auth | Clerk | Handles roles, 2FA, sessions out of the box |
| Database | Postgres via Supabase | Managed, row-level security built in |
| ORM | Prisma | Schema-first, type-safe, agent-friendly |
| File storage | Supabase Storage | Signed URLs, same platform as DB |
| Real-time | Supabase Realtime | Postgres change events → websockets |
| Email | Resend + React Email | Simple API, React templates |
| UI | shadcn/ui + Tailwind CSS | Accessible, well-known by agents |
| Deployment | Vercel | Zero-config Next.js, preview URLs per branch |
| E-signature | Docuseal | Open-source, affordable |

---

## Modules & requirements

### Module 1 — Auth & user roles

**Status: Complete**

#### Defined
- Two roles: `ACCOUNTANT` (admin) and `CLIENT`
- Accountant has full visibility across all clients
- Clients see only their own data (enforced via Supabase RLS)
- 2FA optional for clients, enforced for accountant
- Client accounts created via invitation only — invitation sent when accountant accepts an engagement request
- Multiple people can participate in a single engagement (e.g. married couple filing jointly) — these are engagement participants, not shared accounts
- Clients retain portal access indefinitely after engagement is complete — can log in and view history at any time
- Session timeout duration: standard Clerk defaults (v1)

---

### Module 2 — Front door (service browsing & engagement request)

**Status: Complete**

#### Defined
- Public-facing services page — no login required
- Services catalog managed by accountant via admin UI — she can add, edit, and deactivate services
- Engagement request form is a checklist of defined services (e.g. Personal Tax Return, Business Tax Return) — not freeform, no service-specific variations
- Prospective client selects the services they need and submits basic contact info
- No account creation at request time — account is created only after acceptance
- Accountant receives notification of new request, reviews, accepts or declines
- On acceptance: invitation email sent to client to create their portal account
- On decline: accountant writes a brief message explaining why — sent to prospective client via email
- No discovery call step — services are prescribed and canned
- **Key differentiator:** self-initiated engagement from the public front door — not accountant-initiated
- Returning clients: can request a new engagement from inside the portal (simplified flow) OR accountant can initiate a new engagement on their behalf

---

### Module 3 — Client onboarding (post-acceptance)

**Status: Complete**

#### Defined
- Step 1: Engagement letter sent to client — must be e-signed via Docuseal before any other action is possible. Hard gate.
- Step 2: Intake questionnaire sent to client — templated per service type, defined by accountant in admin UI
- Step 3: Client uploads initial required documents per the document checklist
- Onboarding is "complete" when all three steps are done: letter signed + questionnaire submitted + initial documents uploaded
- Onboarding completion triggers engagement status moving to "In Progress"
- Accountant notified when onboarding is complete

---

### Module 4 — Engagement lifecycle

**Status: Complete**

#### Defined
- Status pipeline (internal / accountant labels): `New → In Progress → Review → Complete`
- Client-facing status labels: simplified and friendly — exact label mapping defined in SRS
- Status transitions are manual — accountant moves engagements through stages herself (v1)
- "Review" = accountant's internal review of work before delivering to client. Not client-facing review.
- "Complete" = two actions required: return delivered to client AND confirmed filed with IRS
- Only the accountant can reopen a completed engagement (e.g. for an amended return) — clients cannot
- Due date per engagement
- Internal notes per engagement — accountant-only, never visible to client
- Priority / flag markers per engagement
- One engagement per service type per tax year per client (a client can have multiple concurrent engagements for different services)

---

### Module 5 — Secure file exchange

**Status: Complete**

#### Defined
- Both sides can upload and download files
- Any file type permitted — no restrictions
- Files encrypted at rest (AES-256), accessed via signed URLs (never publicly accessible)
- Only the accountant can delete files — clients cannot delete anything
- Document retention: 7 years after engagement completion (IRS standard)
- Soft-delete: files marked deleted but retained for the 7-year period
- Accountant can create labeled document requests ("Please upload your W-2")
- Document checklist per engagement — client sees what's outstanding
- Version history — files can be replaced, previous versions retained
- Files organized in folders within an engagement — accountant creates and manages folder structure
- Organized by engagement and tax year at the top level

---

### Module 6 — Messaging & notifications

**Status: Complete**

#### Defined
- Per-engagement message threads with persistent conversation history
- General threads: accountant can open a thread with a client outside of any specific engagement
- Plain text messages only — no formatting, no rich text, no image embeds
- File attachments within messages
- Unread indicators on all messages
- Message threads kept forever — archived when engagement closes, always accessible
- **In-portal notification feed is the primary channel** — this is her daily work surface
- Email is fallback nudge only: "You have new activity in your portal" + login link. No content in email body.
- One digest email per day max — not one per event
- Accountant can suppress email entirely; client email fallback on by default
- Notification types (accountant receives): new service request, new message, document uploaded, onboarding completed, document request overdue, engagement approaching due date
- Notification types (client receives): new message, document request created, status change, deliverable ready, request accepted / declined
- Real-time delivery via Supabase Realtime (WebSocket)
- Notifications marked read when linked item is viewed
- Unread count badge visible in nav at all times
- Notification history retained minimum 90 days
- Auto-reminder engine: cron job flags overdue document requests — frequency configurable globally or per engagement by accountant

---

### Module 7 — Accountant dashboard

**Status: Complete**

#### Defined
- Dashboard home screen: summary metrics at top (active engagements, overdue, pending requests, upcoming deadlines), activity feed below
- Activity feed: unified view of all recent activity — messages, uploads, new requests, status changes, overdue items
- "Needs action" items surfaced distinctly — blocked engagements, overdue doc requests, pending new client requests
- Client list: separate screen, searchable, with status badge per client, filterable by service type / tax year
- Engagement list: separate screen, pipeline view with status, filterable
- Internal notes per engagement (not visible to client)
- Priority / flag markers per engagement
- Overdue document request auto-reminders — configurable frequency globally or per engagement
- Services catalog management in admin UI — add, edit, deactivate services
- Intake questionnaire template management in admin UI — per service type
- Engagement letter template management — system provides default, she can edit

---

### Module 8 — Portal identity & settings

**Status: Complete**

#### Defined
- Custom domain: portal lives at her own domain (e.g. portal.herfirm.com) from day one
- No firm branding for v1 — generic portal appearance. Branding (logo, colors, firm name) deferred to v2.
- Terms of service and privacy policy pages: deferred to v2
- Engagement letter: system provides a default template she can edit in the admin UI. Sent and e-signed via Docuseal.
- Data deletion: hard delete on request — accountant can permanently delete a client and all associated data
- Portal name from client perspective: TBD (deferred — no branding in v1)

---

## Core data models (outline)

| Model | Key fields |
|---|---|
| User | clerkId, role (ACCOUNTANT/CLIENT), email, name |
| Service | title, description, estimatedTimeline, isActive |
| EngagementRequest | serviceIds[], contactInfo, status (pending/accepted/declined), declineMessage |
| Engagement | clientId, serviceId, status, taxYear, dueDate, internalNotes, priority, completedDelivered, completedFiled |
| EngagementParticipant | engagementId, userId |
| OnboardingState | engagementId, letterSigned, questionnaireDone, initialDocsUploaded |
| IntakeTemplate | serviceId, questions[] |
| Message | engagementId (nullable for general threads), senderId, body, attachments[], readAt |
| Thread | clientId, engagementId (nullable), type (engagement/general) |
| Document | engagementId, folderId, uploadedById, storagePath, label, version, deletedAt |
| Folder | engagementId, name, createdById |
| DocumentRequest | engagementId, label, dueDate, fulfilledAt |
| Notification | userId, type, engagementId, readAt, payload (JSON) |
| NotificationPreference | userId, emailEnabled, overdueReminderDays |

---

## Build phases (planned)

| Phase | Scope | Weeks |
|---|---|---|
| 1 | Foundation — scaffold, auth, DB, routing, deployment pipeline | 1–3 |
| 2 | Front door — service browsing, engagement request, accept/decline | 4–6 |
| 3 | Onboarding — engagement letter, intake questionnaire, initial document checklist | 7–8 |
| 4 | File exchange + messaging + in-portal notifications | 9–12 |
| 5 | Accountant dashboard, pipeline, admin UI, polish, security audit | 13–16 |

---

## Out of scope (v1)

- Firm branding (logo, colors, firm name) — deferred to v2
- Terms of service / privacy policy pages — deferred to v2
- Payment processing / invoicing
- Tax calculation or preparation tools
- IRS e-filing integration
- Calendar / scheduling / discovery calls
- Multi-staff / employee accounts
- Mobile native app
- Email marketing or newsletters
- Status transition automation (manual only in v1)

---

## Session log

| Session | Topics covered |
|---|---|
| 1 | Portal concept, off-the-shelf evaluation (TaxDome, Canopy, Liscio), SaaS consideration, tech stack decisions, build plan, gap audit, notification model refinement |
| 2 | Worked through all open questions across all 8 modules — all gaps resolved, requirements complete |

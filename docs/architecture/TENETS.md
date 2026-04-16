# Architectural Tenets

> Read before implementing anything. The SA updates this as tenets emerge or are refined across epics.

## Status

Initial — to be expanded as the SA and RA work through the first few epics.

## Seed tenets (from intake)

1. **Security and data privacy are non-negotiable.** This is a financial application handling tax documents, SSNs, and sensitive personal information. Every feature is designed assuming attacker presence. Encryption at rest (AES-256), signed URLs for file access, Clerk-enforced 2FA on the accountant account, and Supabase Row-Level Security on every table with client-facing data.

2. **The front door is self-serve.** Prospective clients request engagement without an account. Account creation follows acceptance, not precedes it. No feature may reintroduce an "account required before request" gate without explicit requirements change.

3. **The accountant's inbox is the portal, not email.** In-portal notifications are the primary channel. Email is a digest nudge (one per day, no content). No feature may make email the primary delivery path for substantive content.

4. **Onboarding is a hard gate.** Engagement letter signed + questionnaire submitted + initial documents uploaded — all three — before an engagement moves to "In Progress." No bypass mechanisms.

5. **Clients never lose access.** Completed engagements remain accessible indefinitely. Soft-delete only for documents (7-year IRS retention). Hard delete only on explicit accountant request.

6. **Status transitions are human.** The accountant moves engagements through the pipeline manually in v1. No automated status transitions based on timers or document counts.

7. **Row-level security is enforced at the database, not the application.** Supabase RLS policies are the trust boundary. The Next.js app is not a second gatekeeper — if a query returns a row, the client is authorized to see it.

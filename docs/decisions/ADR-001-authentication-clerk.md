# ADR-001: Authentication via Clerk

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** SA (with user direction)
**Related:** ADR-002 (SQL Server), ADR-003 (Identity propagation via SESSION_CONTEXT)

## Context

The portal has three principal types (see SRS § 2):

- **ACCOUNTANT** — a single, pre-created admin account. Mandatory 2FA.
- **CLIENT** — invitation-only accounts created after the accountant accepts an engagement request. Optional 2FA.
- **Anonymous** — prospective clients browsing the public services page and submitting engagement requests. No account.

The app needs a hosted auth provider that:

1. Enforces per-role 2FA policy (required on accountant, optional on client).
2. Blocks self-registration — accounts only exist via invitation flow.
3. Issues server-verifiable session tokens that Next.js middleware can validate on every request.
4. Handles password reset, email verification, MFA enrollment, and session management without the team building any of it.
5. Exposes a stable user ID that the application can tie its own `User` row to.

Building auth in-house is a non-starter for a security-sensitive financial app staffed by a solo developer plus agents. Clerk was identified in the intake as the chosen provider; its free tier covers the expected user count (one accountant plus low-dozens of clients), its invitation API maps directly onto the product requirement, and its Next.js SDK is well-documented.

Earlier iterations of the plan considered pairing Clerk with Supabase Auth (via a Supabase-compatible JWT template). The revised stack (see ADR-002) replaces Supabase with SQL Server, so that bridge is gone. Clerk is now the single auth authority; the app propagates identity into SQL Server through `SESSION_CONTEXT` rather than a database-verifiable JWT (see ADR-003).

## Decision

**Clerk is the sole authentication provider for the portal.**

**Role storage.** Roles live on the Clerk user as `publicMetadata.role: 'ACCOUNTANT' | 'CLIENT'`. We do **not** use Clerk Organizations to model roles in v1 — there is one accountant and a flat roster of clients, not a multi-tenant hierarchy. Organizations would add complexity (org switching, member invitations, org-scoped sessions) that the product does not need. Metadata is read-only from the client SDK and writable only via Clerk's backend API, which keeps role mutation inside trusted code paths.

**2FA policy.** Mandatory MFA is configured at the Clerk application level for the accountant via a role-based policy. Clients may enroll TOTP optionally. The accountant account is provisioned before the portal goes live and must complete MFA enrollment before its first sign-in.

**Invitation-only sign-up.** Clerk's sign-up UI is disabled for self-service. Client accounts are created through Clerk's invitation API, triggered from the accept flow on an `EngagementRequest`. The invitation email delivers a single-use link to Clerk's sign-up completion page. No public sign-up route is exposed by Next.js middleware.

**Session verification.** Every request into the Next.js app runs through Clerk's middleware (`@clerk/nextjs/server`). The middleware verifies the session JWT, loads the user, and populates a server-side request context. Unauthenticated requests to gated routes redirect to the Clerk sign-in page. The Clerk user ID (`userId`) is the identity that every downstream concern keys off.

**App-side `User` row.** A SQL Server `User` row mirrors each Clerk user. The row's primary key is `UNIQUEIDENTIFIER` (app-owned, see ADR-002). A separate unique non-PK column `clerkId NVARCHAR(64)` holds the Clerk user ID. All foreign keys from application tables point at `User.id` (the UUID), never `clerkId`. Rationale:

- Decouples the database from the auth provider. If Clerk is ever swapped, `clerkId` changes but `User.id` and every FK relationship stays stable.
- Matches SQL Server idioms — `UNIQUEIDENTIFIER` with `NEWSEQUENTIALID()` is the native primary-key pattern (ADR-002).
- Keeps the identity-propagation contract simple: the app passes `clerkId` into `SESSION_CONTEXT` (ADR-003), and RLS predicate functions translate that to ownership checks via `User.clerkId`.

**`User` row lifecycle.** Creation and updates are driven by Clerk webhooks (`user.created`, `user.updated`, `user.deleted`). The webhook handler:

1. Verifies the Clerk webhook signature (Svix).
2. Runs under the **admin DB principal** — a separate connection pool with elevated privileges (see ADR-003, ADR-005). Webhooks are not request-scoped; they must never share the request pool or set `SESSION_CONTEXT` for a Clerk caller.
3. Upserts the `User` row, mapping Clerk metadata (`role`, `email`, `name`) to columns.

A secondary path — middleware-on-first-sign-in — is used only as a safety net when a webhook has not yet landed. It also runs under the admin principal.

**No Supabase JWT template.** The previous plan used a Supabase JWT template so that Supabase-side RLS could verify the Clerk session directly. SQL Server cannot verify Clerk JWTs (no JWKS verification, no native JWT primitives), so that bridge does not exist. Instead, the trust chain is:

1. Clerk verifies credentials and issues a session token.
2. Next.js middleware verifies the session token against Clerk's JWKS.
3. The verified Clerk user ID is injected into the request-scoped DB connection via `SESSION_CONTEXT` (ADR-003) before any query runs.
4. SQL Server RLS predicate functions read `SESSION_CONTEXT(N'clerk_user_id')` and filter rows (ADR-005).

## Alternatives considered

### Auth0 / Okta Customer Identity

Feature-equivalent to Clerk. Rejected for v1 because Clerk's Next.js SDK and invitation-only sign-up flow are noticeably more ergonomic, the free tier fits the expected user count, and swapping providers later is contained by the `clerkId`-as-non-PK decision above.

### Supabase Auth

Tied to the abandoned Supabase stack. Evaluating Supabase Auth standalone against Clerk, Clerk wins on MFA policy, invitation flow, and Next.js integration. Not reconsidered.

### NextAuth.js / self-hosted

Would put password reset, MFA enrollment, session storage, and rate-limiting in the team's maintenance surface. Rejected — not worth the build for a solo-accountant portal.

### Clerk Organizations for role modeling

One Clerk org per role (e.g., an "Accountants" org and a "Clients" org) would model access boundaries through org membership rather than metadata. Rejected: there is only one accountant, no org-switching UX is needed, and orgs complicate sessions and invitations. If the product ever grows to multi-firm (v2 SaaS), revisit.

### Clerk user ID as application PK

Making `clerkId` the primary key of `User` was considered and rejected. Arguments for: simpler joins to external systems keyed on Clerk ID. Arguments against, all of which won:

- Vendor lock-in at the schema level. Swapping Clerk means rewriting every FK.
- `NVARCHAR` PKs are inferior to `UNIQUEIDENTIFIER` PKs on SQL Server for index fragmentation and storage.
- Inconsistent with the rest of the schema, which uses `UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()` throughout.

## Consequences

- One less system to maintain — Clerk handles password hashing, MFA secrets, session cookies, rate-limiting, email verification, and CAPTCHA.
- Clerk is a hard dependency. An outage blocks all authenticated access. Mitigation for v1: the product is a professional portal for a single firm, not a consumer product — the accountant's tolerance for rare auth-provider outages is high. If this becomes unacceptable, a second-provider fallback is a Phase 5+ conversation.
- Role changes require writing to Clerk metadata through the backend API and then processing the `user.updated` webhook to sync SQL Server. The admin UI must never write roles directly to the `User` row without going through Clerk.
- The webhook handler is now a load-bearing piece of infrastructure. It must be idempotent (Clerk may deliver duplicates), must verify Svix signatures, and must log every upsert. Regression tests for replay, out-of-order delivery, and signature mismatch are mandatory.
- Clients completing Clerk sign-up before the `user.created` webhook lands will briefly lack a SQL Server `User` row. The middleware safety net (upsert on first authenticated request, under admin principal) handles this. The safety net must run exactly once per Clerk user — guarded by a `WHERE NOT EXISTS` or equivalent.
- The trust chain is entirely on the app side (Next.js middleware verifies the Clerk JWT; SQL Server trusts the middleware's claim via `SESSION_CONTEXT`). The `SESSION_CONTEXT` value is set under an application-role principal with `@read_only=1`, which prevents downstream code from tampering with it mid-request. Still, the app is the critical path — a bug that forgets to set `SESSION_CONTEXT` fails closed (no rows), but a bug that sets the wrong user ID leaks data. ADR-003 addresses this with a `prisma.$extends` middleware and a lint/middleware check.
- Invitation emails are delivered by Clerk. The app does not need to integrate Resend specifically for invitations. Resend remains the email provider for digest nudges and other app-generated mail (separate ADR, deferred).
- Testing: Clerk provides a test mode with programmable users and sessions. Playwright e2e tests sign in against Clerk's test instance. Integration tests that hit the DB set `SESSION_CONTEXT` manually in a setup helper, bypassing the real Clerk flow.

## Related

- **ADR-002** — SQL Server as the primary datastore; defines `UNIQUEIDENTIFIER` PK convention that the `User` table follows.
- **ADR-003** — Identity propagation via `SESSION_CONTEXT`; defines how the Clerk user ID reaches SQL Server on every request.
- **ADR-005** — RLS via Security Policies; predicate functions read `SESSION_CONTEXT(N'clerk_user_id')` to scope rows. Defines the admin principal used by this ADR's webhook handler.
- **SRS** — REQ-AUTH-001 through REQ-AUTH-009, REQ-NFR-004.
- **Tenet 7** (amended) — the database is the trust boundary; the app's obligation is identity propagation.

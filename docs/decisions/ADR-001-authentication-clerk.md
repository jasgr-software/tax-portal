# ADR-001: Authentication via Clerk

**Status:** Accepted
**Date:** 2026-04-16 (revised 2026-04-16 — two-frontend topology)
**Deciders:** SA (with user direction)
**Related:** ADR-002 (SQL Server), ADR-003 (Identity propagation via SESSION_CONTEXT), ADR-006 (Monorepo layout), ADR-010 (Cross-app navigation & session boundaries)

## Context

The portal has three principal types (see SRS § 2):

- **ACCOUNTANT** — a single, pre-created admin account. Mandatory 2FA.
- **CLIENT** — invitation-only accounts created after the accountant accepts an engagement request. Optional 2FA.
- **Anonymous** — prospective clients browsing the public services page and submitting engagement requests. No account.

The stack is now **two Next.js front ends** (see ADR-006):

- **`apps/portal`** (Client Portal) — public + CLIENT surface.
- **`apps/admin`** (Tax Portal) — ACCOUNTANT surface.

Both apps need a hosted auth provider that:

1. Enforces per-role 2FA policy (required on ACCOUNTANT, optional on CLIENT).
2. Blocks self-registration — accounts only exist via invitation flow.
3. Issues server-verifiable session tokens that each app's Next.js middleware can validate on every request.
4. Handles password reset, email verification, MFA enrollment, and session management without the team building any of it.
5. Exposes a stable user ID that the application's `User` row keys off.
6. **Supports two sign-in surfaces** — one per app — with role-based routing that blocks a CLIENT from reaching the admin app and an ACCOUNTANT from reaching client-only routes.

Clerk remains the chosen provider — the decision driver here is **how** to split Clerk across the two apps: one Clerk application shared across both, or two Clerk applications (one per app).

## Decision

**One Clerk application, two sign-in surfaces.** Both `apps/portal` and `apps/admin` point at the **same** Clerk application (same publishable key, same secret key, same user pool, same webhook endpoint). Each app hosts its own sign-in page styled for its audience. Role-based access is enforced by **per-app middleware** reading `publicMetadata.role` from the Clerk session.

Mandatory MFA on ACCOUNTANT and optional MFA on CLIENT remain unchanged. Invitation-only sign-up remains unchanged. The `User` table mirroring pattern (Clerk user ID as `clerkId NVARCHAR(64)` non-PK, app-owned `UNIQUEIDENTIFIER` PK) remains unchanged.

### Why one Clerk application, not two

**Cross-app flows exist and are easier with one Clerk app.**

- **Accountant accepts a request → client receives invitation.** The invitation is created in Clerk via the backend API and delivered as an email whose magic link lands on `apps/portal`'s sign-up completion route. If there were two Clerk apps, the admin-side code would have to target the portal's Clerk app with a separate API key and a separate webhook endpoint — doable but fragile (two keys to manage, two webhooks to verify, two user pools to keep from drifting).
- **Accountant-authored messages / documents reference a shared user identity.** Both apps read/write rows owned by Clerk-authenticated users. One Clerk app = one user pool = one identity space. Two Clerk apps means the ACCOUNTANT exists in app A's pool and the CLIENT in app B's pool — `clerkId` values are no longer comparable, FK-like references across users (e.g., "this message was sent by user X") require joining on `email` or a shadow mapping. Avoidable pain.
- **Webhook topology is simpler.** One `user.*` webhook endpoint updates one `User` table. With two Clerk apps, the webhook handler would have to either (a) live on one specific app's URL and cross-call the other or (b) duplicate into two handlers. Both variants multiply the failure modes documented in ADR-001's original "webhook is load-bearing" section.
- **Organizations / future SaaS expansion.** If this product ever grows into a multi-firm SaaS (an explicit "revisit in v2" from intake.md), the right model is Clerk Organizations with one Clerk app and org-scoped roles — **not** two Clerk apps per firm. Starting with one Clerk app is forward-compatible.

**Separation guarantees come from middleware, not Clerk.** The two-Clerk-app model offers a hardening story: "if CLIENT credentials are ever compromised, they can't even reach the admin Clerk app's sign-in." That sounds reassuring but is a weak guarantee — Clerk credentials are authoritatively verified at sign-in regardless of which surface hosts the sign-in page. The real access control is the role gate, and that lives in middleware.

### Role storage (unchanged)

Roles live on the Clerk user as `publicMetadata.role: 'ACCOUNTANT' | 'CLIENT'`. Written via Clerk backend API, read server-side from the session. We do **not** use Clerk Organizations in v1 — one accountant, flat client roster.

### Per-app middleware (role gates)

Each app has its own `middleware.ts` that runs Clerk's session verification and then enforces a role gate **before any route handler sees the request**.

**`apps/portal/middleware.ts`:**

1. Run Clerk's session check. Allow unauthenticated traffic to the public routes (services page, request form, sign-in, sign-up completion). Public route list is an explicit allow-list — any route not on it requires a session.
2. If authenticated, read `session.claims.publicMetadata.role`.
3. If `role === 'ACCOUNTANT'` and the path is a CLIENT-only path, redirect to the admin app's landing URL. (See ADR-010 for the full cross-app redirect matrix.)
4. If `role === 'CLIENT'`, proceed; the route handler runs under `withClerkIdentity` (ADR-003).
5. Populate `SESSION_CONTEXT` via `withRequestContext` before the first DB query.

**`apps/admin/middleware.ts`:**

1. Run Clerk's session check. **No public routes** — every path requires an authenticated session.
2. If unauthenticated, redirect to the admin sign-in page.
3. If authenticated, read `session.claims.publicMetadata.role`.
4. If `role !== 'ACCOUNTANT'`, redirect to the portal app (CLIENTs land back on their portal home). Return a clear 403-style page if redirect is disabled (e.g., deep-link API hit).
5. If `role === 'ACCOUNTANT'`, proceed; populate `SESSION_CONTEXT`.

The role gate is **hard** — a CLIENT cannot render any admin page, and an ACCOUNTANT cannot render CLIENT-only pages. This is defense-in-depth on top of RLS: RLS would prevent the ACCOUNTANT from seeing a specific client's rows in CLIENT-only contexts (if such contexts exist), but the middleware gate short-circuits before the DB is even consulted. The reverse — CLIENT against ACCOUNTANT-only data — is already impossible via RLS, but the middleware gate makes the intent explicit and returns a faster, cleaner response.

### Clerk configuration

**One Clerk application in the Clerk dashboard.** Single publishable key, single secret key, shared across both apps via env vars (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — set on both app containers from the same secret source).

**Allowed origins / redirect URLs** — both apps' production domains are registered in Clerk's allowed-origins list. Local dev uses `http://localhost:3000` (portal) and `http://localhost:3001` (admin), both registered in Clerk's dev instance allowed origins.

**Sign-in / sign-up URLs** — each app configures its own Clerk URLs:

- `apps/portal` — sign-in at `/sign-in`, sign-up completion (invitation-landing) at `/sign-up`, sign-out redirect to `/`.
- `apps/admin` — sign-in at `/sign-in`, no sign-up route exposed (admin is not a sign-up-able surface), sign-out redirect to `/sign-in`.

Clerk's `<ClerkProvider>` is initialized in each app's root layout with the app's specific sign-in/sign-up URLs. Same backend keys, different client-facing URLs.

**Webhook endpoint.** One webhook, not two. Convention: the webhook lives on `apps/portal` at `/api/webhooks/clerk` (rationale: the portal is reachable from the public internet at a stable, client-customer-facing domain; the admin app's ingress may be more restricted in production). Clerk dashboard points at a single production URL. The handler writes to `User` under the admin DB principal (unchanged from prior ADR).

**Session storage / cookie scope.** Clerk's session cookie is issued by the Clerk domain (not our app domains) when Clerk's sign-in page is used, and as a first-party cookie when Clerk's embedded components host the sign-in. Either way, the cookie carries through to both apps as long as both apps are registered as allowed origins on the same Clerk application. **The same Clerk session thus covers both apps** — a signed-in user moving from `portal.firm.com` to `tax.firm.com` does not have to re-authenticate, and the role gate on `apps/admin` decides whether to serve or bounce.

Cookie-domain specifics depend on the production subdomain structure (ADR-010 discusses the options). Clerk supports both same-apex-domain-with-subdomains (cookies flow automatically) and separate domains (Clerk's JWT-in-URL handshake can bridge them). For local dev, `localhost:3000` and `localhost:3001` share `localhost` as the cookie host, so the session applies to both apps.

### Invitation flow (end-to-end, post-revision)

1. Accountant (in `apps/admin`) accepts an `EngagementRequest`.
2. Admin server action calls Clerk backend API to issue an invitation: `POST /v1/invitations` with the recipient email, `publicMetadata.role: 'CLIENT'`, and a redirect URL pointing at `apps/portal`'s sign-up completion route (e.g., `https://portal.firm.com/sign-up?__clerk_ticket=...`).
3. Clerk sends the invitation email directly (Clerk is the sender — Resend is not involved here).
4. Recipient clicks the link, lands on `apps/portal/sign-up`, completes Clerk's sign-up flow (sets password, optionally enrolls 2FA).
5. Clerk fires `user.created` webhook to `/api/webhooks/clerk` on `apps/portal`. Handler upserts `User` under the admin DB principal.
6. User is redirected into `apps/portal`'s authenticated surface. Middleware sees `role === 'CLIENT'`, proceeds.

No cross-app Clerk-application hop. No invitation-domain mismatch. One user, one Clerk record, one `User` row.

### Accountant sign-in flow

1. Accountant navigates to `apps/admin` (e.g., `tax.firm.com`).
2. Middleware sees no session, redirects to `apps/admin/sign-in`.
3. Clerk sign-in form collects credentials, enforces MFA (mandatory for this role per Clerk policy).
4. Clerk issues session. Middleware next request sees `role === 'ACCOUNTANT'`, proceeds.
5. If the ACCOUNTANT accidentally navigates to `apps/portal`, middleware there redirects to `apps/admin` (ADR-010).

## Alternatives considered

### Two Clerk applications (one per front end)

Each app has its own Clerk app, its own publishable key, its own user pool. Rejected — see "Why one Clerk application" above. Primary drawbacks:

- Cross-app invitation flow requires admin-side code to call the portal-side Clerk app with a separate API key. Two keys, two webhooks, two user pools.
- User identity becomes app-scoped. If a user exists in both (hypothetical, not applicable to the current role model but forward-looking), the two `clerkId` values are not comparable.
- Doubled Clerk config burden (two MFA policies, two invitation templates, two sets of allowed origins).
- Weaker story on Organizations migration for v2 SaaS.
- No meaningful security gain — the role gate already enforces per-app access.

### One Clerk application, middleware-free role allowance (both roles access both apps)

A softer model: both roles can reach both apps, with the UI rendering different components based on role. Rejected because:

- Violates the product intent — "Tax Portal" is explicitly the accountant's work surface; a CLIENT landing there, even with no privileged content rendered, is a UX and operational incident.
- Every page would have to remember to check role and render a fallback. Defense-in-depth at the page level is brittle; middleware is categorical.
- Makes the admin app a larger attack surface (CLIENT sessions with curiosity can probe it).

### Auth0 / Okta / other providers

Not reconsidered — Clerk was the chosen provider and remains so. The two-app split does not weaken Clerk's fit.

### Clerk Organizations modelling "app access" as org membership

Create two Clerk organizations, "Client Portal Users" and "Tax Portal Users," and gate apps on org membership. Rejected:

- Users would have to be added to orgs by metadata changes that aren't the natural expression of their role.
- Role is already a user-level attribute (`publicMetadata.role`). Duplicating it as an org membership is a second source of truth.
- Org switching UX is irrelevant to this product in v1 and would leak into the sign-in experience.
- If v2 SaaS arrives, orgs represent **firms**, not app access — reserving the orgs concept for that future is correct.

## Consequences

- **One Clerk dashboard, one set of keys, one user pool, one webhook.** Operational surface is minimal. All cross-app flows are first-class because they share identity.
- **Per-app middleware is load-bearing.** If `apps/admin/middleware.ts` ever regresses on the role gate (e.g., a merge drops the `role !== 'ACCOUNTANT'` check), a CLIENT could reach admin pages. Mitigations: (a) a shared helper in `packages/db` or a new `packages/auth` package hosts `requireRole(role)` so neither app hand-rolls the check; (b) e2e specs in **both** apps include a negative test — CLIENT signed in, hit admin URL, expect redirect — and admin CLIENT signed in as ACCOUNTANT, hit portal-only URL, expect redirect.
- **Clerk allowed-origins config is now multi-entry.** Both app origins (dev + prod for each) must be registered. A misconfig ("forgot to add the admin origin") breaks that app's sign-in. Documented in operations runbook.
- **Session covers both apps.** A CLIENT signs in once on `apps/portal` and does not re-auth when any portal route navigates them elsewhere. An ACCOUNTANT signs in once on `apps/admin` and stays signed in. If a user somehow holds credentials for both roles (not possible in v1 — one Clerk user has one role — but policy-relevant), the session still carries a single role; the role gates select the right app.
- **Production domain structure has Clerk implications.** See ADR-010 for the cross-app behavior and § Production domain question below. Clerk supports both "apex + subdomains" (`portal.firm.com` + `tax.firm.com`) and "separate apex domains," but the cookie-sharing story is simpler with subdomains of one apex.
- **Invitation email sender is Clerk.** Resend does not appear in the invitation flow. Email-from address and template live in Clerk settings, which means the "from" address is Clerk's domain or a verified custom domain configured in Clerk. DNS / SPF / DKIM setup lives with Clerk's email service, not Resend.
- **Webhook handler ownership.** The handler lives on `apps/portal` for the reasons in § Webhook endpoint above. This is a routing decision, not a data decision — both apps read the `User` table the handler writes. A later ADR may extract the webhook handler into a dedicated service if admin app's ingress constraints require it.
- **Local dev:** `pnpm dev` starts both apps on ports 3000 and 3001. Clerk dev instance allowed origins include both. A developer signing in as ACCOUNTANT on port 3001 stays signed in when they open port 3000.
- **Testing:** Clerk test mode provisions users with `publicMetadata.role` pre-set. Each app's Playwright fixtures sign in the right role for that app's suite. Cross-app specs sign in as the originating-app role, then navigate to the other app to assert the role-gate response.

## Related

- **ADR-002** — SQL Server; defines the `User` table and `clerkId` non-PK pattern.
- **ADR-003** — Identity propagation via `SESSION_CONTEXT`; both apps' middleware runs the same identity-injection pattern.
- **ADR-005** — RLS via Security Policies; RLS is defense-in-depth on top of the middleware role gate.
- **ADR-006** — Monorepo layout; defines the two-app structure this ADR authenticates.
- **ADR-010** — Cross-app navigation & session boundaries; defines what happens on role-mismatched navigation, cross-app deep links, and session continuity.
- **SRS** — REQ-AUTH-001 through REQ-AUTH-009, REQ-NFR-004.
- **Tenet 1** (amended) — Security non-negotiable; RLS + role middleware + 2FA stack.
- **Tenet 7** — the database is the trust boundary; the app's obligation is identity propagation.

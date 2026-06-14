# ADR-010: Cross-App Navigation and Session Boundaries

**Status:** Accepted (amended 2026-04-16)
**Date:** 2026-04-16
**Revised:** 2026-04-16 — production domain structure decided (Option A).
**Deciders:** SA (with user direction)
**Related:** ADR-001 (Clerk authentication), ADR-006 (Monorepo layout), ADR-007 (Container packaging)

## Context

The portal is delivered as two Next.js front ends (ADR-006):

- **`apps/portal`** — Client Portal (public + CLIENT users).
- **`apps/admin`** — Tax Portal (ACCOUNTANT only).

Both apps share a single Clerk application (ADR-001). The per-app middleware enforces role-based access: CLIENT cannot render admin pages, ACCOUNTANT cannot render CLIENT-only portal pages. Public routes on the portal (services, request form, sign-in, sign-up completion) remain reachable unauthenticated.

The apps are reachable at distinct base URLs (localhost: `:3000` and `:3001`; production: two subdomains of one apex — see § Production domain structure). This ADR covers what happens in the spaces **between** the two apps:

- A CLIENT user lands on the admin app's URL. Redirect? Forbid? Show a unified login?
- A signed-in ACCOUNTANT clicks a deep link that points at a specific engagement. Does it work if they're on the portal when they click?
- An email notification contains a link into the admin app. The recipient follows it on a device that's not currently signed in.
- A session is established in one app. Does it cover the other? If a user signs out of one, does the other follow?

These gaps must be specified before Epic 001 scaffolds middleware, before the RA authors cross-app user flows, and before email templates start embedding app-specific links.

## Decision

### 1. Role-based landing — what happens when the wrong role lands on an app

**Rule: middleware redirects to the correct app. No unified login, no forbid-with-403 except for genuine forbidden-resource cases.**

#### Matrix

| Scenario                                                        | Behavior                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Unauthenticated → `apps/portal` public route**                | Serve the route. (Services page, request form, sign-in, sign-up completion are the explicit public allow-list.)                       |
| **Unauthenticated → `apps/portal` private route**               | Redirect to `apps/portal/sign-in` with `?redirect_url=<originally-requested>`.                                                        |
| **Unauthenticated → `apps/admin` (any route)**                  | Redirect to `apps/admin/sign-in` with `?redirect_url=<originally-requested>`.                                                         |
| **Signed-in CLIENT → `apps/portal` (any route)**                | Serve the route (subject to RLS + page authz).                                                                                        |
| **Signed-in CLIENT → `apps/admin` (any route)**                 | Redirect to `apps/portal/` (the client's home). No flash of admin UI. Return a compact HTML response with redirect header; no 403 page rendered — this is a misnavigation, not a permission error. |
| **Signed-in ACCOUNTANT → `apps/admin` (any route)**             | Serve the route.                                                                                                                      |
| **Signed-in ACCOUNTANT → `apps/portal` public route**           | Serve the route. The services page and request form are legitimately public and accountant visits are harmless. An accountant browsing her own public page is expected behavior. |
| **Signed-in ACCOUNTANT → `apps/portal` CLIENT-only route**      | Redirect to `apps/admin/` (the accountant's home).                                                                                    |
| **Any signed-in user → a route that requires a stricter role they don't have (e.g., a hypothetical future "OWNER" check)** | 403 with a clean page. This is a genuine permission error, not a misnavigation. Not expected in v1 (only two roles exist). |

**No "unified login" screen.** A shared sign-in page that detects role and routes to the correct app was considered and rejected. It blurs the product brand — the admin app's sign-in surface is for the accountant, the portal's sign-in surface is for clients (including invitation landing). They have different copy, different MFA behavior (mandatory vs optional), and different styling. A unified screen would try to be both and do neither well.

**Redirect destination.** Always the user's own home surface. CLIENT → `apps/portal/`, ACCOUNTANT → `apps/admin/`. Never "the previous page" for cross-app misnavigation — we don't know whether the previous page was legitimate, and bouncing there could loop.

#### Why redirect, not 403

A CLIENT typing `tax.firm.com` (or clicking an old bookmark) is almost certainly misnavigating, not attacking. A 403 with no recovery path is hostile UX. The redirect lands them where they should be and is self-healing.

For the genuine attack case — CLIENT credentials compromised, attacker poking admin URLs — the redirect achieves the same security outcome (no admin content served) with a gentler failure mode. The RLS policies plus middleware role gates are what prevent data leakage; the redirect-vs-403 choice affects UX, not security.

### 2. Cross-app deep links

**Rule: deep links from email / external sources are absolute URLs pointing at the target app's domain directly. Middleware on the target app handles auth-or-redirect as per § 1.**

- **Admin email "a new engagement request arrived"** → link is absolute to `apps/admin/requests/<id>`. Recipient follows it:
  - If signed in as ACCOUNTANT on the same browser session → admin middleware serves the route.
  - If unsigned → admin middleware redirects to `apps/admin/sign-in?redirect_url=/requests/<id>`. After sign-in, Clerk's `redirect_url` flow lands them on the deep-link page.
  - If signed in as CLIENT → admin middleware redirects to `apps/portal/` per § 1. (Vanishingly unlikely in practice — the accountant's email goes to the accountant.)

- **Client email "new message from your accountant"** → link is absolute to `apps/portal/engagements/<id>/messages`. Recipient follows it:
  - If signed in as CLIENT → portal middleware serves the route (subject to RLS on the specific engagement).
  - If unsigned → portal middleware redirects to `apps/portal/sign-in?redirect_url=/engagements/<id>/messages`. Sign-in completion lands on the deep-link.
  - If signed in as ACCOUNTANT → portal middleware redirects to `apps/admin/` per § 1.

- **Invitation email (Clerk)** → already resolved in ADR-001. Link points at `apps/portal/sign-up?__clerk_ticket=...`. No ambiguity.

**Never cross-app links.** Admin never embeds a portal URL in its UI (even in theory, e.g., "preview what the client sees"); portal never embeds an admin URL. If such a feature is ever needed, it's opened in a new tab explicitly marked "opens in other app" and still goes through the target app's middleware.

### 3. Session sharing

**Rule: one Clerk session covers both apps — the user does not re-authenticate when moving between them.**

Clerk's session cookie is issued under the Clerk application's domain scope. Both `apps/portal` and `apps/admin` use the same Clerk publishable key (ADR-001), so both verify the same session token on every request via Clerk middleware.

**Local dev.** Both apps run on `localhost`. Clerk's dev instance cookies apply to `localhost` across ports, so a sign-in on `:3000` carries to `:3001` and vice versa. No configuration required.

**Production — depends on domain structure.**

- **Option A: subdomains of one apex** (`portal.firmname.com` + `tax.firmname.com`). Clerk issues cookies scoped to `.firmname.com`; both apps receive the session. Recommended path for session continuity.
- **Option B: path-based split under one host** (`firmname.com/` + `firmname.com/admin/`). Cookies scoped to the single host automatically apply to both paths. Session continuity is automatic. Has other trade-offs — see § Production domain question.
- **Option C: two unrelated apexes.** Clerk supports cross-origin session via its hosted handshake URL. Technically works, but introduces a redirect bounce on first cross-app navigation. Not recommended.

**Sign-out behavior.** A sign-out in either app calls Clerk's sign-out API, which revokes the session. The next request from the other app sees no session and redirects to its own sign-in. **Sign-out is global** — there is no "sign out of this app only" in v1. This matches Clerk's default and is the expected behavior when one user has one session; any future "sign out on this device" refinement can land without architectural change.

**Session expiry.** Clerk's default session timeout applies (REQ-AUTH-009). Both apps observe the same expiry because they verify the same session token. A user idle on the portal hits expiry at the same moment a user idle on admin does.

### 4. No shared in-app session storage

Neither app keeps its own session store. There is no Redis, no server-side session DB, no cookie beyond Clerk's. Every cross-request state reconstruction goes through Clerk (session verification) and SQL Server (business data under RLS).

This keeps both apps stateless at the session layer — a critical property for the long-lived-Node-process model (ADR-007) — and means session invalidation propagates at the speed of Clerk's own revocation, not our stores.

### 5. Cross-app coordination via the DB

When an action in one app must be visible in the other, the communication channel is:

1. **DB write** — admin server action writes to SQL Server under RLS.
2. **Realtime push** (deferred, Tier-2 ADR) — SSE notifies the other app's subscribers. For Epic 001, the portal app reads the DB on next request; realtime lands later.
3. **Email nudge** (when appropriate) — digest email to the recipient.

**The apps never call each other's HTTP endpoints.** No `fetch('https://admin.firm.com/internal/...')` from portal, no reverse call from admin. This keeps the apps decoupled, avoids double-authentication concerns, and keeps the auth boundary crisp — every request into either app comes from a user's browser (or a webhook source), never from the sibling app.

### 6. Webhook endpoints

Clerk webhook → `apps/portal/api/webhooks/clerk` (ADR-001). Docuseal webhook (future) → ADR to be written at Epic 003; likely `apps/portal/api/webhooks/docuseal` since Docuseal signs client-initiated artifacts. Platform health probes → each app's own `/healthz` and `/readyz` (ADR-007).

### 7. Middleware implementation (Epic 001 scaffolding)

Each app's `middleware.ts` follows the same skeleton, differing only in the public-route allow-list and the role-gate branch:

```ts
// apps/portal/middleware.ts (illustrative)
import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const publicRoutes = ['/', '/services', '/request', '/sign-in', '/sign-up']

export default clerkMiddleware((auth, req) => {
  const { userId, sessionClaims } = auth()
  const isPublic = /* match req.nextUrl.pathname against publicRoutes */

  if (isPublic) return NextResponse.next()
  if (!userId) return redirectToSignIn('/sign-in', req.nextUrl.pathname)

  const role = sessionClaims?.publicMetadata?.role
  if (role === 'ACCOUNTANT') {
    // Cross-app misnavigation — bounce to admin app
    return NextResponse.redirect(process.env.ADMIN_APP_URL!)
  }
  if (role !== 'CLIENT') {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }
  return NextResponse.next()
})
```

```ts
// apps/admin/middleware.ts (illustrative)
import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export default clerkMiddleware((auth, req) => {
  const { userId, sessionClaims } = auth()
  // No public routes on admin — even /sign-in redirects here for non-auth traffic
  if (req.nextUrl.pathname.startsWith('/sign-in')) return NextResponse.next()

  if (!userId) return redirectToSignIn('/sign-in', req.nextUrl.pathname)

  const role = sessionClaims?.publicMetadata?.role
  if (role !== 'ACCOUNTANT') {
    return NextResponse.redirect(process.env.PORTAL_APP_URL!)
  }
  return NextResponse.next()
})
```

`PORTAL_APP_URL` and `ADMIN_APP_URL` are env vars set per-environment. Local dev: `http://localhost:3000` and `http://localhost:3001`. Production: the chosen domain structure.

A shared helper (`packages/auth/requireRole(role)` — a new package to be scaffolded in Epic 001 if needed, or folded into `packages/db`'s exports) may host the redirect logic so neither app hand-rolls it. Epic 001 Plan decides the exact placement; the above is illustrative.

### 8. E2e tests for cross-app behavior

Mandatory negative tests in Epic 001 scaffolding:

- **In `apps/portal/e2e/`:** ACCOUNTANT signed in, visit `/` (public home — serve), visit `/dashboard-style path that is portal-CLIENT-only` (should redirect to admin).
- **In `apps/admin/e2e/`:** CLIENT signed in, visit any admin URL, expect redirect to portal. Unauthenticated, visit admin URL, expect redirect to `/sign-in`.
- **Session continuity:** sign in on one app, navigate to the other, assert session persists (no sign-in prompt).
- **Sign-out cross-app:** sign out on one app, attempt to reach a private route on the other, assert redirect to the other app's sign-in.

These are part of AC-001-008 (Playwright e2e infrastructure) as expanded for the two-app split.

## Alternatives considered

### 403 page instead of redirect for wrong-role navigation

A role-mismatched hit returns a 403 with a "wrong app — go here" link. Rejected: self-service hostile. Redirect is friendlier and achieves the same security outcome.

### Unified sign-in at a shared URL (e.g., `id.firmname.com`)

A third surface hosts sign-in and routes to whichever app matches the user's role. Rejected: adds a third moving part. Clerk's hosted sign-in already provides this de facto — the app-specific sign-in pages are thin wrappers around Clerk's flow, and a user who hits the wrong app's sign-in can still complete sign-in there and then be redirected to their correct app (because the middleware does the post-sign-in role check). The per-app sign-in surface is clearer than a third domain.

### Separate sessions per app (two Clerk apps)

Already rejected in ADR-001. Re-rejected here because it would force re-authentication on every cross-app navigation — a hostile UX for cross-app flows (accountant clicks an email link that happens to reference a client-side preview) and unnecessary given the one-Clerk-app model.

### No cross-app coordination (each app a fully independent product)

Treat the two apps as fully decoupled — no shared identity, no shared DB, no session continuity. Rejected: the product is one system, not two. Shared identity and DB are load-bearing product features, not implementation details.

### App-to-app HTTP calls for coordination

E.g., admin server action POSTs to `apps/portal/api/internal/invalidate-cache`. Rejected: authentication complexity (whose credentials? service-to-service token?), tight coupling, another failure mode. DB + realtime are sufficient.

## Consequences

- **Middleware is load-bearing and symmetric.** Both apps must maintain their role gate and their cross-app redirect. A regression on one breaks the role model. E2e tests cover the negative cases in both apps.
- **Session is one thing, observable in both apps.** Operational simplicity: one place to revoke (Clerk), one place to observe expiry (Clerk), one place to audit (Clerk).
- **Deep links are always absolute + target-app-specific.** Email templates, notification payloads, and Clerk redirect URLs all use fully qualified URLs. A template that omits the scheme/host is a bug.
- **Env vars for app URLs are required per environment.** `PORTAL_APP_URL` and `ADMIN_APP_URL` appear in `.env.example`, in both apps' runtime config, and in the operations runbook.
- **The production domain structure is load-bearing for session continuity.** Option A (two subdomains of one apex) is decided — see § Production domain structure. Clerk's allowed-origins config (ADR-001) must therefore list two subdomains of one apex, not a single host and not cross-origin domains.
- **No new classes of security risk are introduced by the split.** RLS policies remain the trust boundary for data. Middleware role gates are defense-in-depth. Session revocation is central (Clerk).
- **Cron / jobs / webhook endpoints live on portal.** Single external-facing surface for webhook receipt (ADR-001 notes this for Clerk; future webhook ADRs will reinforce). Admin remains a thinner surface.

## Production domain structure (decided 2026-04-16)

**Decision: Option A — two subdomains of one apex.** E.g., `portal.<firm-apex>` + `tax.<firm-apex>`.

The subdomain prefixes are locked: `portal.` for the Client Portal app and `tax.` for the Tax Portal (admin) app. The firm's apex domain is not yet known and will be supplied at deploy time. The structure itself — two subdomains of one apex — is not subject to further change.

Clerk issues session cookies scoped to `.<firm-apex>`; both apps receive the cookie on every request, giving zero-friction session continuity. `PORTAL_APP_URL` and `ADMIN_APP_URL` env vars are populated with the two fully-qualified subdomain URLs at deploy time.

**Rejected alternatives:**

- **Option B — path-based split under one host** (`portal.<apex>/` + `portal.<apex>/admin/`). Rejected: requires an ingress proxy for path routing, embeds the admin surface under the client-facing brand, and complicates independent ingress hardening (e.g., IP-restricting admin).
- **Option C — two unrelated apexes.** Rejected: Clerk cross-origin session handshake introduces a redirect bounce on first cross-app navigation; higher operational surface.

## Related

- **ADR-001** — Clerk authentication; defines the one-Clerk-app topology whose session this ADR makes portable across both front ends. The allowed-origins config in ADR-001 must enumerate two subdomains of one apex (per § Production domain structure above), not a single host and not unrelated apexes.
- **ADR-006** — Monorepo layout; defines the two-app structure.
- **ADR-007** — Container packaging; two images, two ingress routes, one session.
- **SRS** — REQ-AUTH-001 through REQ-AUTH-009, REQ-IDNT-001.
- **ADR-005 / ADR-020** — security non-negotiable; middleware role gates + RLS + 2FA + encryption.

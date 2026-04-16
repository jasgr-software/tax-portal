# Epic 001 — Foundation: Scaffold, Auth, DB, Routing & Deployment Pipeline

**Epic-type:** feature  
**Epic-deploys:** yes  
**Phase:** 1  
**Status:** Ready for SA  
**Priority:** P0 — must complete before any other epic

---

## Purpose

Establish the full-stack application skeleton that all subsequent epics build on. At the end of this epic the project has: **two running Next.js apps** (`apps/portal` — Client Portal; `apps/admin` — Tax Portal), Clerk authentication enforcing the two-role model with per-app middleware, a Prisma-managed SQL Server schema with the core models, SQL Server Security Policy baseline, a CI/CD pipeline building both apps, and a local development environment with Docker-based SQL Server and Azurite. Nothing is user-visible except the auth shell (sign-in, role-gated routing, cross-app redirect).

The two-front-end architecture is defined in ADR-006 (monorepo layout) and ADR-010 (cross-app navigation and session boundaries). One Clerk application serves both surfaces — see ADR-001.

**Affected flows:** `flow-first-sign-in`, `flow-role-redirect`

---

## Requirements in scope

| Requirement ID | Summary |
|---|---|
| REQ-AUTH-001 | Two roles: ACCOUNTANT and CLIENT |
| REQ-AUTH-002 | ACCOUNTANT has full visibility (enforced in routing + SQL Server Security Policies) |
| REQ-AUTH-003 | CLIENT data isolation via SQL Server Security Policies (per ADR-005) |
| REQ-AUTH-004 | 2FA mandatory for ACCOUNTANT (Clerk enforcement) |
| REQ-AUTH-005 | 2FA optional for CLIENT |
| REQ-AUTH-006 | Invitation-only CLIENT account creation (Clerk invitation flow) |
| REQ-AUTH-008 | Clients retain portal access indefinitely |
| REQ-AUTH-009 | Session timeout: Clerk defaults |
| REQ-AUTH-010 | Role-based cross-app redirect (CLIENT → portal, ACCOUNTANT → admin) |
| REQ-NFR-001 | SQL Server Security Policies on all authenticated data |
| REQ-NFR-003 | Web browser only |
| REQ-NFR-004 | Tech stack: Next.js 14, TypeScript, Clerk, SQL Server, Prisma, shadcn/ui, Tailwind, two apps |
| REQ-IDNT-001 | Custom domain from day one |
| REQ-IDNT-006 | Portal named "Client Portal" (apps/portal) and "Tax Portal" (apps/admin) |

---

## Acceptance Criteria

### AC-001-001 — Monorepo and two Next.js app scaffold
- A `pnpm` workspace monorepo exists matching the ADR-006 layout:
  - `apps/portal/` — Next.js 14 (App Router) in TypeScript, named `@tax-portal/portal`, dev server on port **3000**.
  - `apps/admin/` — Next.js 14 (App Router) in TypeScript, named `@tax-portal/admin`, dev server on port **3001**.
  - `packages/` containing at minimum: `db/`, `storage/`, `ui/`, `eslint-config/`, `tsconfig/`.
- Both apps build without errors (`pnpm build`).
- Lint and type-check pass across the workspace (`pnpm lint`, `pnpm type-check`).
- shadcn/ui and Tailwind CSS are installed; a sample component from `packages/ui` renders correctly in both apps.
- `pnpm dev` (or `pnpm dev:portal` and `pnpm dev:admin`) starts both dev servers on ports 3000 and 3001 respectively.
- Browser tab titles: `apps/portal` pages use "Client Portal" as the site name; `apps/admin` pages use "Tax Portal". (REQ-IDNT-006)

**Affected flows:** `flow-first-sign-in`, `flow-role-redirect`

### AC-001-002 — Clerk authentication integrated (both apps, one Clerk application)
- Clerk is installed and configured in **both apps**, pointing at the **same Clerk application** (same publishable key, same secret key — per ADR-001).
- Sign-in flows work in both apps via Clerk embedded components.
- Invitation-only registration is enforced on `apps/portal`: the sign-up page accepts `?__clerk_ticket=` tokens; direct self-registration without an invitation token is blocked.
- `apps/admin` exposes no sign-up route — sign-up is not a valid action for the admin surface.
- ACCOUNTANT 2FA enforcement is configured in Clerk (MFA required for ACCOUNTANT role).
- Sign-out works from either app; Clerk session is revoked globally (ADR-010 § Session sharing).
- `PORTAL_APP_URL` and `ADMIN_APP_URL` environment variables are present in `.env.example` and validated at app startup (missing values fail the `/readyz` probe per ADR-007 § Health endpoints).

**Affected flows:** `flow-first-sign-in`, `flow-role-redirect`

### AC-001-003 — Per-app role-gated routing and cross-app redirect
- **`apps/portal/middleware.ts`** enforces:
  - Public routes (`/`, `/services`, `/request`, `/sign-in`, `/sign-up`) are accessible without authentication.
  - Private routes redirect unauthenticated users to `apps/portal/sign-in?redirect_url=<path>`.
  - Signed-in ACCOUNTANT visiting a CLIENT-only private route is redirected to `ADMIN_APP_URL`. No flash of portal UI.
  - Signed-in CLIENT proceeds normally.
- **`apps/admin/middleware.ts`** enforces:
  - All routes require authentication (no public routes except `/sign-in`).
  - Unauthenticated users are redirected to `apps/admin/sign-in?redirect_url=<path>`.
  - Signed-in CLIENT is redirected to `PORTAL_APP_URL`. No flash of admin UI.
  - Signed-in ACCOUNTANT proceeds normally; `SESSION_CONTEXT` is set via `withRequestContext` (ADR-003).
- Redirect destinations are `PORTAL_APP_URL` (for clients misnavigating to admin) and `ADMIN_APP_URL` (for accountants misnavigating to portal private routes).
- A shared role-gate helper (`packages/auth` or `packages/db` — SA decides during Plan) hosts the redirect logic so neither app hand-rolls it.
- REQ-AUTH-010, ADR-010.

**Affected flows:** `flow-role-redirect`, `flow-first-sign-in`

### AC-001-004 — Prisma schema with core models (SQL Server)
- A `prisma/schema.prisma` file at the repo root defines the following models with correct field types and relations: `User`, `Service`, `EngagementRequest`, `Engagement`, `EngagementParticipant`, `OnboardingState`, `IntakeTemplate`, `Thread`, `Message`, `Document`, `Folder`, `DocumentRequest`, `Notification`, `NotificationPreference`.
- `User.clerkId` is a non-PK `NVARCHAR(64)` unique column; PKs are `UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()` (ADR-002).
- A baseline migration (Track A — Prisma) is generated and applied to the local SQL Server instance.
- `pnpm prisma generate` produces a typed Prisma client with no errors.
- The `User` row is created/upserted via the Clerk `user.created` / `user.updated` webhook handler on `apps/portal/api/webhooks/clerk` (ADR-001 § Webhook endpoint). Handler runs under `adminDb` (admin DB principal — bypasses Security Policies for this one operation).
- The `Thread` model structure (explicit parent of `Message`, replacing intake's `Message.engagementId` nullable pattern) is present with a `// DECISION:` comment cross-referencing the RA note in SRS § Data Model Overview.

**Affected flows:** `flow-first-sign-in`

### AC-001-005 — SQL Server Security Policy baseline
- Security Policies (ADR-005) are enabled on all tables containing client-scoped data: `Engagement`, `EngagementParticipant`, `OnboardingState`, `Message`, `Thread`, `Document`, `Folder`, `DocumentRequest`, `Notification`, `NotificationPreference`.
- Raw SQL migrations for Security Policies live in `db/policies/` (Track B — per ADR-002 and ADR-005 § Migration track).
- A `validate-policies.ts` script (or equivalent) confirms all covered tables have policies.
- FILTER and BLOCK predicates use `SESSION_CONTEXT(N'clerk_user_id')` (ADR-003).
- Admin principal exemption is present in every predicate body (ADR-005 § Admin exemption).
- An integration test confirms a CLIENT cannot read another CLIENT's rows (hard requirement per ADR-005 § Test obligation and CLAUDE.md domain-specific notes).

**Affected flows:** `flow-first-sign-in`, `flow-role-redirect`

### AC-001-006 — Local development environment (both apps)
- `docker-compose.yml` starts: SQL Server 2022 Developer (port 1433), Azurite (port 10000), both app containers (`portal` on 3000, `admin` on 3001), mail catcher (port 8025).
- `.env.example` lists all required environment variables: Clerk publishable/secret keys, SQL Server connection string, Azurite connection string, `PORTAL_APP_URL` (`http://localhost:3000`), `ADMIN_APP_URL` (`http://localhost:3001`), Resend API key, Docuseal token.
- `docker compose up -d` followed by `pnpm dev:portal` and `pnpm dev:admin` (or `pnpm dev`) produces working applications at `http://localhost:3000` and `http://localhost:3001`.
- Port assignments match ADR-006 § Port assignments.

**Affected flows:** none (infrastructure only)

### AC-001-007 — CI/CD pipeline (both apps)
- A GitHub Actions workflow runs lint, type-check, build, and Vitest unit tests across the workspace on every PR targeting `main`.
- CI builds both `apps/portal` and `apps/admin` independently (two build jobs or sequential build of both).
- Required checks per CLAUDE.md § Required CI checks are present and passing: `lint-and-typecheck`, `test-web`, `security-scan`.
- Container images for both apps are built from `apps/portal/Dockerfile` and `apps/admin/Dockerfile` (ADR-007 § Image shape). Images are size-checked (< 300MB each).
- The custom domain configuration is documented in `docs/operations/inventory.md` (actual production DNS wiring is deploy-platform-deferred per ADR-007, but the `.env.example` and Clerk allowed-origins are set up for both `localhost` and the intended production subdomain structure).

**Affected flows:** none (infrastructure only)

### AC-001-008 — Playwright e2e infrastructure (two configs, shared stack)
- **`apps/portal/playwright.config.ts`** exists with `baseURL: 'http://localhost:3000'`. An `apps/portal/e2e/` directory contains at minimum:
  - **Smoke spec:** loads `http://localhost:3000` (public home), verifies services link or sign-in link is present.
  - **CLIENT auth spec:** completes sign-in as CLIENT (Clerk test mode), lands on portal authenticated home.
  - **Cross-app redirect spec (negative):** signs in as ACCOUNTANT on `apps/portal`, navigates to a CLIENT-only private route, asserts redirect to `http://localhost:3001`.
- **`apps/admin/playwright.config.ts`** exists with `baseURL: 'http://localhost:3001'`. An `apps/admin/e2e/` directory contains at minimum:
  - **ACCOUNTANT auth spec:** completes sign-in as ACCOUNTANT (Clerk test mode, MFA in test mode), lands on admin dashboard.
  - **Cross-app redirect spec (negative):** signs in as CLIENT, visits any admin URL, asserts redirect to `http://localhost:3000`.
  - **Unauthenticated redirect spec:** visits `http://localhost:3001` without a session, asserts redirect to `apps/admin/sign-in`.
- **Cross-app session continuity spec:** signs in on one app, navigates to the other app's public or app-appropriate route, asserts no re-authentication prompt.
- **Cross-app sign-out spec:** signs out on one app, asserts a private route on the other app redirects to sign-in.
- `pnpm --filter portal e2e:run` and `pnpm --filter admin e2e:run` each execute successfully against the running docker-compose stack.
- `pnpm e2e:run` (root) runs both suites in sequence.
- Per-app result artifacts land in `apps/portal/e2e-results/` and `apps/admin/e2e-results/` respectively.
- All cross-app negative test cases from ADR-010 § E2e tests are covered.

**Affected flows:** `flow-first-sign-in`, `flow-role-redirect`

### AC-001-009 — Operations docs baseline
- `docs/operations/inventory.md` is created documenting all provisioned resources: Clerk application (one, shared), SQL Server (local Docker; production engine deferred), Azurite (local; production storage deferred per ADR-008), both app ingress points (local ports and intended production subdomains), GitHub repository.
- `docs/operations/runbook.md` is created with: environment setup instructions for both apps, Clerk allowed-origins configuration for local dev and production, secret rotation procedure, notes on the two-image deploy pattern (per ADR-007), and `PORTAL_APP_URL` / `ADMIN_APP_URL` configuration guidance.

**Affected flows:** none (documentation only)

---

## Out of scope for this epic

- Any user-facing product features (services page content, forms, dashboard content, messaging, files)
- Docuseal integration
- Resend email sending
- Server-Sent Events / real-time notifications
- Any data beyond the auth shell and DB schema

---

## Dependencies

None — this is the root epic.

---

## Notes for SA

- The two-front-end architecture (ADR-006, ADR-010) is the primary structural change from the original Epic 001 spec. Every task in Plan must account for the two-app layout.
- AC-001-003 requires a decision on where the shared role-gate helper lives (`packages/auth` vs `packages/db`). Recommend `packages/auth` as a new package — but SA decides during Plan.
- AC-001-005 (SQL Server Security Policy baseline) must be verified with an integration test per policy per CLAUDE.md domain-specific notes and ADR-005 § Test obligation.
- AC-001-007 (CI): Vercel references from the original epic spec have been removed — deploy platform is deferred (ADR-007). CI builds OCI container images instead.
- AC-001-008 (Playwright): Two Playwright configs are required. The cross-app e2e specs (negative tests for role-based redirect) are mandatory — they exercise the primary security property of the two-app split. See ADR-010 § E2e tests.
- CLARIF-006 (Docuseal self-hosted vs cloud) does not block this epic — Docuseal is not integrated here.
- `flow-first-sign-in` and `flow-role-redirect` are the user flows that Epic 001 must satisfy. Both are authored in `docs/requirements/flows/`. The SA must reference these flows in task specs (`**Affected flows:**` field).

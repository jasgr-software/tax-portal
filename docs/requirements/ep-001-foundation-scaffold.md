# Epic 001 — Foundation: Scaffold, Auth, DB, Routing & Deployment Pipeline

**Epic-type:** feature  
**Epic-deploys:** yes  
**Phase:** 1  
**Status:** Ready for SA  
**Priority:** P0 — must complete before any other epic

---

## Purpose

Establish the full-stack application skeleton that all subsequent epics build on. At the end of this epic the project has: a running Next.js app, Clerk authentication enforcing the two-role model, a Prisma-managed Postgres schema with the core models, a CI/CD pipeline deploying to Vercel, and a local development environment with Docker-based Supabase. Nothing is user-visible except the auth shell (sign-in, role-gated routing).

---

## Requirements in scope

| Requirement ID | Summary |
|---|---|
| REQ-AUTH-001 | Two roles: ACCOUNTANT and CLIENT |
| REQ-AUTH-002 | ACCOUNTANT has full visibility (enforced in routing + RLS) |
| REQ-AUTH-003 | CLIENT data isolation via Supabase RLS |
| REQ-AUTH-004 | 2FA mandatory for ACCOUNTANT (Clerk enforcement) |
| REQ-AUTH-005 | 2FA optional for CLIENT |
| REQ-AUTH-006 | Invitation-only CLIENT account creation (Clerk invitation flow) |
| REQ-AUTH-008 | Clients retain portal access indefinitely |
| REQ-AUTH-009 | Session timeout: Clerk defaults |
| REQ-NFR-001 | RLS policies on all authenticated data |
| REQ-NFR-003 | Web browser only |
| REQ-NFR-004 | Tech stack: Next.js 14, TypeScript, Clerk, Supabase, Prisma, shadcn/ui, Tailwind, Vercel |
| REQ-IDNT-001 | Custom domain from day one |

---

## Acceptance Criteria

### AC-001-001 — Monorepo and Next.js app scaffold
- A `pnpm` workspace monorepo exists with `apps/web` containing a Next.js 14 (App Router) project in TypeScript.
- The app builds without errors (`pnpm build`).
- Lint and type-check pass (`pnpm lint`, `pnpm type-check`).
- shadcn/ui and Tailwind CSS are installed and a sample component renders correctly.
- The root `pnpm dev:web` command starts the dev server on port 3000.

### AC-001-002 — Clerk authentication integrated
- Clerk is installed and configured for the project.
- Sign-in and sign-up flows work via Clerk-hosted UI or embedded components.
- Invitation-only registration is enforced: the sign-up page rejects self-registration without a valid invitation token. Direct self-registration is blocked.
- ACCOUNTANT 2FA enforcement is configured in Clerk settings (MFA required for the accountant org/role).
- Sign-out works.

### AC-001-003 — Role-gated routing
- Authenticated users are redirected based on their role: ACCOUNTANT → `/dashboard`, CLIENT → `/portal`.
- Unauthenticated users attempting to access gated routes are redirected to the sign-in page.
- A CLIENT attempting to access `/dashboard` routes receives a 403 / redirect.
- An ACCOUNTANT attempting to access CLIENT-only routes receives a 403 / redirect.
- Route protection is implemented via Next.js middleware using Clerk session data.

### AC-001-004 — Prisma schema with core models
- A `prisma/schema.prisma` file defines the following models with correct field types and relations: `User`, `Service`, `EngagementRequest`, `Engagement`, `EngagementParticipant`, `OnboardingState`, `IntakeTemplate`, `Thread`, `Message`, `Document`, `Folder`, `DocumentRequest`, `Notification`, `NotificationPreference`.
- A baseline migration is generated and applied to the local Supabase Postgres instance.
- `pnpm prisma generate` produces a typed Prisma client with no errors.
- The `User` model is synced from Clerk via a webhook or middleware that creates/updates a `User` record on Clerk sign-in.

### AC-001-005 — Supabase RLS baseline
- Row-Level Security is enabled on all tables that contain user data.
- A `supabase/migrations/` directory holds the RLS policy SQL.
- CLIENT role: can only SELECT/UPDATE rows where their `userId` (or linked `engagementId`) matches.
- ACCOUNTANT role: unrestricted SELECT on all rows.
- The RLS policies are verified by a seed script or integration test that confirms a CLIENT cannot read another CLIENT's rows.

### AC-001-006 — Local development environment
- `docker-compose.yml` starts a local Supabase stack (Postgres, Storage, Realtime) on the documented ports (54321–54324).
- `.env.example` lists all required environment variables: Clerk publishable/secret keys, Supabase URL + anon key + service role key, Resend API key, Docuseal token.
- `README` or `CLAUDE.md` local setup steps produce a running dev environment in under 10 commands.
- `docker compose up -d` followed by `pnpm dev:web` produces a working application at `http://localhost:3000`.

### AC-001-007 — CI/CD pipeline
- A GitHub Actions workflow runs lint, type-check, build, and Vitest unit tests on every PR targeting `main`.
- Required checks defined in CLAUDE.md § "Required CI checks" are present and passing: `lint-and-typecheck`, `test-web`, `security-scan`.
- Vercel integration is configured: merges to `main` trigger production deploys; PRs generate preview URLs.
- The custom domain (`portal.herfirm.com`) is wired to the Vercel production deployment.

### AC-001-008 — Playwright e2e infrastructure
- `apps/web` contains a Playwright configuration file (`playwright.config.ts`) with a working base URL.
- An `e2e/` directory exists with at least a "smoke" test that: (a) loads the home page, (b) verifies the sign-in link is present, (c) completes the sign-in flow as ACCOUNTANT and lands on the dashboard route.
- `pnpm --filter web e2e:run` executes successfully against a running local stack.
- `pnpm --filter web e2e:run -- --grep 'smoke'` passes.

### AC-001-009 — Operations docs baseline
- `docs/operations/inventory.md` is created documenting all provisioned cloud resources: Vercel project, Supabase project, Clerk application, custom domain DNS record, GitHub repository.
- `docs/operations/runbook.md` is created with environment setup instructions, secret rotation procedure, and deploy procedure.

---

## Out of scope for this epic

- Any user-facing product features (services page, forms, dashboard content, messaging, files)
- Docuseal integration
- Resend email sending
- Supabase Realtime subscriptions
- Any data beyond the auth shell and DB schema

---

## Dependencies

None — this is the root epic.

---

## Notes for SA

- The `Thread` model in the Prisma schema replaces the intake's `Message.engagementId (nullable)` pattern. The SA should create an ADR documenting this decision during Plan. See SRS § Data Model Overview note.
- AC-001-005 (RLS baseline) must be considered carefully — the Supabase service role key bypasses RLS; all application queries must use the anon key + user JWT to exercise RLS. The developer must not use the service role key from client-side code.
- AC-001-007 requires Vercel + GitHub integration to be configured. If the repository or Vercel project doesn't exist yet, the DevOps agent must create them as the first sub-task.
- CLARIF-006 (Docuseal self-hosted vs cloud) does not block this epic — Docuseal is not integrated here.

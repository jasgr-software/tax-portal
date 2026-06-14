# Tech Stack Snapshot (current, decided)

> Structured snapshot of the **current decided** stack — the architecture counterpart to a requirements
> SRS-snapshot. Read-only to the Architecture Agent; it reconciles this against observable project state
> (`package.json`, `prisma/schema.prisma`, `.github/workflows/`, `db/policies/`) and the existing ADRs.
> Each row notes the governing ADR. Where this supersedes the original `docs/requirements/intake.md`
> stack table, the superseded choice is called out.

## Decided stack

| Layer | Choice | Governing ADR | Notes |
|---|---|---|---|
| Framework | Next.js 14 (App Router) | — | Full-stack React. |
| Language | TypeScript | — | Type safety is a hard requirement; compiler is the cross-module contract. |
| Topology | Two front ends — `apps/portal` (Client Portal, client-facing) + `apps/admin` (Tax Portal, accountant-facing) — over shared `packages/` | ADR-006 | Monorepo (pnpm workspace). Cross-app navigation + session boundaries per ADR-010. |
| Auth | Clerk | ADR-001 | Roles, sessions, 2FA (enforced for accountant). |
| Database | **SQL Server 2022** | ADR-002 | **Supersedes** the original "Postgres via Supabase" intake choice. |
| ORM | Prisma (`sqlserver` provider), single track | ADR-004 | Schema-first; entity schema only. Things Prisma can't express go to a raw-SQL track (`db/migrations/`, `db/policies/`). |
| Identity propagation | `SESSION_CONTEXT` on every request-scoped connection, via the `packages/db` wrapper | ADR-003 | App's load-bearing obligation; fail-closed if identity missing. |
| Row-level security | SQL Server Security Policies (filter + block predicates) | ADR-005 | **Supersedes** "Supabase RLS." DB is the trust boundary; one integration test per policy is mandatory. |
| Object storage | Storage abstraction; Azurite (Azure Blob emulator) locally | ADR-008 | **Supersedes** "Supabase Storage." |
| File access | Signed URLs (never public) | ADR-009 | Encryption at rest (AES-256). |
| Repository seam | Repository interface as the test seam | ADR-011 | Enables tier-2 mocking; concrete Prisma repos exercised by tier-3 integration. |
| E-signature | Docuseal (self-hosted) | — | Onboarding engagement-letter gate. |
| Email | Digest-only nudge; Mailhog/Inbucket mail catcher locally | — | **Supersedes** "Resend" as the primary intent; email carries no substantive content. |
| Real-time | In-portal notifications (real-time); email fallback digest-only | — | Original intake named Supabase Realtime; transport revisited under the SQL Server stack. |
| UI | Tailwind CSS + shadcn/ui | — | |
| Unit/component tests | Vitest (+ React Testing Library) | ADR-012 | |
| E2e tests | Playwright (per-app config), full docker-compose stack | ADR-006, ADR-012 | |
| Packaging | OCI containers (multi-stage Dockerfile); production host **deferred** | ADR-007 | Local dev: docker-compose (SQL Server + Azurite + Docuseal + its Postgres + mail catcher). |
| CI | GitHub Actions | ADR-012 | Jobs: lint-and-typecheck, test-portal, test-admin, security-scan. |
| Testing contract | 9-tier testing pyramid | ADR-012 | See `strategy/TESTING.md`. |

## Superseded original choices (do not reintroduce without a new ADR)

- Postgres via **Supabase** → SQL Server 2022 (ADR-002).
- **Supabase** Storage → object-storage abstraction + Azurite/Blob (ADR-008).
- **Supabase** RLS → SQL Server Security Policies (ADR-005).
- **Vercel** zero-config deploy → deploy-platform-agnostic container packaging (ADR-007).
- **Resend** as primary email path → digest-only nudge; no substantive content in email.

# Architectural Tenets

> Read before implementing anything. The Architecture Agent maintains this file (see `AGENT.md`);
> Reviewers — and the architecture deviation scan — cite specific `TENET-NNN` ids when checking tenet
> compliance. Tenets are cited by deviation findings during architecture review. Amending a tenet is
> high-impact — treat it as an escalation carve-out unless purely editorial.

## Status

Tenets carry stable `TENET-NNN` ids (cited by deviation findings). **TENET-007 amended 2026-04-16** during the SA Tier-1 ADR batch (see `decisions/ADR-005-rls-via-security-policies.md`) following the stack switch from Supabase to SQL Server with `SESSION_CONTEXT`-based identity propagation. **TENET-001 amended 2026-04-16** (same session) to replace Supabase RLS language with SQL Server Security Policies (ADR-005). **Two-frontend architecture added 2026-04-16** (pre-Epic-001 cleanup) — the portal is now delivered as `apps/portal` (Client Portal) + `apps/admin` (Tax Portal), with cross-app behavior specified in ADR-010 and role-based middleware gates added as defense-in-depth on top of the database trust boundary. **Migrated into `.architecture/` and assigned stable ids 2026-06-13** (no wording change beyond id labeling and the ADR path repoint).

## Tenets

- **TENET-001 — Security and data privacy are non-negotiable.** This is a financial application handling tax documents, SSNs, and sensitive personal information. Every feature is designed assuming attacker presence. Encryption at rest (AES-256), signed URLs for file access, Clerk-enforced 2FA on the accountant account, and SQL Server Security Policies (row-level filter + block predicates) on every table with client-facing data — see ADR-005.

- **TENET-002 — The front door is self-serve.** Prospective clients request engagement without an account. Account creation follows acceptance, not precedes it. No feature may reintroduce an "account required before request" gate without explicit requirements change.

- **TENET-003 — The accountant's inbox is the portal, not email.** In-portal notifications are the primary channel. Email is a digest nudge (one per day, no content). No feature may make email the primary delivery path for substantive content.

- **TENET-004 — Onboarding is a hard gate.** Engagement letter signed + questionnaire submitted + initial documents uploaded — all three — before an engagement moves to "In Progress." No bypass mechanisms.

- **TENET-005 — Clients never lose access.** Completed engagements remain accessible indefinitely. Soft-delete only for documents (7-year IRS retention). Hard delete only on explicit accountant request.

- **TENET-006 — Status transitions are human.** The accountant moves engagements through the pipeline manually in v1. No automated status transitions based on timers or document counts.

- **TENET-007 — Row-level security is enforced at the database; the app is responsible for identity propagation.**

   The database is the trust boundary. Row-level access policies run in-engine, and no application path may bypass them except the explicitly-documented admin principal (used by migrations, webhooks, and cron — see ADR-005).

   The app's obligation is narrower but load-bearing: **propagate the caller's identity into every request-scoped DB connection** (via `SESSION_CONTEXT` on SQL Server) before any data query runs. Missing identity means no rows returned — policies fail closed. The app may add defense-in-depth authorization checks (e.g., pre-signing a file URL), but those are redundant to, not substitutes for, the DB policy.

# Architecture Intake — Forces, Constraints, Philosophy

> Raw architecture intent for the Tax Accountant Client Portal. This is the ingestion surface for the
> Architecture Agent (read-only to it). It captures the **forces, constraints, and philosophy** that
> drive the *how* — not the product *what* (that lives in `.requirements/`). The agent turns this, plus
> observable project state, into ADRs, the C4 model, the tenets, and the testing/CI-CD strategy.
>
> Provenance: distilled from `docs/requirements/intake.md` (§ Decisions made, § Tech stack) and the seed
> tenets, reconciled to the **current** decided stack. The original intake named a Supabase/Vercel stack;
> that was superseded during the SA's Tier-1 ADR batch (2026-04-16) — see `seed/tech-stack.md` and
> `decisions/ADR-002` (SQL Server), `decisions/ADR-004` (Prisma), `decisions/ADR-007` (containers).

## Product shape (the architecture has to serve this)

- A web-only (v1) portal for a **solo tax accountant** to engage clients, communicate, and exchange
  files securely — replacing email as the client-facing channel.
- Three actor classes: anonymous **prospective clients** (public front door), invited **clients** (see
  only their own engagements), one **accountant** admin (full visibility, daily work surface).
- Not a tax-preparation/calculation/filing tool. No IRS integration, no payments, no scheduling.

## Architectural forces

1. **Security and data privacy are non-negotiable.** Financial application handling tax documents, SSNs,
   PII. Design assuming attacker presence: encryption at rest, signed URLs for file access, enforced 2FA
   on the accountant account, and row-level access enforced **in the database engine** on every table
   with client-facing data.
2. **The database is the trust boundary.** Row-level access policies run in-engine and fail closed; no
   application path bypasses them except a documented admin principal (migrations, webhooks, cron). The
   app's load-bearing obligation is to **propagate caller identity into every request-scoped connection**
   before any data query runs.
3. **The accountant's inbox is the portal, not email.** In-portal notifications are primary; email is a
   digest nudge only (no substantive content). Real-time delivery is expected.
4. **Self-serve front door.** Prospective clients request engagement without an account; account creation
   follows acceptance. No "account required before request" gate.
5. **Onboarding is a hard gate.** Engagement letter e-signed + questionnaire submitted + initial docs
   uploaded — all three — before an engagement moves to In Progress. No bypass.
6. **Long retention, never lose access.** Completed engagements remain accessible indefinitely;
   documents soft-deleted and retained 7 years (IRS); hard delete only on explicit accountant request.
7. **Human-driven lifecycle.** Status transitions are manual in v1 — no timer/document-count automation.

## Delivery & operations philosophy

- **Two front ends, one platform.** A client-facing surface and an accountant-facing surface are
  distinct deployables sharing one data layer and shared packages — cross-surface behavior is a
  first-class concern, not an afterthought.
- **Type safety end to end.** TypeScript across the monorepo; the compiler is the cross-module contract
  (no separate code-generation/contract boundary).
- **Deploy-platform-agnostic packaging.** The production host is deferred; the system is packaged so the
  eventual host must satisfy a documented capability contract rather than the build being tied to one
  platform. Local dev runs the full stack in containers.
- **Lights-out quality.** Agents drive work end-to-end; quality gates must be trustworthy without human
  verification. The testing strategy is a contract (a single pyramid, single cadences, single triggers),
  not a convention — it must grow with the code automatically.

## Constraints the agent must respect

- Web browser only (v1). No mobile/native clients.
- Solo operator: one accountant admin account; operational simplicity matters.
- Escalation carve-outs (security posture, retention/deletion, encryption, auth model, trust boundary,
  regulatory) are user decisions — the agent records them as open decisions without a default.

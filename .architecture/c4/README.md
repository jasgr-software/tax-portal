# C4 Architecture Model — Index

> The C4 model is the living architectural description of the system. The Architecture Agent maintains it
> (see `../AGENT.md`); the Architecture Agent updates it when the model changes — a host workflow may
> dispatch it to do so. This file is the index; detail lives in the level files alongside it.

## Level files

- `L1-context.md` — System context: actors (prospect / client / accountant), the one-platform boundary, and the external-system seams (Clerk, Docuseal, Azure Blob/Azurite, malware scanner, email) with current mock/emulated state
- `L2-containers.md` — Containers: two Next.js front ends (`apps/portal`, `apps/admin`) of one platform over shared `packages/`, SQL Server 2022 (schema + Security Policies + audit ledger), Azurite (blob), Mailhog, Docuseal (compose-deferred); the request-pool vs admin-pool DB paths
- `L3-components.md` — Components: app middleware/actions/webhooks; `packages/db` (`$extends` wrapper, repositories, onboarding/checklist read models, audit seam); the RLS policy layer; the four provider seams (auth/storage/esign/email + scanner)
- `L4-code.md` — Code-level (selective): the `$extends` SESSION_CONTEXT SET hook, the two-phase authorize-then-sign upload pipeline, the BLOCK-governed client write pattern, and the provider-seam shape

## Status

Index migrated into `.architecture/` 2026-06-13. **All four level files (`L1`–`L4`) authored 2026-06-19** as
a backfill of the as-built architecture across delivery Phases 1–4 — each element is grounded in a real source
path or Accepted ADR. The container list above reflects the SQL Server era (ADR-002/004/005/006/008/019/023),
superseding the pre-architecture Supabase sketch below (retired, retained for history only).

## Seed sketch (pre-architecture — stale, retained for history)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Prospective Client (anon)                     │
│                         Client (invited)                         │
│                       Accountant (admin)                         │
└──────────┬──────────────────────────────────────┬───────────────┘
           │                                      │
           ▼                                      ▼
   ┌──────────────┐                      ┌──────────────┐
   │  Public site │                      │ Portal app   │
   │  (SSR pages) │                      │ (auth'd UI)  │
   └──────┬───────┘                      └──────┬───────┘
          │                                     │
          └──────────────┬──────────────────────┘
                         │
                ┌────────▼────────┐
                │  Next.js 14     │
                │  (App Router)   │
                └────────┬────────┘
                         │
       ┌─────────┬───────┼───────┬─────────┬──────────┐
       ▼         ▼       ▼       ▼         ▼          ▼
   ┌─────┐  ┌─────────┐ ┌────┐ ┌────────┐ ┌──────┐ ┌────────┐
   │Clerk│  │Supabase │ │RLS │ │Docuseal│ │Resend│ │Supabase│
   │Auth │  │Postgres │ │    │ │e-sign  │ │email │ │Storage │
   │     │  │+Realtime│ │    │ │        │ │      │ │signed  │
   └─────┘  └─────────┘ └────┘ └────────┘ └──────┘ └────────┘
```

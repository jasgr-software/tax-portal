# C4 Architecture Model — Index

> The C4 model is the living architectural description of the system. The Architecture Agent maintains it
> (see `../AGENT.md`); the Architecture Agent updates it when the model changes — a host workflow may
> dispatch it to do so. This file is the index; detail lives in the level files alongside it.

## Level files

- `L1-context.md` — System context: users, external systems, system boundary
- `L2-containers.md` — Containers: two Next.js front ends (`apps/portal`, `apps/admin`), SQL Server 2022 (+ Security Policies), Clerk, object storage (Azure Blob / Azurite), Docuseal, mail catcher
- `L3-components.md` — Components: modules within each app (auth, front-door, onboarding, engagements, files, messaging, notifications, admin) + shared `packages/`
- `L4-code.md` — Code-level: key classes, hooks, server actions, route handlers, the `packages/db` identity-propagation wrapper

## Status

Index migrated into `.architecture/` 2026-06-13. The level files (`L1`–`L4`) are stubs to be authored by
the Architecture Agent. The container list above reflects the current decided stack (SQL Server era —
ADR-002/004/005/008), superseding the pre-architecture Supabase sketch below.

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

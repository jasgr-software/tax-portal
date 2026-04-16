# Progress

> Single source of truth for current initiative state, quality gates, active bugs, and retro action items. The SA, RA, and SDET update this file at the start and end of every invocation. Structure contract: see `.claude/agent-stack.md` § PROGRESS.md structure contract.

## Current initiative

**Epic 001 — Foundation: Scaffold, Auth, DB, Routing & Deployment Pipeline**  
Branch: `ep-001-foundation-scaffold` (to be created by SA during Plan)  
Goal: Working Next.js app with Clerk auth, Prisma schema, Supabase RLS baseline, CI/CD pipeline, and Playwright e2e infrastructure. Auth shell only — no product features.  
Phase: Ready for SA → Plan  
Gated: Yes

_The RA has completed requirements definition. The SA should pick up Epic 001 next._

> **Before SA begins Plan phase — user must resolve CLARIF-004:** What should the portal be called in client-facing text (page titles, email subjects, browser tab) in v1? Even a simple placeholder like "Client Portal" or the firm name is sufficient. This is needed for scaffold-level copy.

## Awaiting PR merge

_None._

## Active bugs

_None._

## Open retro action items

_None._

---

### RA Requirements Definition — 2026-04-16

**Start:** First RA invocation on a greenfield project. No SRS, epics, roadmap, or observations existed. Read intake.md, CLAUDE.md, agent-stack.md, and ra.md. PROGRESS.md had no current initiative. Observations, discovery, and SRS files did not exist — skipped cleanly per startup checklist guidance.

**Actions:**
- Read all source files: `docs/requirements/intake.md` (8 modules, 5 build phases, tech stack, data models, out-of-scope items), `CLAUDE.md` (product vision, agent config, tech stack), `agents/ra.md` (role rules), `.claude/agent-stack.md` (workflow engine rules)
- Created `docs/requirements/SRS.md` — 62 requirements across 8 functional areas (AUTH×9, DOOR×10, ONBD×7, LIFE×12, FILE×12, MSG×18, DASH×13, IDNT×6) plus 8 NFRs. All status: Planned. Flagged 6 open clarifications.
- Created `docs/requirements/observations.md` — empty with header and format instructions.
- Created 8 epic files in `docs/requirements/`:
  - `ep-001-foundation-scaffold.md` — fully detailed ACs (9 ACs), ready for SA
  - `ep-002-front-door.md` — fully detailed ACs (8 ACs), CLARIF-001 blocks
  - `ep-003-client-onboarding.md` — stubbed ACs, CLARIF-006 blocks
  - `ep-004-file-exchange.md` — stubbed ACs
  - `ep-005-messaging-notifications.md` — stubbed ACs
  - `ep-006-engagement-lifecycle.md` — stubbed ACs, CLARIF-002 and CLARIF-003 block
  - `ep-007-accountant-dashboard.md` — stubbed ACs
  - `ep-008-polish-security-audit.md` — stubbed ACs, CLARIF-005 blocks
- Created `docs/plans/release-roadmap.md` — 5-phase roadmap with epic references and clarification blockers mapped to phases
- Updated `docs/tasks/PROGRESS.md` (this file) — set Current initiative to Epic 001, flagged CLARIF-004 as pre-SA blocker

**Key findings / clarifications flagged for user:**
1. **CLARIF-001** — Decline message portal retention (blocks Epic 002)
2. **CLARIF-002** — Client-facing status label mapping (blocks Epic 006)
3. **CLARIF-003** — Duplicate engagement handling behavior (blocks Epic 006)
4. **CLARIF-004** — Portal name for v1 client-facing text (blocks Epic 001 — needs answer before SA runs)
5. **CLARIF-005** — Hard delete vs 7-year retention conflict (blocks Epic 008)
6. **CLARIF-006** — Docuseal self-hosted or cloud (blocks Epic 003)

**Data model note:** The intake listed `Message.engagementId (nullable)` for general threads. The SRS reorganized this with an explicit `Thread` model as the parent of `Message`, to properly support general and engagement-scoped threads. The SA should review this during plan and create an ADR if the design holds.

**End:** Requirements definition complete. Epic 001 is fully specified and ready for SA pickup after CLARIF-004 is resolved. Epics 002–008 exist with enough context for the SA to plan; later-phase epics need RA refinement before their SA execution begins.

### SA Tier-1 ADR Batch (write phase) — 2026-04-16

**Start:** Third SA invocation on this pre-Plan work. The prior two SA invocations produced a stack analysis; the user then delivered three constraints (SQL Server, defer deploy, Docker for local dev) and green-lit the revised plan after a seven-point walk-through. Entered this invocation to **write** the Tier-1 ADR batch — no more analysis. PROGRESS.md current initiative (Epic 001 in Plan-preflight) was preserved; the Plan phase itself has not started.

**Actions:**
- Wrote Tier-1 ADRs to `docs/decisions/`:
  - `ADR-001-authentication-clerk.md` (pre-existing from prior SA invocation, verified and left unchanged) — Clerk as sole auth provider; roles via Clerk `publicMetadata`, mandatory ACCOUNTANT 2FA, invitation-only sign-up, Clerk webhook → SQL Server `User` row under admin principal, `User.clerkId` as non-PK column, UUID PKs for app FKs.
  - `ADR-002-database-sql-server.md` (pre-existing, left unchanged) — SQL Server 2022 primary datastore; Developer edition in Docker for local dev; production engine deferred to Phase 5; `UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()` PKs; `DATETIMEOFFSET` timestamps; two migration tracks (Prisma + raw SQL); known Prisma+SQL Server rough edges documented.
  - `ADR-003-identity-propagation-session-context.md` (pre-existing, left unchanged) — Clerk → SQL Server identity bridge via `sp_set_session_context @read_only=1`; two pools (`app_user_role` + `app_admin_role`); Prisma `$extends` wrapper fail-closed on missing context; pool-reset regression test mandatory; alternatives (per-user DB users, `EXECUTE AS`, JWT-in-DB, app-side RLS, `CONTEXT_INFO`) rejected with reasoning.
  - `ADR-004-orm-prisma-single-track.md` (NEW) — Prisma as sole ORM with single-track client; two pools not two ORMs; `packages/db/sql/` raw-SQL escape hatch; schema-first; version pinned.
  - `ADR-005-rls-via-security-policies.md` (NEW) — SQL Server Security Policies with FILTER + BLOCK predicates; admin-principal exemption in every predicate; predicate shallowness + access-set tables + ITVF-only as the perf mitigation toolbox; `.rls.test.ts` suite per policy as hard requirement; Epic 001 baseline table list.
  - `ADR-006-monorepo-layout.md` (NEW) — pnpm workspaces, no build orchestrator in v1; `apps/web`, `packages/{db,storage,emails,eslint-config,tsconfig}`, `prisma/`, `db/{migrations,policies,seed}`, `scripts/`, `infra/` reserved; Turbo/Nx revisited at Phase 5.
  - `ADR-007-container-packaging-deploy-agnostic.md` (NEW) — OCI container packaging; multi-stage Dockerfile on `node:20-alpine`; no Vercel-specific APIs; long-lived Node process; `/healthz` + `/readyz` required; Phase-5 host capability list; Azure Container Apps / App Service / Fly.io / Render / Railway / self-hosted / App Runner eligible; Cloud Run eligible-with-SSE-caveat; Vercel-serverless / Workers-only / Lambda-only ineligible; preview-per-PR downgraded to nice-to-have.
  - `ADR-008-object-storage-abstraction.md` (NEW) — port-and-adapter `FileStorage` interface; Azurite dev adapter, memory test adapter, no prod adapter in Epic 001; `STORAGE_ADAPTER=cloud` without binding fails startup; default TTLs 5 min download / 15 min upload, hard cap 1 hour; encryption-at-rest as adapter-contract requirement; signing runs under adapter credentials after app-side RLS-scoped authorization passes.
  - `ADR-009-signed-url-file-access.md` (NEW) — authorize-then-sign pattern; storage key `engagements/{id}/documents/{id}/v{n}/{filename}` with folder structure held in DB not keys; two-phase upload with reconciliation cron; soft-delete semantics; `## Hard-Delete Policy (pending CLARIF-005)` carved out with proposed default (DB tombstone only, storage purged at 7-year sweep) awaiting user decision.
- Updated `docs/architecture/TENETS.md`: replaced tenet 7 with the approved wording (database is the trust boundary; app propagates identity; fail-closed on missing identity; admin principal is the documented bypass); updated `## Status` line to reflect the 2026-04-16 amendment.
- Appended this session entry to `docs/tasks/PROGRESS.md`. **`## Current initiative` unchanged** — Epic 001 Plan has not started (still blocked on CLARIF-004).

**Decisions captured (from the seven-point user walk-through, locked in for ADRs):**
1. SQL Server licensing — all options open; Developer edition in Docker for local dev; production engine deferred.
2. User PK = `UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()`; `User.clerkId` is a separate unique `NVARCHAR(64)` non-PK; all app FKs reference `User.id` (UUID).
3. Realtime via SSE for v1 with single-process scaling caveat documented; reconnect pulls fresh state. (Full realtime ADR deferred to Tier 2.)
4. Dev object storage = Azurite; prod storage deferred but Azure Blob is the gravity. Adapter interface keeps S3 / R2 / GCS on the table.
5. Docuseal = self-hosted prototype-stage; docker-compose gains a Postgres container for Docuseal's own DB when Epic 003 starts. (Docuseal ADR deferred.)
6. Preview-per-PR = nice-to-have, not a Phase-5 filter. Epic 001 CI stays lean.
7. Tenet 7 rewording approved as written above.
8. RA's `Thread` as explicit parent of `Message` accepted; to be captured as `// DECISION:` in Prisma schema during Epic 001, not promoted to an ADR.

**Deferred ADRs (not written in this invocation):**
- Realtime / SSE ADR — Tier 2, deferred. Will be written before Epic 005 (Messaging & Notifications).
- Cron / scheduled-jobs ADR — Tier 2, deferred. Written before Epic 004 (File exchange → overdue reminders) or Epic 005 (whichever lands first).
- Docuseal integration ADR — deferred to Epic 003 (Client onboarding) and gated on CLARIF-006 (self-hosted vs cloud — user confirmed self-hosted in walk-through, but implementation details still want a dedicated ADR before integration starts).
- Email / Resend ADR — deferred until email flows start landing (Phase 2–3).
- Production deploy ADR — deferred to Phase 5.

**Open clarifications still blocking downstream work:**
- **CLARIF-004** (portal name in client-facing text) — blocks Epic 001 Plan. User must answer before SA enters Plan.
- **CLARIF-005** (hard-delete vs 7-year retention conflict) — blocks Epic 008 and leaves an explicit "Hard-Delete Policy (pending CLARIF-005)" section in ADR-009 with a proposed default.
- CLARIF-001, CLARIF-002, CLARIF-003, CLARIF-006 remain open; each blocks the epic the RA assigned it to.

**End:** Tier-1 ADR batch complete. Nine ADRs exist in `docs/decisions/` (001-003 pre-existing from prior SA invocation; 004-009 written this invocation). Tenet 7 amended. PROGRESS.md `## Current initiative` preserved — Plan phase has not begun. Recommended main-session next steps: (a) update CLAUDE.md's tech-stack table and submission-gate notes to reflect the SQL Server / Clerk-only / deploy-agnostic stack, (b) invoke the RA to generalise SRS wording that still references Supabase (REQ-AUTH-003, REQ-FILE-003, REQ-MSG-012, REQ-NFR-001, REQ-NFR-004, § 4 NFR table), (c) resolve CLARIF-004 with the user so SA can enter Epic 001 Plan. SA ends invocation.

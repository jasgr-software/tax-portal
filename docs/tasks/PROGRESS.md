# Progress

> Single source of truth for current initiative state, quality gates, active bugs, and retro action items. The SA, RA, and SDET update this file at the start and end of every invocation. Structure contract: see `.claude/agent-stack.md` § PROGRESS.md structure contract.

## Current initiative

**Epic 001 — Foundation: Scaffold, Auth, DB, Routing & Deployment Pipeline**  
Branch: `ep-001-foundation-scaffold` (to be created by SA during Plan)  
Goal: Two working Next.js apps (`apps/portal` — Client Portal; `apps/admin` — Tax Portal) with Clerk auth (one Clerk app, per-app middleware, cross-app redirect matrix), SQL Server schema + Security Policy baseline, CI/CD pipeline (two OCI container images, two Playwright configs), and local dev environment. Auth shell only — no product features.  
Phase: Ready for SA → Plan  
Gated: Yes

_The RA has completed pre-Epic-001 cleanup. CLARIF-004 resolved. Personas and flows for Epic 001 scope are authored. SA may begin Plan phase._

> **All pre-Plan blockers cleared:**
> - CLARIF-004 resolved: "Client Portal" (`apps/portal`) and "Tax Portal" (`apps/admin`) — see REQ-IDNT-006.
> - Epic 001 ACs updated for two-app architecture (AC-001-001, AC-001-002, AC-001-003, AC-001-005, AC-001-006, AC-001-007, AC-001-008).
> - Flows `flow-first-sign-in` and `flow-role-redirect` authored and ready.
> - SA must reference these flows in all Epic 001 task specs (`**Affected flows:**` field).

## Awaiting PR merge

_None._

## Active bugs

_None._

## Open retro action items

- **2026-04-20 — Dispatch Checkpoint rule-sunset check** (owner: Overwatch). Evaluate at the Close-prep retro of the third post-merge epic. If no task has cited § Dispatch Checkpoint as the rule that enabled mid-execution recovery, surface the rule for keep/revise/retire decision per `.claude/agent-stack.md` § Rule Sunset. Rationale: the rule was imported prophylactically from the upstream sibling repo; no tax-portal incident was observed at port time, so it must earn its keep on this codebase.
- **2026-04-20 — Gate Authoring Rules hotfix-exception promotion check** (owner: Overwatch). At the first hotfix epic that invokes the § Gate Authoring Rules "Hotfix urgency" exception (gate lands as `advisory` pre-evidence), confirm the promotion-back-to-required step actually happens once the incident resolves. Track from the hotfix task's Work Log and the follow-up task that carries the three-item evidence. Rationale: the exception is easy to invoke and easy to leave hanging — the promotion step is where the gate earns its "required" status back, and it needs an explicit check the first time the path is exercised.
- **2026-04-20 — `docs/architecture/model-behavior-notes.md` rot check** (owners: Overwatch, RA, SDET). After the next two quad reviews complete, evaluate whether Lens B (model-behavior lens) produced any cited entries into the notes file. If zero citations across two reviews, decide: (a) seed the file with the three candidate entries identified during the port review (`spec-shaped-green`, `breadcrumb-skip`, `gate-counterfactual-plausibility`), or (b) retire the Lens B requirement from `.claude/agent-stack.md` § Main Session Rules and remove the notes file. Rationale: the stub file's own rule is "observed failures, not speculative ones" — leaving it empty indefinitely signals the Lens B process isn't working; seeding it speculatively contradicts its charter. Two quad reviews is the forcing function for keep/seed/retire.

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

### SA Two-Frontend Split ADR Batch (write phase, pre-Epic-001 cleanup) — 2026-04-16

**Start:** Fourth SA invocation on pre-Epic-001 work. User directed a structural architecture change: the single `apps/web` model is replaced by two front ends — `apps/portal` (Client Portal, client-facing) and `apps/admin` (Tax Portal, accountant-facing). Scope of this invocation is ADR revisions only; no Plan phase, no `docs/requirements/` edits (RA runs next), no `apps/` edits (nothing scaffolded yet). Read agent-stack.md, agent-phases.md, sa.md, CLAUDE.md, intake.md, SRS.md, ep-001-foundation-scaffold.md, and listed existing ADRs. TENETS.md and PROGRESS.md read for status-line/session-entry updates.

**Actions:**
- **Revised `docs/decisions/ADR-006-monorepo-layout.md`** — replaced single `apps/web` with `apps/portal` (Client Portal, port 3000) + `apps/admin` (Tax Portal, port 3001). Documented shared `packages/` shape (db, storage, emails, ui, eslint-config, tsconfig). Added `packages/ui` in v1 (shadcn primitives + layout shells; no business logic). Playwright strategy: two per-app configs against a shared docker-compose stack (rationale: scoped runs, different base URLs, different auth fixtures, different result artifacts; shared stack because cross-app flows — invitation landing, end-to-end accept→onboarding — require one DB state). Cross-app spec placement rule: spec lives in the app where the flow terminates. Server Actions vs API routes: per-app, no cross-app HTTP — coordination via DB + realtime. Turbo/Nx still deferred (two apps + 5 packages is trigger-threshold but not yet painful).
- **Revised `docs/decisions/ADR-001-authentication-clerk.md`** — picked **one Clerk application, two sign-in surfaces** over two Clerk applications. Rationale: cross-app invitation flow (accountant accepts → Clerk invitation → portal sign-up completion) is first-class with one Clerk app; user identity remains comparable across apps (one `clerkId` per user); webhook topology stays simple (one webhook, landing on `apps/portal/api/webhooks/clerk`); forward-compatible with Clerk Organizations for hypothetical v2 multi-firm SaaS. Role gates enforced in per-app middleware — CLIENT cannot render admin pages, ACCOUNTANT cannot render CLIENT-only portal pages, public portal routes remain reachable unauthenticated. Role storage unchanged (`publicMetadata.role`). Invitation email sender is Clerk (Resend not involved). Session spans both apps automatically when both apps are registered as Clerk allowed origins.
- **Revised `docs/decisions/ADR-007-container-packaging-deploy-agnostic.md`** — picked **two images, one per app** over single-image-with-two-entrypoints. Rationale: independent deploy cadence, independent blast radius, different scaling profiles, different ingress policies, per-image dep audit, per-image health probe granularity. Each app ships `apps/<app>/Dockerfile` with standard multi-stage Alpine build, per-image size target <300MB, independent `/healthz` + `/readyz` endpoints. Host capability list updated to require two workloads deployable independently — all prior candidates (ACA, App Service, Fly, Render, Railway, self-hosted, App Runner, Cloud Run-with-caveat) remain eligible. Vercel serverless, Workers-only, Lambda-only remain ineligible. Cron remains a separate (future) image.
- **Created `docs/decisions/ADR-010-cross-app-navigation-session-boundaries.md`** — covers: role-based landing redirect matrix (redirect-not-403 for misnavigation; 403 reserved for genuine permission errors); cross-app deep links (always absolute, target-app-specific; middleware handles auth/redirect); session sharing (one Clerk session covers both apps — local dev shares `localhost` cookie, production depends on domain structure); no shared in-app session storage; cross-app coordination via DB + realtime only (no app-to-app HTTP); webhook endpoints live on portal; middleware skeleton (illustrative) for both apps; mandatory Epic-001 e2e negative tests for cross-app behavior. Flagged production domain structure to user: three options (subdomains of one apex, path-based split, two apexes); recommended Option A (two subdomains of one apex, e.g., `portal.firmname.com` + `tax.firmname.com`) — cleanest Clerk cookie story, matches `REQ-IDNT-001`'s `portal.herfirm.com` reference.
- **Fixed Tenet 1** in `docs/architecture/TENETS.md` — replaced "Supabase Row-Level Security on every table with client-facing data" with "SQL Server Security Policies (row-level filter + block predicates) on every table with client-facing data — see ADR-005." Rest of tenet preserved.
- **Updated TENETS.md `## Status` line** — noted Tenet 1 amended 2026-04-16 and two-frontend architecture added 2026-04-16 with pointer to ADR-010 and per-app middleware role gates.
- **Appended this session entry** to `docs/tasks/PROGRESS.md`. `## Current initiative` preserved — Plan phase has not begun (still blocked on CLARIF-004 and on RA pass to generalise Supabase wording + backfill personas/flows for two-app architecture).

**ADR numbering:** 001, 006, 007 revised (superseded content replaced in place — revision dates noted in each ADR's header). 010 created as the next available number. 002, 003, 004, 005, 008, 009 unchanged by this invocation.

**Tenet 1 final wording (quoted):** "Security and data privacy are non-negotiable. This is a financial application handling tax documents, SSNs, and sensitive personal information. Every feature is designed assuming attacker presence. Encryption at rest (AES-256), signed URLs for file access, Clerk-enforced 2FA on the accountant account, and SQL Server Security Policies (row-level filter + block predicates) on every table with client-facing data — see ADR-005."

**Design choices made autonomously (documented in the ADRs above):**
1. App names: `apps/portal` + `apps/admin` (directory-neutral; user-facing brands "Client Portal" and "Tax Portal" decoupled from directory names).
2. Ports: 3000 (portal) + 3001 (admin). Portal on lower-number default because it's the public-facing first-hit surface.
3. Playwright: two per-app configs, shared docker-compose stack.
4. Server Actions vs API routes for cross-app: per-app Server Actions; no cross-app HTTP at all. Coordination through DB + realtime.
5. Session storage: no in-app session store; Clerk session is authoritative; cookies naturally span both apps when Clerk allowed-origins includes both.
6. `packages/ui`: yes in v1 — shadcn primitives + layout shells; no business logic.
7. Clerk topology: one Clerk application shared across both apps.
8. Container packaging: two images, one per app.
9. Webhook endpoint: lives on `apps/portal` (single public-facing ingress surface for webhook receipt).

**Flagged to user (not decided here):**
- **Production domain structure** — Option A (recommended): two subdomains of one apex (`portal.firmname.com` + `tax.firmname.com`). Option B: path-based split. Option C: two unrelated apexes. ADR-010 describes trade-offs; Clerk allowed-origins config and deploy-time ingress depend on the choice. No ADR will be written until the user picks.

**Architectural concerns surfaced mid-analysis but not resolved in the ADRs:**
- **Webhook handler placement long-term.** Currently lands on `apps/portal`. If production ingress policy ever restricts portal to public traffic and moves admin behind a VPN/allow-list, the webhook stays with the public app by construction — fine. If both apps ever end up behind ingress restrictions, webhook handler extraction into a dedicated service may be warranted. Not Epic 001's problem; noted in ADR-001 for revisit.
- **Shared role-gate helper package.** ADR-010 hand-waves between "shared helper in `packages/db`" vs "new `packages/auth`." Epic 001 Plan should pick one during task breakdown — recommend `packages/auth` since auth concerns are growing (middleware, role gates, invitation flow helpers). Not an ADR-level decision.
- **Cross-app e2e scaffolding.** AC-001-008 in ep-001 references a single-app Playwright setup. Acceptance criteria will need RA refresh to cover two apps' Playwright configs + cross-app session / deep-link specs. RA territory — noted for their pass.
- **Clerk `publicMetadata.role` writability.** Clerk's public metadata is writable only via backend API — good for role integrity. But the admin UI writing role through the backend must happen inside a server action; a developer accidentally calling a client-side helper would silently fail. A lint rule (in `packages/eslint-config`) or a wrapped helper in `packages/db`/`packages/auth` is worth considering. Epic 001 Plan decision.
- **Cron / scheduled jobs as a third image.** Flagged in ADR-007 but not formalised. When cron lands (Epic 004 or 005), the decision whether it's `apps/cron` (workspace app) or a thinner `scripts/run-cron` standalone image should be made then. Not Epic 001.
- **Env var enforcement for `PORTAL_APP_URL` / `ADMIN_APP_URL`.** Both apps need these to construct cross-app redirect URLs. Missing env at startup should fail the readyz probe, not silently render broken links. Epic 001 scaffolding task should include a startup check.

**Files modified this invocation:**
- `docs/decisions/ADR-001-authentication-clerk.md` — revised (Clerk topology: one app, two sign-in surfaces; role middleware gates; invitation flow; session spans both apps).
- `docs/decisions/ADR-006-monorepo-layout.md` — revised (two apps, `packages/ui` added, Playwright strategy, port assignments, app naming rationale).
- `docs/decisions/ADR-007-container-packaging-deploy-agnostic.md` — revised (two images, per-app Dockerfiles, per-app health endpoints, host capability list updated for two workloads).
- `docs/decisions/ADR-010-cross-app-navigation-session-boundaries.md` — created (redirect matrix, deep links, session sharing, middleware skeletons, production domain question flagged).
- `docs/architecture/TENETS.md` — Tenet 1 amended (Supabase RLS → SQL Server Security Policies); `## Status` line updated.
- `docs/tasks/PROGRESS.md` — this entry appended.

**End:** Two-frontend split ADR batch complete. Ten ADRs now exist in `docs/decisions/` (001 + 006 + 007 revised in place; 010 new). Tenets 1 and 7 both amended. PROGRESS.md `## Current initiative` preserved — Epic 001 Plan still pending RA follow-up pass (RA needs to generalise SRS wording for two-frontend architecture, backfill personas/flows that reference the single-app assumption, and refresh AC-001-008's Playwright scope) and user resolution of CLARIF-004 + production-domain-structure question. SA ends invocation.

### RA Pre-Epic-001 Cleanup — 2026-04-16

**Start:** Second RA invocation, same PR as the SA's two-frontend ADR batch. Scope: generalise SRS wording (Supabase/Vercel → tech-stack-agnostic), resolve CLARIF-004, incorporate two-front-end architecture into SRS, backfill personas and flows, refresh Epic 001 ACs, update release-roadmap.md, and append this session entry.

**Actions:**

- **SRS.md rewritten (version 1.0 → 1.1):**
  - Added Architecture Note section at top explaining two-front-end model with ADR-006 and ADR-010 cross-references.
  - REQ-AUTH-003: replaced "Supabase Row-Level Security (RLS)" → "SQL Server Security Policies (per ADR-005)".
  - REQ-AUTH-010: new requirement capturing the cross-app redirect rule (ADR-010 matrix).
  - REQ-DOOR-001–010: reworded to name `apps/portal` and `apps/admin` where behavior is surface-specific.
  - REQ-ONBD-003, REQ-DASH-001, REQ-DASH-004, REQ-DASH-010: added `apps/admin` surface refs.
  - REQ-FILE-003: replaced "Supabase Storage handles this" → "signed-URL object storage (per ADR-008 and ADR-009)".
  - REQ-MSG-012: replaced "Supabase Realtime (WebSocket)" → "real-time push (Server-Sent Events in v1; see ADR-002c when written)".
  - REQ-MSG-018: replaced "cron job" → "scheduled background jobs (per ADR-009-cron when written)".
  - REQ-IDNT-001: replaced "Configured via Vercel" → deploy-platform-deferred note (ADR-007).
  - REQ-IDNT-003: replaced "portal name TBD" with separate REQ-IDNT-003 (branding deferred) and updated REQ-IDNT-006 to carry the portal names.
  - REQ-IDNT-006 repurposed: was engagement-letter req (that content moved to REQ-IDNT-007); now carries "Client Portal" / "Tax Portal" names. CLARIF-004 resolved and removed from Open Clarifications table.
  - REQ-IDNT-007: new requirement for engagement letter template (content split from REQ-IDNT-006).
  - REQ-NFR-001: replaced "Supabase Row-Level Security" → "SQL Server Security Policies (per ADR-005)".
  - REQ-NFR-002: added "See ADR-009".
  - REQ-NFR-004: replaced entire Supabase/Vercel stack with current stack (SQL Server, ADR-006 two-app, ADR-007 container packaging, ADR-008/ADR-009 storage).
  - CLARIF-005: updated "Supabase Storage" → "object storage" in question text.
  - Total requirements reworded: 18 existing, 2 added (REQ-AUTH-010, REQ-IDNT-007), 1 repurposed (REQ-IDNT-006). REQ-IDNT-003 retitled (no longer "name TBD"). CLARIF-004 removed from open table.

- **Personas created (4):**
  - `docs/requirements/personas/jane-accountant.md` — solo accountant, primary ACCOUNTANT user, `apps/admin` daily surface.
  - `docs/requirements/personas/tom-prospective-client.md` — anonymous prospective client, public front-door path.
  - `docs/requirements/personas/sarah-returning-client.md` — returning CLIENT with existing account, re-engagement path.
  - `docs/requirements/personas/martha-and-james-married-couple.md` — multi-participant scenario, two CLIENTs one engagement.

- **Flows created (6):**
  - `docs/requirements/flows/flow-first-sign-in.md` — **foundational** (Epic 001). Invitation → CLIENT sign-up → portal landing. ACCOUNTANT direct sign-in → admin landing. Covers REQ-AUTH-001, REQ-AUTH-004, REQ-AUTH-005, REQ-AUTH-006, REQ-AUTH-009, REQ-AUTH-010, REQ-NFR-001, REQ-NFR-004.
  - `docs/requirements/flows/flow-role-redirect.md` — **foundational** (Epic 001). CLIENT → admin redirect; ACCOUNTANT → portal-private redirect. Covers REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-010, REQ-NFR-001, REQ-NFR-004.
  - `docs/requirements/flows/flow-engagement-request.md` — Phase 2 (Epic 002 scope). Anonymous + returning-client request submission, accept/decline, invitation email. Stub-level but complete.
  - `docs/requirements/flows/flow-onboarding.md` — Phase 3 (Epic 003 scope). Three-step gate: letter e-sign, questionnaire, doc upload → `In Progress`. Stub-level; CLARIF-006 dependency noted.
  - `docs/requirements/flows/flow-message-exchange.md` — Phase 4 (Epic 005 scope). Per-engagement and general thread messaging, notifications, email digest. Stub-level.
  - `docs/requirements/flows/flow-file-exchange.md` — Phase 4 (Epic 004 scope). Signed-URL upload/download, document requests, version history, soft-delete, overdue reminders. Stub-level.

- **Epic 001 (ep-001-foundation-scaffold.md) updated:**
  - Purpose section: rewritten for two-app architecture, references ADR-006 and ADR-010.
  - Requirements in scope: REQ-AUTH-003 updated (SQL Server Security Policies), REQ-AUTH-010 added, REQ-NFR-004 updated, REQ-IDNT-006 added.
  - AC-001-001: two Next.js apps (`apps/portal` port 3000, `apps/admin` port 3001), not one. `packages/` structure. Browser tab titles per REQ-IDNT-006.
  - AC-001-002: both apps, one Clerk application. `PORTAL_APP_URL`/`ADMIN_APP_URL` env vars. `apps/admin` no sign-up route.
  - AC-001-003: per-app middleware (portal + admin), cross-app redirect matrix per ADR-010. Shared role-gate helper.
  - AC-001-004: SQL Server `UNIQUEIDENTIFIER` PKs per ADR-002. Webhook handler on `apps/portal/api/webhooks/clerk`. `Thread` model `// DECISION:` comment.
  - AC-001-005: "Supabase RLS baseline" → "SQL Server Security Policy baseline". `db/policies/` Track B. Integration test per-policy.
  - AC-001-006: docker-compose brings up both apps + SQL Server + Azurite. `.env.example` includes `PORTAL_APP_URL`/`ADMIN_APP_URL`.
  - AC-001-007: Vercel removed. CI builds two OCI container images. Size check per image.
  - AC-001-008: two Playwright configs (one per app). Cross-app negative tests, session continuity spec, sign-out spec. All ADR-010 § E2e tests mandatory. Per-app result artifacts.
  - AC-001-009: operations docs updated for two apps, two ingress points, two-image deploy pattern.
  - `**Affected flows:**` fields added to all ACs that touch user-facing behavior.
  - Notes for SA updated.

- **release-roadmap.md updated (version 1.0 → 1.1):**
  - Phase 1 goal: rewritten for two-app scaffolding + ADR-006/ADR-010 cross-refs.
  - ep-001 notes: "scaffolds both `apps/portal` + `apps/admin`".
  - Phase 1 gate: "both apps' e2e suites green, cross-app redirect specs pass".
  - Phases 2–5 goals: updated to name `apps/portal` and `apps/admin` where relevant.
  - Phase 5: mentions two OCI images and production deploy ADR to be written.
  - Open Clarifications table: added Status column. CLARIF-004 marked Resolved 2026-04-16.

- **PROGRESS.md `## Current initiative` updated:** goal rewritten for two-app architecture. CLARIF-004 blocker removed. Pre-Plan blockers cleared note added.

**CLARIF-004 resolution:** Portal names confirmed as: "Client Portal" (browser tab titles, page headers, email subjects in `apps/portal`) and "Tax Portal" (browser tab titles, page headers in `apps/admin`). REQ-IDNT-006 updated. Removed from SRS § Open Clarifications. Removed from release-roadmap.md as a blocker. PROGRESS.md current-initiative blocker removed.

**Flow changes this session:**
- `flow-first-sign-in` — created. Steps for CLIENT invitation path and ACCOUNTANT direct sign-in path. Branches: expired invitation, MFA failure, unauthenticated private route. Postconditions: `User` row created, session active, correct app surface rendered.
- `flow-role-redirect` — created. Scenarios A (CLIENT → admin → portal redirect) and B (ACCOUNTANT → portal-private → admin redirect). Branch B1: ACCOUNTANT on public portal routes — served, no redirect.
- `flow-engagement-request` — created (Phase 2 stub). Full anonymous + returning-client + accountant-initiated paths. Accept and Decline branches.
- `flow-onboarding` — created (Phase 3 stub). Three-step gate, multi-participant branch, Docuseal webhook failure branch.
- `flow-message-exchange` — created (Phase 4 stub). Engagement + general threads, notifications, email digest.
- `flow-file-exchange` — created (Phase 4 stub). Authorize-then-sign pattern, version history, soft-delete, overdue reminders.

**Remaining open clarifications (unchanged by this pass):**
- CLARIF-001 — decline message portal retention (blocks Epic 002)
- CLARIF-002 — client-facing status label mapping (blocks Epic 006)
- CLARIF-003 — duplicate engagement handling (blocks Epic 006)
- CLARIF-005 — hard delete vs 7-year retention conflict (blocks Epic 008)
- CLARIF-006 — Docuseal self-hosted or cloud (blocks Epic 003)

**End:** Pre-Epic-001 cleanup complete. SRS generalised, CLARIF-004 resolved, four personas authored, six flows authored (two foundational for Epic 001, four phase-2+ stubs), Epic 001 ACs updated for two-app architecture, release-roadmap.md updated, PROGRESS.md current initiative refreshed. SA is unblocked to begin Epic 001 Plan phase. RA ends invocation.

### Main Session Chore — Port j4j agent-stack hardening (round 2) — 2026-04-26

**Start:** Branch `chore/port-j4j-agent-stack-hardening`. The first round (commit c6edafd, PR #4) brought the Opus 4.7 hardening + metrics + Two-lens quad review + Gate Authoring Rules + Dispatch Checkpoint + `Introduces-gate` field. This round audits the journey-for-jasmine commits between that baseline and j4j HEAD, ports the non-board items, and runs quad review.

**Audited j4j commits:** dd9cca1, 1672017, bc82394, f0765b8, c10a174, 1e2c20a (already in baseline), caefd8d (already in baseline). Board-related items skipped per user direction (`/board-*` skills, `board-config.json`, observations-as-Issues, `Issue:` field on epics, `[EPIC] ` Issue prefix, board-sync blocks at Plan/Close-prep, `Closes #<task-issue>` PR-body rule, RA-owned roadmap routing — RA already owns the roadmap in this project, but the at-Close-finalize phase change is moot until `docs/plans/release-roadmap.md` exists).

**Ported (5 items):**
- **dd9cca1 — harness agent registration** — created `.claude/agents/` with 8 symlinks (`developer`, `overwatch`, `pd-draft`, `pd-interview`, `pd-review`, `ra`, `sa`, `sdet` → `../../agents/<name>.md`). `agents/*.md` remains the single source of truth; symlinks let the harness auto-discover so `subagent_type: "ra"` etc. resolve without the `general-purpose` indirection. Takes effect on next session restart.
- **c10a174 — portal+admin = one platform** — added `### Platform-frontend scope` section to `CLAUDE.md` (after Agent Team table, before Domain-specific notes); added Plan-phase cross-surface scoping rule + spawn-prompt-inline rule for `[webapp-developer]` to `agents/sa.md`; added cross-surface audit reject criterion to `agents/sdet.md` review process and Quality Parity Audit preamble. Adapted from j4j's `apps/web` + `apps/admin` to tax-portal's `apps/portal` + `apps/admin` (per ADR-006). Sunset trigger preserved (3 consecutive Close-prep retros with zero parity findings → keep/remove review).
- **f0765b8 — `/run-tests` skill** — `.claude/commands/run-tests.md`. Canonical test-invocation pattern that avoids Monitor token waste and matches the existing `Bash(pnpm:*)` allowlist. Adapted from j4j (dropped .NET section, kept portal/admin/cross-app/CI shapes).
- **f0765b8 — `/mirror-audit` skill** — `.claude/commands/mirror-audit.md`. Mechanical cross-surface drift check across `apps/portal` + `apps/admin`. Pairs with the c10a174 SDET reject criterion. Adapted (s/web/portal/, project-specific examples for "intrinsically single-surface").
- **bc82394 (non-board portion) — `/memory-audit` skill** — `.claude/commands/memory-audit.md`. Project-agnostic memory-staleness audit. Adapted (slug → `-home-jasgr-repos-tax-portal`).

**Skipped:**
- `agents/devops.md` (1e2c20a + 6a11381) — j4j version assumes Bicep + Azure infra; tax-portal is Docker Compose + GitHub Actions with prod deploy deferred (ADR-007). Revisit when production platform lands.
- `/pre-deploy` skill (f0765b8) — guards staging deploys; tax-portal has no staging pipeline. Revisit when staging exists.
- bc82394 phases.md change (Close-finalize roadmap update routes through RA) — moot until `docs/plans/release-roadmap.md` exists; RA already owns it per `agents/ra.md` Constraints.
- All board-related skills, config, and prompt additions per user direction.

**Quad review (per `.claude/agent-stack.md` § Agent workflow file changes — two-lens pass):**
- **SA: approve-with-tweaks** — no blocking; advisory findings on rule-duplication between agent-stack.md and the threaded enforcement points (RA + SDET + SA hooks for Gate Authoring Rules), and pre-existing `§ Bug Workstream Quality Gates` dead pointer at `agents/sdet.md:55` (out of scope for this branch).
- **RA: approve-with-tweaks** — flagged grandfathering for `Introduces-gate` at epic close (`agents/ra.md:177`). Demoted to advisory for tax-portal — `docs/tasks/done/` is empty (pre-Epic-001), so no rejection precondition exists. Vocabulary alignment with SRS confirmed (`apps/portal`/`apps/admin` matches REQ-IDNT-006). No board-coupling wording leaked in (`observations.md` references unchanged).
- **SDET: approve-with-tweaks (3 BLOCKING applied)** — (1) Dispatch Checkpoint enforcement was not wired into `agents/sdet.md` § Review Process step 2 — added a step-2 mandatory rejection bullet citing § Dispatch Checkpoint. (2) `Introduces-gate` missing-field rejection lived only in step 3 alongside the value-`yes` content check — added a step-2 mandatory bullet covering all three required task-spec fields (`Affected flows`, `Affected requirements`, `Introduces-gate`); refined step 3's Gate Authoring evidence bullet to defer missing-field rejection to step 2. (3) Gate Authoring evidence verification didn't require SDET to actually open + verify the cited log line in the local-CI case — refined the bullet to require `Read`-and-confirm of the cited line, closing the "valid run, wrong step" loophole.
- **Overwatch: approve** — no blocking; advisory findings on cross-surface sunset-trigger ownership (Overwatch needs an explicit per-retro counter for parity findings — future `agents/overwatch.md` Category 6 edit, not in scope here) and the model-behavior-notes stub starvation (already tracked under the existing retro action item dated 2026-04-20).

**Files changed:**
- `.claude/agents/{developer,overwatch,pd-draft,pd-interview,pd-review,ra,sa,sdet}.md` — new symlinks
- `.claude/commands/{run-tests,mirror-audit,memory-audit}.md` — new skill files
- `CLAUDE.md` — `### Platform-frontend scope` section added
- `agents/sa.md` — Plan-phase cross-surface scoping; webapp-developer spawn-prompt inline
- `agents/sdet.md` — Cross-surface audit reject criterion; Quality Parity Audit preamble; 2 step-2 mandatory rejections (Dispatch Checkpoint, required-fields-missing); refined step-3 Gate Authoring evidence bullet
- `docs/tasks/PROGRESS.md` — this entry

**Followup queue (already in `## Open retro action items` above):**
- The three 2026-04-20 entries (Dispatch Checkpoint rule-sunset, Gate Authoring hotfix-exception promotion, model-behavior-notes rot check) cover the advisory findings from this round's quad review. No new retro items added.

**End:** Round-2 port complete. Branch ready for PR. `## Current initiative` (Epic 001) preserved — chore did not touch Epic 001 work. Main session ends invocation.

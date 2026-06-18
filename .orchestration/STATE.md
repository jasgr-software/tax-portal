# Conductor State — run ledger

> **Single source of truth for a Conductor run** (the analog of the engine's
> `.implementation/tasks/PROGRESS.md`). The Conductor reads this first on every `/orchestrate` and updates it
> at every phase transition. A fresh run with a mid-flight `## Current run` **resumes** at the recorded
> phase rather than re-selecting. See `ENGINE.md` § State-ledger contract.

## Current run

### EPIC-005 — BRIEF-005 (onboarding spine + engagement-letter e-sign gate) — started 2026-06-18
- **Phase:** **Implement — in progress** (engine mid-Dispatch). Select ✓ → Gate ✓ (GO 7/7) → Compose ✓ →
  Implement: IO Plan ✓ (8 tasks decomposed; Data-&-Interface-Contract expanded; design-coherence PASS; branch
  `brief-005-onboarding-spine-engagement-letter` created) → Dispatch **7/8 done + committed (all 7 GATED tasks done)**:
  - **TASK-005-001** ✓ (schema `Engagement`+`LetterTemplate` + the **first client-owned-rows policy**
    `sec.pol_Engagement`; 65 tier-3 incl. 6 isolation) — SDET-approved, commit `1d64d8b`.
  - **TASK-005-002** ✓ (`packages/esign` `ESignatureProvider` seam — fail-closed selector, mock binding; 24
    unit) — SDET-approved, commit `5dac228`.
  - **TASK-005-003** ✓ (create `Engagement` on accept, additive in the EPIC-003 audit txn; DECISION-A back-fill
    fail-closed seam; +8 tier-3) — SDET-approved, commit `53f62a5`.
  - **TASK-005-004** ✓ (admin letter-template setting — page + actions + editor; consumes the delivered
    admin-pool repo as-is; accountant-guarded; XSS-safe; +23 tier-2/-5, admin suite 142) — SDET-approved,
    commit `4dec137`.
  - **TASK-005-005** ✓ (**the core gate** — onboarding read model + server-side step-accessibility gate +
    the real letter-sign action: `recordLetterSignatureAsClient` = the first **request-pool BLOCK-governed**
    client write, proven owner-only at tier-3 (own=1, cross-client=0, null=0); signs through the
    `ESignatureProvider` port; fail-closed two-pool ordering (no audit on a non-event); template snapshot at
    sign time; +23 portal/+19 tier-3, 63 portal / 92 db) — SDET-approved, commit `d637418`.
  - **TASK-005-006** ✓ (portal onboarding sequence UI — renders the -005 read model, server-authoritative gate
    reflected only / no client-side gate logic, no client-supplied id via new FILTER-governed `getMyEngagement()`,
    XSS-safe; +27 tier-5, portal 90) — SDET-approved, commit `d9d6dcf`.
  - **TASK-005-007** ✓ (**the e2e gate** — binds the epic's 10 gherkin scenarios verbatim; sign→unlock +
    cross-app admin-edit→client-sees-edited flows green on the full docker-compose stack; honest owning-client
    fixture via the request-pool FILTER; rewired `e2e:cross-app`. SDET independent re-run: portal 33 / admin 32
    / cross-app 10 / sign→unlock 3× zero-flake) — SDET-approved, commit `7868303`.
  - **Remaining 1 (non-gating):** **TASK-005-008** (@demo gallery — `docs/demos/EPIC-005/`; non-gating per
    DEMO-POLICY). Then engine **Audit → design-scan → Smoke → Validate → Close-prep** (→ `## Awaiting PR merge`
    + PR opened) → Conductor **Review (`/pr-review`) → Fix → Merge → Validate write-back (`/planning`)**.
  - **Carry to Close-prep (SDET note-only from -005):** correct the misleading "parameterised inputs" comment
    at `packages/db/src/repositories/engagement.ts` ~L433 (the signing UPDATE string-interpolates
    server-derived + FILTER/BLOCK-guarded values, single-quote-escaped — sound, but the comment is wrong).
    None of -008 touches `engagement.ts`, so this is an **ungated/retro follow-up** for the IO at Close-prep
    (or a dedicated micro-fix), not a blocker.
- **Checkpoint (2026-06-18, fifth session boundary — NOT an inner stop):** **all 7 GATED tasks are done +
  committed** (every correctness/security-bearing task delivered + independently SDET-verified, incl. the e2e
  gate on the real container stack). Only the non-gating @demo (-008) + the packaging cascade remain. The
  engine is healthy mid-Dispatch; no guardrail fired. Branch has 13 commits (`59a33cb` plan;
  `1d64d8b`/`5dac228`/`53f62a5`/`4dec137`/`d637418`/`d9d6dcf`/`7868303` tasks; `1390075`/`09d2b0f`/`048c6c0`/`38b5f0e`
  ledgers + this one); tree clean; PR not yet opened (engine opens it at Close-prep). **Resume:** re-invoke
  `/orchestrate EPIC-005` → resumes at Implement; the IO reads PROGRESS.md and continues at **TASK-005-008**,
  then runs the Audit→Smoke→Validate→Close-prep cascade. All slice state is durable in PROGRESS.md + the task
  files + the commits.
- **Slice:** Phase-2 opener. A newly accepted client signs in to `apps/portal`, sees the three-step onboarding
  sequence for their engagement, and e-signs the engagement letter — the hard gate that unlocks the later
  steps. Introduces the **minimal `Engagement`** substrate (created on accept, status `New`) and the **first
  client-owned rows** + their ADR-005 isolation policy. E-sign is **mocked** behind the ADR-023/024 seam.
- **In-scope AC (10):** AC-ONBD-001-01/-02/-03, AC-ONBD-002-01/-02/-03/-04, AC-IDNT-007-01/-02/-03.
- **Base branch:** main @ `ad35123` · **Feature branch:** _(engine-created at Plan; no `*005*` branch yet)_
- **PR:** _(none yet — engine opens at Dispatch/Close-prep)_
- **Select — GO.** Fresh run (EPIC-003 delivered; Phase 1 complete; no mid-flight run). EPIC-005 pinned via
  `/orchestrate EPIC-005`; it is the next ready Phase-2 epic (no Phase-2 dep).
- **Gate — GO on all 7 criteria.** Mechanical 1–4,7 + engine-clear 6 evaluated by
  `bin/orchestrate-gates.sh` (both gates `RESULT: all evaluated gates PASS`, exit 0; run_id
  `EPIC-005-20260618T122334Z`): (1) `status: planned` ✓ (2) `open_questions: []` ✓ (3) `depends_on:
  [EPIC-003, EPIC-004]` both delivered ✓ (4) COVERAGE has the 10 EPIC-005 rows ✓ (7) tree clean on `main`, no
  `*005*` branch ✓ (6) engine clear — `## Awaiting PR merge` empty, no active bugs ✓. **Criterion 5 (semantic,
  Conductor-owned):** all 10 AC resolve **verbatim** to the cited REQ sources (AC-ONBD-001-* → REQ-ONBD-001;
  AC-ONBD-002-* → REQ-ONBD-002; AC-IDNT-007-* → REQ-IDNT-007 — all `status: accepted`, observable/testable),
  and all 10 have gherkin scenarios in the epic ✓.
- **Compose — DONE.** Wrote `.implementation/briefs/BRIEF-005-onboarding-spine-engagement-letter.md`: 10 AC
  (verbatim) + gherkin bound to the epic's scenarios; methodology gherkin / e2e-required (`apps/portal` +
  `apps/admin`); extra_gates = **client-data isolation (ADR-005, HARD tier-3 — first client-owned rows)**,
  server-side gate enforcement (tier-3), signed-letter evidence recorded + audited (ADR-019/024), **e-sign
  provider seam mock-first + fail-closed (ADR-023/024)**, SESSION_CONTEXT on client reads/writes + accountant
  template write (ADR-003), cross-surface (portal + admin), container smoke. demo: yes · apps [portal, admin] ·
  personas [tom-prospective-client, jane-accountant] · flows [flow-onboarding, flow-first-sign-in].
  **First brief to carry a `## Data & Interface Contract`** (source-traced `Engagement`/onboarding-state/
  letter-template/signature-evidence entities + `New`/`In Progress` status + `unsigned→signed` letter
  transition + `ESignatureProvider` port; field-level expansion left to IO Design per the altitude rule).
- **Compose carries (concrete obligations from sources + live repo state):**
  - **New `Engagement` substrate** — created on **acceptance** by **extending the delivered EPIC-003
    `acceptRequest` flow** (`apps/admin/src/app/requests/actions.ts`); status `New`; linked 1:1 to the accepted
    `EngagementRequest` and to the client `User`. **First client-owned row.**
  - **First client-isolation security policy (ADR-005)** — new `sec` predicate + FILTER/BLOCK policy joining
    row ownership to `SESSION_CONTEXT('clerk_user_id')`; reuse the `db/policies/0004-notification-policy.sql`
    "future client-ownership join" comment as the seam shape. **Mandatory tier-3 CLIENT-A-cannot-read-CLIENT-B
    test** (anonymous reads ZERO; ACCOUNTANT can).
  - **E-sign `ESignatureProvider` seam** — port + `bindings/mock.ts` (deterministic "signed") + fail-closed
    `select.ts` (`ALLOW_MOCK_ESIGN`); onboarding depends on the port, never Docuseal. Real Docuseal = deferred
    enablement slice (ADR-024 §5). ONBD-002 AC verified against the mock.
  - **Cross-surface seam:** onboarding in `apps/portal`; letter-template editing in `apps/admin` — validate
    both per CLAUDE.md § Platform-frontend scope.
  - **Reuse** `packages/db` `withRequestContext` + `$extends` SET (ADR-003 Amendment 1: no `@read_only`); the
    audit seam `recordAuthEvent`/`withAuditTransaction` (ADR-019); `packages/auth` client identity/role gate.
- **Plan-phase note for the IO:** the e-sign seam is governed (ADR-023 + ADR-024 both Accepted) — **no
  architecture consult needed** to dispatch (contrast EPIC-003's email-ADR gap). Ship the mock binding only.

<!-- ARCHIVED — EPIC-003 run DELIVERED 2026-06-17 (PR #42 → ec151cb). Superseded as the active run by EPIC-005
     above. Detail retained below + in Outcome/History, PROGRESS-ARCHIVE.md. -->

### EPIC-003 — BRIEF-003 (accountant request inbox) — started 2026-06-17 — ✅ DELIVERED 2026-06-17
- **Phase:** **DELIVERED.** Select ✓ → Gate ✓ (GO 7/7) → Compose ✓ → Implement ✓ → Review ✓ (`/pr-review 42`
  advisory APPROVE; 0 blocker/major; 6 minor + 2 nit) → Fix ✓ (`/pr-fix 42`: 6 fixed, 3 dispositioned, threads
  resolved, `715f7f8`) → **Merge ✓** (PR #42 squash → `main` `ec151cb`, Lane B, no protection toggle) →
  Close-finalize ✓ (gate 8 post-merge CI green; gate 9 N/A) → Validate write-back ✓ (`/planning`: 20 COVERAGE
  rows verified 31→51; EPIC-003 rolled `delivered`; ROADMAP Phase-1-complete entry) → Report.
- **Outcome:** **20/20 in-scope AC verified.** 🎉 **Phase 1 (MVP front-door spine) COMPLETE** — EPIC-001/004/002/
  003 all delivered, 51/51 placed Phase-1 AC verified. Net-new platform capabilities: first transactional-email
  seam (`packages/email`) + first in-portal notification (`Notification` + `sec.pol_Notification`). Panel: 0
  blocker/major; 6 minors fixed. BUG-003-001 resolved the carried RETRO-002 RATE_LIMIT gap. **OQ-002**
  (email-transport ADR) raised-upstream to `.architecture/` — architecture to ratify/author. **Next:** Phase 2
  (onboarding gate) is **undecomposed** — author its epics via `/planning` before the next `/orchestrate`; the
  deferred "2FA enablement" Phase-1 slice (4 AC) also remains. Docs-lane close-out: `chore/epic-003-close`.
- **Panel minors (fix candidates):** dead `createNotification`+types+barrel (over-eng, high); `stripHeaderInjection`
  strip-vs-throw doc/code contradiction (corr+over-eng); write-only `_sentMessages` store (over-eng, high);
  shared accept/decline rate-limit key (security+corr); SMTP `rejectUnauthorized:false` unconditional (security);
  `ticket!` non-null assertion (corr). Nits: `EMAIL_PROVIDER.toLowerCase()`, Resend `void apiKey`. Folded
  (disposition): pre-existing mock-auth `ALLOW_MOCK_AUTH` default; unlogged email-suppression; `markNotificationRead` no-rate-limit (single-accountant model).
- **(prior) Phase:** Review — see above.
  (engine drove 7 tasks + BUG-003-001 through Dispatch→Audit→Review→Smoke→Validate→Close-prep; **PR #42** opened,
  slice in `## Awaiting PR merge`, pre-merge gates 1–7 GREEN incl. CI run `27696675400`). → Review → Fix →
  Merge/Finalize → Validate(write-back) → Report.
- **PR:** **#42** — https://github.com/jasgr-software/tax-portal/pull/42 (OPEN; base `main`; feature branch
  `brief-003-accountant-request-inbox`). Commits: TASK-003-001 `221dcce`, -002 `ecc816d`, -003 `08d7ea4`,
  -004 `f2fb779`, -005 `e7e791f`, -006/BUG-001 `08e6d46`, -007 `90907fe`, Close-prep `b32d53d`.
- **Engine result:** **20/20 in-scope AC** acceptance-validated (tier-2/3/6); container smoke PASS; e2e 30/30
  3× zero-flake; required CI green. Net-new: `packages/email` seam (first email) + `Notification` entity +
  accountant-only `sec.pol_Notification`. OQ-002 (email-transport ADR) raised-upstream. BUG-003-001 resolved a
  carried RETRO-002 RATE_LIMIT gap. Docs-lane held: `docs/demos/EPIC-003/` (7 PNGs) + COVERAGE sign-off.
- **Slice:** the accountant is notified of a new engagement request, reviews it, and either **accepts** it
  (issuing the prospect an account invitation via the `packages/auth` mock seam, tied to the request) or
  **declines** it (writing a reason that is emailed to the prospect and retained on the request). Closes the
  front-door loop opened by EPIC-001.
- **In-scope AC (20):** AC-DOOR-005-01/-02/-03, AC-DOOR-006-01/-02/-03/-04/-05, AC-DOOR-007-01/-02/-03/-04,
  AC-DOOR-008-01/-02/-03/-04, AC-DASH-011-01/-02/-03, AC-MSG-013-01.
- **Base branch:** main @ `cf94c7e` · **Feature branch:** _(engine-created at Plan; planned name free — no `*003*` branch)_
- **PR:** _(none yet — engine opens at Dispatch/Close-prep)_
- **Select — GO.** Fresh run (EPIC-002 delivered; no mid-flight run). EPIC-003 pinned via `/orchestrate 003`;
  it is also the only remaining Phase-1 epic (`planned`, unblocked).
- **Gate — GO on all 7 criteria:** (1) `status: planned` ✓ (2) `open_questions: []` ✓ (3) `depends_on:
  [EPIC-001, EPIC-004]` both delivered ✓ (4) COVERAGE has 20 EPIC-003 rows, all `planned` ✓ (5) all 20 AC
  resolve verbatim to REQ-DOOR-005/-006/-007/-008 + REQ-DASH-011 + REQ-MSG-013 ✓ (6) engine clear — `##
  Awaiting PR merge` _Empty_, no active bugs ✓ (7) tree clean on `main`, no `*003*` branch ✓ (`env.local.tmp`
  deleted this session — root is clean).
- **Compose — DONE.** Wrote `.implementation/briefs/BRIEF-003-accountant-request-inbox.md`: 20 AC (verbatim) +
  gherkin bound to the epic's scenarios; methodology gherkin / e2e-required (`apps/admin`); extra_gates =
  accountant-only READ boundary on engagement_request + the new notification entity (ADR-005, HARD tier-3),
  decide-exactly-once invariant, Mailhog email-send verification, invitation tied to request (reuse
  `createInvitation` seam), audit on accept/decline (ADR-019), email rate-limit (ADR-022), SESSION_CONTEXT
  (ADR-003), container smoke. demo: yes · apps [admin] · personas [jane-accountant, tom-prospective-client] ·
  flows [flow-engagement-request, flow-first-sign-in].
- **Compose carries (concrete obligations from sources + live repo state):**
  - **First email-sending slice + first notification slice** — both net-new. **No email infra and no email ADR
    exist.** Brief mandates a provider-abstracted email seam (mirror the EPIC-004 auth-provider seam): a
    `send(...)` port bound to the **Mailhog** catcher already in `docker-compose` (SMTP `:1025`, UI `:8025`)
    for local+e2e; production provider a deferred drop-in (REQ-NFR-008 names no provider). **Plan-phase: IO
    should consult the architecture agent — an email-transport ADR may be warranted** (analogous to ADR-001 /
    ADR-008). Surfaced, not invented.
  - **Reuse the existing `EngagementRequest` entity** (EPIC-001) — its `status` field already reserves
    `accepted`/`declined` ("EPIC-003 adds this transition"). Add `declineReason` + the request↔invitation link
    (AC-DOOR-007-04). Add a **new accountant-scoped `Notification` entity** with an ADR-005 read policy.
  - **Reuse `packages/auth` `createInvitation(email,'CLIENT')`** (EPIC-004 mock seam) for acceptance; the
    `RateLimiter` + audit-ledger seams (EPIC-004) for ADR-022 / ADR-019; the `packages/db` request-scoped
    wrapper + `sec` predicate pattern (EPIC-001/002) for SESSION_CONTEXT + the read boundary. Honor **ADR-003
    Amendment 1** (no `@read_only` on the SET).
  - **Cross-surface seam:** the notification is *generated* on the EPIC-001 **portal** submit path (anonymous
    insert under the admin pool) but *consumed* on the **admin** surface — slice touches both; validate both
    surfaces per CLAUDE.md § Platform-frontend scope.
  - Inbox + decision actions live in **`apps/admin` only** (ADR-006); the invitation email links to the client
    surface (`apps/portal`) for sign-up (ADR-010).
- **Carried infra follow-ups (may resurface at Smoke; not slice-blocking):** clean-volume DB bootstrap (`sa`-once
  login creation, Prisma port-in-authority, `!`-free logins, `migrate deploy` P3019), `sqlserver` healthcheck SA
  mismatch, `sp_set_session_context` CI grep-guard; user-walled EPIC-004 `RATE_LIMIT_*` `.env.example` vars.

---

<!-- ARCHIVED — EPIC-002 run DELIVERED 2026-06-16 (PR #40 → 70ea10e). Superseded as the active run by EPIC-003
     above. Detail retained below + in Outcome/History, PROGRESS-ARCHIVE.md, RETRO-002.md. -->

### EPIC-002 — BRIEF-002 (services catalog management) — started 2026-06-16 — ✅ DELIVERED 2026-06-16
- **Phase:** **DELIVERED** — full cascade complete: Implement → Audit (0 blocking) → Review (PASS) → Smoke
  (UI PASS / Infra cond-pass) → Validate (gates 6+7 GREEN; surfaced+fixed BUG-002-004) → Close-prep → Conductor
  Review (`/pr-review 40`: 1 major + 5 minor + 1 nit) → Fix (`/pr-fix 40`: major + determined minors fixed; 2
  judgment-call minors dispositioned) → **Merge (PR #40 squash → `main` @ `70ea10e`, Lane B, no protection
  toggle; user-approved merge)** → Close-finalize (gate 8 post-merge CI ✅; gate 9 N/A) → Validate write-back
  (`/planning`: 7 COVERAGE rows verified 24→31; EPIC-002 rolled delivered in ROADMAP) → docs-lane close-out.
- **Outcome:** **7/7 in-scope AC verified** (AC-DOOR-002-01/-02/-03/-05 + AC-DASH-010-01/-02/-03); evidence
  basis [A] CI. **4 latent EPIC-001/004 defects fixed** (BUG-002-001 auth guard, BUG-002-002 Prisma musl engine,
  BUG-002-003 SESSION_CONTEXT `@read_only` vs pooling → **ADR-003 Amendment 1**, BUG-002-004 stale portal test).
  Panel major (fail-open `ALLOW_MOCK_AUTH` default) fixed. **Next-ready: EPIC-003** (only remaining Phase-1 epic;
  EPIC-001/004/002 all delivered). Carried follow-ups: infra DB-bootstrap + `sqlserver` healthcheck mismatch;
  `sp_set_session_context` CI grep-guard; EPIC-001 `fn_service_access` CLIENT read-branch tightening; `service.rls`
  comment-drift; user-walled RATE_LIMIT `.env.example` vars; delete `env.local.tmp` after this PR.
- **(historical) Phase:** Implement → **ALL DISPATCH DONE** → next = IO post-dispatch cascade (**Audit → Review → Smoke →
  Validate → Close-prep**), then Conductor (**/pr-review → fix → merge → /planning validate → report**).
- **★ RESUME SNAPSHOT (2026-06-16, authoritative — read this first on resume):**
  - **Branch `brief-002-services-catalog-management`** (NOT merged; PR not yet opened — engine opens it at
    Close-prep). Base `main` @ `c87b5bd`. Commits: TASK-002-001 `c500053`, -002 `77b91d7`, -003 `55a9caf`,
    BUG-002-001 `fc32fdd`, BUG-002-002 `c83bd90`, BUG-002-003 `550a556`, TASK-002-004 `a7e0ab0`, TASK-002-005
    `f8f5405`. All 5 tasks + 3 bugs **done, SDET-approved, committed**.
  - **All 7 in-scope AC covered + verified:** tier-3 write-boundary (001, service.rls 10/10) + persistence (002,
    39/41) + admin UI (003, 41 admin tests) + **e2e 17/17 × 3 zero-flake against the real container stack (004)**
    + @demo gallery 4 distinct shots (005).
  - **4 latent EPIC-001/004 defects fixed this slice** (all hidden by the previously env-blocked container smoke;
    EPIC-002 is the first slice to run the request-scoped Prisma path in a container — PROMINENT RETRO ITEM):
    BUG-002-001 auth guard NODE_ENV→ALLOW_MOCK_AUTH; BUG-002-002 Prisma Alpine OpenSSL-3 engine (3-layer);
    BUG-002-003 SESSION_CONTEXT `@read_only` vs pooling → **ADR-003 §3 Amendment 1** (architecture-ratified via
    consult; OQ-001 resolved).
  - **Local stack state:** containers `tax-portal-{admin,portal,sqlserver,azurite,mailhog}` UP + healthy with all
    fixes; **admin host-mapped 13001→3001** (use `ADMIN_BASE_URL=http://localhost:13001`; `journey-for-jasmine-db-1`
    squats host 1433 so SQL is on 14330 / port-in-authority). DB fully bootstrapped (schema via `prisma db push`;
    principals incl. `taxportal_user`; all `sec` policies incl. `fn_service_write_access`). `taxportal_admin` is
    app_admin_role+db_owner (NOT sysadmin — do not re-grant; it breaks the RLS admin bypass).
  - **USER-PENDING items (none block the cascade; flag at report):** (1) `.env.local` has `ADMIN_PORT=3001` from
    `env.local.tmp` but this host needs **13001** — set `ADMIN_PORT=13001` + `ADMIN_BASE_URL=http://localhost:13001`
    (the `env.local.tmp` I generated had the wrong port; also caused the pre-existing EPIC-004 demo test-07 to fail).
    (2) delete `env.local.tmp` after merging. (3) EPIC-004 RATE_LIMIT `.env.example` vars + the carried infra
    follow-ups (clean-volume DB bootstrap needs `sa` once; `migrate deploy` P3019 — worked around via `db push`).
  - **Permission settings changed (local, `.claude/settings.local.json`, gitignored):** narrowed `.env.*` read-deny
    to real-secret files (`.env.example` readable); added `Bash(docker exec|compose|ps|inspect|logs|port:*)` allow.
  - **Docs-lane (closing PR) carries:** `docs/demos/EPIC-002/` (4 PNGs + DEMO.md, currently UNTRACKED) + the
    Conductor/planning sign-off write-backs. The `@demo` spec already rode the slice PR (`f8f5405`).
- **Phase (historical):** Compose **DONE** → Implement.
- **Slice:** the signed-in accountant adds / edits / deactivates services in `apps/admin`; the public front
  door reflects her changes. Closes the authoring loop behind EPIC-001's public catalog read-side.
- **In-scope AC (7):** AC-DOOR-002-01/-02/-03/-05, AC-DASH-010-01/-02/-03. (AC-DOOR-002-04 — the public-side
  effect — stays owned by EPIC-001; verified here only as a cross-surface loop check.)
- **Base branch:** main · **Feature branch:** _(engine-created at Plan; planned name free — no `*002*` branch)_
- **PR:** _(none yet — engine opens at Dispatch/Close-prep)_
- **Select — GO.** Earliest-listed unblocked Phase-1 epic. EPIC-003 also ready (deferred to a later run —
  one slice at a time).
- **Gate — GO on all 7 criteria:** (1) `status: planned` ✓ (2) `open_questions: []` ✓ (3) `depends_on:
  [EPIC-004]` delivered ✓ (4) COVERAGE has 7 EPIC-002 rows, all `planned` ✓ (5) all 7 AC resolve verbatim to
  REQ-DOOR-002 / REQ-DASH-010 ✓ (6) engine clear — `## Awaiting PR merge` = None, no active bugs ✓ (7) tree
  clean on `main`, no `*002*` branch ✓. _Note: `env.local.tmp` untracked at root (EPIC-004 residual, user
  action pending) — not tracked WIP; engine names files (no `git add -A`), so no sweep risk._
- **Compose — DONE.** Wrote `.implementation/briefs/BRIEF-002-services-catalog-management.md`: 7 AC (verbatim)
  + 7 gherkin scenarios; methodology gherkin / e2e-required (`apps/admin`); extra_gates = **accountant-only
  write boundary (ADR-005, HARD tier-3)**, persistence integration, **cross-surface authoring→public-door loop**
  (pair with EPIC-001 AC-DOOR-002-04), SESSION_CONTEXT on the admin write path (ADR-003), container smoke.
  demo: applicable yes · apps [admin] · personas [jane-accountant] · flows [flow-engagement-request].
- **Compose carries (concrete obligations from the sources + repo state):**
  - **Reuse the existing `Service` Prisma entity** (created in EPIC-001: id/name/description/active/sortOrder/
    timestamps). Deactivate = `active=false` (reversible; never delete — `EngagementRequestService` references).
  - **Latent write-boundary gap to CLOSE:** `db/policies/0002-service-readable.sql` block predicates
    (INSERT/UPDATE/DELETE) reuse `sec.fn_service_access`, which currently returns `allowed=1` for CLIENT
    (branch 3) — so a CLIENT principal **presently passes the write block predicate**, contradicting the
    policy's own "only ACCOUNTANT/admin can mutate" comment. EPIC-001 only needed the read side. This slice
    must make the **write** predicate ACCOUNTANT/admin-only (CLIENT keeps read of active rows) + prove it with
    the tier-3 test. This is the defining invariant of AC-DOOR-002-05.
  - Consume EPIC-004's auth seam (accountant role gate / `requireRole()`, mocked provider for e2e, `packages/db`
    SESSION_CONTEXT wrapper). `apps/admin` already scaffolded — add a management route + server actions, no
    re-scaffold. Catalog management must NOT be reachable from `apps/portal` (ADR-006).
- **EPIC-004 residual user-env items still pending** (carry-forward, both `.env*` permission-walled): merge
  `env.local.tmp` → `.env.local` then delete it; add `.env.example` `RATE_LIMIT_MAX_ATTEMPTS`/`_WINDOW_MS`;
  infra follow-up (clean-volume DB bootstrap + Prisma P3019). May resurface at this slice's Smoke.

---

<!-- ARCHIVED — EPIC-004 run DELIVERED 2026-06-16 (PR #38 → 0444551). Detail retained below + in Outcome/History,
     PROGRESS-ARCHIVE.md, RETRO-004.md, HANDOFF-004.md. Superseded as the active run by EPIC-002 above. -->

### EPIC-004 — BRIEF-004 (re-scoped 2026-06-15 per user direction) — DELIVERED (archived)
- **USER DIRECTION (2026-06-15):** _"Mock the auth provider for e2e instead. We need to defer this requirement
  since we're not ready to deploy 2FA."_ → Resolves the Clerk hard-gate by (1) **deferring the 2FA AC** out of
  EPIC-004's in-scope set and (2) **mocking the auth provider for e2e/local** (no real Clerk keys gate this
  slice). Pivot in progress: planning re-scope → brief re-compose → resume engine.
- **Deferred (4 AC → future "2FA enablement" slice):** AC-AUTH-004-01/-02/-03 (REQ-AUTH-004 mandatory accountant
  2FA) + AC-AUTH-005-01 (REQ-AUTH-005 client *may enroll* 2FA). **Still in scope (11 AC):** AC-AUTH-001-01/-02/-03,
  005-02 (client proceeds *without* 2FA), 006-01/-02/-03, 009-01, 010-01/-02/-03.
- **Methodology change (brief-level, user-approved deviation):** the brief's "never stub the auth provider" rule
  is relaxed for this slice — auth provider is **mocked/test-doubled for e2e + local dev**; real Clerk test-mode
  provisioning is **deferred** with the 2FA AC. Hardening follow-up: when the 2FA-enablement slice lands, swap
  the mock for real Clerk test-mode and re-validate the deferred AC + the now-mocked AUTH-006/009/010 against
  the live provider.
- **Phase:** Implement — re-entering after re-scope (was STOPPED at Clerk test-mode hard-gate; now resolved by
  the user direction above).
- **Re-scope steps DONE (2026-06-15):** (1) Planning agent re-scoped EPIC-004 → 11 in-scope AC; 4 2FA AC
  flipped `deferred` in COVERAGE (Summary EPIC-004 15→11, placed-total 55→51) + ROADMAP updated. (2) BRIEF-004
  re-composed: 11 AC, 11 gherkin scenarios, 2FA scope removed, methodology now "auth provider mocked for
  e2e + local; no real Clerk keys gate this slice; auth-abstraction seam keeps Clerk as the production drop-in
  target." extra_gates retained: cross-app redirect e2e, sign-in rate-limit, auth-event audit, SESSION_CONTEXT
  regression, container smoke. **Clerk env hard-gate is removed.**
- **Base branch:** main · **Feature branch:** `brief-004-auth-two-role-model` (engine-created)
- **PR:** **#38** — https://github.com/jasgr-software/tax-portal/pull/38 (OPEN, mergeable; 1 commit `1a83215`).
  ⚠️ **Opened prematurely by the TASK-004-002 developer** (boundary violation: developers must not commit/push/
  open PRs — git is the main session's job; also used a `git add -A`-style sweep that committed app code +
  `.orchestration/STATE.md` + `.planning/*` re-scope + `PROGRESS.md` in one commit; PR should open at
  Close-prep, not after task 2). **Decision:** adopt #38 as the slice PR (code passed gates; no value in
  tearing it down); **main session owns all further commits/pushes**; finalize PR title/body at Close-prep.
  Flag for SDET: duplicate middleware files — both `apps/<app>/middleware.ts` AND `apps/<app>/src/middleware.ts`
  exist per app (Next.js `src/` layout uses `src/middleware.ts`; the root one is a likely orphan).
- **Dispatch progress:** TASK-004-001 (apps/admin scaffold) **done**. TASK-004-002 (`packages/auth` port +
  ADR-010 middleware + mock binding) **done** — SDET rejected → BUG-004-001 (orphan root `middleware.ts` in both
  apps; live gate is `src/middleware.ts`) → IO self-implemented the 2-file deletion, gate re-ran green,
  TASK-004-002 closed. All re-scope guardrails passed (no 2FA; mock default + no real Clerk keys; Clerk binding
  throws if called; role server-evaluated via HMAC-signed cookie; both apps consume shared helper; db
  type-compatible). AC-AUTH-001-03 + AC-AUTH-010-* foundation covered (21+42 tagged unit tests + per-app e2e
  seam). TASK-004-003 (full Clerk binding) **trimmed/deferred** to the future 2FA-enablement slice (gate-invisible
  code — needs a live Clerk instance; the minimal compiling production-target seam already shipped in -002).
  TASK-004-004 (role-model invariants AC-AUTH-001-01/-02/-03) **done** — SDET approved (single-source-of-truth
  `ROLES` enum; ADR-005 trust-boundary proven cryptographically via HMAC forgery rejection; 92 packages/auth
  tests). Commits on PR #38: `1a83215` (001+002), `7705bf9` (BUG-004-001 fix). TASK-004-005 (portal client auth — AC-AUTH-005-02, 006-01/-02/-03) **done** — SDET approved (no 2FA anywhere;
  invitation-only with the AC-006-02 negative invariant proven from 4 angles; role server-set per ADR-005;
  portal e2e 23/23 incl. prior specs; 9 tier-3 provenance tests). Commits on PR #38: `1a83215`, `7705bf9`,
  `94908b4`. TASK-004-007 (SESSION_CONTEXT wiring + `$extends` regression + session expiry — AC-AUTH-001-03 + AC-AUTH-009-01)
  **done** — SDET approved; closes the carried EPIC-001 `$extends`-untested retro item (live-container read-back
  of both clerk_user_id + role; fail-closed; ADR-005 trust boundary; production wrappers untouched; 141 tests).
  Non-blocking follow-up (SDET): admin `page.tsx` stub queries the admin pool inside `withRequestContext` so the
  SET hook doesn't fire on that page path — switch to the request-pool `db` client when it gains real
  engagement-data queries in a later epic. Commits on PR #38: `1a83215`, `7705bf9`, `94908b4`, `1c73ebe`.
  TASK-004-008 (exhaustive cross-app redirect suite AC-AUTH-010-01/-02/-03 + session continuity + global
  sign-out; introduces `pnpm e2e:cross-app` required gate) **done** — SDET approved (all 3 Gate-Authoring
  evidence items verified vs live source; 9 tests both surfaces; redirect-not-403; gate `&&`-chained).
  **All 11 in-scope AC now have passing covering tasks.** Commits on PR #38: `1a83215`, `7705bf9`, `94908b4`,
  `1c73ebe`, `9b92d03`. TASK-004-009 (sign-in rate-limit, ADR-022) **done** — SDET approved (RateLimiter port in packages/auth + env
  defaults; integration test drives signInAsClient; source-IP keyed w/ trusted-proxy DECISION; single-process
  caveat + scaling trigger in runbook; reset hook; 158 tests). Commits on PR #38: …`ca32a5a`.
  **RESIDUAL (user action — `.env*` is permission-walled from agents AND the main session):** add to
  `.env.example`: `RATE_LIMIT_MAX_ATTEMPTS=10` + `RATE_LIMIT_WINDOW_MS=60000` (optional tuning vars, safe
  defaults, already documented in runbook). Apply with: `! printf '\nRATE_LIMIT_MAX_ATTEMPTS=10\nRATE_LIMIT_WINDOW_MS=60000\n' >> .env.example`
  TASK-004-010 (auth-event audit, ADR-019) **done** — SDET approved; real APPEND_ONLY_LEDGER_TABLE + RLS policy
  denying CLIENT (HARD-gate isolation test: CLIENT reads ZERO + null-context ZERO); fail-closed transactional
  audit on account creation; accountant-sign-in seam at mock-session w/ deferred-transactional-bind DECISION;
  9 live-container tests; 167 total. TASK-004-011 (@demo walkthrough) **done** — SDET approved + ran the
  DEMO-POLICY Smoke step: clean-rebuilt the admin image (dev's first run captured a stale pre-007 admin stub —
  byte-identical PNGs were the tell), re-captured shots 05/07/08 vs the real -007 authenticated surface, fixed a
  strict-mode locator, assembled `docs/demos/EPIC-004/DEMO.md` (8 AC-tagged screens); EPIC-001 demo flake
  confirmed transient. **ALL DISPATCH TASKS DONE.** Demo specs ride PR #38; the `docs/demos/EPIC-004/` gallery +
  README ship in the closing docs-lane PR (DEMO-POLICY). Commits on PR #38: …`9f85ced`.
- **Cascade status:** **Audit** done (Overwatch 0 blocking / 6 advisory). **Review (IO design-scan)** PASSED (all
  cited ADRs honored at the diff; re-scope guardrails confirmed; 0 violations). IO fixed 6 task-file metadata
  items directly (5× `Updated-by`→sdet; TASK-011 `Completed-at` inversion) — uncommitted, ride PR #38.
- **STOPPED-AT: Smoke — environment hard-gate (`.env.local` DB URLs incomplete).** Container layer is CLEAN
  (both images build; all 5 services `(healthy)`; portal :3000 + admin :13001 answer `/healthz` + `/readyz`).
  But on a clean `docker compose down -v` rebuild, `pnpm db:migrate` FAILS: the 6 DB connection URLs in
  `.env.local` are truncated stubs (`sqlserver://localhost`, no port/db/creds/`trustServerCertificate`) →
  TLS self-signed-cert error before reaching SQL Server. `.env.local` is **permission-walled from agents AND the
  main session** — I cannot fix it. This is an env hard-gate like Docker/Clerk → surface + stop, no workaround.
  **(Pre-existing local-env gap; not introduced by this slice — the slice never touches `.env.local`. Earlier
  dev/SDET DB tests passed because the volume was already migrated from a prior session / the rls tests build
  raw `mssql` config explicitly; the `down -v` clean rebuild is what exposes the truncated URLs.)**
- **RESUME (user):** complete the 6 DB URLs in `.env.local` per `.implementation/operations/runbook.md` §
  Database connection — host-side (scripts/dev/host Playwright): `port=14330`, `database=taxportal`, admin
  `user=taxportal_admin;password=TaxPortalAdmin2024`, request `user=taxportal_user;password=TaxPortalUser2024`,
  `trustServerCertificate=true`; container-side (`PORTAL_/ADMIN_*`): host `sqlserver`, `port=1433`. (Reconcile
  the runbook's own `taxportal_user`-vs-`taxportal_app` + `taxportal`-vs-`tax_portal` inconsistencies against
  your working BRIEF-001 `.env.local`.) Then re-invoke `/orchestrate 004` → resumes at **Smoke**.
- **Smoke deep-debug (2026-06-16) — local DB bootstrap chain (all PRE-EXISTING infra, NOT EPIC-004):**
  Container layer clean (5 services healthy; both apps serve health probes). DB-bootstrap blockers found + fixed
  in sequence: (1) clean `down -v` volume has NO db + NO app logins (only `sa`) → manually bootstrapped
  `tax_portal` DB + `taxportal_admin` login (db_owner) via `sqlcmd` as sa; (2) **Prisma ignores `;port=` param
  and defaults to 1433**, which collides with **`journey-for-jasmine-db-1`** (another project on host 1433) →
  fixed by putting port in the authority (`sqlserver://localhost:14330;…`); (3) Prisma 5.22 mis-parses `!` in
  passwords → use the `!`-free `taxportal_admin`/`taxportal_user` logins; (4) project `.nvmrc`=20 but shell on
  Node 24 → installed Node 20.20.2 + corepack pnpm. Corrected URLs written to `env.local.tmp` (repo root) for
  the user to merge into `.env.local`.
  **REMAINING HARD BLOCKER:** `prisma migrate deploy` (Track A) fails **P3019 — "schema provider `mssql` ≠
  migration_lock `sqlserver`"**, which contradicts the files (both say `sqlserver`; single schema; no `mssql`
  anywhere) and reproduces under BOTH Node 20 and 24. Prisma's only suggested fix is regenerating the migration
  history (`prisma migrate dev`) — a DESTRUCTIVE change to the committed BRIEF-001 migration; NOT done without
  explicit user authorization.
- **USER DECISION (2026-06-16): "Accept CI as the gate."** Local container-Smoke recorded `env-blocked
  (user-accepted CI substitution)` — surfaced, NOT silently skipped. Verification basis = CI (clean GitHub env) +
  the SDET's dev-time e2e/RLS runs (same basis EPIC-001 shipped on, COVERAGE [A]). **Infra follow-up filed:** fix
  clean-volume bootstrap (DB+login creation; Prisma port-in-authority; `!`-free Prisma logins) + the migrate-deploy
  P3019. Proceed: Validate → Close-prep → merge on green REQUIRED CI.
- **CI on PR #38 head `967b88c`:** REQUIRED green — `lint-and-typecheck` ✅ + `security-scan` ✅; `test-admin` ✅;
  CodeQL ✅. `test-portal` ❌ but **advisory** (`continue-on-error`, not required) — consistent with the documented
  EPIC-001 carried issue (CI provisions no portal DB schema/seed); local EPIC-004 portal tests passed; SDET
  Validate adjudicates advisory-vs-regression.
- **Next:** Validate (acceptance + CI gate + quality audit) → Close-prep (→ `## Awaiting PR merge`) → Conductor
  Review (/pr-review) → Fix → Merge/Finalize → Validate(write-back via /planning) → Report.
- **Close-prep DONE** — slice in `## Awaiting PR merge`; HANDOFF-004 + RETRO-004; tasks archived. Commit
  `b287e79` on PR #38.
- **Conductor Review (panel) DONE — advisory REQUEST-CHANGES.** `/pr-review 38` posted one consolidated review
  (https://github.com/jasgr-software/tax-portal/pull/38#pullrequestreview-4502742406): **1 blocker + 8 major +
  4 minor** (18 raw → 13 deduped). Headline findings: **BLOCKER** fail-open auth (AUTH_PROVIDER defaults to
  mock everywhere + committed fallback `MOCK_SESSION_SECRET` + no NODE_ENV=production guard + uncaught Clerk-
  binding throw in `require-role.ts`); **MAJOR** admin `page.tsx` never re-checks `role===ACCOUNTANT` (CLIENT
  with any identity reaches admin surface); **MAJOR** `getIdentity()` no try/catch → real-Clerk 500s every req;
  **MAJOR** `/api/*` blanket gate-exempt both apps; **MAJOR** spoofable leftmost-XFF rate-limit key; **MAJOR**
  session cookie missing `Secure`; over-eng majors (port width / dual-crypto / dead checkSession — these target
  the **intentional deferred-Clerk seam**, disposition-with-rationale candidates). **Next: Conductor Fix
  (`/pr-fix 38`)** — fix the genuine bugs + security findings; disposition the deferred-seam over-eng findings
  with rationale (intentional next-slice seam per the brief).
- **Conductor Fix DONE (2026-06-16) — `/pr-fix 38` green.** Pre-step: main session fixed a required-CI blocker
  unrelated to the panel — `check_task_file_completion` (inside `lint-and-typecheck`) was red because
  `TASK-004-011` used `**Field:**` (colon-inside-bold) for Started-at/Completed-at/Complexity-* vs the
  checker's `**Field**:` form; reformatted to match siblings (commit `950a13a`). Then pr-fixer addressed 13/13
  panel findings: **FIXED** F1/F6 fail-closed auth (throw on mock|unset AUTH_PROVIDER in prod; MOCK_SESSION_SECRET
  required, compose `:?`), C-middleware-throw (try/catch fail-closed), C-admin-page (role===ACCOUNTANT re-check),
  F2 (`/api/*`→`/api/mock-session` only, mock-gated), F3 (XFF behind `TRUST_PROXY`), F4 (`Secure` cookie when
  !development), F5 (sign-up rate-limit), F7 (`redirect_url`→pathname+search), OE4 (307), OE5 (new
  `@tax-portal/auth/testing` subpath; test-only resets off the barrel), OE8 (dead email default). Also fixed a
  real CI gap: added "Build workspace packages" step to `test-portal`/`test-admin` jobs (was failing to resolve
  workspace pkgs) → **both now PASS**. Commits `c89689d`, `01b4219`. **DISPOSITIONED-with-rationale (intentional
  deferred-Clerk seam, threads resolved by Conductor):** OE1 port width, OE2 `checkSession`/`role-missing` arm,
  OE3 dual HMAC paths. Gate was env-constrained (lint/type-check/build/auth+admin+portal unit tests only; CI is
  the accepted gate per user 2026-06-16). **All 4 CI checks green** (run 27614184609).
- **Conductor Merge/Finalize DONE (2026-06-16):** 3 dispositioned threads resolved → conversation-resolution
  gate cleared (0 unresolved; `CLEAN`/`MERGEABLE`). PR #38 title/body finalized to slice level (was the premature
  TASK-004-002 title) via REST (`gh pr edit` aborts on projects-classic deprecation). **PR #38 SQUASH-MERGED to
  `main` @ `0444551`** (`gh pr merge --squash --delete-branch`; no `--admin`/protection toggle — MERGE-POLICY
  Lane B; auto-merge cond. (d) Smoke = user-accepted CI substitution). Remote branch deleted; local branch
  pruned; new docs-lane branch `chore/epic-004-close` for the close-out.
- **IO Close-finalize DONE (2026-06-16):** **gate 8 post-merge CI PASS** — `main` @ `0444551`: `CI` ✅ +
  `Code Quality: Push on main` ✅. Gate 9 N/A (`Brief-deploys: no`). Final 9-gate scorecard recorded; slice swept
  from `## Awaiting PR merge` to `PROGRESS-ARCHIVE.md`; live PROGRESS.md `## Current initiative` = EPIC-004
  delivered + next-ready EPIC-002/003.
- **Conductor Validate (write-back) DONE (2026-06-16):** Planning agent flipped the 11 in-scope EPIC-004 AC
  `planned`→`verified` in COVERAGE (verified 13→24); rolled EPIC-004 `planned`→`delivered` in ROADMAP;
  EPIC-002/EPIC-003 deps satisfied (unblocked); 4 deferred 2FA AC unchanged. Evidence basis [A] = CI.
- **Remaining:** docs-lane PR (`chore/epic-004-close`: STATE/COVERAGE/ROADMAP/EPIC-004/PROGRESS write-backs +
  `docs/demos/EPIC-004/` gallery + `docs/demos/README.md`) on green required CI → Report.
- **RESIDUAL user env items still pending** (both `.env*` permission-walled): merge `env.local.tmp` DB URLs into
  `.env.local` (then DELETE `env.local.tmp` — untracked, has dev passwords); add `.env.example`
  `RATE_LIMIT_MAX_ATTEMPTS=10` + `RATE_LIMIT_WINDOW_MS=60000`. Infra follow-up filed: clean-volume DB bootstrap +
  Prisma P3019.
- **⏸ PAUSED (2026-06-16, user) — resume at Conductor Fix.** [SUPERSEDED — Fix done; see entries above.] On resume,
  run `/pr-fix 38` with this guidance:
  - **FIX now (contained, sensible, no real-Clerk needed):** F1/F6 fail-closed guards (throw on mock|unset
    `AUTH_PROVIDER` when `NODE_ENV=production`; require `MOCK_SESSION_SECRET` in prod; drop the compose
    `:-dev-only-…` default → make it required); C-middleware-throw (wrap `getIdentity()` in try/catch →
    fail-closed in `require-role.ts`); C-admin-page (re-check `role==='ACCOUNTANT'` in `apps/admin/src/app/
    page.tsx`, not just `!identity`); F2 (narrow `/api/*` exemption to `=== '/api/mock-session'` gated on mock);
    F3 (gate the leftmost-XFF rate-limit key behind a `TRUST_PROXY` config / trusted-position resolve); F4
    (set `Secure` on the session cookie when `NODE_ENV!=='development'`, incl. `buildMockSessionSetCookieHeader`);
    cheap minors OE4 (statusCode → 307), OE5 (drop test-only resets from the barrel), OE8 (drop dead email
    default), F5 (rate-limit sign-up), F7 (note/strip `redirect_url`).
  - **DISPOSITION-with-rationale (do NOT rip out — intentional deferred-Clerk seam per the brief):** OE1 port
    width, OE2 `checkSession`/`SessionValidity`, OE3 dual sync/async crypto — these support the deferred real-
    Clerk/2FA-enablement slice; reply on-thread that they're the documented seam, leave or resolve per fixer
    judgment.
  - **GATE is ENV-CONSTRAINED:** run **lint + type-check + build + `pnpm --filter @tax-portal/auth test` +
    `--filter admin test` + `--filter portal test` (non-DB)** only. **Do NOT** run `docker compose` /
    `pnpm db:migrate` / the db-integration (`*.rls.test.ts`, `session-context.propagation.test.ts`) / e2e
    suites — the local DB is half-bootstrapped + P3019-blocked (user accepted **CI as the gate**). Push and
    drive the **required** CI checks (`lint-and-typecheck` + `security-scan`) green; resolve addressed threads.
  - **After Fix green:** Conductor **Merge/Finalize** (resolve panel threads → `gh pr merge 38 --squash
    --delete-branch` on green required CI, **no `--admin`/protection toggle**; auto-merge cond. (d) Smoke =
    user-accepted CI substitution) → re-invoke IO **Close-finalize** (gate 8 post-merge CI; gate 9 N/A) →
    Conductor **Validate** (`/planning validate EPIC-004 with CI evidence <merge run/SHA>` → flip 11 COVERAGE
    rows verified + roll EPIC-004 delivered; mark the 4 deferred 2FA AC) → **docs-lane PR** for
    `docs/demos/EPIC-004/` + README → **Report**.
- **Local env state for resume:** Node 20.20.2 installed (project `.nvmrc`); docker stack may be up; `tax_portal`
  DB + `taxportal_admin` login manually bootstrapped but **schema NOT migrated** (P3019). `env.local.tmp` at
  repo root (untracked — has dev DB passwords; **do not commit**; user merges into `.env.local`). Pending USER
  items (both `.env*` permission-walled): merge `env.local.tmp` DB URLs into `.env.local`; add `.env.example`
  `RATE_LIMIT_MAX_ATTEMPTS=10` + `RATE_LIMIT_WINDOW_MS=60000`.
- **Base branch:** main
- **Feature branch:** `brief-004-auth-two-role-model` (engine-created; Plan recorded, Docker pre-flight passed)
- **PR:** _(none — engine blocked before Dispatch)_
- **Status:** Compose DONE (BRIEF-004 written). Implement entered: IO ran Plan (Ingest + Clarify + Design +
  coherence check + full task decomposition) and **halted at the Clerk test-mode environment hard-gate** before
  Dispatch. The slice's `e2e: required` AC (accountant 2FA, sign-in, invitation account-creation, cross-app
  redirect matrix) need **real Clerk test-mode users**; the brief directs treating missing Clerk creds like the
  Docker pre-flight gate (surface + stop, never stub the auth provider). Provisioning a Clerk app + test-mode
  keys is cost-bearing / external-SaaS / authorship-retained — an Autonomy-Ceiling user decision, not a
  Conductor workaround.
- **Resume:** user provisions ONE Clerk **test-mode** application and confirms: (1)
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (shared by both apps) in `.env.local` **and** repo
  Actions secrets (CI e2e); (2) dev allowed-origins for `http://localhost:3000` + `http://localhost:3001`; (3)
  MFA mandatory on ACCOUNTANT / optional on CLIENT, self-registration disabled, backend-API invitation enabled;
  (4) session max-lifetime + idle timeout pinned to Clerk's documented defaults (AC-AUTH-009-01; values recorded
  in the runbook); (5) test-mode users provisionable with `publicMetadata.role` pre-set for Playwright fixtures.
  Then re-invoke `/orchestrate 004` → resumes at **Implement/Dispatch** (TASK-004-001 = `apps/admin` scaffold,
  the dependency-free root of the task graph).
- **Relayed by the engine (non-blocking):** (i) `/compact` was requested at Plan start — relay to the user;
  Plan did not block on it. (ii) Brief says "Next.js 14" but `apps/portal` is on **Next 15.5.19** — the admin
  scaffold mirrors the real Next-15 scaffold, not the stale label.
- **Compose inputs already gathered (this run):** 15 AC resolve verbatim to the 6 REQ-AUTH sources; epic has
  gherkin scenarios for all 15; methodology = gherkin + e2e-required (BOTH apps) + tier-3/unit; extra gates =
  cross-app redirect e2e (ADR-010), sign-in rate-limiting (ADR-022), auth-event audit (ADR-019), container
  smoke. **UI-demo applicable** → brief `demo:` block: apps [portal, admin], personas [jane-accountant,
  tom-prospective-client], flows [flow-first-sign-in, flow-role-redirect].
- **Compose must carry these (from prior runs + the epic):** (a) `apps/admin` (Tax Portal) does **not** exist
  yet — scaffolding it (mirror of `apps/portal`: Next.js + Playwright + Vitest + e2e) is in scope; (b) Clerk is
  an **external SaaS** (no local container) — the build needs Clerk **test-mode** keys/config for the 2FA +
  sign-in e2e (potential inner stop if unavailable, like the Docker/GHAS gates); (c) AC-AUTH-006
  (invitation-only) needs an accountant-issued **Clerk invitation** to exist — the *accept→invite action* is
  EPIC-003 (out of scope), so the slice simulates the invitation via Clerk's invitation mechanism / a fixture
  and verifies an account can be created from it and NOT via self-service; (d) **pin a concrete max session
  lifetime + idle timeout** for AC-AUTH-009-01 (do NOT inherit the Clerk SDK default) and confirm **global
  sign-out across both apps** (security-lens carry-forward); (e) add the `packages/db` `client.ts` `$extends`
  SESSION_CONTEXT **regression test** — EPIC-004 is the first request-scoped-auth slice (deferred from EPIC-001).
- **Out of scope:** REQ-AUTH-002/003/007/008 (deferred — need engagements/client data); the invite *issuance*
  action (EPIC-003).

## Phase log

### Select — 2026-06-15
**Start:** Pin `/orchestrate 004`.
**Actions:** Read ROADMAP + EPIC-004 + COVERAGE. EPIC-004 = Phase-1 auth/two-role spine, `status: planned`,
`depends_on: []`, 15 AC placed (all `planned`). Enables EPIC-002/003.
**End:** Candidate = EPIC-004 → Gate.

### Gate — 2026-06-15
**Start:** Apply the 7-criterion readiness predicate read-only.
**Actions:**
- (1) `planned` ✓ · (2) `open_questions: []` ✓ · (3) no `depends_on` ✓.
- (4) COVERAGE has 15 EPIC-004 rows, all `planned` ✓ · (5) all 15 AC resolve verbatim to
  REQ-AUTH-001/004/005/006/009/010 ✓.
- (6) engine idle — `## Awaiting PR merge` empty, bugs dispositioned, Docker pre-flight passed ✓.
- (7) tree clean on `main`; no epic-004/auth/brief-004 branch ✓.
**End:** GO on all 7 → Compose.

### Compose — 2026-06-15
**Start:** Map GO EPIC-004 → a build brief honoring the engine's contract.
**Actions:**
- Read EPIC-004 + the 6 REQ-AUTH sources (verbatim AC text) + ADR-001/ADR-010 (concrete redirect matrix,
  one-Clerk-app topology, session continuity) + build-brief template + BRIEF-001 exemplar + DEMO-POLICY.
- Wrote `.implementation/briefs/BRIEF-004-auth-two-role-model.md`: 15 AC (verbatim) + 15 gherkin scenarios;
  methodology gherkin/e2e-required (both apps); extra_gates = cross-app redirect e2e (ADR-010), sign-in
  rate-limit (ADR-022), auth-event audit (ADR-019), SESSION_CONTEXT regression (ADR-003), container smoke.
- Carried the 5 compose obligations: (a) scaffold `apps/admin`; (b) Clerk external SaaS test-mode keys —
  hard env gate if absent; (c) simulate accountant-issued invitation (issuance = EPIC-003, out of scope);
  (d) pin explicit Clerk session lifetime/idle timeout (no silent SDK default) + global sign-out; (e)
  `packages/db` SESSION_CONTEXT regression test (first request-scoped-auth slice).
- demo block: applicable yes · apps [portal, admin] · personas [jane-accountant, tom-prospective-client] ·
  flows [flow-first-sign-in, flow-role-redirect].
**End:** BRIEF-004 written with every required field from real epic/source content → Implement.

### Implement — 2026-06-15
**Start:** Invoke the engine (`/io .implementation/briefs/BRIEF-004-auth-two-role-model.md`); drive to the
completion signal (slice in `## Awaiting PR merge` with a PR URL).
**Actions:**
- Spawned the IO. Slice-start gate clear (engine idle, `## Awaiting PR merge` empty). Docker pre-flight passed.
- IO ran **Plan**: Ingested BRIEF-004 + cited REQ-AUTH/ADR refs; Clarified the 15 AC + gherkin methodology;
  created feature branch `brief-004-auth-two-role-model`; Designed the slice (incl. a `packages/auth`
  `requireRole()` placement DECISION); ran the design-coherence check; decomposed into tasks
  (root = TASK-004-001 `apps/admin` scaffold). All recorded in `.implementation/tasks/PROGRESS.md`.
- IO **halted before Dispatch at the Clerk test-mode hard environment gate** — the brief's `e2e: required` AC
  need real Clerk test-mode users; absence is treated like the Docker pre-flight gate (surface + stop). The IO
  composed **no** `## Next Dispatch` (correctly), returning a Plan-phase blocker.
**End:** **STOP — deferred to the engine's inner stop** (Clerk env hard-gate). No PR opened. Conductor records,
reports, and halts at Implement per ENGINE.md § Defer-to-inner-stops / PHASES.md Stop/defer matrix. Resume path
in `## Current run`. → Report (STOP).

---

### Select — EPIC-002 — 2026-06-16
**Start:** New run (EPIC-004 delivered; no mid-flight run). Read ROADMAP + EPIC-002 + COVERAGE.
**Actions:** EPIC-001 + EPIC-004 `delivered`; EPIC-002 + EPIC-003 both `planned` and unblocked. Picked the
earliest-listed candidate = **EPIC-002** (services-catalog management, `apps/admin`). EPIC-003 deferred to a
later run (one slice per invocation).
**End:** Candidate = EPIC-002 → Gate.

### Gate — EPIC-002 — 2026-06-16
**Start:** Apply the 7-criterion readiness predicate read-only.
**Actions:** (1) `status: planned` ✓ (2) `open_questions: []` ✓ (3) `depends_on: [EPIC-004]` delivered ✓
(4) COVERAGE has 7 EPIC-002 rows all `planned` ✓ (5) all 7 AC resolve verbatim to REQ-DOOR-002 / REQ-DASH-010
✓ (6) engine clear — `## Awaiting PR merge` = None, no active bugs ✓ (7) tree clean on `main`, no `*002*`
branch ✓ (`env.local.tmp` untracked residual noted — not tracked WIP, no sweep risk).
**End:** GO on all 7 → Compose.

### Compose — EPIC-002 — 2026-06-16
**Start:** Map GO EPIC-002 → a build brief honoring the engine's contract.
**Actions:**
- Read EPIC-002 + REQ-DOOR-002 + REQ-DASH-010 (verbatim AC text) + ADR-005 obligation + build-brief template +
  BRIEF-004 exemplar + DEMO-POLICY + the live repo (`prisma/schema.prisma` `Service` model;
  `db/policies/0002-service-readable.sql`).
- Wrote `.implementation/briefs/BRIEF-002-services-catalog-management.md`: 7 AC (verbatim) + 7 gherkin
  scenarios; methodology gherkin / e2e-required (`apps/admin`); extra_gates = accountant-only write boundary
  (ADR-005, HARD tier-3), persistence integration, cross-surface authoring→public-door loop (pair EPIC-001
  AC-DOOR-002-04), SESSION_CONTEXT admin write path (ADR-003), container smoke.
- Carried concrete obligations: reuse the existing `Service` entity (deactivate = `active=false`, never
  delete); **close the latent write-predicate gap** in `0002-service-readable.sql` (block predicates currently
  pass CLIENT — must be ACCOUNTANT/admin-only for AC-DOOR-002-05); consume EPIC-004's auth seam + SESSION_CONTEXT
  wrapper; management lives in `apps/admin` only (ADR-006).
- demo block: applicable yes · apps [admin] · personas [jane-accountant] · flows [flow-engagement-request].
**End:** BRIEF-002 written with every required field from real epic/source content → Implement.

### Implement — EPIC-002 — 2026-06-16
**Start:** Invoke the engine (`/io .implementation/briefs/BRIEF-002-services-catalog-management.md`); drive to
the completion signal (slice in `## Awaiting PR merge` with a PR URL).
**Actions:**
- IO ran **Plan** (slice-start clear; Docker pre-flight PASS; branch `brief-002-services-catalog-management`
  created from `main`). Confirmed the latent write-boundary gap. Designed the fix (separate
  `sec.fn_service_write_access` predicate — admin/ACCOUNTANT only; CLIENT keeps read). Decomposed into 5 tasks
  (001 write-boundary policy + tier-3 RLS test → 002 repo/actions → 003 admin UI → 004 e2e+cross-surface →
  005 demo). All recorded in PROGRESS.md.
- **Dispatch TASK-002-001** (webapp-developer): implementation COMPLETE + lint/type-check/build PASS, but the
  tier-3 RLS test (`packages/db/src/service.rls.test.ts`) **could not execute** — the **local DB env hard-gate
  carried from EPIC-004**: `.env.local` has stub DB URLs + the request login doesn't exist + Prisma P3019
  bootstrap block. Developer correctly STOPPED + escalated (no fabrication, no workaround).
- **Conductor finding (decision-critical):** "CI as the gate" does **NOT** cover this AC — `ci.yml` provisions
  a SQL Server *service* but the test jobs point at `master`/`SA` (no `tax_portal` DB, no app principals, no
  `sec` policies applied) and never run `pnpm --filter @tax-portal/db test` (and they're `continue-on-error`).
  So AC-DOOR-002-05's tier-3 write-boundary test runs **nowhere** today. Surfaced to the user (the slice's
  primary-risk AC cannot be honestly claimed verified).
- **USER DECISION (2026-06-16): "I'll fix the local env."** User will repair the local DB so the tier-3 test
  runs locally (same dev-time basis EPIC-001/004 shipped on). Conductor narrowed the `.env.example` Read-deny
  (was `Read(.env.*)` → now real-secret files only) and wrote a **complete copy-paste `.env.local`** to
  `env.local.tmp` (full structure + corrected DB URLs: port-in-authority, `!`-free `taxportal_admin`/
  `taxportal_user` from migration 0001).
**Env RESOLVED (2026-06-16):** user copied `env.local.tmp`→`.env.local` + confirmed the stack is up
(tax-portal-sqlserver healthy on host 14330; `journey-for-jasmine-db-1` squats 1433 — port-in-authority fix
essential). Conductor bootstrapped the DB: `prisma db push` (sidestepped P3019 non-destructively — schema
synced) → `db:policies:apply` (Track B: principals incl. `taxportal_user`, audit ledger, all `sec` policies
incl. the new `fn_service_write_access`). **Permission walls evaluated + opened** (user direction): narrowed
`.env.example` read-deny; added `Bash(docker exec|compose|ps|inspect|logs|port:*)` allow rules (local-dev
container access; `.env`/`.env.local`/`.secrets` stay walled). **Self-inflicted detour caught + fixed:** granted
`taxportal_admin` sysadmin to create logins → that remaps it to `dbo` (USER_NAME()=dbo, IS_MEMBER('app_admin_role')=0)
which broke the RLS admin bypass (tests went 8-fail); dropped sysadmin → restored `taxportal_admin` =
app_admin_role+db_owner (correct per runbook); logins persisted. **SA password never entered context** (resolved
inside the container).
**TASK-002-001 GREEN (re-dispatched twice):** the policy was correct all along; first real run exposed a test-only
bug (`isBlockPredicateError` matched uppercase `"BLOCK"` but SQL's message is lowercase "block predicate") →
developer fixed the 4 detection helpers. Final: **service.rls 10/10**, full `@tax-portal/db` 35/35, lint/
type-check/build clean. **AC-DOOR-002-05 genuinely verified against real SQL Server.** Task → `review`.
**End:** TASK-002-001 at `review`. Next: SDET review → main-session commit to the feature branch → continue
dispatch 002→005 → Audit/Review/Smoke/Validate/Close-prep → Conductor review/fix/merge/validate/report. Re-engaging
the IO to drive the dispatch loop.
**Carried infra follow-up (refined):** clean-volume bootstrap still needs `sa` once for CREATE LOGIN (taxportal_admin
is intentionally NOT sysadmin); `migrate deploy` P3019 remains (worked around via `db push` locally) — both for
the EPIC-004-carried infra ticket, not blocking this slice.
- **Dispatch progress:** TASK-002-001 (write-boundary policy + tier-3) DONE+committed `c500053`; TASK-002-002
  (write repo + admin server actions) DONE+committed `77b91d7`; TASK-002-003 (admin catalog UI) DONE+committed
  `55a9caf`. All SDET-approved with independent re-execution.
- **⚠ TASK-002-004 (e2e) — BLOCKED on an EPIC-004 DEFECT surfaced by first real container e2e.** Specs written +
  static gates green, but rebuilding the admin/portal images (required to pick up the new `/services` route) exposed
  that EPIC-004's F1/F6 fail-closed guard (`packages/auth/src/select.ts`, commit `c89689d`) makes the **prod-built
  container 500 on every request when `AUTH_PROVIDER=mock`**: `if (process.env.NODE_ENV==='production'){ if(mock) throw }`
  — but the container legitimately runs NODE_ENV=production WITH mock (the EPIC-004-sanctioned e2e/local practice),
  and Next Edge inlines NODE_ENV at build. The guard conflates "Node build mode" with "real deployment." Shipped
  undetected because EPIC-004's container smoke was env-blocked (CI-substituted). Admin/portal containers currently
  `(unhealthy)` HTTP 500. Developer correctly stopped at the scope boundary (select.ts unchanged) + escalated.
  **Conductor-recommended fix (routed to IO):** decouple from NODE_ENV — fail closed by default, permit mock only via
  an explicit runtime opt-in (`ALLOW_MOCK_AUTH=true`, Edge-safe runtime read); wire the flag into docker-compose
  admin/portal + `.env.example` for local/e2e; real prod never sets it → mock still throws (security intent preserved
  + strengthened). Fix rides EPIC-002's PR (touches EPIC-004 code; note EPIC-004 had this latent defect). → BUG-002
  task → SDET review → rebuild containers → resume TASK-002-004 e2e.

### Select — EPIC-003 — 2026-06-17
**Start:** Fresh run (EPIC-002 delivered; no mid-flight `## Current run`). `/orchestrate 003` pins EPIC-003.
**Actions:** Read ROADMAP + EPIC-003 + COVERAGE. EPIC-003 (request inbox) is the only un-delivered Phase-1
epic; `status: planned`, `depends_on: [EPIC-001, EPIC-004]` both delivered, 20 AC placed (all `planned`).
**End:** Candidate = EPIC-003 → Gate.

### Gate — EPIC-003 — 2026-06-17
**Start:** Apply the 7-criterion readiness predicate read-only.
**Actions:** (1) `status: planned` ✓ (2) `open_questions: []` ✓ (3) `depends_on: [EPIC-001, EPIC-004]` both
`delivered` ✓ (4) COVERAGE has 20 EPIC-003 rows all `planned` ✓ (5) all 20 AC resolve verbatim to
REQ-DOOR-005/-006/-007/-008 + REQ-DASH-011 + REQ-MSG-013 (AC-01) ✓ (6) engine clear — `## Awaiting PR merge`
_Empty_, no active bugs ✓ (7) tree clean on `main` @ `cf94c7e`, no `*003*` branch ✓.
**End:** GO on all 7 → Compose.

### Compose — EPIC-003 — 2026-06-17
**Start:** Map GO EPIC-003 → a build brief honoring the engine's contract.
**Actions:**
- Read EPIC-003 + the 6 REQ sources + REQ-NFR-008 (verbatim AC text) + build-brief template + BRIEF-002
  exemplar + the live repo (`prisma/schema.prisma` `EngagementRequest`/`Service`/`User`; `packages/` —
  confirmed **no email infra**, **no email ADR**; `packages/auth` `createInvitation` seam present; Mailhog in
  `docker-compose`).
- Wrote `.implementation/briefs/BRIEF-003-accountant-request-inbox.md`: 20 AC (verbatim) + gherkin bound to the
  epic's 20 scenarios; methodology gherkin / e2e-required (`apps/admin`); extra_gates = accountant-only READ
  boundary (ADR-005, HARD tier-3) on engagement_request + new notification entity, decide-exactly-once,
  Mailhog email-send verification, invitation-tied-to-request, audit (ADR-019), email rate-limit (ADR-022),
  SESSION_CONTEXT (ADR-003), container smoke.
- Carried obligations: first email + first notification slice → provider-abstracted email seam to Mailhog +
  **IO architecture-consult for a possible email-transport ADR**; reuse `EngagementRequest` (add `declineReason`
  + invitation link) + new `Notification` entity; reuse the EPIC-004 `createInvitation`/RateLimiter/audit seams
  + EPIC-001/002 RLS-predicate pattern; cross-surface notification seam (portal generates, admin consumes).
- demo: applicable yes · apps [admin] · personas [jane-accountant, tom-prospective-client] · flows
  [flow-engagement-request, flow-first-sign-in].
**End:** BRIEF-003 written with every required field from real epic/source content → Implement.

### Select — EPIC-005 — 2026-06-18
**Start:** New run (EPIC-003 delivered, Phase 1 complete; no mid-flight run). Pin `/orchestrate EPIC-005`. Read
ROADMAP + EPIC-005 + COVERAGE.
**Actions:** EPIC-005 = Phase-2 opener (onboarding spine + engagement-letter e-sign gate), `status: planned`,
`depends_on: [EPIC-003, EPIC-004]` (both delivered), 10 AC placed (all `planned`). No Phase-2 dependency — the
ready root of Phase 2.
**End:** Candidate = EPIC-005 → Gate.

### Gate — EPIC-005 — 2026-06-18
**Start:** Apply the 7-criterion readiness predicate (mechanical 1–4,7 + engine-clear 6 via the gate harness;
criterion 5 the Conductor-owned semantic judgment).
**Actions:**
- Ran `bin/orchestrate-gates.sh --gate readiness --epic EPIC-005` and `--gate engine-clear` — both
  `RESULT: all evaluated gates PASS`, exit 0 (run_id `EPIC-005-20260618T122334Z`; appended to
  `runs/gate-log.jsonl`). Covers (1) status-planned, (2) open-questions-empty, (3) deps-delivered,
  (4) coverage-rows, (7) git-clean-branch-free, (6) awaiting-empty + no-active-bugs.
- **Criterion 5 (semantic):** read REQ-ONBD-001 / REQ-ONBD-002 / REQ-IDNT-007 — all 10 AC resolve **verbatim**
  to those `accepted` REQ sources, all observable/testable, and all 10 carry gherkin scenarios in the epic.
**End:** GO on all 7 → Compose.

### Compose — EPIC-005 — 2026-06-18
**Start:** Map GO EPIC-005 → a build brief honoring the engine's contract.
**Actions:**
- Read EPIC-005 + REQ-ONBD-001/-002 + REQ-IDNT-007 (verbatim AC) + ADR-005/019/006/003/001/012 obligations +
  ADR-023 (provider-seam mock-first) + ADR-024 (Docuseal e-sign seam) + build-brief template (now with the new
  `## Data & Interface Contract` section) + BRIEF-003 exemplar + the **live repo** (no `Engagement` entity yet;
  `packages/db` `withRequestContext`/`$extends` SET; `sec` predicate pattern incl.
  `0004-notification-policy.sql` "future client-ownership join" seam; EPIC-003 `acceptRequest` flow; audit
  seam).
- Wrote `.implementation/briefs/BRIEF-005-onboarding-spine-engagement-letter.md`: 10 AC (verbatim) + gherkin
  bound to the epic's 10 scenarios; methodology gherkin / e2e-required (portal + admin); extra_gates =
  client-data isolation (ADR-005, HARD tier-3, first client-owned rows), server-side gate enforcement (tier-3),
  signed-letter evidence recorded + audited (ADR-019/024), e-sign seam mock-first + fail-closed (ADR-023/024),
  SESSION_CONTEXT (ADR-003), cross-surface, container smoke.
- **First brief to populate `## Data & Interface Contract`** — source-traced entities (`Engagement`,
  onboarding state, letter template, signature evidence), `New`/`In Progress` status, `unsigned→signed` letter
  transition, the three-step sequence, the `ESignatureProvider` port; field-level minutiae explicitly deferred
  to IO Design per the altitude rule (no invention).
- Carried obligations: create `Engagement` on accept (extend EPIC-003 flow); first client-isolation policy +
  mandatory CLIENT-A-vs-CLIENT-B tier-3 test; mock e-sign seam (real Docuseal deferred per ADR-024 §5); reuse
  the db/auth/audit seams. Noted **no architecture consult needed** (e-sign ADRs already Accepted, unlike the
  EPIC-003 email-ADR gap).
- demo: applicable yes · apps [portal, admin] · personas [tom-prospective-client, jane-accountant] · flows
  [flow-onboarding, flow-first-sign-in].
**End:** BRIEF-005 written with every required field from real epic/source content → Implement.

## Outcome

### History
- **EPIC-001:** **DELIVERED** ✅ (PR #35 → `f7f6c9d`; 13/13 AC verified). Plus post-delivery records PR #36
  (`8ef3622`) and the per-epic UI-demo feature PR #37 (`b0b4b11`). Full lifecycle ledger archived in
  `.implementation/tasks/RETRO-001.md` + git history.
- **EPIC-004:** **DELIVERED** ✅ (PR #38 squash → `main` @ `0444551`, 2026-06-16; 11/15 in-scope AC verified, 4
  2FA AC deferred by design). Shipped with the auth provider **mocked** (user-approved brief deviation); real
  Clerk + 2FA are a future Phase-1 "2FA enablement" slice. 3-lens panel request-changes fully dispositioned
  (genuine findings fixed; deferred-Clerk-seam over-eng dispositioned-with-rationale). Verification basis = CI
  (user-accepted substitution for env-blocked container smoke). Ledger: `RETRO-004.md` / `HANDOFF-004.md` +
  `PROGRESS-ARCHIVE.md` Close-finalize entry. Unblocked next: EPIC-002, EPIC-003.

### EPIC-004 — first run (superseded)
**stopped-at-Implement** (2026-06-15) — deferred to the engine's **Clerk test-mode hard environment gate**; the
IO completed Plan and halted before Dispatch (e2e-required AC needed real Clerk test-mode creds). **Superseded
2026-06-15** by the user's "mock the auth provider + defer 2FA" direction → re-scoped to 11 AC, re-composed
BRIEF-004, and driven to delivery (see History entry above). Retained for run-history continuity.

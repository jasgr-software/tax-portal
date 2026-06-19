# RETRO-007 — BRIEF-007 / EPIC-007 (Initial document upload — checklist + secure, malware-scanned file storage)

**Slice:** step 3 of the onboarding sequence — **initial document upload**, on top of the delivered EPIC-005
spine + letter gate and the EPIC-006 questionnaire. The accountant authors labeled document requests
(`apps/admin`); the post-letter-gate client sees the checklist (outstanding vs provided) and uploads any-type
files to fulfill (two-phase **authorize-then-sign**, ADR-009); malicious files are **withheld + the uploader
informed** (**scan-before-available**, ADR-021); files are encrypted-at-rest (adapter contract, ADR-020),
engagement-isolated (the **third** client-isolation policy `0007`, ADR-005), audited (ADR-019), rate-limited
(ADR-022); the document-step satisfaction is wired into the EPIC-005 read model (AC-ONBD-004-04). The largest
Phase-2 slice (two net-new ports + the first stored-bytes path). **19 in-scope AC.** Branch
`brief-007-initial-document-upload` → PR (pending — `## Awaiting PR merge`). **Brief-type:** feature ·
**Brief-deploys:** no.

## 9-gate scorecard (pre-merge)

1. **Per-task submission gates** — ✅ 7/7 (every developer Work Log carries lint/type-check/build/test + e2e
   evidence where mandated; both gate-introducing tasks carry the three-item Gate-Authoring evidence).
2. **SDET Review** — ✅ 7/7 tasks approved. One concrete in-slice rejection (BUG-007-001 — stale admin e2e
   data-testids), fixed and re-approved (see Retro classification item 1).
3. **Overwatch Audit** — ✅ **CLEAN, 0 blocking.** Scope discipline / audit+rate-limit seam reuse (ADR-019/022 —
   no parallel paths) / `0007` policy + the two new ports within their cited ADRs / gated-path accountability all
   PASS; cross-surface parity CLEAN both surfaces. Gate-Authoring three-item evidence on TASK-007-003 (`0007`
   policy) + TASK-007-004 (scan-promotion gate) independently sanity-checked real. Findings surfaced were
   observations only (the carried retro items below).
4. **IO Design scan** — ✅ integrated diff (all 7 tasks) honors every cited ADR (005/008/009/019/020/021/022) +
   the recorded slice-local design contract; 0 violations → 0 fix-forward tasks. The one IA gap (orphan authoring
   route, FA-1) was fix-forward **folded into TASK-007-006** before Smoke (nav link + cross-app nav assertion),
   not a revert.
5. **Container Smoke** — ✅ PASS. Clean-volume bring-up healthy; all 5 Track-A + 10 Track-B migrations incl.
   `0007`; `0007` DB objects + `Document_status_chk` present in-container; both apps `/healthz`+`/readyz` 200;
   **first stored-bytes path PASS end-to-end through real Azurite** (clean upload→scan→promote `active` +
   authorize-then-sign download; infected→withheld fail-closed); portal e2e 44/44. BUG-007-001 closed + re-smoke
   3/3 green. `sqlserver (unhealthy)`-on-persisted-volume = carried SA-password/volume mismatch (DB operational
   via app principals).
6. **SDET Acceptance-validation** — ✅ APPROVED. All **19 in-scope AC** validated under the bound **gherkin**
   prose-bind (`.feature` files authored verbatim from EPIC-007 — admin 1 + portal 18; each scenario ↔ test
   assertion confirmed). The three HARD non-negotiables (per-policy client-isolation AC-FILE-001-05/-003-02;
   scan-before-available fail-closed AC-NFR-009-01/-02) independently re-confirmed REAL against the live stack.
7. **SDET CI gate** — ✅ PASS. `pnpm ci:local` EXIT 0; lint clean both surfaces, type-check clean
   portal/admin/packages, build clean (Next.js 15.5.19, admin's new `document-requests` route compiled),
   **57 test files / 836 tests ALL PASS** (portal 168, admin 223, packages 445 incl. the tier-3 isolation +
   pipeline + checklist suites). Quality parity audit CLEAN — both surfaces config + `e2e:run` + `.feature`
   files; tests ran for both; no coverage target.
8. **Post-merge CI** — pending (Close-finalize).
9. **Post-merge staging smoke** — **N/A** (`Brief-deploys: no`, ADR-007 — production platform deferred, no
   staging environment).

## What shipped (net-new platform capabilities)

See **HANDOFF-007 § Net-new platform capabilities** for the full enumeration. Headline: the platform's **first
stored-bytes path** — first `FileStorage` port + Azurite adapter (ADR-008/009), first `FileScanner` port
(mock-first, ADR-021), the **third** client-isolation RLS policy `0007` (ADR-005), the two-phase
authorize-then-sign + scan-before-available pipeline, the checklist read model + document-step satisfaction
(AC-ONBD-004-04), and the ADR-019/022 audit+rate-limit caller-binding (reused, not hand-rolled).

## Retro finding classification (per ENGINE.md § Retro Finding Classification)

The promotion bar is a **concrete quality-gate failure**. **One finding cleared it** — the BUG-007-001 SDET
rejection (a concrete Review/Smoke-gate failure). Separately, the **clock-domain inversion** reached its
elevation threshold this slice and is promoted to `ungated-fix` (off-PR). Everything else is an **observation**.

**`gated-path-fix` (resolved this slice / rides the PR):**

1. **[test-selector drift — concrete SDET rejection, BUG-007-001] `apps/admin/e2e/specs/document-requests.spec.ts`
   stale data-testid selectors.** TASK-007-006's testid rename in `DocumentRequestEditor.tsx` left the admin e2e
   spec's selectors stale (blast-radius miss) → spec failures at Smoke. SDET self-implemented the **e2e-spec-only**
   selector fix (no production code change), re-smoke 3/3 GREEN (tests 9/10/11 pass; corrected selectors verified
   against the rendered testids), **SDET-approved**, committed `414890f`. **Classification `gated-path-fix`** (it
   landed on the branch in a gated path, rides the PR — a resolved gate failure, not a forward action item).
   This is the **3rd manifestation of the "mock/selector interface drift" family** (a task changed a shared
   contract without updating a consuming spec in lockstep; the e2e gate caught it). Stuck-Loop counter = 1 (not
   triggered). **Lesson (carry):** a testid/selector rename must update all consuming specs **in the same change**.

**`ungated-fix` (promoted off-PR — process/doc change, does NOT ride the BRIEF-007 PR):**

2. **[metric-integrity — RETRO-006 item 2 → ELEVATED this slice] Clock-domain `Completed-at`/`Started-at`
   inversion.** Recurred on **TASK-007-001..004** (developer agents wrote `Completed-at` during their
   submission-gate Work Log entry instead of leaving it blank for the SDET's atomic close; tasks 005–007 were
   correctly SDET-authored/forward-ordered; BUG-007-001's close stamp is a midnight sentinel `2026-06-19T00:00:00Z`
   from the same family). No gate failed (all metadata present + valid, `Complexity-actual` ∈ 1–5). This is the
   **7th+ occurrence** project-wide (RETRO-002/003/004/005/006 + here), meeting the RETRO-006 item-2 elevation
   threshold. **Disposition: `ungated-fix`** (Overwatch-recommended; IO-classified). **Fix:** amend
   `.implementation/agents/developer.md` (and/or the Dispatch-Checkpoint guidance) to **prohibit developer writes
   to `Completed-at`** — per the Task Metadata Contract, `Completed-at` is SDET-authored (or IO-as-reviewer for
   `Impl: io`) inside the atomic close edit only. **This is an ungated-path workflow-doc edit (quad-review); it
   does NOT ride the BRIEF-007 application-code PR** — it rides a future docs/ungated change. Tracked in
   `## Open retro action items` until that change lands.

**`acknowledged` / observations (no action item — did not clear the promotion bar):**

3. **[doc-drift — header comment] `apps/admin/e2e/specs/document-requests.spec.ts` header comment lists stale
   data-testids** (`document-request-label-input`, `add-document-request-button`, `document-request-item-{id}`)
   that diverge from the actual `DocumentRequestEditor.tsx` rendered testids. **The functional tests use the
   correct selectors** (BUG-007-001 already fixed the functional drift); this is **comment-only** residue.
   Observation — not promoted; carried.

4. **[hardening — CSP env-gating, TASK-007-006] `apps/portal/next.config.mjs` `connect-src` includes the
   unconditional `http://localhost:10000` dev origin** (the Azurite blob origin). Inert in prod HTTPS via
   mixed-content blocking, but it ships in the prod CSP header. **Recommend env-gating it out of production** in a
   follow-up hardening pass. Observation — not promoted; carried.

5. **[gated-path candidate — Overwatch Obs 6] `adminDb` type-cast in
   `apps/admin/src/app/requests/[id]/page.tsx`** — the orphan-route nav fix (TASK-007-006) casts the admin db
   client to reach the engagement-by-request lookup. SDET-approved; advisory. **Recommend a typed accessor on the
   `packages/db` admin client** so the cast isn't needed; rides the next `packages/db` task that touches this
   surface. Observation — not promoted; carried.

6. **[demo — carried family] `@demo` prior-epic PNG byte-churn recurred.** TASK-007-007 itself was
   scope-disciplined (only EPIC-007 PNGs written), but `pnpm e2e:demo` re-runs **all** `@demo` specs and rewrites
   prior galleries; main session manually reverted. **Candidate `ungated-fix`:** scope each `@demo` spec's
   screenshot output to its own `docs/demos/EPIC-NNN/` path so the manual revert isn't needed. Observation — not
   promoted; carried.

7. **[e2e-determinism — pre-existing] `apps/portal/e2e/specs/questionnaire-cross-app.spec.ts:372` flake**
   (EPIC-006-owned; file unmodified this branch). **NOT a BRIEF-007 regression** and not a BRIEF-007 AC.
   Observation — carried (joins the EPIC-005 `onboarding.spec.ts:312` flake family in `## Open retro action items`).

## Rule sunset (ENGINE.md § Rule Sunset, CLAUDE.md § Platform-frontend scope)

- **Cross-surface-parity rule (CLAUDE.md § Platform-frontend scope) — counter at 1/3, KEEP/observe.** Overwatch
  + SDET independently confirmed cross-surface parity CLEAN this slice (both `apps/portal` + `apps/admin`
  audited — admin authoring UI + portal upload step + the cross-app author→fulfill loop all validated; no parity
  defects). Per the CLAUDE.md trigger (3 **consecutive** zero-finding Close-preps), BRIEF-007 is the **first
  consecutive clean slice** post a reset — **sunset counter: 1 of 3**. **IO recommendation: KEEP** (re-evaluate
  at the next Close-prep). The rule directly produces the cross-app author→fulfill e2e; cost is low and the
  platform is still growing two-surface features (EPIC-008 ahead). Reset to 0 on any future parity finding.
- **Autonomy Ceiling item 2 `--no-verify` clause — KEEP.** Not triggered this slice (no commit bypass attempted);
  prophylactic guard against an irreversible bad-commit class; cheap to retain. (3+ slices without a trigger —
  surfaced per the carried sunset candidate; IO recommends KEEP as a cheap irreversibility guard.)
- **`PushNotification` spam-loop guard — KEEP.** Not triggered (no notification fired this slice); prophylactic
  against alert-fatigue / handler recursion; cheap to retain.

## Carry-forward to next slice

- **[ungated-fix — PROMOTED] Clock-domain `Completed-at` inversion** (item 2) — amend `developer.md` to prohibit
  developer writes to `Completed-at`. **Off-PR** (rides a future docs/ungated change). In `## Open retro action
  items`.
- **[hardening — ungated-fix candidate] CSP `connect-src localhost:10000` env-gating** (item 4) — gate the
  Azurite dev origin out of the production CSP header.
- **[doc-drift] `document-requests.spec.ts` header-comment stale testids** (item 3) — comment-only; rides the
  next admin-e2e task that touches the file.
- **[gated-path candidate] `adminDb` typed accessor on `packages/db`** (item 5) — so the
  `requests/[id]/page.tsx` cast isn't needed; rides the next `packages/db` task.
- **[demo — ungated-fix candidate] `@demo` screenshot output scoping** (item 6) — scope each `@demo` spec's
  writes to its own `docs/demos/EPIC-NNN/` path.
- **[e2e-determinism] EPIC-006 `questionnaire-cross-app.spec.ts:372` + EPIC-005 `onboarding.spec.ts:312` flakes**
  (item 7) — pre-existing, not BRIEF-007 regressions; `beforeEach`/onboarding-nav fixture timing.
- **Infra (root family, carried):** `sqlserver` healthcheck SA-password-vs-volume mismatch + clean-volume DB
  bootstrap + `migrate deploy` P3019; `scripts/smoke-test.sh` defaults (default `ADMIN_URL` :13001 +
  SA-password derivation). Non-blocking; resurfaces on a `down -v` rebuild.
- **[security — defense-in-depth] SEC-3 per-connection `SESSION_CONTEXT` hardening** — tracked, not a defect.
- **Deferred enablement slices:** real AV/FileScanner wiring (ADR-021, mock-first today); real Docuseal e-sign
  (ADR-024 §5). Document **versioning** (beyond `v1`) + 7-year **retention** automation are later FILE slices
  (the `0007` key pattern reserves the path).
- **CI carries (EPIC-004 follow-ups):** `test-portal` `packages/**` build step before graduating to required;
  ESLint `adminDb` import-boundary extension.

## Post-Merge Addendum (Close-finalize) — 2026-06-19

**Merge:** **PR #52** squash-merged to `main` → **`eaa5875`** (`eaa58759a10995cde1e8ea37103fbb388cca8a66`),
**Lane B** (reviewed lane — application code: `packages/`, `apps/`, `prisma/`, `db/policies/`,
`docker-compose.yml`), **user-approved**. `gh pr merge 52 --squash --delete-branch` — **no `--admin`**, no
`enforce_admins`/branch-protection toggle; remote branch deleted; local `main` synced to `eaa5875`. The
fixer's `c46eb91` (the M1 cross-tenant `completeUpload` ownership fix + its regression test + the other 8
panel findings) is folded into the squash.

**PR-review panel + fix outcome:** `/pr-review` ran the 3-lens advisory panel; **2 majors** found and fixed by
`/pr-fix`, headlined by **M1 — a cross-tenant ownership gap in `completeUpload`** (the upload-completion path
did not re-assert engagement ownership before promoting the document — a client could complete an upload
against another engagement's authorization handle). Fixed **with a dedicated regression test** + the other 8
panel findings, all in `c46eb91`. This deepens the file-isolation guarantee beyond the `0007` RLS policy at
the data layer — the application path now re-checks ownership at completion (defense-in-depth). Threads
resolved; merged on green required CI.

**Gate 8 — post-merge CI (`main` @ `eaa5875`): ✅ GREEN.**

- **CI** workflow — run **`27844771147`** — `completed/success`. Jobs:
  `lint-and-typecheck` ✅ **success** (required) · `security-scan` ✅ **success** (required) ·
  `test-portal` ✅ success (advisory) · `test-admin` ✅ success (advisory) · `report-failure` skipped.
  Both **required** checks green.
- **CodeQL** (Code Quality: Push on main) workflow — run **`27844771086`** — `completed/success`.
- Watched via `gh run watch <id> --exit-status` (both exit 0) + a `gh run view --json status,conclusion`
  poll-to-completion (no blocking sleep loop, no `| tail`); conclusions confirmed at run + job level against
  `headSha = eaa58759a10995cde1e8ea37103fbb388cca8a66`.

**Gate 9 — post-merge staging smoke: N/A** (`Brief-deploys: no`, ADR-007 — production platform deferred, no
staging environment).

**Post-merge bugs:** **zero.** No `BUG-007-POST-NNN` created; nothing surfaced after merge.

### Final post-merge 9-gate scorecard

| # | Gate | Verdict |
| - | ---- | ------- |
| 1 | Per-task submission | ✅ 7/7 |
| 2 | SDET Review | ✅ 7/7 (1 in-slice rejection BUG-007-001 fixed + re-approved) |
| 3 | Overwatch Audit | ✅ CLEAN, 0 blocking |
| 4 | IO Design scan | ✅ PASS (0 violations; orphan-route IA fix-forward folded into TASK-007-006) |
| 5 | Container Smoke | ✅ PASS (first stored-bytes path proven end-to-end through real Azurite) |
| 6 | SDET Acceptance-validation | ✅ APPROVED — 19/19 in-scope AC (gherkin prose-bind) |
| 7 | SDET CI gate | ✅ PASS (`pnpm ci:local` EXIT 0; 57 files / 836 tests green) |
| 8 | Post-merge CI | ✅ **GREEN** — CI `27844771147` success (both required checks) + CodeQL `27844771086` success @ `eaa5875` |
| 9 | Post-merge staging smoke | **N/A** (`Brief-deploys: no`) |

**Gates 1–8 GREEN; gate 9 N/A. BRIEF-007 / EPIC-007 DELIVERED.**

**Delivery state:** Phase 2 (onboarding gate) — EPIC-005 (step 1) ✓ + EPIC-006 (step 2) ✓ + **EPIC-007
(step 3) ✓** all delivered. **EPIC-008 (onboarding-completion capstone) is now UNBLOCKED** — it required both
EPIC-006 ✓ and EPIC-007 ✓; both are delivered. EPIC-008 is the Phase-2 capstone and the next ready slice.

_The off-PR `ungated-fix` carries (clock-domain `Completed-at` `developer.md` amend; CSP env-gating;
header-comment doc-drift; `adminDb` typed accessor; `@demo` screenshot scoping; pre-existing e2e flakes) remain
in `## Open retro action items` — none ride this application-code PR; they land on future docs/ungated changes
or the next task touching the relevant surface._
</content>

# BUG-008-001 — Azurite SAS-URL PUT host-unreachable from the Playwright browser process (upload-delivery e2e tier)

**Status:** open — tracked follow-up (does NOT block BRIEF-008 merge)
**Brief:** BRIEF-008 / EPIC-008 (surfaced at the TASK-008-004 e2e gate)
**Origin:** EPIC-007 (ADR-009 two-phase upload pipeline) — **pre-existing infra defect, NOT a BRIEF-008 regression**
**Filed by:** IO (per the SDET TASK-008-004 verification + review disposition, 2026-06-20T01:15:00Z)
**Severity:** non-blocking (env-only; the affected ACs are proven at tier-3 integration; e2e is not a per-PR required CI check)
**Impl:** unassigned — **do NOT fix in BRIEF-008** (out of slice scope; its own follow-up)
**Disposition:** tracked follow-up — carried to retro / Validate-disposition; AC-ONBD-005-01 carried for slice
Validate by its tier-3 integration proof. Fix is its own future infra slice (own its own brief/task).

---

## What fails

The ADR-009 **two-phase upload pipeline** (browser PUTs the file directly to Azurite via a SAS URL →
`completeUploadAction` records the blob) does not complete in this local environment when driven from the
**host Playwright Chromium** process. Checklist items remain `data-status="outstanding"` and never reach
`data-status="fulfilled"`, so any e2e that depends on a completed upload times out.

The SDET independently established this at the TASK-008-004 gate (not on the developer's word), three ways:

**B — PRE-EXISTING (proven three ways):**

1. **Spec byte-identity to `main`** — `git diff origin/main...HEAD -- apps/portal/e2e/specs/document-upload.spec.ts apps/portal/e2e/specs/document-upload-cross-app.spec.ts` returns **empty**. The EPIC-007 upload specs are byte-identical to `main` @ `eaa5875` (PR #52) and untouched by `brief-008-onboarding-completion-transition`.
2. **No BRIEF-008 code in the upload-delivery path** — `git diff origin/main...HEAD -- apps/portal/src/app/onboarding/ packages/db/` shows only: (a) an import + two best-effort `try/catch` blocks appended **after** the `submitQuestionnaire`/`completeUpload` success/revalidate branches in `actions.ts` (the `completeUploadAction` body itself is unchanged), and (b) the additive `getEngagementStatusForAdmin` read in `engagement.ts`. No upload-PUT / `completeUploadAction` delivery-path code was modified.
3. **Reproduces with the 004 specs absent** — the three uncommitted TASK-008-004 specs were temporarily moved out of the tree; `pnpm --filter portal e2e:run -- --grep document-upload` on the committed-only tree produced **4 failures** — exactly EPIC-007 `document-upload.spec.ts` tests 22/23/24 + `document-upload-cross-app.spec.ts` test 18 — same `Expected "fulfilled" / Received "outstanding"` timeout mode. The failure exists **without** any BRIEF-008 spec present.

**C — ENVIRONMENT, not code:** `docker compose logs azurite` during the upload-spec run shows **zero blob-level
PUT requests** (`PUT /devstoreaccount1/tax-portal-documents/<blob-key>`) arrive at Azurite — only CORS setup +
an idempotent container-create (409). The SAS URL is signed against the **container-internal** Azurite address,
which is **unreachable from the host Playwright Chromium** under the `:10000` / port-remap topology, so the SAS
PUT never lands. This is an infra/networking defect in the ADR-009 two-phase upload pipeline — no BRIEF-008
contribution.

---

## Root cause

The upload SAS URL is signed against the **container-internal Azurite address** rather than a host-reachable
endpoint. When the e2e browser (host-side Playwright Chromium) attempts the direct PUT, the signed host is not
routable from the host process under the local compose topology (Azurite published on `:10000`, neighbor-squat
port remaps in play), so the blob PUT never reaches Azurite and the upload never completes. Server-side
integration code (which talks to Azurite over the in-network address) is unaffected — only the browser-driven
direct-PUT tier is broken.

---

## Affected specs / ACs

| Spec | Status | Notes |
| ---- | ------ | ----- |
| `apps/portal/e2e/specs/document-upload.spec.ts` (tests 22, 23, 24) | FAIL (env) | EPIC-007-owned; byte-identical to `main` |
| `apps/portal/e2e/specs/document-upload-cross-app.spec.ts` (test 18) | FAIL (env) | EPIC-007-owned; byte-identical to `main` |
| BRIEF-008 portal positive path (AC-ONBD-005-01 — client finishes step 3 ⇒ upload step done) | BLOCKED (env) | Depends on a completed upload; **proven at tier-3** (below) |
| BRIEF-008 EPIC-008 cross-app spec (completion path portal → admin) | BLOCKED (env) | Depends on a completed upload to reach the completing step |

**What is NOT affected (passed at the 004 gate, 3× flake-clean):** admin EPIC-008 4/4 (In Progress status +
the `onboarding_completed` notification identifying engagement+client), the portal negative path (incomplete
onboarding stays New / no notification), and the security fail-closed check (completion notification NOT visible
to CLIENT).

---

## Why this does NOT block BRIEF-008 merge

1. **e2e is NOT a per-PR required CI check** (CLAUDE.md — required checks are `lint-and-typecheck` +
   `security-scan`; e2e enforcement is a pre-deploy/staging gate, not per-PR). An env-blocked e2e path does
   not gate this slice's merge.
2. **AC-ONBD-005-01 is proven at tier-3 integration** —
   `packages/db/src/onboarding-completion.integration.test.ts:485` ("fulfilled DocumentRequest →
   document-upload step done → transitions") PASSES on the **real SQL Server container** (part of
   TASK-008-001's 14/14, SDET-re-run @ 22:11:00Z). The AC's behavior is proven with no dependency on the
   browser→Azurite PUT; only the browser-e2e tier is env-blocked. **AC-ONBD-005-01 is carried for slice
   Validate by this tier-3 proof.**
3. **The defect is pre-existing and EPIC-007-originated** (proven structurally + by reproduction with the 004
   specs absent) — it is not introduced or worsened by BRIEF-008.

---

## Steps to reproduce

```bash
docker compose --env-file .env.local up -d           # full stack (portal :3000, admin :13001, azurite :10000, sqlserver :14330)
pnpm --filter portal e2e:run -- --grep document-upload
# Observe: document-upload.spec.ts tests 22/23/24 + document-upload-cross-app.spec.ts test 18 fail
#   ("Expected data-status=\"fulfilled\" / Received \"outstanding\"" timeouts).
docker compose logs azurite | grep -E 'PUT /devstoreaccount1/tax-portal-documents'  # → no host-driven blob PUTs land
```

---

## Suggested fix direction (for the future infra slice — NOT this slice)

Sign the upload SAS URL against a **host-reachable Azurite endpoint** (the published `:10000` host address, or
a stable hostname both the container network and the host browser can resolve), rather than the
container-internal address — so the browser-driven direct PUT in the ADR-009 two-phase flow lands. Verify by
re-running `pnpm --filter portal e2e:run -- --grep document-upload` (4 EPIC-007 specs green) + the BRIEF-008
portal positive path + the EPIC-008 cross-app spec. This is an EPIC-007 / ADR-009 infra concern and must be
scoped to its own brief/task — do not patch it inside BRIEF-008.

---

## Notes

This is the browser-driven **upload-delivery** tier only. Server-side Azurite integration (used by the tier-3
integration tests, which pass on the real container) is unaffected. Same local-stack family as the carried
neighbor-squat / port-remap quirks (project memory: "Local stack bring-up quirks").

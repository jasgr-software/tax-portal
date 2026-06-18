# HANDOFF-006 — BRIEF-006 / EPIC-006 completion report

**For the upstream producer (`.planning/` → COVERAGE write-back).** Slice: intake questionnaire —
per-service-type templates + client completion (**step 2 of the onboarding sequence**, on top of the delivered
EPIC-005 spine + letter gate). Branch `brief-006-intake-questionnaire` → **PR (pending)**. Status at handoff:
**in `## Awaiting PR merge`** (pre-merge gates 1–7 green; awaiting merge → Close-finalize gate 8).

## AC satisfied (7/7 in-scope — ready for COVERAGE `verified`)

**Evidence basis:** SDET acceptance-validation (7/7 traced to passing AC-tagged tests under the bound gherkin
prose-bind, tier-2/3/6 — each scenario text ↔ test assertion confirmed, not AC-tag-sharing) **+** SDET CI gate
(`pnpm ci:local` EXIT 0; portal e2e 36/36, admin 35/35, cross-app 11/11) **+** container smoke (both BRIEF-006
routes live + auth-gated against the docker stack; smoke e2e both surfaces green). Green **required** CI on the
PR head is confirmed at Close-finalize (gate 8) per the EPIC-001/002/003/004/005 CI-as-the-gate basis.

| AC | Tier(s) | Covering evidence |
|---|---|---|
| AC-ONBD-003-01 | 6 + 3 | `questionnaire-resolution.rls.test.ts` (server-side service-type match 6/6, DECISION-F `sortOrder ASC, id ASC` tiebreak; non-owner/null → null fail-closed); portal `onboarding-questionnaire.spec.ts:443` (test 18, 787ms); `questionnaire-cross-app.spec.ts` |
| AC-ONBD-003-02 | 3 | `@@unique([serviceId])` schema constraint (one template per service type); `onboarding.ts` `accessible: signed` unchanged (letter gate NOT weakened); `submitQuestionnaireAction` calls `checkStepAccessibility`; non-owner FILTER fail-closed (tier-3 live) |
| AC-ONBD-003-03 | 6 + 3 | `onboarding-questionnaire.rls.test.ts` (read-model satisfaction 10/10 — `questionnaireSubmittedAt != null` drives `done`, server-side); portal `onboarding-questionnaire.spec.ts:546` (test 19, 1.0s; `data-questionnaire-submitted` false→true) |
| AC-ONBD-003-04 | 3 + 6 | `submitQuestionnaireAsClient` owner-only INSERT+UPDATE batch; `@@unique([engagementId])` one-per-engagement; positive DB-backed recording test; cross-app `questionnaire-cross-app.spec.ts` (answer persisted across surfaces) |
| AC-DASH-012-01 | 6 + 2/5 | admin `questionnaire-templates.spec.ts:197` (test 11, 1.0s); 42 Vitest component tests (admin 184/184) |
| AC-DASH-012-02 | 3 + 6 | DECISION-F resolution test 6/6; `@@unique([serviceId])` constraint; admin `questionnaire-templates.spec.ts:270` (test 12, 2.6s) |
| AC-DASH-012-03 | 6 | admin `questionnaire-templates.spec.ts:369` (test 13, 1.0s — edit → navigate away/back → retained) |

**Plus the HARD extra gate (ADR-005, the second client-owned-row family — not a numbered AC but a brief
non-negotiable):** `questionnaire-answer.client-isolation.rls.test.ts` (7/7 live against the real SQL Server
container) — CLIENT-A reads own / CLIENT-B reads ZERO of CLIENT-A / null SESSION_CONTEXT reads ZERO / ACCOUNTANT
reads both / cross-client UPDATE BLOCK (rowsAffected=0) / template INSERT BLOCK (33504). The `pol_Questionnaire
Template` BLOCK-only accountant-write predicate is also covered.

**Conductor → `/planning validate EPIC-006 with CI evidence <merge run/SHA>`** after merge: flip these 7
COVERAGE rows `planned → verified` and roll EPIC-006 `planned → delivered`. EPIC-007 (initial document upload)
remains the next Phase-2 slice; EPIC-008 (onboarding completion + transition) is the Phase-2 capstone and needs
006 + 007 before it can start.

## Net-new platform capabilities delivered

- **Second client-owned-row family + second client-isolation policy** (`QuestionnaireAnswer` one-per-engagement;
  `db/policies/0006-questionnaire-policy.sql` `pol_QuestionnaireAnswer` with the ownership-join CLIENT branch
  mirroring `0005`). The isolation *mechanism* + its mandatory per-policy three-item HARD test land here;
  **REQ-AUTH-003 feature AC remain Phase-3-owned** (raised in the brief; not claimed by this slice).
- **First per-service-type template** (`QuestionnaireTemplate`, `@@unique([serviceId])`, accountant-owned
  BLOCK-only `pol_QuestionnaireTemplate`) — the catalog mechanism ADR-005 named `IntakeTemplate`; contrast
  EPIC-005's single global `LetterTemplate`.
- **Server-side engagement→service-type→template resolution** (`getQuestionnaireForEngagement` + no-arg
  `getMyQuestionnaire()`): FILTER-governed engagement gate FIRST, then service join (DECISION-F primary type),
  then template read; absent → null. No client-supplied ids — the client cannot pick their questionnaire.
- **Owner-only BLOCK-governed client submit** + the **read-model extension** (`intake-questionnaire.done` from
  `questionnaireSubmittedAt`, server-side satisfaction) — with the letter hard gate **NOT weakened**
  (`accessible: signed` unchanged).
- **Portal questionnaire step UI** behind the EPIC-005 letter gate (consumes the read model, does not re-derive
  gate logic; question content rendered as React text, no `dangerouslySetInnerHTML`).

## Out-of-scope honored (for the planning ledger)

No dynamic/conditional questionnaire organizer logic (REQ-ONBD-008 v2); no document-upload internals
(EPIC-007); no onboarding-completion transition (EPIC-008); no engagement-lifecycle pipeline beyond `New`
(Phase 3); no accountant answer-review UI (Phase 4); REQ-AUTH-003 feature AC not claimed. The
`document-upload` step refs in `OnboardingSequence.tsx` are pre-existing EPIC-005 spine placeholders, unchanged.

## Upstream items raised

- **None this slice.** ADR-005 already names the `IntakeTemplate` accountant-managed/client-readable catalog
  mechanism; the isolation mechanism + per-policy test land here, the REQ-AUTH-003 feature-AC boundary is
  already a planning-flagged note in the brief/epic. All five cited ADRs (003/004/005/006/012) are Accepted and
  governed the slice end-to-end. No new `OPEN-QUESTIONS.md` entry.

## Resolved this slice (was carried)

- **`inventory.md` Track-B drift** (RETRO-005 Obs 4 carry) — enumerated at TASK-006-001 (adds `0006` + the new
  entities; the natural carrier). **No longer carried.**
- **The TASK-006-001 carried `@@ROWCOUNT` glance-item** — resolved by the scoped 33504 try/catch in
  `submitQuestionnaireAsClient` (TASK-006-005). **No longer carried.**

## Carry-forward (see RETRO-006 § Carry-forward)

`scripts/smoke-test.sh` hardening (default `ADMIN_URL` :13001 + SA-password derivation); `@demo` screenshot
output scoping to `docs/demos/EPIC-NNN/`; AC-ONBD-001-01 EPIC-005 portal e2e flake (`beforeEach` timing);
clock-source `Completed-at`/`Started-at` inversion (6th occurrence); infra clean-volume bootstrap + `sqlserver`
healthcheck mismatch + P3019; SEC-3 per-connection SESSION_CONTEXT hardening; REQ-AUTH-003 feature AC (Phase 3);
real Docuseal enablement slice; CI `test-portal` `packages/**` build step + ESLint `adminDb` import-boundary.

## Docs-lane close-out (Conductor, post-merge)

- `docs/demos/EPIC-006/` gallery (6 AC-tagged PNGs, both surfaces) — rides the slice PR.
- COVERAGE/ROADMAP sign-off via `/planning validate EPIC-006` after merge.
- **NOT in the slice PR:** `.orchestration/STATE.md` + the `.planning/EPIC-002` reconciliation are the
  Conductor's out-of-slice docs-lane edits (uncommitted in the working tree) — they take the separate docs-lane,
  not this slice's branch.

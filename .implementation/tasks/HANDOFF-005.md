# HANDOFF-005 — BRIEF-005 / EPIC-005 completion report

**For the upstream producer (`.planning/` → COVERAGE write-back).** Slice: client onboarding spine +
engagement-letter e-sign gate (opens **Phase 2 — the onboarding gate**). Branch
`brief-005-onboarding-spine-engagement-letter` → **PR (pending)**. Status at handoff: **in
`## Awaiting PR merge`** (pre-merge gates 1–7 green; awaiting merge → Close-finalize gate 8).

## AC satisfied (10/10 in-scope — ready for COVERAGE `verified`)

**Evidence basis:** SDET acceptance-validation (10/10 traced to passing AC-tagged tests under the bound gherkin
prose-bind, tier-2/3/6 — each scenario text ↔ test assertion confirmed, not AC-tag-sharing) **+** SDET CI gate
(423 tests, 0 failures; 0 lint, 0 type errors) **+** container smoke (sign→unlock live against the docker
stack). Green **required** CI on the PR head is confirmed at Close-finalize (gate 8) per the EPIC-001/002/003/004
CI-as-the-gate basis (COVERAGE note [A]).

| AC | Tier(s) | Covering evidence |
|---|---|---|
| AC-ONBD-001-01 | 6 + 3 + 2 | `onboarding.spec.ts` (exactly 3 steps, fixed order via `[data-step]`); `onboarding-gate.rls.test.ts`; `onboarding-sequence.test.tsx`; `actions.test.ts` |
| AC-ONBD-001-02 | 3 | `onboarding-gate.rls.test.ts` (questionnaire + upload **refused** → `StepRefusal`); `actions.test.ts` (server-side gate, not hidden-only) |
| AC-ONBD-001-03 | 6 + 2 | `onboarding.spec.ts` (`data-current-step` + `data-remaining`, "Step 1 of 3"); `onboarding-gate.rls.test.ts`; `actions.test.ts` |
| AC-ONBD-002-01 | 3 | `onboarding-gate.rls.test.ts` (questionnaire `accessible:false` when `letterSignedAt` NULL); `engagement.persistence.test.ts` |
| AC-ONBD-002-02 | 3 | `onboarding-gate.rls.test.ts` (document-upload `accessible:false` when `letterSignedAt` NULL); `actions.test.ts` |
| AC-ONBD-002-03 | 6 | `onboarding.spec.ts` (click Sign → steps 2/3 `data-accessible="true"`, 3× zero-flake 397/403/409ms); `onboarding-cross-app.spec.ts` |
| AC-ONBD-002-04 | 3 | `engagement.persistence.test.ts` (`letterSignedAt` + evidence + snapshot set); `onboarding-gate.rls.test.ts` (rowsAffected=1, owner-only); `actions.test.ts` (audit row written after BLOCK pass; **no** row on rowsAffected=0) |
| AC-IDNT-007-01 | 2/5 + 6 | `engagement.persistence.test.ts` (seeded default `COUNT>=1`); admin `letter-template.spec.ts` (non-empty default shown); `letter-template/actions.test.ts` |
| AC-IDNT-007-02 | 2/5 + 6 | admin `letter-template.spec.ts` (edit → navigate away/back → retained); `engagement.persistence.test.ts`; admin unit |
| AC-IDNT-007-03 | 6 (cross-app) | `onboarding-cross-app.spec.ts` (accountant edits unique content → client `letter-content` contains it verbatim → client signs → unlock; 696ms) |

**Plus the HARD extra gate (ADR-005, the first client-owned rows — not a numbered AC but a brief
non-negotiable):** `engagement.client-isolation.rls.test.ts` — CLIENT-A reads own / CLIENT-B reads ZERO of
CLIENT-A / null SESSION_CONTEXT reads ZERO / ACCOUNTANT reads all / cross-client UPDATE BLOCK (rowsAffected=0,
admin read-back confirms unchanged). 6 tests + the 19-test `onboarding-gate.rls.test.ts` BLOCK proofs, all
against the real SQL Server container.

**Conductor → `/planning validate EPIC-005 with CI evidence <merge run/SHA>`** after merge: flip these 10
COVERAGE rows `planned → verified` and roll EPIC-005 `planned → delivered`. This **opens Phase 2** (onboarding
gate); EPIC-006/007/008 remain planned/decomposed.

## Net-new platform capabilities delivered

- **First client-owned rows + first client-isolation policy** (`Engagement` + onboarding-state columns;
  `db/policies/0005-engagement-policy.sql` with the live CLIENT-ownership branch). The isolation *mechanism* +
  its mandatory per-policy three-item test land here; **REQ-AUTH-003 feature AC remain Phase-3-owned** (raised
  in the brief; not claimed by this slice).
- **`packages/esign` provider seam** — port + deterministic mock binding + deferred Docuseal stub + fail-closed
  real-default selector (`ALLOW_MOCK_ESIGN` opt-in, not `NODE_ENV`). Onboarding depends only on the port.
- **Request-pool BLOCK-governed client write** (`recordLetterSignatureAsClient`) — SESSION_CONTEXT set in-batch
  with the UPDATE so the BLOCK predicate fences the write; fail-closed audit (no row on rowsAffected=0).
- **Server-side onboarding gate** (locked steps refused, not hidden) + the editable default letter template +
  the cross-surface edit→sign loop.

## Out-of-scope honored (for the planning ledger)

No engagement-lifecycle pipeline beyond `New` (no transitions/labels — Phase 3); no questionnaire internals
(EPIC-006); no document-upload internals (EPIC-007); no completion transition (EPIC-008); no real Docuseal
(`bindings/docuseal.ts` throws at call-time — deferred enablement slice, ADR-024 §5); no multi-participant
signing (Phase 3); REQ-AUTH-003 feature AC not claimed.

## Upstream items raised

- **None this slice.** ADR-023 (provider-seam/mock-first) + ADR-024 (Docuseal-behind-seam) are both
  **Accepted** and govern the e-sign seam end-to-end; the REQ-AUTH-003 feature-AC boundary is already a
  planning-flagged note in the brief/epic. No new `OPEN-QUESTIONS.md` entry.

## Resolved this slice (was carried)

- **`service.rls.test.ts` + `engagement.ts` comment-drift** (RETRO-002 Obs 3 → carried 4×) — comment-only
  corrections folded at this Close-prep (see RETRO-005 § `ungated-fix`). Handed to the main session to apply on
  the slice branch (gated-path edits + git are main-session-owned).

## Carry-forward (see RETRO-005 § Carry-forward)

Infra clean-volume bootstrap + `sqlserver` healthcheck mismatch + P3019 + Prisma OpenSSL warning;
`sp_set_session_context` CI grep-guard; `inventory.md` Track-B policy/entity enumeration; synthetic
`Completed-at`/`Started-at` clock source (5th occurrence); REQ-AUTH-003 feature AC (Phase 3); the real Docuseal
e-sign enablement slice; EPIC-001 `fn_service_access` CLIENT read-branch tightening; `jane-accountant.md` v2;
AC-AUTH-010-02 demo env mismatch.

## Docs-lane close-out (Conductor, post-merge)

- `docs/demos/EPIC-005/` gallery (7 AC-tagged PNGs + walkthrough) — rides the slice PR.
- COVERAGE/ROADMAP sign-off via `/planning validate EPIC-005` after merge.

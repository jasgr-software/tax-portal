# TASK-005-005: Onboarding read model + server-side step-accessibility gate + letter-sign action (portal)

**Brief**: BRIEF-005
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: io
**Depends on**: TASK-005-001 (Engagement/onboarding-state schema + isolation policy + repo), TASK-005-002 (`ESignatureProvider` seam), TASK-005-003 (engagement exists + client link), TASK-005-004 (template content to present)
**Impl**: developer
**E2e-required**: no
**Brief-deploys**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-ONBD-001-01, AC-ONBD-001-02, AC-ONBD-001-03 (read model + ordered steps + position — server side), AC-ONBD-002-01, AC-ONBD-002-02 (questionnaire + upload **server-side-locked** until signed), AC-ONBD-002-03 (sign → unlock), AC-ONBD-002-04 (signature evidence recorded against the engagement + audited), AC-IDNT-007-03 (the letter presented is the accountant's edited template).
**Upstream refs:** ADR-001/ADR-005 (onboarding reachable only by the authenticated CLIENT who owns the engagement; role server-set), ADR-003 (client-principal reads + the signature write via `withRequestContext`), ADR-019 (signature is a security-significant audited event — fail-closed write, reuse `recordAuthEvent`/`withAuditTransaction`), ADR-023/024 (sign through the `ESignatureProvider` port — mock binding; never Docuseal directly).
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _the sign→unlock e2e happy path is TASK-005-007; this task proves the gate at tier-3_
- [ ] **Security review** — server-side gate (locked step **refused**, not hidden); client owns the engagement (isolation policy + identity guard); signature evidence not client-asserted (comes from the provider port); audit fail-closed
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Server-side enforcement is the load-bearing check (brief extra-gate + ADR-012 tier-3).** The questionnaire/upload steps are **inaccessible until the letter is signed** because the server **refuses** the action (checks `letterSignedAt != null`) — not merely because a UI link is hidden. Prove AC-ONBD-001-02 / AC-ONBD-002-01/-02 at **tier-3** (call the accessibility/step-entry function directly with an unsigned engagement → refused). A reviewer must be able to bypass the UI and still be blocked.
- **Ownership + identity** — onboarding reads run under the client principal via `withRequestContext`; the `sec.pol_Engagement` FILTER (TASK-005-001) means a non-owner CLIENT reads ZERO. Add the new portal `getClientIdentity()` (mirror admin `getAccountantIdentity()`); role from the verified session only.
- **AC-ONBD-002-04 evidence + audit** — on signature the provider's completion evidence is recorded against the engagement (`letterSignedAt`, `letterSignatureEvidence`, `letterTemplateSnapshot`) **and** `recordAuthEvent({ action: 'engagement.letter_signed', … })` writes inside the same transaction (fail-closed). The "signed" decision comes from `ESignatureProvider.verifyCompletion`, never from a client-supplied "I signed" claim (ADR-024 §3 trust boundary — even under the mock).
- **AC-IDNT-007-03** — the content signed is `LetterTemplate.content` as it stands at sign time, snapshotted into `letterTemplateSnapshot`.

## Context

This is the heart of the slice: the client opens their engagement, the onboarding read model resolves the three ordered steps + accessibility server-side, and the client signs the engagement letter through the mock `ESignatureProvider`. On a provider-verified completion, the signature is recorded against the engagement + audited, and steps 2/3 unlock. Steps 2/3 internals are out of scope (EPIC-006/007) — this task gates them.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/onboarding/actions.ts` | create | `getClientIdentity()`; `getOnboardingAction(engagementId)` (read model); `signEngagementLetterAction(engagementId)` (drive the port, record evidence + audit, unlock) |
| `packages/db/src/onboarding.ts` (or extend `repositories/engagement.ts`) | modify | `resolveOnboarding(engagement)` → ordered steps + per-step `accessible` + position; `recordLetterSignature(engagementId, evidence, snapshot, txn)` |
| `packages/db/src/index.ts` | modify | barrel-export the onboarding read model + signature recorder |
| `apps/portal/src/app/onboarding/actions.test.ts` | create | tier-2/3 — unsigned: steps 2/3 refused; sign drives port + records evidence + audit; signed: steps 2/3 accessible; non-owner CLIENT blocked |
| `packages/db/src/onboarding-gate.rls.test.ts` | create | tier-3 — server-side accessibility under client principal; locked step refused; ownership isolation |

## Onboarding read/accessibility contract (binding — IO Design expansion)

- **Steps (fixed order, AC-ONBD-001-01):** `['engagement-letter', 'intake-questionnaire', 'document-upload']`.
- `getOnboardingAction(engagementId)` (client principal) returns:
  ```ts
  { engagementId, steps: [
      { key: 'engagement-letter',  accessible: true,  done: letterSignedAt != null },
      { key: 'intake-questionnaire', accessible: letterSignedAt != null, done: false },
      { key: 'document-upload',      accessible: letterSignedAt != null, done: false } ],
    currentStep, remaining }   // AC-ONBD-001-03 position + remaining
  ```
- **Refusal (AC-ONBD-001-02, AC-ONBD-002-01/-02):** any server entry point for steps 2/3 (and the sign action's preconditions) checks `letterSignedAt != null` and **refuses** when locked — returns a refusal result / 404-equivalent, not a hidden link. Deriving step state from `letterSignedAt` + the fixed order keeps it drift-free.
- **`signEngagementLetterAction(engagementId)` (AC-ONBD-002-03/-04, IDNT-007-03):**
  1. `getClientIdentity()` → must be the CLIENT owning the engagement (isolation policy + identity guard).
  2. Load the engagement (client principal) + the current `LetterTemplate.content`.
  3. `provider.createSignatureRequest({ engagementId, letterContent: template.content, signer })` then `provider.verifyCompletion(ref)` (mock → `signed: true`).
  4. On `signed: true`, in a `withAuditTransaction`: `recordLetterSignature(engagementId, evidence, snapshot=template.content, txn)` (sets `letterSignedAt`/`letterSignatureEvidence`/`letterTemplateSnapshot`) **and** `recordAuthEvent({ action: 'engagement.letter_signed', targetType: 'Engagement', targetId: engagementId, sourceSurface: 'portal', … }, txn)`.
  5. `revalidatePath('/onboarding')` so the unlocked steps render.

## Tests to Write First

- [ ] `[AC-ONBD-001-01] getOnboardingAction returns exactly three steps in order`
- [ ] `[AC-ONBD-002-01] questionnaire step refused/inaccessible when letterSignedAt is NULL` (server-side)
- [ ] `[AC-ONBD-002-02] document-upload step refused/inaccessible when letterSignedAt is NULL` (server-side)
- [ ] `[AC-ONBD-001-02] a later step cannot be entered before the letter is signed` (server refuses)
- [ ] `[AC-ONBD-002-03] after signEngagementLetterAction, steps 2/3 become accessible`
- [ ] `[AC-ONBD-002-04] signature records evidence against the engagement + writes an audit row` (same txn)
- [ ] `[AC-IDNT-007-03] the content presented/snapshotted is the accountant's edited template`
- [ ] `[ADR-005] a CLIENT who does not own the engagement is blocked` (isolation)
- [ ] `[AC-ONBD-001-03] currentStep + remaining reflect signed/unsigned state`

## Implementation Notes

- Add `getClientIdentity()` to the portal mirroring admin `getAccountantIdentity()` (synthetic Request from cookies → `getAuthProvider().getIdentity()` → require `role === 'CLIENT'`). The portal currently relies on middleware only (the dashboard stub has no server identity helper) — this is the first portal server action needing CLIENT identity.
- The "signed" signal must come from `ESignatureProvider.verifyCompletion`, not a client argument — even the mock must be driven through the port so the real-Docuseal swap is a clean binding change (ADR-024 §3/§5).
- New audit action string `engagement.letter_signed` extends the existing `action` field (no schema change — ADR-019 §ACTION VALUES extensible).

## Definition of Done

- [ ] Onboarding read model returns three ordered steps + position + per-step accessibility (server-derived)
- [ ] Steps 2/3 server-side-refused until signed; signed unlocks them
- [ ] Signing drives the `ESignatureProvider` port; evidence recorded against the engagement + audited in one txn
- [ ] The presented/snapshotted letter is the accountant's edited template
- [ ] Non-owner CLIENT blocked; lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

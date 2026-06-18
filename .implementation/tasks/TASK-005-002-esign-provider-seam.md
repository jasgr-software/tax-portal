# TASK-005-002: `packages/esign` provider seam — port + mock binding + fail-closed selector

**Brief**: BRIEF-005
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: io
**Depends on**: none (parallel-safe with TASK-005-001; sequenced after for dispatch ordering)
**Impl**: developer
**E2e-required**: no
**Brief-deploys**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** none (infra seam — justification: this task ships the `ESignatureProvider` port + mock binding + selector that TASK-005-005 consumes to satisfy AC-ONBD-002-*; it has no user-facing behavior of its own. The ONBD-002 AC are verified against the mock in -005/-007).
**Upstream refs:** ADR-023 (provider-seam & mock-first integration — the governing pattern), ADR-024 (e-signature via Docuseal behind the seam — §1 the seam, §5 mock-first sequencing, §6 template boundary). Both **Accepted** — no consult needed.
**Introduces-gate:** **advisory** — the fail-closed selector is a security-relevant boundary; provide gate-authoring-style evidence in the Work Log (the selector's green test + the named fail-closed code path + a counterfactual) but it lands advisory, not a required CI check.

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _no e2e for this seam; the e2e gate is TASK-005-007_
- [ ] **Security review** — fail-closed selector; mock unreachable in a production config; no secrets committed
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **ADR-023 §4 fail-closed selection is the load-bearing check.** Verify the selector **defaults to the real binding** and the mock is selectable **only** via an explicit `ALLOW_MOCK_ESIGN=true` non-production opt-in — the **inverse default** of `packages/auth` `select.ts` (which defaults to mock). A real config (`ESIGN_PROVIDER=docuseal`, `ALLOW_MOCK_ESIGN` unset) must bind the real (deferred-stub) binding or throw; it must **never** silently fall back to the mock. `ESIGN_PROVIDER=docuseal` + `ALLOW_MOCK_ESIGN=true` is a contradiction → throw (mirror the auth contradiction guard).
- **ADR-023 §6** — the mock is behavior-faithful (deterministic `signed: true` + an evidence shape matching the port), **not** security-faithful; the binding's comments must not claim otherwise.
- **Port shape** — narrow; names only what onboarding needs; onboarding depends on the port, never on a binding class.

## Context

The engagement letter is e-signed through an `ESignatureProvider` seam (ADR-023/024). This slice ships the **mock binding only**; the real self-hosted Docuseal binding + verified/idempotent completion callback + reconciliation fallback + encrypted signed-doc storage are a **deferred enablement slice** (ADR-024 §5). This task stands up the seam so TASK-005-005 can drive signing through the port. The seam **must fail closed** — the mock can never be active in a production configuration (the BUG-002-001 generalization, ADR-023 §4).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/esign/package.json` | create | `@tax-portal/esign` workspace package (mirror `packages/email` package.json) |
| `packages/esign/tsconfig.json` | create | extends `@tax-portal/tsconfig` |
| `packages/esign/src/port.ts` | create | `ESignatureProvider` interface + `SignatureRequest`/`SignatureCompletion` types |
| `packages/esign/src/bindings/mock.ts` | create | `MockESignatureProvider` — deterministic `signed: true` + evidence |
| `packages/esign/src/bindings/docuseal.ts` | create | `DocusealESignatureProvider` — deferred stub; throws `EsignBindingNotAvailableError` if invoked |
| `packages/esign/src/select.ts` | create | `getESignatureProvider()` singleton; fail-closed, real-default selector keyed on `ESIGN_PROVIDER` + `ALLOW_MOCK_ESIGN` |
| `packages/esign/src/index.ts` | create | barrel — exports port types + `getESignatureProvider` + `resetESignProviderForTesting`; **NOT** the binding classes |
| `packages/esign/src/esign.test.ts` | create | unit — mock determinism + the fail-closed selector matrix |
| `docker-compose.yml` | modify | set `ESIGN_PROVIDER`/`ALLOW_MOCK_ESIGN` on the portal service (mock for local/e2e) |
| `.env.example` | modify | document `ESIGN_PROVIDER` + `ALLOW_MOCK_ESIGN` |
| `.implementation/operations/inventory.md` + `runbook.md` | modify | record the new e-sign env vars (per CLAUDE.md § DevOps — env-var change) |

## Interface contract (binding — IO Design expansion)

```ts
export interface SignatureRequest { engagementId: string; ref: string }  // ref = provider-side handle
export type SignatureCompletion =
  | { signed: true; signedAt: string; evidence: string }   // evidence = serialized signed-letter proof
  | { signed: false };

export interface ESignatureProvider {
  /** Create a signature request over the supplied letter content for the signing client. */
  createSignatureRequest(input: {
    engagementId: string;
    letterContent: string;
    signer: { clerkUserId: string; email?: string };
  }): Promise<SignatureRequest>;
  /** Recognize/verify completion. Mock returns a deterministic signed completion. */
  verifyCompletion(ref: string): Promise<SignatureCompletion>;
}
```
- **Mock binding:** `createSignatureRequest` returns a deterministic `ref`; `verifyCompletion` returns `{ signed: true, signedAt: <fixed/now ISO>, evidence: JSON.stringify({ provider: 'mock', engagementId, ... }) }`. No external calls.
- **Selector (`select.ts`) — fail-closed, real-default (DECISION-E):**
  ```
  const raw = process.env.ESIGN_PROVIDER;                 // default → 'docuseal' (real), NOT mock
  const provider = (raw ?? 'docuseal').toLowerCase();
  const allowMock = (process.env.ALLOW_MOCK_ESIGN ?? '').toLowerCase() === 'true';
  if (provider === 'mock' && !allowMock) throw … // mock forbidden without explicit non-prod opt-in
  if (provider === 'docuseal' && allowMock) throw … // contradiction (mirror auth guard)
  switch (provider) { case 'mock': MockESignatureProvider; case 'docuseal': DocusealESignatureProvider; default: throw }
  ```
  > **Inverted default vs. `packages/auth`:** auth defaults to `mock` (its non-prod posture predates ADR-023); ADR-023 §4 mandates the **real binding as default**. E-sign is the first seam authored under ADR-023, so it sets the correct precedent: real-default, mock only on explicit opt-in.

## Tests to Write First

- [ ] `mock createSignatureRequest + verifyCompletion is deterministic and returns signed:true with evidence`
- [ ] `selector binds mock when ESIGN_PROVIDER=mock AND ALLOW_MOCK_ESIGN=true`
- [ ] `selector THROWS when ESIGN_PROVIDER=mock and ALLOW_MOCK_ESIGN unset` (fail-closed) — expected: throw
- [ ] `selector THROWS on ESIGN_PROVIDER=docuseal + ALLOW_MOCK_ESIGN=true` (contradiction) — expected: throw
- [ ] `selector binds the docuseal (deferred-stub) binding when ESIGN_PROVIDER=docuseal, ALLOW_MOCK_ESIGN unset` — selection completes; binding throws only at call-time
- [ ] `unknown ESIGN_PROVIDER throws at selection` — expected: throw
- [ ] `index.ts barrel does NOT export binding classes` (only port + getter + test reset)

## Implementation Notes

- Mirror `packages/email` / `packages/auth` structure exactly (port + bindings + select + barrel + singleton + `resetESignProviderForTesting`).
- `ALLOW_MOCK_ESIGN=true` only in `docker-compose.yml` (portal service) + local `.env.local`; a real deploy sets `ESIGN_PROVIDER=docuseal` and leaves `ALLOW_MOCK_ESIGN` unset.
- DevOps doc obligation: this touches env vars → update `inventory.md` + `runbook.md` (CLAUDE.md § DevOps).

## Definition of Done

- [ ] `@tax-portal/esign` package with port + mock + docuseal-stub + fail-closed selector + barrel
- [ ] Selector fail-closed matrix tests pass (mock-without-opt-in throws; contradiction throws; real default)
- [ ] env vars wired in docker-compose.yml + documented in .env.example + inventory/runbook updated
- [ ] lint + type-check + build pass; no binding class leaked through the barrel

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

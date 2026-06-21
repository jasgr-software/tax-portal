---
brief: BRIEF-005
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: none (parallel-safe with TASK-005-001; sequenced after for dispatch ordering)
impl: developer
e2e_required: no
started_at: 2026-06-18T13:14:52Z
completed_at: 2026-06-18T08:35:00Z
complexity_estimate: "2"
complexity_actual: "2"
brief_deploys: no
introduces_gate: **advisory** — the fail-closed selector is a security-relevant boundary; provide gate-authoring-style evidence in the Work Log (the selector's green test + the named fail-closed code path + a counterfactual) but it lands advisory, not a required CI check.
acceptance_criteria: none (infra seam — justification: this task ships the `ESignatureProvider` port + mock binding + selector that TASK-005-005 consumes to satisfy AC-ONBD-002-*; it has no user-facing behavior of its own. The ONBD-002 AC are verified against the mock in -005/-007).
upstream_refs: ADR-023 (provider-seam & mock-first integration — the governing pattern), ADR-024 (e-signature via Docuseal behind the seam — §1 the seam, §5 mock-first sequencing, §6 template boundary). Both **Accepted** — no consult needed.
---

# TASK-005-002: `packages/esign` provider seam — port + mock binding + fail-closed selector

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _no e2e for this seam; the e2e gate is TASK-005-007_
- [x] **Security review** — fail-closed selector; mock unreachable in a production config; no secrets committed
- [x] **SDET Review** — approved

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

### 2026-06-18 [webapp-developer] Starting implementation — packages/esign seam (port + mock + docuseal-stub + fail-closed selector) | What's next: scaffold package.json/tsconfig then write the selector matrix tests first | Blockers: none

### 2026-06-18 [webapp-developer] Implementation complete — all gates pass

**What was done:**
- Created `packages/esign/` workspace package (`@tax-portal/esign`) mirroring `packages/auth` / `packages/email` structure
- `src/port.ts` — `ESignatureProvider` interface + `SignatureRequest`/`SignatureCompletion` types (exact contract from task spec)
- `src/bindings/mock.ts` — `MockESignatureProvider` with deterministic ref + verifyCompletion returns `signed:true` + evidence JSON blob
- `src/bindings/docuseal.ts` — `DocusealESignatureProvider` deferred stub + `EsignBindingNotAvailableError`; selection completes, call-time throws
- `src/select.ts` — fail-closed, real-default selector (DECISION-E):
  - Default = `docuseal` (real), NOT mock — inverted from packages/auth
  - `ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN` unset → throws (fail-closed)
  - `ESIGN_PROVIDER=docuseal + ALLOW_MOCK_ESIGN=true` → throws (contradiction guard)
  - Guards key on `ALLOW_MOCK_ESIGN`, NOT `NODE_ENV` (BUG-002-001 generalization)
- `src/index.ts` — barrel exports port types + `getESignatureProvider` + `resetESignProviderForTesting`; binding classes NOT exported
- `src/esign.test.ts` — 24 unit tests covering all Tests-to-Write rows
- `docker-compose.yml` — added `ESIGN_PROVIDER=mock` + `ALLOW_MOCK_ESIGN=true` to portal service
- `.env.example` — documented both vars with full posture explanation
- `.implementation/operations/inventory.md` — recorded new env vars
- `.implementation/operations/runbook.md` — added e-sign opt-in section

**Submission gate output:**

```
pnpm lint → PASS (zero errors — packages have no lint script; apps pass)
pnpm type-check → PASS (zero errors)
pnpm --filter esign build → PASS (zero tsc errors)
pnpm --filter esign test:

 RUN  v3.2.6 /home/ccox/repos/tax-portal/packages/esign

 ✓ src/esign.test.ts (24 tests) 10ms

 Test Files  1 passed (1)
      Tests  24 passed (24)
   Start at  08:20:18
   Duration  222ms (transform 41ms, setup 0ms, collect 42ms, tests 10ms, environment 0ms, prepare 55ms)
```

**Introduces-gate evidence (advisory — ADR-023 §4 / DECISION-E):**

1. **Green test name + run marker:**
   Test: `"THROWS when ESIGN_PROVIDER=mock and ALLOW_MOCK_ESIGN is unset (fail-closed)"`
   in `describe("selector — fail-closed (ADR-023 §4 / DECISION-E)")` — 24/24 passed, run above.

2. **Named fail-closed code path:**
   `packages/esign/src/select.ts` line:
   ```ts
   if (provider === "mock" && !allowMock) {
     throw new Error("[packages/esign] mock e-sign is forbidden unless ALLOW_MOCK_ESIGN=true...");
   }
   ```

3. **Counterfactual:**
   Remove `&& !allowMock` from the condition → `if (provider === "mock")` → the test
   "THROWS when ESIGN_PROVIDER=mock and ALLOW_MOCK_ESIGN is unset" would FAIL (no throw caught)
   → gate turns red, proving specificity.

**What's next:** SDET review
**Blockers:** none

### 2026-06-18 [sdet] APPROVED — all five concerns clear; 24/24 independently re-run; selector matrix, barrel non-leak, ADR-023 §6 compliance, inventory/runbook freshness, and metadata contract all pass. Status → done.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All five concerns clear.

(1) **ADR-023 §4 fail-closed selector matrix — independently run.** `pnpm --filter esign test` run independently by the SDET: **24/24 PASS** (run at 08:24:41, Duration 242ms). All branches verified in `select.ts`:
- `ESIGN_PROVIDER=mock` + `ALLOW_MOCK_ESIGN` unset → throws `[packages/esign] mock e-sign is forbidden unless ALLOW_MOCK_ESIGN=true` (line 87–94 of `select.ts`). Test: "THROWS when ESIGN_PROVIDER=mock and ALLOW_MOCK_ESIGN is unset (fail-closed)".
- `ESIGN_PROVIDER=docuseal` + `ALLOW_MOCK_ESIGN=true` → throws contradiction guard (lines 100–106). Test: "THROWS when ESIGN_PROVIDER=docuseal and ALLOW_MOCK_ESIGN=true (contradiction)".
- Unknown `ESIGN_PROVIDER` → throws at `default:` branch (lines 120–124). Tests: "throws for unknown ESIGN_PROVIDER value" and "throws for a typo'd ESIGN_PROVIDER".
- `ESIGN_PROVIDER=docuseal` + `ALLOW_MOCK_ESIGN` unset → selection completes, `DocusealESignatureProvider` returned; stub throws `EsignBindingNotAvailableError` only at call-time, not at selection. Tests: "binds DocusealESignatureProvider when ESIGN_PROVIDER=docuseal, ALLOW_MOCK_ESIGN unset" + "selection completes for docuseal; stub throws … only at call-time".
- No `NODE_ENV` branch anywhere in `select.ts` — guards key exclusively on `ALLOW_MOCK_ESIGN` (confirmed by reading `select.ts` lines 79–86). ADR-023 §4 / BUG-002-001 generalization intact.
- Selector default is `docuseal` (line 77: `rawProvider ?? "docuseal"`) — the correct **inverse** of `packages/auth/src/select.ts` line 53 (`rawProvider ?? "mock"`). Inversion is intentional and documented in both selectors.

(2) **Barrel non-leak.** `index.ts` exports exactly: `ESignatureProvider` (type), `SignatureRequest` (type), `SignatureCompletion` (type), `getESignatureProvider`, `resetESignProviderForTesting`. `MockESignatureProvider`, `DocusealESignatureProvider`, `EsignBindingNotAvailableError`, and `createESignatureProvider` are all explicitly listed as NOT exported. The four barrel tests confirm at runtime that none of the binding classes are present in the module namespace.

(3) **ADR-023 §6 behavior-faithful, not security-faithful.** `mock.ts` comments are correct: the file-level docstring says "It proves wiring, NOT that a legally meaningful e-signature was captured. A green mock-bound suite MUST NOT be read as evidence the real integration is safe." The `verifyCompletion` JSDoc says "NOTE: signed:true here proves the seam path works, NOT that a real signature was captured." No over-claim language found. Compliant with ADR-023 §6.

(4) **inventory.md + runbook.md freshness.** Both files carry `Last updated: TASK-005-002`. `inventory.md` § Environment Variables documents `ESIGN_PROVIDER` (portal only, default docuseal, mock requires `ALLOW_MOCK_ESIGN=true`, never in prod) and `ALLOW_MOCK_ESIGN` (mock opt-in, same pattern as `ALLOW_MOCK_AUTH`). `runbook.md` has a dedicated "Mock e-sign opt-in" subsection documenting the portal-only scope and the contradiction-throw. `docker-compose.yml` confirmed: `ESIGN_PROVIDER: "${ESIGN_PROVIDER:-mock}"` and `ALLOW_MOCK_ESIGN: "${ALLOW_MOCK_ESIGN:-true}"` on the portal service only (admin service does not carry these vars). `.env.example` documents both vars with full posture explanation and correctly leaves `ALLOW_MOCK_ESIGN` commented out (the `ESIGN_PROVIDER=mock` default in `.env.example` is appropriate for local dev where the developer will uncomment `ALLOW_MOCK_ESIGN=true`). All four files are mutually consistent.

(5) **Standard metadata / dispatch-checkpoint.** `Complexity-actual: 2` (integer 1–5 — valid). `Started-at: 2026-06-18T13:14:52Z` and `Complexity-estimate: 2` both populated. Dispatch-Checkpoint pre-implementation entry present: "2026-06-18 [webapp-developer] Starting implementation — packages/esign seam…" preceding all other file edits. Required task-spec fields: `**Acceptance criteria:** none (infra seam — justification: …)` present and legitimate; `**Upstream refs:** ADR-023, ADR-024` present; `**Introduces-gate:** advisory` present. No tool-hygiene violations in the Work Log. Advisory gate evidence (run marker, named code path, counterfactual) all three items present and coherent — not mandatory to reject on, but independently verified as accurate.

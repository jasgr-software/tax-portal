# TASK-005-007: E2e + gherkin binding + cross-app (portal onboarding + admin template edit)

**Brief**: BRIEF-005
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: io
**Depends on**: TASK-005-003 (engagement on accept), TASK-005-004 (template edit), TASK-005-005 (gate + sign), TASK-005-006 (onboarding UI)
**Impl**: developer
**E2e-required**: **yes**
**Brief-deploys**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-ONBD-001-01, AC-ONBD-001-03 (sequence rendered, position shown — e2e tier 6), AC-ONBD-002-03 (sign → unlock happy path — e2e), AC-IDNT-007-03 (edited template shown to the client — cross-app edit→sign). (The tier-3 server-side ACs — ONBD-001-02, ONBD-002-01/-02/-04 — are proven in TASK-005-001/-005; this task adds their e2e where the brief's tier map places them at tier 6.)
**Upstream refs:** ADR-012 (testing pyramid — tier-6 e2e for the end-to-end sign path), ADR-006 (cross-app edit→sign spans admin + portal), ADR-023/024 (e2e runs against the **mock** e-sign binding via `ALLOW_MOCK_ESIGN=true` in the e2e container).
**Introduces-gate:** **advisory** — the e-sign mock e2e is a new e2e surface. Provide gate-authoring-style evidence in the Work Log (the green run + the named code path the e2e covers + a counterfactual); it lands advisory (e2e is not a per-PR required check — CLAUDE.md).

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [ ] **Targeted e2e** — **actual execution output in Work Log** (portal + admin + cross-app); 3× zero-flake for the sign→unlock spec
- [ ] **Security review** — e2e drives the mock e-sign through the port; no test-only auth/e-sign bypass leaks into a production-reachable path (the BUG-002-001/BUG-003-001 lesson)
- [ ] **SDET Review** — approved (SDET re-runs independently; cannot approve on developer evidence alone)

## SDET Review focus areas

- **E2e proof is mandatory (ENGINE.md § Submission Gate).** "Curl"/"not executed"/"Docker unavailable" are not substitutes. SDET independently re-runs the sign→unlock spec **3× zero-flake** (the BUG-003-001 lesson — watch for rate-limit/singleton/container-env flake sources; the e-sign mock is deterministic, so flake here is a real defect).
- **Gherkin binding (no re-authoring).** The 10 epic scenarios (`.planning/EPIC-005 § Acceptance scenarios`) are the contract. Transcribe them **verbatim** into the `.feature` file(s) (tagged with AC ids + tier), and ensure the Playwright `.spec.ts` tests cover the behavior each scenario describes (prose-bound until the Cucumber tooling lands — CLAUDE.md § Executable gherkin tooling). Drift from a scenario is a rejection.
- **Cross-surface (CLAUDE.md § Platform-frontend scope).** Validate **both** surfaces: `apps/portal` (client sign→unlock, position/sequence) and `apps/admin` (accountant edits template), plus `pnpm e2e:cross-app` for the edit→client-sees-edited-letter path.
- **Container env** — `ESIGN_PROVIDER=mock` + `ALLOW_MOCK_ESIGN=true` set on the portal e2e container (docker-compose), mirroring the `ALLOW_MOCK_AUTH` pattern.

## Context

The end-to-end sign path runs against the full docker-compose stack: a post-signup client walks the three-step sequence, signs the engagement letter (mock e-sign), and the later steps unlock; the accountant's edited template is what the client signs. This is the tier-6 e2e gate for the slice.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/e2e/features/onboarding.feature` | create | The epic's onboarding/sign/unlock gherkin scenarios, verbatim, tagged with AC ids + tier |
| `apps/admin/e2e/features/letter-template.feature` | create | The IDNT-007 template-edit scenarios, verbatim |
| `apps/portal/e2e/onboarding.spec.ts` | create | Playwright — sequence rendered (ONBD-001-01/-03), sign→unlock (ONBD-002-03) |
| `apps/admin/e2e/letter-template.spec.ts` | create | Playwright — default present, edit persists (IDNT-007-01/-02 e2e surface) |
| `apps/portal/e2e/onboarding-cross-app.spec.ts` (or extend the cross-app suite) | create | Edit template in admin → client signs/sees the edited letter (IDNT-007-03) — `pnpm e2e:cross-app` |
| `docker-compose.yml` | modify | `ESIGN_PROVIDER=mock`, `ALLOW_MOCK_ESIGN=true` on the portal e2e service (if not set by TASK-005-002) |

## Implementation Notes

- Reuse the EPIC-003/004 e2e helpers (mock-session establishment, DB cleanup with `try/finally`, unique-email helpers) and the `@demo`/`e2e:run` exclusion conventions. The mock e-sign is deterministic — no `waitForEmail`-style external dependency, so the sign→unlock spec should be stable; still run 3× zero-flake per the gate.
- Seed an accepted-request → engagement → signed-up-client fixture (the dependency chain from TASK-005-003) at test setup; or drive the full accept→signup→onboard flow if the helpers make it cheap.
- Tag every test with its AC id in the title/annotation (the EPIC-003 convention) so the Validate traceability table maps cleanly.

## Tests to Write First

- [ ] `[AC-ONBD-001-01] onboarding shows three ordered steps` (portal e2e)
- [ ] `[AC-ONBD-001-03] onboarding shows current position + remaining` (portal e2e)
- [ ] `[AC-ONBD-002-03] signing the letter unlocks steps 2/3` (portal e2e — 3× zero-flake)
- [ ] `[AC-IDNT-007-01/-02] accountant sees + edits the default template` (admin e2e)
- [ ] `[AC-IDNT-007-03] the client signs the accountant's edited template` (cross-app)

## Definition of Done

- [ ] `.feature` files transcribe the epic's 10 scenarios verbatim (tagged); Playwright specs cover them
- [ ] portal + admin + cross-app e2e green against the docker-compose stack (mock e-sign)
- [ ] sign→unlock spec 3× zero-flake (SDET re-runs independently)
- [ ] actual e2e execution output captured in the Work Log
- [ ] lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:

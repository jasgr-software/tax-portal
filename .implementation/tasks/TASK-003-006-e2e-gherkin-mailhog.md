# TASK-003-006: E2e suite (admin) — accept→invite & decline→email happy paths, inbox states, Mailhog assertions, gherkin binding

**Brief**: BRIEF-003
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-003-003, TASK-003-004, TASK-003-005
**Impl**: developer
**E2e-required**: yes
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-DOOR-005-02 (notification leads to the request), AC-DOOR-006-01 (view details), AC-DOOR-006-02 (accept), AC-DOOR-006-03 (decline), AC-DOOR-007-01 (invitation email arrives), AC-DOOR-008-01 (reason capture), AC-DOOR-008-02 (reason email arrives), AC-DOOR-008-04 (reason retained/shown), AC-DASH-011-01 (view all), AC-DASH-011-02 (states), AC-DASH-011-03 (pending identifiable)
**Upstream refs:** ADR-012 (testing pyramid — tier-6 e2e), ADR-006 (admin surface), REQ-NFR-008 (email delivery proven against Mailhog)
**Introduces-gate:** advisory (the e2e Mailhog email-delivery assertion is the slice's email gate — § Gate Authoring Rules three-item evidence in the Work Log)

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + `pnpm --filter admin e2e:run` (full stack incl. Mailhog)
- [ ] **Targeted e2e** — actual execution output in the Work Log; accept→invite & decline→email specs run **3× zero-flake** (e2e-heavy, § Bug Fixes pre-push rule applies to new e2e specs)
- [ ] **Security review** — e2e auths as ACCOUNTANT via the mock-session fixture; asserts a non-accountant cannot reach the inbox/actions
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Real stack** — Docker pre-flight; runs against SQL Server + admin Next.js + **Mailhog**. Email assertions read the **Mailhog HTTP API** (`http://localhost:8025/api/v2/...`) — the invitation email (AC-DOOR-007-01) and the decline reason email (AC-DOOR-008-02) must actually arrive, to the prospect's contact email.
- **Gherkin binding (CLAUDE.md § Executable gherkin tooling)** — the brief sets `acceptance_format: gherkin`; bind the epic's 20 scenarios (do NOT re-author them) as `.feature` + spec coverage. Until the Cucumber tooling lands, `.feature` files are human-readable specs and the `.spec.ts` must cover the scenario behavior.
- **Flake discipline** — new e2e specs run 3× sequentially with zero flakes before review; capture the runs in the Work Log.
- Gate-authoring three-item evidence for the email-delivery e2e gate (run/job + named code path the gate catches + counterfactual).

## Context

End-to-end proof of the slice's two happy paths and the inbox read surface, against the real container stack including Mailhog. This is where the email-send AC (AC-DOOR-007-01, AC-DOOR-008-02) are proven for real (the unit/tier-3 in TASK-003-002/-005 use the mock/in-memory binding).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/specs/request-inbox.spec.ts` | Create | Inbox list/states/pending + view details (AC-DASH-011-*, AC-DOOR-006-01); notification leads to request (AC-DOOR-005-02). |
| `apps/admin/e2e/specs/request-accept.spec.ts` | Create | Accept → status accepted → invitation email in Mailhog to the prospect (AC-DOOR-006-02, AC-DOOR-007-01). |
| `apps/admin/e2e/specs/request-decline.spec.ts` | Create | Decline with reason → status declined → reason email in Mailhog + reason retained/shown (AC-DOOR-006-03, AC-DOOR-008-01/-02/-04). |
| `apps/admin/e2e/features/request-inbox.feature` | Create | The epic's 20 gherkin scenarios, bound (human-readable spec until Cucumber tooling lands). |
| `apps/admin/e2e/fixtures/mailhog.ts` | Create | Helper to query/clear the Mailhog API. |
| `apps/admin/e2e/fixtures/requests.ts` | Create | Seed/cleanup engagement requests for the specs. |

## Tests to Write First

- [ ] `AC-DOOR-006-02 + AC-DOOR-007-01 — accept then invitation email arrives in Mailhog` — expected: status accepted + email to prospect
- [ ] `AC-DOOR-006-03 + AC-DOOR-008-02/-04 — decline then reason email arrives + reason retained` — expected: status declined + email + reason shown on detail
- [ ] `AC-DASH-011-01/-02/-03 — inbox lists all, states distinct, pending identifiable` — expected: matches
- [ ] `AC-DOOR-005-02 — notification leads to the request` — expected: opening the notification reaches the request detail

## Implementation Notes

- Use the admin mock-session fixture (`apps/admin/e2e/fixtures/auth.ts`) to sign in as ACCOUNTANT.
- Clear Mailhog before each email assertion to avoid cross-test bleed.
- Run the email specs 3× zero-flake before marking review (pre-push e2e rule).

## Work Log

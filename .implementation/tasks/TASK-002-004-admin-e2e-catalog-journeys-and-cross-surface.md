# TASK-002-004: Admin e2e catalog journeys (7 gherkin scenarios) + .feature mirror + cross-surface deactivate→public-door loop check

**Brief**: BRIEF-002
**Brief-type**: feature
**Brief-deploys**: no
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: io
**Depends on**: TASK-002-003
**Impl**: developer
**E2e-required**: yes <!-- methodology.e2e: required; authenticated admin CRUD on the project default E2e-required list -->
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-DOOR-002-01, AC-DOOR-002-02, AC-DOOR-002-03, AC-DASH-010-01, AC-DASH-010-02, AC-DASH-010-03 (e2e tier-6 journeys; each covering test tagged with BOTH the DOOR and DASH id where one journey evidences both), and the UI-level surface of AC-DOOR-002-05 (the catalog write path exists only on the authenticated admin surface). Plus the cross-surface loop for AC-DOOR-002-03 (paired with EPIC-001's AC-DOOR-002-04 — NOT claimed as a row here).
**Upstream refs:** ADR-006 (apps/admin e2e scope), ADR-010 (admin-only), ADR-012 (tier-6 e2e), planning EPIC-002 (the 7 gherkin scenarios verbatim)
**Introduces-gate:** no <!-- e2e is a pre-existing brief-mandated gate, not a newly-introduced required gate -->

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + `pnpm --filter admin e2e:run` (+ cross-surface check) pass
- [ ] **Targeted e2e** — ACTUAL execution output in Work Log against the live docker-compose stack (Docker pre-flight required; "not executed" is not a substitute — ENGINE.md § Submission Gate)
- [ ] **Security review** — e2e drives the mocked auth provider (accountant test session); confirms no real Clerk is contacted; confirms the catalog write path is absent on apps/portal
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **AC-id test-tag contract (HARD for COVERAGE write-back):** every covering test's title/annotation contains
  its `AC-DOOR-002-NN` / `AC-DASH-010-NN` id; the paired add/edit/deactivate journeys are tagged with BOTH the
  DOOR and DASH ids.
- **Gherkin binding:** the 7 scenarios reproduced verbatim in the brief §Acceptance scenarios are bound to
  executable Playwright specs in `apps/admin`, mirrored as `apps/admin/e2e/features/services-catalog.feature`
  (human-readable until the Cucumber binder lands — see CLAUDE.md). No scenario drift.
- **e2e runs against the live docker-compose stack** exercising the real admin route, role gate, server
  actions, the TASK-002-001 security policy, and the DB path end to end — mocked provider != mocked gate.
- **Cross-surface honesty:** the deactivate→public-door loop is recorded as EVIDENCE for AC-DOOR-002-03, NOT as
  an AC-DOOR-002-04 sign-off (AC-DOOR-002-04 stays owned by EPIC-001).
- **Flake guard:** e2e specs are not flaky — re-run the new specs to confirm stability.

## Context

The tier-6 e2e proof of the slice: the accountant's add / edit / deactivate journeys through the admin UI,
against the mocked auth provider established in EPIC-004, plus the cross-surface loop — a service deactivated
in apps/admin no longer appears as a selectable option on the public services page / request form in
apps/portal. Binds the brief's 7 gherkin scenarios to executable specs.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/specs/services-catalog.spec.ts` | Create | The add/edit/deactivate journeys (AC-DOOR-002-01/-02/-03 + AC-DASH-010-01/-02/-03), each tagged with its AC id(s); uses `setupAccountantSession` from `apps/admin/e2e/fixtures/auth.ts`. |
| `apps/admin/e2e/features/services-catalog.feature` | Create | The 7 gherkin scenarios verbatim from the brief, mirrored as the human-readable behavior contract. |
| `apps/admin/e2e/specs/services-catalog-write-boundary.spec.ts` | Create (or fold into above) | UI-surface of AC-DOOR-002-05: the catalog write path is admin-only; a CLIENT/anonymous visitor has no write UI (the trust-boundary proof is the TASK-002-001 tier-3 test — this is the UI-surface complement). |
| cross-surface loop spec | Create | Deactivate in apps/admin → service absent from apps/portal services page / request form. Drive via `pnpm e2e:cross-app` if it fits that suite, else an admin-then-portal e2e. Tag as evidence for AC-DOOR-002-03 (NOT AC-DOOR-002-04). |

## Tests to Write First

- [ ] `[AC-DOOR-002-01][AC-DASH-010-01] accountant adds a service → appears in her catalog list` — expected: new service listed
- [ ] `[AC-DOOR-002-02][AC-DASH-010-02] accountant edits a service → edited details reflected` — expected: updated details shown
- [ ] `[AC-DOOR-002-03][AC-DASH-010-03] accountant deactivates a service → shown inactive` — expected: inactive state shown
- [ ] `[AC-DOOR-002-03] deactivated service no longer selectable on the public door (cross-surface loop)` — expected: absent from apps/portal services page / request form
- [ ] `[AC-DOOR-002-05] catalog write path exists only on the authenticated admin surface` — expected: no write UI for CLIENT/anonymous

## Implementation Notes

- Docker pre-flight before running (ENGINE.md § Docker Pre-Flight). e2e runs against the full local stack
  (SQL Server + both apps + Azurite + Mailhog) per CLAUDE.md.
- Reuse `apps/admin/e2e/fixtures/auth.ts` (`setupAccountantSession`) for the accountant test session — no real
  Clerk.
- **Local-env caveat (carry-forward):** the local DB bootstrap is half-broken (clean-volume no DB/logins;
  Prisma `migrate deploy` P3019). If the e2e gate is hard-blocked by this env issue, STOP and escalate to the
  IO — do NOT fabricate execution output. The IO will adjudicate (CI-substitution is a user governance
  decision, precedented in EPIC-004).

## Definition of Done

- [ ] All 6 in-scope AC have a tagged e2e covering test (DOOR+DASH double-tagged on the paired journeys)
- [ ] 7 gherkin scenarios mirrored to `services-catalog.feature`
- [ ] Cross-surface deactivate→public-door loop verified (recorded as AC-DOOR-002-03 evidence)
- [ ] Actual e2e execution output in Work Log; specs re-run for flake stability
- [ ] Lint + type-check + build pass

---

## Work Log

## Attempt Log

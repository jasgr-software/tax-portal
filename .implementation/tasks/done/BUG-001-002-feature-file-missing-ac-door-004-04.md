---
brief: BRIEF-001
status: closed
severity: blocking (gherkin scenario drift — SDET rejection criterion)
task: TASK-005
raised_by: sdet
raised_at: 2026-06-15
---

# BUG-001-002: Feature file missing AC-DOOR-004-04 scenario (12 of 13 scenarios mirrored)

---

## What failed

`apps/portal/e2e/features/public-front-door.feature` contains 12 scenarios but the brief
mandates 13. The scenario for **AC-DOOR-004-04** ("No account is created for the prospective
client at request-submission time") is absent from the feature file.

The brief's `acceptance_scenarios` field states:
> "apps/portal/e2e/features/public-front-door.feature (bind the 13 Given/When/Then scenarios
> reproduced in §Acceptance scenarios below)"

The brief's § Acceptance scenarios section includes the following scenario that is missing
from the feature file:

```gherkin
### AC-DOOR-004-04 — No account is created at submission
Given a visitor submitting an engagement request
When the request is created
Then no account is created for the visitor at submission time
```

The TASK-005 Definition of Done ticks `[x] All 13 scenarios bound to AC-id-tagged specs;
public-front-door.feature mirrors them` — this is incorrect. The feature file has 12 entries.

---

## Behavior classification

AC-DOOR-004-04 IS covered by a **tier-3 integration test** in TASK-003
(`engagement-request.persistence.test.ts`: `[AC-DOOR-004-04] no User row is created when an
engagement request is submitted`). That test ran green. The tier mapping in the brief places
AC-DOOR-004-04 at tier-3, not tier-6 — so no additional Playwright e2e spec is required.

However, the brief's `acceptance_format: gherkin` requirement mandates that ALL 13
acceptance scenarios are **mirrored** in `public-front-door.feature` (even those whose bound
test lives at a lower tier). The feature file is the human-readable behavior contract and the
future Cucumber binder target. Missing a scenario from it means the COVERAGE.md ledger row
for AC-DOOR-004-04 cannot be confirmed from feature-file evidence at the planning validate
phase.

---

## Reproduction steps

1. Count scenarios in `apps/portal/e2e/features/public-front-door.feature` — 12 total.
2. Compare against the 13 AC ids in the brief: the missing id is `AC-DOOR-004-04`.
3. Grep for `AC-DOOR-004-04` in e2e files — only found in tier-3 test files
   (`packages/db/src/engagement-request.persistence.test.ts`), not in the feature file
   or any Playwright spec under `apps/portal/e2e/`.

---

## Expected vs. actual

**Expected:** `public-front-door.feature` contains 13 scenarios, each tagged with its AC id,
including:

```gherkin
  @AC-DOOR-004-04
  Scenario: No account is created at submission
    Given a visitor submitting an engagement request
    When the request is created
    Then no account is created for the visitor at submission time
```

**Actual:** The scenario is absent. The feature file ends at the AC-DOOR-004-05 scenario.

---

## Fix guidance (TASK-005 rework)

Add the missing scenario to `apps/portal/e2e/features/public-front-door.feature` after
the AC-DOOR-004-03 @smoke scenario and before AC-DOOR-004-05:

```gherkin
  @AC-DOOR-004-04
  Scenario: No account is created at submission
    Given a visitor submitting an engagement request
    When the request is created
    Then no account is created for the visitor at submission time
```

No new Playwright spec is needed — AC-DOOR-004-04 is a tier-3 obligation covered by
`packages/db/src/engagement-request.persistence.test.ts`. The feature file entry is a
human-readable mirror and future Cucumber binder target only. A comment in the feature file
can note that this scenario's bound test lives at tier-3 (in packages/db).

After the fix, re-run `pnpm --filter portal e2e:run` to confirm the change does not
break any existing specs (the change is additive to the .feature file only).

## Resolution

**2026-06-15 [webapp-developer]** Fixed in TASK-005 rework: inserted @AC-DOOR-004-04 scenario into `apps/portal/e2e/features/public-front-door.feature` after the @AC-DOOR-004-03 @smoke scenario and before @AC-DOOR-004-05; added tier-3 comment noting bound test location in packages/db; updated # AC ids: header from `AC-DOOR-004-01..03/-05` to `AC-DOOR-004-01..05`. Verified 12/12 existing e2e specs pass — no regression.

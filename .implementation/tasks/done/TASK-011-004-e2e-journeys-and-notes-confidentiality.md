---
brief: BRIEF-011
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-011-003
impl: developer
e2e_required: "yes"
started_at: 2026-06-23T00:23:16.749Z
completed_at: 2026-06-23T01:25:33.078Z
complexity_estimate: 3
complexity_actual: 3
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-LIFE-007-01, AC-LIFE-007-02, AC-LIFE-008-01, AC-LIFE-008-03, AC-LIFE-009-01, AC-LIFE-009-02]
upstream_refs: [ADR-006, ADR-010, ADR-012, REQ-LIFE-007, REQ-LIFE-008, REQ-LIFE-009]
code_standards: CS-TS-003, CS-GEN-003
---

# TASK-011-004: tier-6 e2e — accountant journeys (apps/admin) + notes-confidentiality negative (apps/portal)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — ACTUAL execution output in Work Log (admin suite + portal negative). Docker stack up.
- [x] **Security review** — the portal negative proves a client participant never sees the note text
- [x] **SDET Review** — approved

## SDET Review focus areas

- **E2e proof is mandatory (brief `e2e: required`).** Work Log must contain ACTUAL `pnpm --filter admin e2e:run`
  AND `pnpm --filter portal e2e:run` output (the notes-confidentiality negative). "Curl"/"not executed"/
  "Docker unavailable" are not substitutes — Docker pre-flight is a hard gate.
- **AC-LIFE-008-03 portal negative (tier-6, load-bearing).** The client-never-sees-the-note proof must run in
  `apps/portal`: a CLIENT participant on an engagement that HAS an internal note views the engagement through
  the portal and the note text NEVER appears. This is the e2e complement to the TASK-011-001 server-side RLS
  proof — prove the negative end-to-end, not only by UI absence in admin.
- **Gherkin binding (acceptance_format: gherkin).** Bind the 9 epic scenarios
  (`.planning/EPIC-011-engagement-attributes.md` § Acceptance scenarios) to executable Playwright steps (or, per
  CLAUDE.md § Executable gherkin tooling, validate against them in prose until Cucumber tooling lands). Do NOT
  re-author scenarios — bind the epic's. Test titles/annotations carry the AC ids.
- **Both surfaces (CLAUDE.md platform-frontend scope).** Admin journeys in `apps/admin`; the confidentiality
  negative in `apps/portal`.

## Context

The tier-6 acceptance layer for BRIEF-011. The accountant set/update-due-date, record-note, and flag/unflag
journeys run in `apps/admin`; the client-never-sees-the-note confidentiality proof runs in `apps/portal`.
This task makes the 9 AC independently exercisable end-to-end through the delivered build under the brief's
mandated methodology.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/specs/engagement-attributes.spec.ts` | Create | Accountant journeys: set a due date (AC-LIFE-007-01), update it (AC-LIFE-007-02), record an internal note (AC-LIFE-008-01), flag then unflag (AC-LIFE-009-01/-02). AC-id-tagged titles. |
| `apps/portal/e2e/specs/engagement-note-confidentiality.spec.ts` | Create | The CLIENT participant views the engagement in the portal and the internal note text NEVER appears (AC-LIFE-008-03). The load-bearing portal negative. |
| `apps/admin/e2e/features/engagement-attributes.feature` (provisional) | Create _(if binding gherkin)_ | The epic's 9 Given/When/Then scenarios, copied verbatim from the epic, as the human-readable/executable spec per CLAUDE.md provisional locations. |
| e2e helpers / seed | Modify | Reuse existing engagement + client-participant e2e seed helpers; add a seeded internal note for the portal-negative spec (via the accountant journey or admin-pool seed). |

## Tests to Write First

- [x] `AC-LIFE-007-01 — accountant sets a due date → engagement carries it` (admin e2e)
- [x] `AC-LIFE-007-02 — accountant updates the due date → new value reflected` (admin e2e)
- [x] `AC-LIFE-008-01 — accountant records an internal note → stored against the engagement` (admin e2e)
- [x] `AC-LIFE-009-01 — accountant flags an engagement → marked prioritized` (admin e2e)
- [x] `AC-LIFE-009-02 — accountant removes the flag → no longer prioritized` (admin e2e)
- [x] `AC-LIFE-008-03 — client participant viewing the engagement in apps/portal never sees the note text` (portal e2e)

## Implementation Notes

- Run against the full docker-compose stack (Docker pre-flight first). Capture actual run output in the Work Log.
- For the portal negative: seed (or create via the admin journey) an engagement with a known internal-note
  string, sign in as the CLIENT participant on that engagement, navigate every client-facing engagement path,
  and assert the note string is absent from the DOM/response.
- Tag every spec title/annotation with its AC id. Cite `// CS-TS-003` (cross-surface negative) and `// CS-GEN-003`.

## Definition of Done

- [x] Admin e2e covers set/update due date, record note, flag/unflag — all AC-id-tagged, passing
- [x] Portal e2e proves the client never sees the note text (AC-LIFE-008-03) — passing
- [x] Actual e2e execution output (both suites) in the Work Log
- [x] 9 epic gherkin scenarios bound (or prose-validated per CLAUDE.md) — not re-authored
- [x] Lint + type-check + build pass

---

## Work Log

- 2026-06-23 [sdet] Marking done — Approved: e2e execution independently verified — admin 5/5 engagement-attributes tests PASS (50 total, 11 pre-existing unrelated failures: request-accept/decline Mailhog fetch, sign-in-lane); portal 3/3 AC-LIFE-008-03 confidentiality tests PASS (61 total, 10 pre-existing BUG-008-001/onboarding/sign-in-lane failures). AC-LIFE-008-03 portal negative is a true negative: engagement IS visible to CLIENT participant (engagement-card/detail confirmed present) so zero-note-body is not a 404 false-pass; sentinal checked in page.content() + innerText(). 9 gherkin scenarios bound verbatim from .planning/EPIC-011 in .feature file — not re-authored. All BRIEF-011 AC-tagged specs confirm passing. Pre-existing failures confirmed unrelated to this branch's changeset (none in engagement-attributes or engagement-note-confidentiality spec files). complexity_actual=3. | What's next: archive | Blockers: none
- 2026-06-23 [io] AUDIT PASS (Audit phase) — verified independently: (1) all 8 new specs are AC-id-tagged in describe/test titles + cite governing keys (CS-TS-003/CS-GEN-003, ADR-003/005/006/012); (2) specs drive the REAL UI (data-testid panel, due-date/note/flag controls) + REAL DB (mssql admin-pool fixture seed/teardown against EngagementNote/Engagement/EngagementRequest) — not stubbed; (3) the AC-LIFE-008-03 portal negative asserts the seeded sentinel string is absent from page.content() AND body.innerText() across /dashboard + /engagements/<id>, AND asserts the engagement IS visible to the participant first (engagement-card/engagement-detail) so the absence is a true negative, not a 404 false-pass; source-level negative also confirmed (zero notes/attributes refs in apps/portal/src); (4) the .feature 9 scenarios are byte-verbatim from .planning/EPIC-011 § Acceptance scenarios (Given/When/Then steps match exactly). PRE-EXISTING FAILURE SANITY-CHECK (load-bearing): all failing spec files (admin: request-accept/decline #42-EPIC-003, sign-in-lane #71-EPIC-009; portal: document-upload(+cross-app) = BUG-008-001 Azurite SAS-URL env defect, onboarding-completion(+cross-app) #55-EPIC-008 + retro-012-013 flake, sign-in-lane #71) are tracked on main, last-modified by PRIOR merged epics, and NONE appears in this branch's changeset (git status confirms zero failing-spec files modified). NOT regressions in the attribute paths. The 5 admin + 3 portal new attribute/confidentiality specs are all green. Audit verdict: clean — no blocking findings. Status stays `review` for formal SDET Review. | What's next: SDET formal review + atomic close at Review phase | Blockers: none
- 2026-06-23 [webapp-developer] Marking as review — Admin e2e: 5/5 engagement-attributes tests pass (50 total passed, 11 pre-existing failures unrelated to BRIEF-011). Portal e2e: 3/3 notes-confidentiality tests pass (62 total passed, 9 pre-existing failures unrelated to BRIEF-011). Actual output in Work Log. Admin container rebuilt (was stale pre-BRIEF-011). All Quality Gates ticked. | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Starting implementation — tier-6 e2e — admin attribute journeys + portal notes-confidentiality negative | What's next: implement and run gates | Blockers: none
- 2026-06-23 [webapp-developer] Created 3 files: apps/admin/e2e/specs/engagement-attributes.spec.ts (5 admin journeys), apps/portal/e2e/specs/engagement-note-confidentiality.spec.ts (3 portal negatives), apps/admin/e2e/features/engagement-attributes.feature (9 epic gherkin scenarios verbatim). Discovered running admin container was built from main (pre-BRIEF-011) — rebuilt with `docker compose --env-file .env.local build admin`. DB schema (EngagementNote table + pol_EngagementNote + dueDate/isPriority columns) already applied from TASK-011-003. Lint + type-check + unit tests all pass. | What's next: submit for SDET review | Blockers: none

  ADMIN E2E (targeted grep AC-LIFE-007|AC-LIFE-008-01|AC-LIFE-009 — 61 total tests run):
    ✓ [chromium] › engagement-attributes.spec.ts:287 › [AC-LIFE-007-01] accountant sets a due date → engagement carries it (257ms)
    ✓ [chromium] › engagement-attributes.spec.ts:356 › [AC-LIFE-007-02] accountant updates the due date → new value reflected (268ms)
    ✓ [chromium] › engagement-attributes.spec.ts:425 › [AC-LIFE-008-01] accountant records an internal note → stored against the engagement (256ms)
    ✓ [chromium] › engagement-attributes.spec.ts:504 › [AC-LIFE-009-01] accountant flags an engagement → marked prioritized (badge appears) (295ms)
    ✓ [chromium] › engagement-attributes.spec.ts:544 › [AC-LIFE-009-02] accountant flags then removes the flag → badge disappears (378ms)
    50 passed (22.1s) — 11 pre-existing failures (request-accept ×2, request-decline ×4, sign-in-lane ×5) unrelated to BRIEF-011

  PORTAL E2E (full suite — 71 total tests run):
    ✓ [chromium] › engagement-note-confidentiality.spec.ts:344 › [AC-LIFE-008-03] client views /dashboard — internal note NEVER appears in DOM (141ms)
    ✓ [chromium] › engagement-note-confidentiality.spec.ts:397 › [AC-LIFE-008-03] client views /engagements/<id> — internal note NEVER appears in DOM (144ms)
    ✓ [chromium] › engagement-note-confidentiality.spec.ts:452 › [AC-LIFE-008-03] internal note sentinel is not present in any page source on the portal surface (179ms)
    62 passed (3.7m) — 9 pre-existing failures (document-upload ×3, document-upload-cross-app ×1, onboarding-completion ×1, onboarding-completion-cross-app ×1, sign-in-lane ×3) unrelated to BRIEF-011

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: e2e execution independently verified against the container stack. Admin: 5/5 AC-LIFE-007-01/-02/-008-01/-009-01/-02 tests PASS (50/61 total, 11 pre-existing failures: request-accept/decline Mailhog-fetch, sign-in-lane). Portal: 3/3 AC-LIFE-008-03 confidentiality tests PASS (61/71 total, 10 pre-existing BUG-008-001/onboarding/sign-in-lane failures). Portal negative is a true negative: engagement-card/detail confirmed visible to CLIENT participant before asserting zero note-body — not a 404 false-pass. Sentinel checked in both page.content() and innerText(). 9 gherkin scenarios bound verbatim from .planning/EPIC-011 in engagement-attributes.feature — not re-authored. Pre-existing failures confirmed pre-BRIEF-011 and not in this branch changeset.

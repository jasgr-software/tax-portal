# Epic 003 — Client Onboarding

**Epic-type:** feature  
**Epic-deploys:** yes  
**Phase:** 3  
**Status:** Pending (awaiting Epic 002 completion)  
**Priority:** P1

---

## Purpose

Deliver the three-step onboarding gate that a newly invited client must complete before their engagement moves to "In Progress": (1) e-sign the engagement letter via Docuseal, (2) complete the intake questionnaire, (3) upload initial required documents. The accountant manages questionnaire templates and the engagement letter template in the admin UI.

---

## Requirements in scope

| Requirement ID | Summary |
|---|---|
| REQ-ONBD-001 | Three-step onboarding: letter e-sign → questionnaire → initial docs |
| REQ-ONBD-002 | Engagement letter must be e-signed before any other step (hard gate) |
| REQ-ONBD-003 | Intake questionnaire templated per service type; accountant manages templates |
| REQ-ONBD-004 | Step 3: client uploads initial documents per document checklist |
| REQ-ONBD-005 | Onboarding complete when all three steps done |
| REQ-ONBD-006 | Onboarding completion transitions engagement status New → In Progress |
| REQ-ONBD-007 | Accountant notified when onboarding is complete |
| REQ-DASH-012 | Admin UI: intake questionnaire template management |
| REQ-DASH-013 | Admin UI: engagement letter template management |
| REQ-IDNT-006 | Engagement letter via Docuseal; system provides default template |
| REQ-NFR-007 | Docuseal webhook callback to confirm signature completion |

> CLARIF-006 (Docuseal self-hosted vs cloud) must be resolved before this epic ships. It affects environment config and webhook accessibility.

---

## Acceptance Criteria

_Placeholder — to be fully detailed by the RA before this epic is handed to the SA. Core acceptance criteria will cover: Docuseal e-sign flow with webhook confirmation, questionnaire rendering from template, step gating logic, document checklist upload, status transition trigger, accountant notification, and admin UI for template management._

**Key acceptance criteria to define:**
- AC-003-001: Docuseal integration — letter sent, signed, webhook received, `OnboardingState.letterSigned` updated
- AC-003-002: Step 1 gate enforced — steps 2 and 3 are inaccessible until letter is signed
- AC-003-003: Intake questionnaire renders from `IntakeTemplate` for the engagement's service type
- AC-003-004: Questionnaire submission persists answers; `OnboardingState.questionnaireDone` updated
- AC-003-005: Document checklist renders outstanding `DocumentRequest` items; client uploads satisfy them
- AC-003-006: Onboarding completion check triggers engagement status → `In Progress`
- AC-003-007: Accountant receives `onboarding_completed` notification
- AC-003-008: Admin UI for questionnaire template CRUD per service type
- AC-003-009: Admin UI for engagement letter template edit

---

## Dependencies

- Epic 002 completed (engagement + client account exists to onboard into)
- CLARIF-006 resolved (Docuseal hosting decision)

---

## Notes for SA

- Docuseal webhook handling must be considered carefully for local dev — a tunnel (e.g., ngrok) or a mock webhook endpoint may be needed.
- The hard gate for step 1 must be enforced server-side (middleware or API route check), not only in the UI.

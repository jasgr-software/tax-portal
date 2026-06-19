# apps/admin/e2e/features/document-requests.feature
#
# EPIC-007 — Initial document upload: checklist, secure upload, malware scan
# Acceptance scenario for the accountant document-request authoring (admin surface).
#
# Transcribed VERBATIM from .planning/EPIC-007-initial-document-upload-checklist.md
# § Acceptance scenarios (L151–155). Do NOT re-author this scenario.
#
# NOTE (CLAUDE.md § Executable gherkin tooling): The Cucumber tooling has NOT landed yet.
# This .feature file is a human-readable spec. The executable Playwright tests that
# cover the same behavior live in:
#   apps/admin/e2e/specs/document-requests.spec.ts (tier-6 admin e2e)
# When Cucumber tooling is integrated, this file will be bound to step definitions
# under apps/admin/e2e/steps/. Until then, SDET review compares implementation
# behavior against this scenario via prose.
#
# Tier annotation (per EPIC-007 § Traceability & sign-off contract):
#   @tier-6 — e2e gate (accountant creates a labeled document request)
#
# ADR-006: Document-request authoring is apps/admin ONLY — clients never reach this surface.
# ADR-012: Tier-6 e2e.

Feature: Accountant document-request authoring

  @AC-FILE-007-01 @tier-6
  Scenario: Accountant creates a labeled document request
    Given the accountant in an engagement
    When she creates a document request with a free-text label
    Then a labeled document request is created in that engagement

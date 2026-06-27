# apps/portal/e2e/features/request-created-nudge.feature
#
# Human-readable Gherkin acceptance scenarios for EPIC-019 — Client request-created nudge
# (portal surface — apps/portal).
#
# Acceptance criteria covered: AC-MSG-014-02
#
# This scenario is verbatim from BRIEF-019 § Acceptance scenarios.
# The executable gate is apps/portal/e2e/specs/request-created-nudge.spec.ts (Playwright .spec.ts).
# The Cucumber tooling is not yet chosen; this .feature file is the human-readable contract
# that the .spec.ts verifies behavior against (see CLAUDE.md § Executable gherkin tooling).
#
# ADR-005: RLS-scoped per recipient — client sees only their own notification.
# ADR-006: portal surface only — the client nudge appears on apps/portal.
# ADR-012: tier-6 e2e.
# ADR-023: ENABLE_DIGEST_TRIGGER=true (already set); no new email path introduced.
# CS-GEN-001: digest email is content-free — no request detail in subject or body.
# CS-GEN-002: additive; no new email path; rides the EXISTING EPIC-018 digest.
# CS-GEN-003: AC ids cited.

Feature: Client document-request-created notification in portal feed (portal surface)
  As a client (sarah)
  I want to be notified in my portal feed when a document request is created for me
  And have that notification ride the existing content-free email digest

  # ── AC-MSG-014-02 ─────────────────────────────────────────────────────────────

  @AC-MSG-014-02
  Scenario: Client receives an in-portal notification when a document request is created
    Given the accountant creates a document request for a client
    When the request is created
    Then that client receives an in-portal notification that a document request was created for them
    And the notification is summarized by the existing content-free daily digest email
    And no new email content path or per-event email is introduced

# apps/admin/e2e/features/file-deletion.feature
#
# Gherkin acceptance scenarios for EPIC-014 — File deletion, soft-delete & recovery.
#
# TASK-014-003: admin delete + recover server actions, UI, portal no-delete proof.
#
# Source: BRIEF-014 § Acceptance scenarios (reproduced verbatim from
#   .planning/EPIC-014-file-deletion-soft-delete-retention.md).
#
# Binding note (CLAUDE.md § Executable gherkin tooling):
#   Cucumber tooling is NOT YET wired in this repo. This .feature file is the
#   human-readable behavior contract. The executable proof is the standard Playwright
#   spec at apps/admin/e2e/specs/file-deletion.spec.ts whose test titles carry the
#   AC id (the AC-id test-tag contract for the coverage write-back).
#
# Surfaces covered:
#   admin (Tax Portal) — AC-FILE-004-01, AC-FILE-006-01, AC-FILE-006-03, AC-FILE-004-02
#   portal (Client Portal) — AC-FILE-004-02, AC-FILE-004-03 (no-delete absence)
#
# ADR-005: Delete is accountant-only (RLS + accountant-identity guard).
# ADR-006: Delete lives in apps/admin; portal surface exposes none.
# ADR-018: Soft-delete-first; row + bytes retained in-window.
# ADR-012: Tier-6 e2e for AC-FILE-004-01, AC-FILE-006-01, AC-FILE-006-03;
#           tier-3 action test for server-side AC-FILE-004-02.
#
# // ADR-005 // ADR-006 // ADR-018 // ADR-012 // CS-TS-003 // CS-TS-004 // CS-GEN-003

Feature: File deletion, soft-delete, and recovery (EPIC-014)

  # ── AC-FILE-004-01: Accountant deletes a file ─────────────────────────────────

  Scenario: [AC-FILE-004-01] Accountant deletes a file from an engagement
    Given the accountant viewing a file in an engagement
    When she deletes it
    Then the file is deleted from the working view of that engagement

  # ── AC-FILE-004-02: A client cannot delete any file ───────────────────────────

  Scenario: [AC-FILE-004-02] A client cannot delete any file (server-side rejection)
    Given a client participant of an engagement, including for a file they uploaded
    When they attempt to delete a file through any portal path
    Then no deletion occurs and the capability is not available to them

  # ── AC-FILE-004-03: No client-facing path removes a file ──────────────────────

  Scenario: [AC-FILE-004-03] No client-facing path exists to remove a file
    Given the client surface of an engagement
    When it is examined for a file-removal capability
    Then no client-facing path exists to remove a file from the engagement

  # ── AC-FILE-006-01: Deleting marks deleted and hides from working view ─────────

  Scenario: [AC-FILE-006-01] Deleting a file marks it deleted and removes it from the normal file view
    Given a file in an engagement
    When the accountant deletes it
    Then it is marked deleted and removed from the normal file view

  # ── AC-FILE-006-03: A deleted file remains recoverable until retention elapses ─

  Scenario: [AC-FILE-006-03] A deleted file remains recoverable within the retention window
    Given a soft-deleted file within its retention window
    When recovery is attempted
    Then the file is recoverable until the retention period elapses

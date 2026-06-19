# apps/portal/e2e/features/document-upload.feature
#
# EPIC-007 — Initial document upload — checklist, secure upload, malware scan
# Acceptance scenarios for the client document-upload step (portal surface + admin authoring).
#
# Transcribed VERBATIM from .planning/EPIC-007-initial-document-upload-checklist.md
# § Acceptance scenarios (L122–253). Do NOT re-author these scenarios.
#
# NOTE (CLAUDE.md § Executable gherkin tooling): The Cucumber tooling has NOT landed yet.
# These .feature files are human-readable specs. The executable Playwright tests that
# cover the same behavior live in:
#   apps/portal/e2e/specs/document-upload.spec.ts   (tier-6 portal e2e — client side)
#   apps/portal/e2e/specs/document-upload-cross-app.spec.ts (cross-app: admin authors → client fulfills)
# When Cucumber tooling is integrated, these files will be bound to step definitions
# under apps/portal/e2e/steps/. Until then, SDET review compares implementation
# behavior against these scenarios via prose.
#
# Tier annotation (per EPIC-007 § Traceability & sign-off contract):
#   @tier-6 — e2e (checklist render, upload, fulfilled leaves outstanding, rejection shown)
#   @tier-3 — service integration / security (scan gate, encryption, engagement isolation, authz)
#
# ADR-006: Document-request authoring in apps/admin; client upload in apps/portal.
# ADR-009: Signed-URL upload — no public path.
# ADR-021: Malware scan before file is available.
# ADR-005: Files are engagement-scoped.
# ADR-012: Testing pyramid — tiers defined above.

Feature: Client document upload against accountant-defined checklist

  # ─── Checklist visibility and item rendering ─────────────────────────────────

  @AC-ONBD-004-01 @tier-6
  Scenario: Client is shown the engagement's checklist
    Given a client at the document-upload step whose engagement has a document checklist
    When the client opens the step
    Then they are shown the document checklist the accountant defined for that engagement

  @AC-ONBD-004-02 @tier-6
  Scenario: Outstanding vs. provided is visible
    Given a checklist with some items provided and some not
    When the client views the checklist
    Then they can distinguish which items are still outstanding from those already provided

  @AC-ONBD-004-03 @tier-6
  Scenario: Client uploads to fulfill an item
    Given an outstanding checklist item
    When the client uploads the corresponding document
    Then the upload is accepted and the item is fulfilled

  @AC-ONBD-004-04 @tier-3
  Scenario: Step satisfied when required items are provided
    Given an engagement whose required checklist items have all been provided
    When the upload step's satisfaction is evaluated
    Then the document-upload step is satisfied

  # ─── Accountant document-request authoring ────────────────────────────────────

  @AC-FILE-007-01 @tier-6
  Scenario: Accountant creates a labeled document request
    Given the accountant in an engagement
    When she creates a document request with a free-text label
    Then a labeled document request is created in that engagement

  @AC-FILE-007-02 @tier-6
  Scenario: Client sees the requests and their labels
    Given an engagement with document requests
    When the client participant views the engagement
    Then they see each document request and its label

  @AC-FILE-007-03 @tier-6
  Scenario: Client fulfills a request by uploading
    Given a document request addressed to the client's engagement
    When the client uploads a file in response
    Then that request is fulfilled by the uploaded file

  # ─── Per-engagement checklist ─────────────────────────────────────────────────

  @AC-FILE-008-01 @tier-3
  Scenario: Checklist reflects the engagement's requests
    Given an engagement with one or more document requests
    When the engagement's checklist is examined
    Then the checklist reflects those document requests

  @AC-FILE-008-02 @tier-6
  Scenario: Client distinguishes outstanding from fulfilled
    Given a client participant viewing their engagement's checklist
    When they review it
    Then outstanding items are distinguishable from fulfilled ones

  @AC-FILE-008-03 @tier-6
  Scenario: A fulfilled item leaves the outstanding set
    Given an outstanding checklist item
    When its document request is fulfilled
    Then that item is no longer shown as outstanding

  # ─── File upload and isolation ────────────────────────────────────────────────

  @AC-FILE-001-02 @tier-3
  Scenario: Client uploads a file to their engagement
    Given a client participant of an engagement
    When they upload a file to that engagement
    Then the file is stored as part of that engagement's document set

  @AC-FILE-001-05 @tier-3
  Scenario: Uploaded file does not cross engagements
    Given a file uploaded to one engagement
    When another engagement's document set is examined
    Then the file is not present in or reachable from that other engagement

  # ─── No file type restrictions ────────────────────────────────────────────────

  @AC-FILE-002-01 @tier-6
  Scenario: Any file type is accepted
    Given a client uploading a file of an arbitrary type or extension
    When the upload is processed
    Then the file is not rejected solely because of its format

  # ─── Files encrypted at rest and never publicly accessible ───────────────────

  @AC-FILE-003-01 @tier-3
  Scenario: Files encrypted at rest
    Given a file stored through the portal
    When its storage is examined
    Then the file is encrypted at rest

  @AC-FILE-003-02 @tier-3
  Scenario: Retrieval requires an authorization check
    Given a stored engagement file
    When retrieval is attempted
    Then it succeeds only after an authorization check confirms the requester may access that engagement's documents

  @AC-FILE-003-03 @tier-3
  Scenario: No anonymous/public path to a file
    Given a stored engagement file
    When an unauthenticated, unauthorized requester attempts to reach it
    Then no anonymous or public path returns the file

  @AC-FILE-003-04 @tier-3
  Scenario: Access grants are time-limited
    Given a time-limited access grant to a file
    When the grant has expired
    Then the grant no longer retrieves the file

  # ─── Malware scanning ────────────────────────────────────────────────────────

  @AC-NFR-009-01 @tier-3
  Scenario: Files scanned before being made available
    Given a file uploaded through the document-upload path
    When the upload is processed
    Then the file is scanned for malware before it is made available to view or download

  @AC-NFR-009-02 @tier-6
  Scenario: Malicious file withheld and uploader informed
    Given an uploaded file found to be malicious
    When the scan completes
    Then the file is withheld from recipients and the uploader is informed it was rejected

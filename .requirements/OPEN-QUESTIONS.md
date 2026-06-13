# Open Questions

Ambiguities the Requirements Agent could not resolve on its own. Each carries a **proposed default**
so downstream work is never blocked — except **escalation carve-out** items (data retention/deletion,
PII, encryption, access-control/audit scope, the auth model, regulatory requirements), which require a
user decision and carry no default.

A requirement blocked by an open question lists its `OQ-NNN` in `open_questions:` and sits at
`status: clarifying` until the question is resolved.

Status: `open` → `resolved`. Seeded from the unresolved `CLARIF-*` items in `seed/SRS-snapshot.md §7`.

---

## OQ-001 — Decline message retention
- **Status:** open
- **Affects:** REQ-DOOR-008
- **Question:** When the accountant declines an engagement request, is the decline message retained in
  the portal for the accountant's records, or sent via email only with no portal retention? A
  financial-context communication may benefit from being retained for audit purposes.
- **Proposed default:** (none — **escalation carve-out: data retention / audit scope.** User decision required.)
- **Resolution:** _pending_
- **Provenance:** CLARIF-001

## OQ-002 — Client-facing engagement status labels
- **Status:** open
- **Affects:** REQ-LIFE-002
- **Question:** What are the client-facing status labels for each internal status (New, In Progress,
  Review, Complete)? These must be defined before the engagement lifecycle is built.
- **Proposed default:** Mirror the internal labels verbatim ("New", "In Progress", "Review",
  "Complete") until the product owner supplies friendlier client-facing copy.
- **Resolution:** _pending_
- **Provenance:** CLARIF-002

## OQ-003 — Duplicate engagement attempt behavior
- **Status:** open
- **Affects:** REQ-LIFE-011
- **Question:** When a duplicate engagement is attempted (same service + tax year + client), what
  should the system do? (a) show an error and block, (b) silently redirect to the existing engagement,
  (c) warn the accountant and allow override.
- **Proposed default:** (c) warn the accountant and allow override — least destructive, preserves
  accountant judgment.
- **Resolution:** _pending_
- **Provenance:** CLARIF-003

## OQ-004 — Hard delete vs. retention precedence
- **Status:** open
- **Affects:** REQ-IDNT-005, REQ-FILE-005, REQ-AUTH-008
- **Question:** Hard delete (REQ-IDNT-005) conflicts with 7-year document retention (REQ-FILE-005) and
  indefinite client access (REQ-AUTH-008). What is the precedence? Does a hard delete override the
  retention rule? Are files physically removed from object storage, or only the DB records?
- **Proposed default:** (none — **escalation carve-out: data deletion / retention / access-control
  scope.** User decision required.)
- **Resolution:** _pending_
- **Provenance:** CLARIF-005

## OQ-005 — Docuseal hosting model
- **Status:** open
- **Affects:** REQ-NFR-007
- **Question:** Is Docuseal self-hosted or Docuseal Cloud? This affects environment configuration,
  webhook URL accessibility, and operational cost.
- **Proposed default:** Self-hosted (matches the local dev stack). Note: this is partly an
  operational/infra decision and should be confirmed with whoever owns deployment.
- **Resolution:** _pending_
- **Provenance:** CLARIF-006

---

_Resolved before this ledger was created: **CLARIF-004** (portal names) — settled 2026-04-16 as
"Client Portal" (client-facing) and "Tax Portal" (accountant-facing). Not carried as an open question._

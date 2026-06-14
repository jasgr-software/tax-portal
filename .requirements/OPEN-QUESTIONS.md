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
- **Status:** resolved
- **Affects:** REQ-DOOR-008
- **Question:** When the accountant declines an engagement request, is the decline message retained in
  the portal for the accountant's records, or sent via email only with no portal retention? A
  financial-context communication may benefit from being retained for audit purposes.
- **Proposed default:** (none — **escalation carve-out: data retention / audit scope.** User decision required.)
- **Resolution:** **2026-06-13 — retain with the request.** The decline reason is retained in the
  portal, attached to the declined request record, for the accountant's reference (the request record is
  retained regardless; the prospect remains accountless). REQ-DOOR-008 → accepted, with AC-DOOR-008-04
  added for portal-side retention.
- **Provenance:** CLARIF-001

## OQ-002 — Client-facing engagement status labels
- **Status:** resolved
- **Affects:** REQ-LIFE-002
- **Question:** What are the client-facing status labels for each internal status (New, In Progress,
  Review, Complete)? These must be defined before the engagement lifecycle is built.
- **Proposed default:** Mirror the internal labels verbatim ("New", "In Progress", "Review",
  "Complete") until the product owner supplies friendlier client-facing copy.
- **Resolution:** **2026-06-13 — simplified mapping, Review hidden.** Client-facing labels: New →
  "Received", In Progress → "In Progress", Review → "In Progress", Complete → "Completed". The internal
  Review stage is not surfaced to the client (consistent with REQ-LIFE-004); clients see three states.
  Mapping is fixed in v1 (not accountant-configurable). REQ-LIFE-002 → accepted.
- **Provenance:** CLARIF-002

## OQ-003 — Duplicate engagement attempt behavior
- **Status:** resolved
- **Affects:** REQ-LIFE-011
- **Question:** When a duplicate engagement is attempted (same service + tax year + client), what
  should the system do? (a) show an error and block, (b) silently redirect to the existing engagement,
  (c) warn the accountant and allow override.
- **Proposed default:** (c) warn the accountant and allow override — least destructive, preserves
  accountant judgment.
- **Resolution:** **2026-06-13 — (c) warn + allow override.** On a duplicate attempt the accountant is
  warned and shown the existing matching engagement, and may navigate to it or deliberately override to
  create a second. Not a hard block, not a silent redirect. Applies at engagement creation (the
  accountant's action). REQ-LIFE-011 → accepted.
- **Provenance:** CLARIF-003

## OQ-004 — Hard delete vs. retention precedence
- **Status:** resolved
- **Affects:** REQ-IDNT-005, REQ-FILE-005, REQ-AUTH-008, REQ-FILE-013, REQ-FILE-014, REQ-FILE-015
- **Question:** Hard delete (REQ-IDNT-005) conflicts with 7-year document retention (REQ-FILE-005) and
  indefinite client access (REQ-AUTH-008). What is the precedence? Does a hard delete override the
  retention rule? Are files physically removed from object storage, or only the DB records?
- **Proposed default:** (none — **escalation carve-out: data deletion / retention / access-control
  scope.** User decision required.)
- **Resolution:** **2026-06-13 — Option D (defer).** Permanent hard-delete of a client and all
  associated data is **deferred from v1**. In v1, client data is kept per the 7-year retention rule
  (REQ-FILE-005) and clients retain indefinite access (REQ-AUTH-008); the precedence/physical-erasure
  question is therefore moot for v1. True permanent deletion — and any non-destructive
  deactivate/close mechanism — is deferred to a later version, to be designed once the retention/legal
  policy is settled. **Consequences:** REQ-IDNT-005 (client hard delete) is descoped from v1 (to be
  authored as deferred when the IDNT domain is processed); REQ-AUTH-008 is unblocked → accepted.
- **Resolution addendum — 2026-06-14 (partial reversal for purge):** The user decision of 2026-06-14
  partially supersedes the 2026-06-13 deferral. **Post-retention accountant-confirmed purge is brought
  into v1** — after the 7-year window elapses, the accountant may explicitly purge engagement data
  (never automatically). This resolves the post-retention side of the precedence question: retention
  governs during the window; after the window, purge is available under accountant control. Legal hold
  (new) suspends purge eligibility regardless of age. Client-erasure requests during the retention
  window are honored as access-revocation only, not data destruction. **The deferral of REQ-IDNT-005
  (wholesale permanent deletion of a client identity) is NOT reversed** — wholesale client erasure
  remains out of v1 scope. New requirements added: REQ-FILE-013 (post-retention purge),
  REQ-FILE-014 (legal hold), REQ-FILE-015 (retention-vs-erasure precedence). REQ-FILE-005 updated with
  reconciliation note.
- **Provenance:** CLARIF-005

## OQ-005 — Docuseal hosting model
- **Status:** resolved
- **Affects:** REQ-NFR-007
- **Question:** Is Docuseal self-hosted or Docuseal Cloud? This affects environment configuration,
  webhook URL accessibility, and operational cost.
- **Proposed default:** Self-hosted (matches the local dev stack). Note: this is partly an
  operational/infra decision and should be confirmed with whoever owns deployment.
- **Resolution:** **2026-06-13 — out of scope (HOW → ADR).** Self-hosted vs cloud is a deployment/ops
  decision, not a requirement; this WHAT-not-HOW layer captures only the e-sign capability (REQ-NFR-007).
  The hosting choice is deferred to an implementation ADR. If a real driver emerges (cost control, or
  signed documents must stay under the firm's control), capture it as its own WHAT-level NFR.
  REQ-NFR-007 → accepted.
- **Provenance:** CLARIF-006

## OQ-006 — Message thread retention ("kept forever")
- **Status:** resolved
- **Affects:** REQ-MSG-006
- **Question:** Are message threads kept forever with no deletion path in v1, or is there a maximum
  retention / purge after some period?
- **Proposed default:** Indefinite retention; archive-not-delete on engagement close.
- **Resolution:** **2026-06-13 — seed-specified.** The seed states threads are kept forever and
  archived (not deleted) on close; this is consistent with the v1 no-hard-delete stance (OQ-004) and
  indefinite client access (REQ-AUTH-008). REQ-MSG-006 authored `accepted` as such.
- **Provenance:** authoring run (MSG)

## OQ-007 — Notification history retention period
- **Status:** resolved
- **Affects:** REQ-MSG-016
- **Question:** Confirm the 90-day floor for notification history, and whether there is an upper bound
  after which notification records are purged.
- **Proposed default:** Retain notification records (read and unread) for at least 90 days; no upper
  bound in v1.
- **Resolution:** **2026-06-13 — seed-specified.** The seed sets a 90-day minimum; no purge ceiling is
  defined for v1. REQ-MSG-016 authored `accepted` as such.
- **Provenance:** authoring run (MSG)

## OQ-008 — Message attachment file-type / size / scanning policy
- **Status:** resolved
- **Affects:** REQ-MSG-004, REQ-NFR-009 (new)
- **Question:** Should message attachments be governed by the same access-control, file-type, and size
  rules as engagement documents, or have their own policy (e.g. tighter limits, allowed extensions,
  virus scanning)?
- **Proposed default (in effect):** Message attachments inherit the same file-type and size constraints
  as engagement document upload.
- **Resolution:** **2026-06-13 — mirror documents + add malware scanning for all uploads.** Message
  attachments follow the same file-type/size rules as engagement document upload (REQ-FILE-002). A new
  cross-cutting security requirement **REQ-NFR-009** was added: every upload (documents and message
  attachments) is scanned for malware before it is made available. REQ-MSG-004 → AC-MSG-004-05 added.
- **Provenance:** authoring run (MSG)

## OQ-009 — Onboarding document-checklist completeness gate
- **Status:** resolved
- **Affects:** REQ-ONBD-004, REQ-ONBD-005
- **Question:** Must the document-upload step require ALL checklist items before it is satisfied, or may
  the accountant mark some items optional so the step can complete with only required ones provided?
- **Proposed default (in effect):** Every item on the accountant-defined checklist is required; the step
  is satisfied only when all are provided (the accountant expresses optionality by what she puts on the
  checklist).
- **Resolution:** **2026-06-13 — confirmed (default stands).** All checklist items are required; the
  accountant expresses optionality by curating the checklist. No per-item optional flag in v1.
  REQ-ONBD-004/005 already encode this; no change needed.
- **Provenance:** authoring run (ONBD)

## OQ-010 — Document-request overdue threshold
- **Status:** resolved
- **Affects:** REQ-FILE-012
- **Question:** How is a document request's due point determined so "overdue" can be computed —
  per-request due date set by the accountant, a fixed interval after creation, or tied to an engagement
  deadline?
- **Proposed default (in effect):** Overdue is relative to an accountant-set due point on the request,
  falling back to a configurable global interval after creation when none is set.
- **Resolution:** **2026-06-13 — confirmed (default stands).** A document request becomes overdue
  relative to an accountant-set due date on the request; if none is set, a configurable global interval
  after creation applies (consistent with REQ-DASH-008 reminder cadence). REQ-FILE-012 already encodes
  this; no change needed.
- **Provenance:** authoring run (FILE)

## OQ-011 — Adopt or drop the legacy user flows & personas
- **Status:** resolved
- **Affects:** (layer-level — no single REQ)
- **Question:** The `.implementation/` refactor (2026-06-14) retired the legacy `docs/` agent structure but
  left `docs/requirements/flows/` (6 user-flow files) and `docs/requirements/personas/` (4 persona files)
  with no home in the new layers. They predate this `.requirements/` layer and overlap with the acceptance
  criteria now carried on `REQ-*` files. Should the `.requirements/` layer **absorb** them (migrate flows →
  a `flows/` artifact type and personas → a `personas/` artifact type under `.requirements/`, reconciled
  against the REQ acceptance criteria), or **drop** them (the REQ acceptance criteria + persona context in
  the SRS snapshot already cover their content)?
- **Proposed default:** Drop. The REQ acceptance criteria are the canonical "what"; product-wide flows and
  personas, if still wanted, are better re-derived as a first-class `.requirements/` artifact type than
  migrated verbatim from the retired `docs/` tree. Until the Requirements Agent decides, the files remain in
  `docs/requirements/{flows,personas}/` untouched (read-only legacy).
- **Resolution (2026-06-14):** **Absorbed by `.planning/`, not `.requirements/`, and not dropped.** Once
  `.planning/` took ownership of the behavior contract (personas, flows, acceptance scenarios), the 4
  personas and 6 flows were **migrated verbatim** from `docs/requirements/{personas,flows}/` to
  `.planning/personas/` and `.planning/flows/`, and the `docs/` tree was retired. They are grandfathered as
  richer legacy flows; `.planning/` keeps them current each planning run. `.requirements/` confirms it does
  **not** own them.
- **Provenance:** `.implementation/` refactor, 2026-06-14 (flagged from the implementation layer); resolved
  2026-06-14 by the `.planning/` behavior-contract migration.

---

_Resolved before this ledger was created: **CLARIF-004** (portal names) — settled 2026-04-16 as
"Client Portal" (client-facing) and "Tax Portal" (accountant-facing). Not carried as an open question._

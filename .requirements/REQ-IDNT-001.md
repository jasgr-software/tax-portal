---
id: REQ-IDNT-001
title: Portal served on the firm's own custom domain
domain: IDNT
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-IDNT-001
  - seed/intake.md
open_questions: []
---

# REQ-IDNT-001 — Portal served on the firm's own custom domain

## User need
The accountant is asking clients to trust the portal with sensitive financial documents and personal
information. A portal that lives on a generic, third-party-looking web address undermines that trust and
makes the service feel less like *her* practice. From day one she wants the portal to live at her own
firm's web address (for example, a sub-address of her firm's domain) so clients recognize it as hers and
feel confident it is a legitimate extension of her practice.

## Proposed solution
Both the Client Portal and the Tax Portal are reachable at a web address belonging to the firm's own
domain, rather than only at a generic provider address. This is a v1 requirement, not a later
enhancement: clients encounter the firm's own domain the first time they are invited.

## Acceptance criteria
- **AC-IDNT-001-01** — The portal is reachable by clients at a web address under the firm's own domain.
- **AC-IDNT-001-02** — The firm's own domain is the address presented to clients from v1 onward, not
  deferred to a later version.

## Notes
- The mechanics of acquiring, configuring, and certificating the domain depend on the chosen hosting
  arrangement and are an implementation/operations concern outside this requirement.

## Links
- Related: REQ-IDNT-006 (portal names)
- Open questions: none

---
id: REQ-FILE-011
title: Top-level organization by engagement and tax year
domain: FILE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-011
  - seed/intake.md
open_questions: []
---

# REQ-FILE-011 — Top-level organization by engagement and tax year

## User need
A client may have several years of work and more than one engagement. When they (or the accountant) come
back to retrieve documents, they think in terms of "which engagement" and "which tax year." The
top-level organization of files needs to match that mental model so prior-year documents are easy to
locate.

## Proposed solution
At the top level, files are organized by engagement and by tax year, so a user navigating documents
finds them grouped first by the engagement and tax year they belong to before drilling into the
accountant's folder structure within an engagement.

## Acceptance criteria
- **AC-FILE-011-01** — At the top level, files are grouped by the engagement they belong to.
- **AC-FILE-011-02** — At the top level, files are grouped by tax year.
- **AC-FILE-011-03** — A user can locate an engagement's files by navigating from its engagement and tax
  year down into the engagement's folder structure.

## Links
- Related: REQ-FILE-010 (folder structure within an engagement)
- Open questions: none

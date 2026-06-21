---
id: CS-INFRA-001
title: Infra topology changes update the operations inventory and runbook
language: infra
polarity: do
rating: required
status: active
verification: A change to Dockerfile content, docker-compose service topology, secrets, environment variables, ingress wiring, or the admin/app DB principal split is accompanied by matching updates to `.implementation/operations/inventory.md` and `.implementation/operations/runbook.md`. SDET rejects an infra task whose inventory/runbook is stale; a reviewer confirms the docs reflect the change.
source:
  - CLAUDE.md#Domain-specific-notes
  - ADR-007
related: [CS-INFRA-002]
rating_history:
  - { rating: required, date: 2026-06-20, by: agent, rationale: "born required — CLAUDE.md makes this a must for DevOps tasks and SDET is instructed to reject stale inventory/runbook; a hard review gate" }
open_questions: []
---

# CS-INFRA-001 — Infra topology changes update the operations inventory and runbook

## Rule
Per **CLAUDE.md § Domain-specific notes (DevOps)**, any change to Dockerfile content, compose service
topology, secrets, environment variables, ingress wiring, or the admin/app DB principal split **must**
update `.implementation/operations/inventory.md` and `.implementation/operations/runbook.md` in the same
change. The production platform is deferred (**ADR-007**), but the capability contract the eventual host
must satisfy is authoritative and lives in those docs.

## Rationale
The inventory and runbook are the single description of what the stack is and how to operate it. An infra
change that doesn't update them leaves the operational contract lying — the next operator (or the eventual
production host) works from a stale map.

## Verification
SDET treats stale inventory/runbook as a rejection for infra tasks. A reviewer confirms every changed
service / secret / env var / principal is reflected in both docs.

## Links
- Source: CLAUDE.md § Domain-specific notes (DevOps), ADR-007 (deploy-agnostic packaging)
- Related: CS-INFRA-002
- Open questions: none

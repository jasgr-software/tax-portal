---
id: CS-GEN-001
title: No secrets or PII in logs
language: cross-cutting
polarity: dont
rating: recommended
status: active
verification: Log statements and structured-log fields carry no secrets (keys, tokens, connection strings, SA_PASSWORD) and no PII beyond what the telemetry policy permits; identity in traces is the Clerk user id, redacted before any third-party log sink. A reviewer scans changed log/telemetry call sites against ADR-017.
source:
  - ADR-017
related: [ADR-019, ADR-003]
rating_history:
  - { rating: recommended, date: 2026-06-20, by: agent, rationale: "born recommended — ADR-017 sets the policy and it is a real convention, but it is not yet a mechanical CI gate (review-enforced, not lint-enforced)" }
open_questions: []
---

# CS-GEN-001 — No secrets or PII in logs

## Rule
Do not write secrets or PII to logs. Per **ADR-017**, telemetry and application logs must exclude keys,
tokens, connection strings, and PII beyond what the policy permits; the Clerk user id used to tie a trace
to a principal must be redacted before reaching any third-party log store (ADR-003 § Observability).

## Rationale
Logs flow to sinks with weaker access controls than the database. A token or SSN in a log line is a data
exposure that survives long after the request — and undoes the RLS trust boundary the rest of the stack
enforces.

## Verification
Review changed log/telemetry call sites against the ADR-017 policy. The evidence hook is the policy itself
plus the redaction step on any identity field; `security-scan` catches a subset (hard-coded secrets) but
PII discipline is review-enforced.

## Links
- Source: ADR-017 (telemetry data-handling policy)
- Related: ADR-019 (audit-trail logging), ADR-003 (observability — identity redaction)
- Open questions: none

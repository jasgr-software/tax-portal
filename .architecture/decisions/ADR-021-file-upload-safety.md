---
id: ADR-021
title: File-upload safety — scan-before-available pipeline, AV engine deferred
status: Accepted   # Posture decidable (quarantine/scan-before-available pipeline, MIME validation, size limits); the AV engine/vendor is deferred (defer-but-constrain — capability contract defined). No carve-out blocks this ADR.
date: 2026-06-14
deciders: [Architecture Agent, user]
related: [ADR-005, ADR-007, ADR-008, ADR-009, ADR-013, ADR-020]
source:
  - .requirements/REQ-NFR-009.md   # all uploaded files are scanned for malware — the WHAT (this ADR decides the scan-before-available HOW)
  - architecture-dispatch-2026-06-14#adr-d-file-upload-safety   # dispatch: decide upload safety; defer AV engine (defer-but-constrain)
  - decisions/ADR-009-signed-url-file-access.md   # two-phase upload, pending→active state, "server-side AV deferred to Phase 4/5", content-type=any
  - decisions/ADR-008-object-storage-abstraction.md   # FileStorage port; pending-row + reconciliation; signed-upload URL
  - decisions/ADR-007-container-packaging-deploy-agnostic.md   # no local FS beyond /tmp; cron as own workload; defer-but-constrain shape
  - decisions/ADR-013-cloud-portability-azure-readiness.md   # keep cloud touchpoints behind a port; Azure-cheapest default
open_decisions: []   # AV engine/vendor is a defer-but-constrain tool deferral with a capability contract — it does not block this ADR (mirrors ADR-007/016)
---

# ADR-021: File-upload safety — scan-before-available pipeline, AV engine deferred

**Status:** Accepted. The upload-safety *posture* is decided; the specific antivirus engine/vendor is deferred under the **defer-but-constrain** pattern (ADR-007/013/016) with a capability contract. No escalation carve-out blocks this ADR.
**Date:** 2026-06-14
**Deciders:** Architecture Agent (with user direction)
**Related:** ADR-009 (two-phase upload, `pending`→`active`, content-type=any, AV-deferred note), ADR-008 (`FileStorage` port; reconciliation sweeps), ADR-007 (no local FS beyond `/tmp`; cron workload; defer-but-constrain), ADR-013 (port discipline; Azure-cheapest default), ADR-005 (RLS trust boundary) + ADR-020 (encryption / security posture); **REQ-NFR-009** (all uploaded files are scanned for malware — the requirement this ADR's scan-before-available pipeline satisfies)

## Context

Client-uploaded files that the accountant later downloads are a **malware vector**: a prospective or invited client uploads a document, and the accountant opens it on her workstation. ADR-009 explicitly **deferred** server-side antivirus scanning ("ClamAV / Defender / third-party scanner … deferred to Phase 4 or 5") and set content-type to **any** (REQ-FILE-002, no restriction). ADR-009 also already built the structural seam that upload safety needs: a **two-phase upload** (create `Document` row in `pending` state → client PUTs to a signed URL → `complete` flips it to `active`), with a reconciliation cron for stragglers. What is missing is the *decision* about where safety checks sit in that pipeline.

This ADR fills that gap **now, before implementation**, deciding the upload-safety posture and reserving the AV engine choice for later (defer-but-constrain). The forces:

1. **Malware risk is real (security non-negotiable — ADR-005 / ADR-020).** Even with a small, semi-trusted client base, a single malicious upload reaching the accountant's machine is a serious incident. "Trusted known clients" (ADR-009's deferral rationale) is not a safety guarantee.
2. **The two-phase upload already gives us a quarantine seam.** A file in `pending` is not yet `active`; inserting a scan between "object landed" and "marked active/available" fits the existing ADR-009 state machine without new architecture.
3. **No local filesystem beyond `/tmp` (ADR-007).** Scanning must operate on the object in storage (or a streamed copy), not a persisted local file.
4. **Cloud portability (ADR-013).** The AV engine must sit behind a port and be a deploy-time choice — not a vendor SDK baked into a route handler. Azure-cheapest default is the design target, but no Azure dependency today.
5. **Defer the engine, not the posture.** Like the deployment host (ADR-007), the observability backend (ADR-016), and the UI design (ADR-015), the *tool* stays open while the *contract* is locked.

Scope is **how, not what**: this decides the upload-safety *mechanism*, not the product requirement asserting *that* uploads must be scanned for malware (REQ-NFR-009 owns that).

## Decision

**We will gate uploaded files behind a scan-before-available pipeline: a file is scanned (malware/AV) and validated (content-type/MIME + size) while in the ADR-009 `pending`/quarantine state, and only promoted to `active`/available after it passes. The specific AV engine/vendor is deferred behind a `FileScanner` port with a defined capability contract (defer-but-constrain). MIME validation and size limits are decided now.**

### 1. Scan-before-available pipeline (decided) — sits inside the ADR-009 state machine

The pipeline reuses and extends ADR-009's two-phase upload:

1. Client requests a signed upload URL; server creates the `Document` row in **`pending`** (unchanged, ADR-009).
2. Client PUTs the file body directly to the signed URL into storage (unchanged, ADR-008/009). **A `pending` document is quarantined: it is never downloadable by any actor and never appears as `active`.**
3. On `complete` (or via the reconciliation cron), before flipping to `active`, the server invokes the **`FileScanner` port** on the stored object:
   - **Pass** → MIME/size validation (below) also passes → promote to **`active`** (available for download).
   - **Fail (malware detected)** → move to a terminal **`infected`/quarantined** state; the object is **not** promoted, is flagged for accountant review, and is scheduled for adapter-side deletion (or retained quarantined) per the operations runbook. Notify per the in-portal notification model.
   - **Indeterminate/scanner-unavailable** → stays `pending` (fail-closed: not promoted to available) and is retried; it must never silently become `active` without a pass.
4. The download authorize-then-sign gate (ADR-009) only ever mints URLs for `active` documents, so a quarantined/`pending`/`infected` object can never be signed for download. **The scan gate and the authorize-then-sign gate are layered, both load-bearing.**

The scan runs **out-of-band** on the object in storage (or a streamed copy through `/tmp` only, never a persisted local file — ADR-007), typically as part of the `complete` handler or the reconciliation/scan cron workload (ADR-007's separate cron image is the natural host for heavier scanning). It does **not** block the client's PUT.

### 2. Content-type / MIME validation (decided)

- **Claimed content-type is signed into the upload URL** (ADR-008 `SignedUploadOptions.contentType`, ADR-009) and enforced at the storage layer.
- **Server-side validation confirms the *actual* content matches the claimed type** (magic-byte/content sniffing) during the scan phase, rejecting mismatches (e.g. an `.exe` masquerading as `application/pdf`). ADR-009 keeps "any content type" as the *product* allowance (REQ-FILE-002), but "any type" does not mean "no validation" — the bytes must match the declared type, and an allow/deny list of executable/dangerous types is an operations-tunable applied at this gate.

### 3. Size limits (decided — reaffirms ADR-009)

- **100 MB per file in v1**, enforced in the signed-upload-URL policy (ADR-008/009) — reaffirmed, not changed. The scan phase additionally rejects objects whose `stat()` size exceeds the policy (defense-in-depth against a storage-layer bypass).

### 4. AV engine/vendor is deferred behind a `FileScanner` port (defer-but-constrain)

The concrete scanner is **not decided here** — exactly as ADR-007 defers the host and ADR-016 defers the observability backend. It sits behind a small **`FileScanner` port** (the ADR-013 port pattern); the eventual engine must satisfy this **capability contract**:

1. **Scan an object in storage** (by key, or a streamed copy) and return a verdict: `clean` / `infected(threat)` / `indeterminate`.
2. **Operate out-of-band** without holding the client request open and without requiring a persisted local file beyond `/tmp` (ADR-007).
3. **Be reachable behind the port** — no vendor scanner SDK imported into a route handler (ADR-013); swapping engines is a single adapter change.
4. **Support a no-op/dev binding** — local dev and tests run with a no-op or stub scanner (analogous to ADR-008's `MemoryAdapter` and ADR-016's no-op exporter) so the pipeline is exercised without a real engine. A `cloud`/prod binding that is requested but unbound **fails closed** (mirrors ADR-008's fail-closed boot), never silently passing files through unscanned.

**Azure-cheapest default target (not a commitment):** Microsoft Defender for Storage (malware scanning on Blob) is the natural Azure default to design toward (ADR-013), with ClamAV-in-a-container as a portable self-hosted alternative and third-party scan APIs as further options — but no code depends on any of them; the port keeps it a deploy-time choice.

### Why this is Accepted (no carve-out)

Upload safety is a **security posture** but not one of the AGENT.md §2 escalation items requiring user sign-off — it is a mechanism decision (where scanning sits, fail-closed promotion, MIME/size validation), and the only deferred element is a **tool** (the AV engine), which is the routine defer-but-constrain pattern, not a no-default carve-out. Compare ADR-007/016: deferring a *vendor* with a capability contract keeps the ADR Accepted; only *data-retention/encryption/trust-boundary policy* sub-decisions get the no-default carve-out treatment (as in ADR-018/019/020). Nothing here is such a sub-decision.

## Consequences

- **Uploaded files are quarantined until proven safe.** The `pending`→scan→`active` gate closes ADR-009's deferred AV gap. **Code follow-up flagged for `[webapp-developer]`:** a `FileScanner` port in `packages/storage` (or a sibling package); scan invocation in the `complete` handler and/or the reconciliation/scan cron; the `infected` terminal state + accountant notification + adapter-side deletion; magic-byte content-type validation; fail-closed binding for the prod scanner; extend the ESLint SDK-ban list to flag vendor scanner SDK imports in `apps/**`/`packages/**`. **DevOps follow-up:** the scan cron workload and the chosen engine wiring at Phase 5; runbook entry for quarantine/infected handling.
- **Two layered gates on downloads.** Authorize-then-sign (ADR-009) plus active-only-after-scan (this ADR). A document can be downloaded only if the caller is authorized *and* the file passed scanning. Either gate failing blocks the download.
- **The engine stays genuinely deferred.** Like ADR-007's host and ADR-016's backend, the scanner is a Phase-5-style tool deferral. The app speaks to a `FileScanner` interface and is indifferent to Defender-for-Storage vs. ClamAV vs. a third-party API.
- **No new always-on burden today.** In dev/test the no-op scanner runs; nothing scan-specific operates until a prod engine is bound at Phase 5. The bias (port discipline, Azure-cheapest target) lives in what the app is constrained to call.
- **Fail-closed is the rule.** An unavailable or unbound scanner leaves files `pending`/unavailable, never silently `active`. A leaked/malicious file reaching the accountant requires both gates to fail.
- **Reaffirms, does not change, ADR-008/009.** Size cap (100 MB), signed-upload contentType, two-phase state machine, and reconciliation cron are reused; this ADR layers safety onto them without superseding.

## Alternatives considered

- **No AV scanning (keep ADR-009's deferral indefinitely).** Rejected — ADR-009 deferred AV to "Phase 4 or 5" on a "trusted clients" rationale; that is an acceptance-risk the malware vector does not justify leaving unowned. Deciding the *pipeline* now (engine still deferred) costs nothing in lock-in and removes the unbounded deferral.
- **Scan synchronously inside the client's upload request.** Rejected — would hold the request open for the scan duration, fight large uploads, and require buffering the file in the app (ADR-008 explicitly avoids upload-via-server). Out-of-band scan in the `pending` quarantine state fits the existing two-phase machine.
- **Restrict allowed content types to a safe allow-list (e.g. PDF/images only).** Rejected as the baseline — REQ-FILE-002 / ADR-009 allow any type (tax workflows involve varied formats). MIME *validation* (bytes match declared type) plus AV scanning is the chosen control; an executable deny-list at the scan gate is an ops-tunable, not a blanket type restriction.
- **Pick the AV engine now (e.g. commit to ClamAV or Defender).** Rejected — contradicts the deferral directive and ADR-013 (a vendor scanner SDK in app code is proprietary coupling). The defer-but-constrain pattern (ADR-007/016) keeps the engine open behind a `FileScanner` port with a capability contract.
- **Treat upload safety as a no-default escalation carve-out.** Rejected — unlike ADR-018/019/020, no sub-decision here is data-retention/encryption/trust-boundary *policy*; it is a mechanism decision plus a tool deferral. The §2 carve-out does not apply; this ADR is Accepted.
- **Fold into ADR-009 by amending it.** Rejected — ADRs are immutable; ADR-009 scoped AV as "deferred." This ADR `related:`-links it and lands the decision rather than rewriting the immutable record.

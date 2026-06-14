---
id: ADR-020
title: Encryption posture & key management — TLS everywhere, at-rest everywhere, KMS abstracted
status: Accepted   # Posture (TLS in transit, at-rest for DB + blob, KMS behind a port) + key custody now decided: platform-managed keys (PMK) for v1, no compliance/contractual driver mandates CMK. OD-006 resolved 2026-06-14.
date: 2026-06-14
deciders: [Architecture Agent, user]
related: [ADR-002, ADR-005, ADR-007, ADR-008, ADR-009, ADR-013, ADR-017]
source:
  - .requirements/REQ-FILE-003.md   # files encrypted at rest — the WHAT (the requirement this posture's at-rest mechanism satisfies)
  - architecture-dispatch-2026-06-14#adr-c-encryption-key-management   # dispatch: consolidate encryption posture; keep cloud-portable; decide key custody
  - decisions/ADR-008-object-storage-abstraction.md   # AES-256 encryption-at-rest as adapter contract for blob storage — reconcile, do not contradict
  - decisions/ADR-009-signed-url-file-access.md   # encryption at rest delivered by adapter; TLS for signed-URL traffic
  - decisions/ADR-013-cloud-portability-azure-readiness.md   # no cloud secrets/KMS SDK in app code; 12-factor; per-concern port discipline
  - decisions/ADR-002-database-sql-server.md   # DB at-rest encryption (TDE), TLS connection options deferred to deploy
  - decisions/ADR-007-container-packaging-deploy-agnostic.md   # secrets injected via env, never baked; TLS at ingress
  - decisions/ADR-017-telemetry-data-handling-policy.md   # the distinct HMAC secret — a key this posture governs the custody of
open_decisions: []   # OD-006 resolved: PMK for v1, KeyProvider abstraction kept for a clean CMK/BYOK swap if a driver later emerges
---

# ADR-020: Encryption posture & key management — TLS everywhere, at-rest everywhere, KMS abstracted

**Status:** Accepted. The **portable encryption posture** (TLS in transit everywhere, encryption at rest for DB + blob — satisfying REQ-FILE-003 — key access abstracted behind a port) is decided, and the formerly-carved-out **key custody** decision (OD-006) is now made: **platform-managed keys (PMK) for v1**, since no compliance or contractual driver mandates customer-managed keys (CMK) for a solo-accountant v1; the `KeyProvider` abstraction is kept so CMK/BYOK is a clean later swap if such a driver emerges. Key custody is a pure HOW with no governing requirement, by design. OD-006 is resolved; no open decision blocks this ADR.
**Date:** 2026-06-14
**Deciders:** Architecture Agent (with user direction)
**Related:** ADR-008 (AES-256 at-rest adapter contract — reconciled, not contradicted), ADR-009 (at-rest via adapter; signed-URL TLS), ADR-013 (no cloud KMS/secrets SDK in app code; 12-factor; ports), ADR-002 (DB at-rest/TDE; TLS connection), ADR-007 (env-injected secrets, never baked; TLS ingress), ADR-017 (the distinct HMAC secret this posture governs custody of), ADR-005 (RLS trust boundary — the access-control complement to encryption)

## Context

Encryption posture is currently **scattered across several ADRs** with no single consolidated decision:

- **The security posture** (ADR-005 — the RLS trust boundary) treats encryption at rest (AES-256) as non-negotiable for this financial data, alongside signed URLs and enforced 2FA. This ADR is where that at-rest mechanism is decided.
- **ADR-008** makes **AES-256 encryption at rest an adapter-contract requirement for blob storage** — every `FileStorage` adapter must store objects encrypted (Azurite simulates SSE; prod adapters configured with provider-side default encryption). **This ADR must reconcile with — not contradict — ADR-008.**
- **ADR-009** states encryption at rest for files is "delivered by the adapter (ADR-008), not by the app," and routes all file traffic over signed URLs.
- **ADR-002** notes TLS requirements and connection-string secrets are "deferred to the deployment ADR"; DB at-rest encryption (TDE) is implied by the security posture but never decided — this ADR decides it.
- **ADR-007** requires secrets be injected via env and never baked into images; TLS terminates at ingress.
- **ADR-013** forbids a cloud secrets/KMS SDK (e.g. Azure Key Vault SDK) in app code — secrets arrive via env (12-factor), and every cloud touchpoint sits behind a port.
- **ADR-017** introduces a **distinct HMAC secret** for telemetry correlation-id hashing — a key whose *custody* this posture should govern alongside the DB/blob keys.

The gap: there is **no ADR that states the encryption posture as a whole** — TLS in transit everywhere, encryption at rest for **both** the database and blob storage, and how keys are accessed in a way that stays cloud-portable. Without it, a developer could reach for `@azure/keyvault-secrets` in a route handler (violating ADR-013), or assume Azure-only TDE semantics, or leave the DB-at-rest question unowned.

The forces:

1. **Security is non-negotiable.** SSNs, tax documents, financial data — encryption in transit and at rest is table stakes, and AES-256 is already named (the security posture this ADR makes concrete; access-control complement in ADR-005).
2. **Cloud portability (ADR-013).** The posture must not bake any cloud KMS SDK into app code; key access must be abstracted/injected so Azure Key Vault / AWS KMS / GCP KMS / HashiCorp Vault is a **deploy-time** choice, not a code dependency.
3. **Reconcile, don't re-litigate.** ADR-008 already decided blob at-rest; this ADR consolidates and *extends* (adds DB-at-rest and TLS-everywhere as explicit posture, adds the KMS-abstraction rule) without contradicting it.

Per **AGENT.md §2**, **encryption** is an escalation carve-out. Key custody was originally held as **OD-006 (no default)**. The 2026-06-14 design session resolved it: the user confirmed **no compliance or contractual driver mandates customer-managed keys** for the solo-accountant v1, so **platform-managed keys (PMK)** are the v1 choice, with the `KeyProvider` abstraction preserved for a clean CMK/BYOK swap should a driver later emerge. Key custody has **no governing requirement** — it is a pure HOW, by design (unlike the at-rest *requirement* itself, REQ-FILE-003, which this posture satisfies). OD-006 is resolved.

Scope is **how, not what**: REQ-FILE-003 owns that encryption at rest must exist; this ADR decides the encryption *mechanism, portability discipline, and key-custody choice*.

## Decision

**We will enforce TLS in transit on every connection, encryption at rest for both the database and blob storage (AES-256, reconciling ADR-008 — satisfying REQ-FILE-003), and access all encryption keys through a portable, env-injected abstraction — never a cloud KMS SDK in app code (ADR-013). For key custody we will use platform-managed keys (PMK) with platform-automatic rotation for v1 (no compliance/contractual driver mandates CMK), keeping the `KeyProvider` abstraction so CMK/BYOK is a clean later swap if a driver emerges.**

### 1. TLS in transit, everywhere (decided)

Every network hop carrying portal data is TLS-encrypted:

- **User ↔ app:** HTTPS at ingress (ADR-007 terminates TLS at the ingress layer, per host).
- **App ↔ database:** the SQL Server connection uses TLS (`Encrypt=true`); ADR-002 deferred the exact connection options to deploy — this ADR fixes the *posture* (encrypted connection required) while the cert/trust specifics remain a deploy-time detail.
- **App ↔ blob storage:** HTTPS to the storage endpoint; signed URLs (ADR-009) are HTTPS-only.
- **App ↔ third parties** (Clerk, Docuseal, email, OTLP endpoint): HTTPS/TLS.

No plaintext data hop is acceptable. This is the in-transit complement to this ADR's at-rest AES-256.

### 2. Encryption at rest — DB *and* blob (decided; reconciles ADR-008)

- **Blob storage (reconciled with ADR-008):** unchanged and reaffirmed — AES-256 at rest is an **adapter-contract requirement** (ADR-008 §Encryption-at-rest). Azurite simulates SSE in dev; production adapters are configured with provider-side default encryption on. This ADR does **not** contradict ADR-008; it consolidates it into the overall posture and adds the DB side.
- **Database at rest:** the SQL Server datastore is encrypted at rest. The portable mechanism is **Transparent Data Encryption (TDE)** — available on box SQL Server 2022 *and* Azure SQL Database (inside the ADR-013 intersection; Azure SQL has TDE on by default, box/MI enable it via the database master key + certificate). TDE encrypts data files, log files, and backups at rest without app code involvement. This closes the previously-unowned "DB at rest" gap implied by the security posture.
- **App-level / column-level encryption** (e.g. SQL Server Always Encrypted for SSN-class columns) is **not adopted in v1** — RLS (ADR-005) is the access boundary, TDE covers at-rest, and Always Encrypted has portability and Prisma-compatibility costs (ADR-005 already noted it as "a different concern, not considered here"). It remains a future layered option, not a baseline.

### 3. Key access is abstracted and env-injected — no cloud KMS SDK in app code (decided)

Consistent with ADR-013's "no cloud secrets SDK; secrets arrive via env (12-factor)":

- **No KMS/secrets SDK in app code.** No `@azure/keyvault-secrets`, `@azure/identity`-for-KMS, AWS KMS SDK, GCP KMS SDK, or HashiCorp Vault client imported into `apps/**` or `packages/**`. Such an import is a **deviation finding** (against this ADR and ADR-013).
- **Keys and key-material references arrive via environment.** Application-managed secrets (the DB connection secret, the storage connection/SAS credential, and the **ADR-017 HMAC secret**) are injected into the container env by the platform (ADR-007), exactly as ADR-013's "Config & secrets" row prescribes. The platform may back those env values with Azure Key Vault references / AWS Secrets Manager / etc. **at the platform layer** — but app code only ever reads env vars.
- **Infrastructure-managed keys stay in the infrastructure.** TDE keys and blob-SSE keys are managed by the database engine / storage account at the **infrastructure** layer, not handed to or rotated by app code. The app never holds the data-encryption key; it relies on the platform's at-rest encryption.
- **One portable seam if app-mediated key access is ever needed.** Should a future need arise for the app to fetch a key (it does not today), it goes through a small `KeyProvider`-style port (the ADR-013 pattern), with the cloud KMS impl behind the interface — never a provider SDK in a route handler.

### 4. Key custody: platform-managed keys (PMK) for v1, platform-automatic rotation (decided — OD-006 resolved)

- **Key custody/ownership = platform-managed keys (PMK) for v1.** TDE keys (DB at-rest) and blob-SSE keys are managed by the platform (the database engine / storage account), not by the firm. The user confirmed in the 2026-06-14 design session that **no compliance or contractual driver mandates customer-managed keys (CMK) / BYOK** for the solo-accountant v1, so the simpler PMK posture is chosen. The firm does not take on key-lifecycle custody it has no obligation to hold.
- **Key rotation = platform-automatic.** With PMK, rotation of the infrastructure at-rest keys (TDE / blob-SSE) is handled automatically by the platform on its own cadence; the app holds no data-encryption key and performs no at-rest key rotation. The application-managed secrets (DB connection secret, storage credential, the **ADR-017 HMAC secret**) continue to arrive via env (§3) and are rotated at the platform/secret-store layer; note ADR-017 already records that rotating the HMAC secret deliberately breaks cross-window telemetry correlation.
- **CMK/BYOK stays a clean later swap.** The `KeyProvider` abstraction (§3) is **kept** precisely so that, *if* a future compliance or contractual driver emerges that mandates customer-managed keys, moving from PMK to CMK/BYOK is a deploy-time / adapter change behind the port — not an app-code rewrite. No code depends on PMK-vs-CMK today.

### What is decided

| Aspect | Status |
|---|---|
| TLS in transit on every hop | **Decided** |
| Encryption at rest for blob (AES-256, ADR-008 reaffirmed) | **Decided** (satisfies REQ-FILE-003) |
| Encryption at rest for DB (TDE, box/Azure SQL intersection) | **Decided** (satisfies REQ-FILE-003) |
| No cloud KMS/secrets SDK in app code; keys/secrets via env (12-factor) | **Decided** |
| Infrastructure-managed at-rest keys; app never holds the DEK | **Decided** |
| Always Encrypted / column-level encryption | **Decided: not in v1** (future layered option) |
| **Key custody = platform-managed keys (PMK) for v1** (no CMK driver) | **Decided** (OD-006 resolved) |
| **Key rotation = platform-automatic** (app holds no at-rest key) | **Decided** (OD-006 resolved) |
| `KeyProvider` abstraction kept for a clean CMK/BYOK swap if a driver emerges | **Decided** |

## Consequences

- **Encryption posture is now a single citable standard.** A route importing a cloud KMS SDK, a non-TLS DB/storage connection, an unencrypted-at-rest store, or a plaintext data hop is a **deviation finding** (this ADR + ADR-005 + ADR-013). **Code/infra follow-ups flagged:** for `[webapp-developer]` — ensure the DB connection sets `Encrypt=true`; keep all key/secret access on env vars; add the optional `KeyProvider` port only if app-mediated key access is ever needed; extend the ADR-013/016 ESLint SDK-ban list to also flag cloud KMS/secrets SDK imports. For `[devops]` — TDE enabled on the production DB; blob-SSE default-on; ingress TLS; env-injected secrets backed by the platform secret store; these belong in `docs/operations/inventory.md` + `runbook.md`.
- **Reconciles ADR-008 without contradiction.** ADR-008's blob at-rest contract stands unchanged; this ADR adds DB-at-rest and the KMS-abstraction rule, consolidating the posture. No ADR is edited or superseded.
- **Key custody is decided: PMK for v1.** The app and infra are built on platform-managed, platform-rotated at-rest encryption. There is no blocked surface — OD-006 is resolved. Should a compliance/contractual driver later require CMK/BYOK, the `KeyProvider` abstraction makes it a deploy-time swap, not an app-code change. **DevOps follow-up:** record PMK as the v1 custody posture (TDE service-managed keys, blob-SSE Microsoft-/platform-managed keys, platform-automatic rotation) in `docs/operations/inventory.md` + `runbook.md`; the CMK/BYOK upgrade path is a noted future option.
- **Portability preserved.** TDE is in the box/Azure SQL intersection (ADR-013); blob-SSE is provider-default per ADR-008; no KMS SDK touches app code. The eventual platform (Azure Key Vault, AWS KMS, etc.) is a deploy-time binding, not a code dependency; PMK is the simplest binding and CMK remains reachable behind the same `KeyProvider` seam.
- **Governs the ADR-017 HMAC secret's custody.** ADR-017 created a distinct HMAC env secret but did not own its custody/rotation — this posture places it under the same env-injection rule, rotated at the platform/secret-store layer under the resolved PMK posture (rotating it deliberately breaks cross-window telemetry correlation, per ADR-017).

## Alternatives considered

- **Bake a cloud KMS SDK (e.g. Azure Key Vault SDK) into app code for key access.** Rejected — directly violates ADR-013 ("no cloud secrets SDK; 12-factor env injection"). It is the encryption analog of the `@vercel/*`/edge-runtime lock-in the project avoids everywhere else. Keys arrive via env; the platform backs them with whatever KMS it likes.
- **Adopt SQL Server Always Encrypted for SSN-class columns in v1.** Rejected as baseline — RLS (ADR-005) is the access boundary and TDE covers at-rest; Always Encrypted carries Prisma-compatibility and key-management complexity disproportionate to a solo-accountant v1 (ADR-005 already set it aside). It stays available as a future layered enhancement, not a v1 requirement.
- **Skip DB-at-rest and rely on blob-at-rest + RLS only.** Rejected — this ADR's security posture treats encryption at rest as non-negotiable for the financial data, which lives in the DB; leaving the database unencrypted at rest while encrypting blobs is an inconsistent posture. TDE is free in the box/Azure intersection and app-transparent, so there is no reason to omit it.
- **Mandate customer-managed keys (CMK) / BYOK in v1.** Rejected for v1 — key custody is an AGENT.md §2 escalation item, and the user confirmed in the 2026-06-14 design session that **no compliance or contractual driver mandates CMK** for the solo-accountant v1. CMK adds key-lifecycle custody burden the firm has no obligation to hold; PMK is the simpler, sufficient v1 posture. CMK/BYOK is preserved as a clean later swap behind the `KeyProvider` abstraction should a driver emerge — it is not a v1 baseline.
- **Fold the posture into ADR-008/ADR-013 by editing them.** Rejected — ADRs are immutable, and the posture spans more than either (DB-at-rest + TLS-everywhere + KMS-abstraction + the ADR-017 secret). A new consolidating ADR that `related:`-links them is the correct shape.

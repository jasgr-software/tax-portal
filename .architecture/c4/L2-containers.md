# C4 L2 — Containers

> Living description. See `README.md` for the index. **Stub** — to be authored by the Architecture Agent.

## Status

Stub (2026-06-13). Not yet authored.

## Container diagram

_TBD — `apps/portal` (Client Portal) + `apps/admin` (Tax Portal) over shared `packages/`; SQL Server 2022
with Security Policies; Clerk; object storage (Azure Blob / Azurite); Docuseal; mail catcher._

## Elements

_TBD._

## Relationships

_TBD — note the `SESSION_CONTEXT` identity-propagation path (ADR-003) and signed-URL file access (ADR-009)._

## Notes

Governing ADRs: ADR-002 (SQL Server), ADR-004 (Prisma), ADR-005 (Security Policies), ADR-006 (monorepo),
ADR-007 (container packaging), ADR-008 (object storage), ADR-010 (cross-app navigation).

# Code-Standards Intake

> Raw standards intent. **Appendable; read-only to the agent.** Add a dated block of "rules we want
> catalogued" or "conventions we keep repeating" and the next agent run harvests them into keyed
> `CS-*` standards (cross-referenced against `seed/sources.md`). Free-form prose is fine — the agent
> does the keying, bucketing, and rating.

---

## 2026-06-20 — Initial intent (layer establishment)

The repo's dos and don'ts are scattered across ADRs, `CLAUDE.md`, and code comments with no single
catalogue and no stable, citable key a reviewer can use as evidence that a standard was honored. Stand
up the catalogue and seed it with a focused starter set per bucket, extracted faithfully from what the
repo *actually* mandates — not invented rules.

Known recurring conventions worth cataloguing first (the agent harvests the authority and rates each at
its current enforcement weight):

- **TS** — request-scoped DB access only via the `packages/db` wrapper (ADR-003); never import
  `requestDb`/`adminDb` directly outside `packages/db` (ADR-003 §6); apply UI/route patterns to **both**
  `apps/portal` and `apps/admin` (CLAUDE.md cross-surface parity).
- **SQL** — every client-scoped table has a `SECURITY POLICY` with a per-policy RLS integration test
  proving CLIENT-A cannot read CLIENT-B (ADR-005 §6); raw-SQL track only for what Prisma can't express,
  entity schema stays on the Prisma track (ADR-002 / ADR-004); RLS predicates are inline TVFs, shallow,
  admin/accountant branch first, fail-closed on null identity (ADR-005 §2/§5).
- **GEN** — no secrets/PII in logs (ADR-017); additive, non-destructive edits to keyed artifacts
  (the layer convention); cite the governing key in code/test comments as the evidence hook.
- **INFRA** — DevOps changes to Docker/compose/secrets/env/ingress update
  `.implementation/operations/inventory.md` + `runbook.md` (CLAUDE.md); container packaging is a
  multi-stage, deploy-agnostic OCI image (ADR-007).

**Consumption is deferred this pass** — define the contract, do not wire consumers. Standards are
expected to be cited in build briefs later so implementation agents follow the established conventions.

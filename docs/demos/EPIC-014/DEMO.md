# EPIC-014 — File deletion, soft-delete & recovery (UI demo gallery)

**Persona:** jane-accountant · **Flow:** flow-document-lifecycle · **Surface:** apps/admin (Tax Portal)
**Source:** `apps/admin/e2e/demo/file-deletion.demo.spec.ts` (`@demo`) · **Non-gating** (the e2e gate is the gate).

The accountant's everyday lifecycle journey: delete a file (it leaves the working view but is preserved),
find it in the Archive, and recover it — all within the 7-year retention window where nothing is permanently
removed. The client surface (apps/portal) exposes **no** delete capability (proven separately by
`apps/portal/e2e/specs/no-client-delete.spec.ts`).

| # | Screen | AC |
| - | ------ | -- |
| 01 | Working view with the per-file Delete control | AC-FILE-004-01 |
| 02 | Delete confirm (soft-delete is recoverable — a light confirm) | AC-FILE-004-01 |
| 03 | Working view after delete — the file has left the normal list | AC-FILE-006-01 |
| 04 | Archive section showing the soft-deleted file (retained, recoverable) | AC-FILE-006-01 |
| 05 | Recover control on the archived file | AC-FILE-006-03 |
| 06 | Working view after recover — the file is restored | AC-FILE-006-03 |

6 screens · regenerate via `pnpm --filter admin e2e:run -- --grep '@demo'` against the local stack.

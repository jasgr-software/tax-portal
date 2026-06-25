---
brief: BRIEF-016
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-24T19:14:30.131Z
completed_at: 2026-06-24T19:29:34.967Z
complexity_estimate: 2
complexity_actual: 2
introduces_gate: "no"
acceptance_criteria: [AC-MSG-012-01, AC-MSG-012-02]
upstream_refs: ADR-023, ADR-006, ADR-012
code_standards: CS-TS-003, CS-GEN-001, CS-GEN-003
---

# TASK-016-003: Real-time notification transport — provider seam (port + mock binding + real stub + selector)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — the seam's mock realization is exercised end-to-end in TASK-016-005/-006/-007
- [x] **Security review** — fail-closed selector; no PII in transport payloads/logs (CS-GEN-001)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **ADR-023 seam shape (the established precedent).** Mirror `packages/esign` exactly: a `port.ts` (the
  `NotificationTransport` interface apps depend on — never a concrete binding), `bindings/mock.ts`, a real
  binding **stub** that throws a `NotAvailable`-style error at call time (no real provider wired — Phase 5),
  and a **fail-closed `select.ts`** keyed on an env var + an explicit `ALLOW_MOCK_*` opt-in (the esign
  fail-closed/real-default precedent, NOT NODE_ENV — see BUG-002-001 / ADR-023 §4).
- **No real provider.** This slice verifies the **mock** binding only. The transport choice (Supabase
  Realtime / SSE) has **no dedicated ADR yet** (planning-flagged gap, non-blocking) — **do not invent a
  transport ADR**. The stub is a deferred binding, exactly like `DocusealESignatureProvider`.
- **CS-GEN-001.** No notification payload PII, client identities, or linked-item keys in logs.

## Context

Capability 4 (real-time delivery) is consumed behind a **mockable provider seam** per ADR-023 — the slice
verifies the **mock** realization (real provider → Phase 5). This task stands up the seam package mirroring the
established `packages/esign` port + bindings + selector pattern, so the feed/badge consumers (-005/-006)
subscribe to a transport **port**, and the mock binding drives real-time arrival in e2e (TASK-016-007).

Satisfies (at the transport layer): AC-MSG-012-01/-02 (new notifications surface without manual refresh) — the
end-to-end proof rides the UI e2e tasks; this task delivers the seam they bind to.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/realtime/src/port.ts` | Created | `NotificationTransport` port: `publish(channel, event)` + `subscribe(channel, subscriber)`. Apps depend on this port only. |
| `packages/realtime/src/bindings/mock.ts` | Created | `MockNotificationTransport` — deterministic in-process mock; synchronous fan-out; deterministic and directly observable in e2e. |
| `packages/realtime/src/bindings/supabase-realtime.ts` | Created | `SupabaseRealtimeTransport` — real-provider stub that throws `RealtimeBindingNotAvailableError` at call-time (deferred — Phase 5). Mirrors `DocusealESignatureProvider`. DECISION: named `supabase-realtime` as advisory (likely candidate); enablement slice may rename. |
| `packages/realtime/src/select.ts` | Created | `getNotificationTransport()` — fail-closed selector keyed on `REALTIME_PROVIDER` + `ALLOW_MOCK_REALTIME` (mirrors esign `select.ts`). Mock reachable only with explicit opt-in. |
| `packages/realtime/src/index.ts` | Created | Barrel exports (port types + `getNotificationTransport` + `resetNotificationTransportForTesting`). Binding classes intentionally NOT exported. |
| `packages/realtime/package.json` | Created | Package scaffold mirroring `packages/esign`. |
| `packages/realtime/tsconfig.json` | Created | Package tsconfig mirroring `packages/esign`. |
| `packages/realtime/vitest.config.ts` | Created | Vitest config mirroring `packages/esign`. |
| `packages/realtime/eslint.config.mjs` | Created | ESLint config mirroring `packages/esign`. |
| `packages/realtime/src/realtime.test.ts` | Created | 26 tests: selector fail-closed/real-default/opt-in/contradiction/unknown-value + mock publish/subscribe round-trip + barrel leak check. |
| `docker-compose.yml` | Modified | Added `REALTIME_PROVIDER=mock` + `ALLOW_MOCK_REALTIME=true` to both `portal` and `admin` services (additive; default `mock` for e2e/local). |
| `.env.example` | Modified | Added `REALTIME_PROVIDER` + `ALLOW_MOCK_REALTIME` documentation block (additive). |
| `.implementation/operations/inventory.md` | Modified | Added `REALTIME_PROVIDER` + `ALLOW_MOCK_REALTIME` env var entries (additive inventory note per CLAUDE.md DevOps rule). |

## Tests to Write First

- [x] `selector: REALTIME_PROVIDER=mock without ALLOW_MOCK_REALTIME throws` — PASS (fail-closed throw)
- [x] `selector: default binds the real stub (not mock)` — PASS (real-default: SupabaseRealtimeTransport)
- [x] `selector: REALTIME_PROVIDER=mock + ALLOW_MOCK_REALTIME=true returns the mock` — PASS
- [x] `selector: contradiction (real + ALLOW_MOCK) throws` — PASS
- [x] `mock transport publish/subscribe round-trips an event` — PASS (subscriber observes published event)

## Implementation Notes

- **Copy the esign seam structurally** — it is the canonical ADR-023 reference in this repo
  (`packages/esign/src/{port,select,bindings/mock,bindings/docuseal}.ts`). Keep the selector's fail-closed,
  real-default posture and the `ALLOW_MOCK_*`-not-NODE_ENV trust key.
- **Wire the env into docker-compose** for e2e: the portal + admin services set `REALTIME_PROVIDER=mock` +
  `ALLOW_MOCK_REALTIME=true` (this is the only configuration that makes the mock reachable). Coordinate the
  compose change with the consumer tasks (-005/-006) — keep it minimal and additive. If a compose edit is
  needed, it rides this task (note the `.implementation/operations/` inventory/runbook update per CLAUDE.md
  DevOps rule **only if** service topology/env changes materially).
- **Shared pattern across both surfaces (CS-TS-003):** the same transport port is consumed by both `apps/portal`
  and `apps/admin` — do not fork the seam per app.
- Cite ADR-023/-006 + CS-GEN-001 in comments (CS-GEN-003). Do **not** author a transport ADR.

## Definition of Done

- [x] `packages/realtime` seam (port + mock + real stub + fail-closed selector) implemented, mirroring esign
- [x] Selector + mock unit tests pass (26/26 tests pass)
- [x] e2e compose env (`REALTIME_PROVIDER=mock` + `ALLOW_MOCK_REALTIME=true`) set for both app services
- [x] No real provider wired; the real binding is a call-time-throwing stub (`SupabaseRealtimeTransport`)
- [x] Lint + type-check + build pass

---

## Work Log

- 2026-06-24 [sdet] Marking done — 26/26 tests pass (213ms). Seam shape verified against packages/esign: port-only interface, mock binding, call-time-throwing stub, fail-closed selector keyed on ALLOW_MOCK_REALTIME not NODE_ENV. Selector test matrix complete: mock-without-opt-in throws, default binds real stub, mock+opt-in returns mock, contradiction throws, unknown-value throws. Barrel leak check confirmed binding classes not exported. Both portal and admin docker-compose services carry REALTIME_PROVIDER/ALLOW_MOCK_REALTIME. inventory.md has both env-var rows. CS-GEN-001 citations present throughout; DECISION: on advisory supabase-realtime naming present. Pre-existing admin type errors (NotificationItem fixture mismatch from TASK-016-001/-002) bound to TASK-016-006 — not introduced by this task. Lint and full-workspace lint/type-check clean within this package scope. | What's next: archive | Blockers: none
- 2026-06-24 [webapp-developer] Marking as review — packages/realtime seam implemented mirroring packages/esign exactly. 26/26 unit tests pass (selector fail-closed/real-default/opt-in/contradiction/unknown + mock pub/sub round-trip + barrel leak check). Build clean. Compose env wired for both portal + admin. Pre-existing apps/admin type errors (NotificationItem fixture mismatches from TASK-016-001/-002 schema changes) noted as not introduced by this task. | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] Starting implementation — task TASK-016-003-realtime-provider-seam | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved

**Notes**:

**Seam shape (ADR-023 / esign mirror):** Verified structurally against `packages/esign`. `port.ts` exports `NotificationTransport` interface only — no concrete class. `bindings/mock.ts` is the in-process deterministic mock (synchronous fan-out). `bindings/supabase-realtime.ts` is a call-time-throwing stub mirroring `DocusealESignatureProvider` — `RealtimeBindingNotAvailableError` on both `publish` and `subscribe`. `select.ts` fail-closed selector is structurally identical to the esign reference: same singleton pattern, same `ALLOW_MOCK_REALTIME`-not-NODE_ENV guard, same contradiction throw. `index.ts` barrel: port types + `getNotificationTransport` + `resetNotificationTransportForTesting` exported; `MockNotificationTransport`, `SupabaseRealtimeTransport`, `RealtimeBindingNotAvailableError`, and `createNotificationTransport` intentionally withheld. Barrel leak-check tests assert all four are absent — four separate `it()` cases, each would fail if the barrel leaked the class.

**Selector test matrix (all 5 required scenarios confirmed):**
- `mock` without `ALLOW_MOCK_REALTIME` → throws (2 variants: unset + `false`)
- `REALTIME_PROVIDER` unset, `ALLOW_MOCK_REALTIME` unset → `SupabaseRealtimeTransport` (real-default)
- `mock` + `ALLOW_MOCK_REALTIME=true` → `MockNotificationTransport`
- `supabase-realtime` + `ALLOW_MOCK_REALTIME=true` → throws (contradiction)
- unknown value → throws (2 variants: `unknown-binding`, `supabase` typo)

**Gate evidence re-run:** `pnpm --filter @tax-portal/realtime test` — 26 passed (26), 213ms. Not re-running the full suite; CI gate is the independent verification. Package-level `tsc -p tsconfig.json` exits cleanly. Full workspace lint passes clean. Full workspace `type-check` has pre-existing failures in `apps/admin/src/app/requests/_components/NotificationsIndicator.test.tsx` and `apps/admin/src/app/requests/notifications.test.ts` (`NotificationItem` missing `recipientType`/`recipientUserId`/`linkedItemType`/`linkedItemId` fields). These files were last modified by commits #55 (EPIC-008) and #42 (EPIC-003) — not by this task. The developer's Work Log acknowledges them explicitly; they are bound as a merge-blocker fix to TASK-016-006. Not attributable to this task.

**Infra changes:** `docker-compose.yml` portal service (line 155-156) and admin service (line 279-280) both carry `REALTIME_PROVIDER: "${REALTIME_PROVIDER:-mock}"` and `ALLOW_MOCK_REALTIME: "${ALLOW_MOCK_REALTIME:-true}"`. `inventory.md` has both rows at lines 126-127 (added TASK-016-003 attribution). `.env.example` carries the doc block. Runbook update not required — env-only addition, no service-topology change.

**CS compliance:**
- CS-GEN-001 (`recommended`): `mock.ts` explicitly does not log payload contents in `publish()`; `port.ts` carries the PII policy at both the interface and the channel-string levels. Citations `// CS-GEN-001` present in mock.ts and port.ts. Verified: no payload logging call sites exist.
- CS-TS-003 (`recommended`): one shared port consumed by both surfaces — not forked per app. Citations `// CS-TS-003` present in port.ts (line 14) and index.ts (line 21).
- CS-GEN-003 (`recommended`): ADR-023, ADR-006, CS-GEN-001 citations present throughout. `DECISION (TASK-016-003)` advisory-naming breadcrumb present in `supabase-realtime.ts` line 17 and `select.ts` lines 73-76.

**AC coverage:** AC-MSG-012-01 and AC-MSG-012-02 are tagged in the test file header and in two specific test bodies (`it("full round-trip: subscribe → publish → event observed (AC-MSG-012-01)"`, plus the round-trip test comment). These are transport-layer assertions — the end-to-end UI proof is deferred to TASK-016-007 per brief design. The seam itself is the deliverable here and it is correctly scoped.

**introduces_gate: no** — correct; the new package adds a test runner entry point but not a new quality gate in the ENGINE.md sense.

/**
 * packages/realtime/src/index.ts — Barrel export for @tax-portal/realtime
 *
 * Exports:
 *   - Transport port types (NotificationTransport, NotificationChannel, NotificationEvent,
 *     NotificationSubscriber, UnsubscribeFn)
 *   - Binding selector (getNotificationTransport)
 *   - Test reset (resetNotificationTransportForTesting)
 *
 * INTENTIONALLY NOT EXPORTED:
 *   - MockNotificationTransport — binding class must not be in the public barrel.
 *   - SupabaseRealtimeTransport — binding class must not be in the public barrel.
 *   - RealtimeBindingNotAvailableError — internal binding error; not part of the public API.
 *   - createNotificationTransport — internal factory; import from "./select.js" in tests only.
 *
 * Apps import from @tax-portal/realtime — never from a concrete binding file.
 * Consumer code must depend on the port, never on a binding class (ADR-023 §1).
 * The SDET checks this: the barrel must not leak binding classes.
 *
 * ADR-023: provider-seam & mock-first strategy. // ADR-023
 * ADR-006 / CS-TS-003: shared port for both apps/portal and apps/admin. // ADR-006
 */

// ─── Transport Port ───────────────────────────────────────────────────────────
export type {
  NotificationTransport,
  NotificationChannel,
  NotificationEvent,
  NotificationSubscriber,
  UnsubscribeFn,
} from "./port.js";

// ─── Binding Selector ─────────────────────────────────────────────────────────
export { getNotificationTransport } from "./select.js";

// ─── Test Reset ───────────────────────────────────────────────────────────────
// Exported for test use only. Do NOT use in production code.
// Tests must call this in afterEach to clear the singleton between tests.
// (Mirrors the esign package pattern — resetESignProviderForTesting.)
export { resetNotificationTransportForTesting } from "./select.js";

/**
 * packages/realtime/src/bindings/supabase-realtime.ts — Real-provider transport binding (deferred stub)
 *
 * ADR-023 §2 (mock-first sequencing): The real real-time binding — wired to the chosen
 * transport provider (Supabase Realtime / SSE / equivalent) — is a DEFERRED ENABLEMENT SLICE.
 * This file is the deferred stub that holds the binding's place in the selector so
 * REALTIME_PROVIDER=supabase-realtime (the real-default) completes selection without error.
 * The stub throws RealtimeBindingNotAvailableError at call-time.
 *
 * Selection completes; the stub is unreachable in production until the enablement slice
 * wires the real provider. When that slice lands, this file is REPLACED with the real
 * transport integration — no call-site change required (callers import only via the port
 * or getNotificationTransport()).
 *
 * NOTE: The transport choice (Supabase Realtime / SSE) has NO dedicated ADR yet — this is
 * a planning-flagged, non-blocking gap. Do NOT author a transport ADR here.
 * DECISION (TASK-016-003): the stub is named "supabase-realtime" as the most likely
 * real provider candidate, but the name is advisory — the enablement slice will confirm
 * the final choice and may rename this file. The selector key is "supabase-realtime".
 *
 * Mirrors packages/esign/src/bindings/docuseal.ts (DocusealESignatureProvider deferred stub).
 *
 * ADR-023: provider-seam & mock-first strategy.
 */

import type {
  NotificationTransport,
  NotificationChannel,
  NotificationEvent,
  NotificationSubscriber,
  UnsubscribeFn,
} from "../port.js";

// ─── SupabaseRealtimeTransport ────────────────────────────────────────────────

/**
 * SupabaseRealtimeTransport — deferred production binding.
 *
 * CURRENT STATUS: Stub. Throws RealtimeBindingNotAvailableError when any method is called.
 * Selection completes; only call-time throws.
 *
 * When the real real-time enablement slice lands, replace this stub with the real
 * transport integration (Supabase Realtime channels, or SSE, or equivalent).
 *
 * ADR-023 §5: running a mock real-time transport in production requires the same
 * fail-closed treatment as other deferred integrations. The real binding is a
 * release-gating item for any real-time capability exercised in production.
 */
export class SupabaseRealtimeTransport implements NotificationTransport {
  async publish(_channel: NotificationChannel, _event: NotificationEvent): Promise<void> {
    // DECISION (TASK-016-003): stub throws at call-time. The real implementation
    // will publish the event to the configured real-time provider channel.
    throw new RealtimeBindingNotAvailableError();
  }

  subscribe(_channel: NotificationChannel, _subscriber: NotificationSubscriber): UnsubscribeFn {
    // DECISION (TASK-016-003): stub throws at call-time. The real implementation
    // will establish a subscription on the provider channel and return a real cleanup fn.
    throw new RealtimeBindingNotAvailableError();
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when the real-provider binding is called before the enablement slice lands.
 *
 * Mirrors EsignBindingNotAvailableError in packages/esign.
 *
 * If you see this error in tests or local dev, set REALTIME_PROVIDER=mock and
 * ALLOW_MOCK_REALTIME=true (e.g. in docker-compose.yml for the portal/admin service).
 *
 * In production, the real real-time binding must be wired before any real-time
 * capability is exercised (ADR-023 §2 / §5 — release-gating item).
 */
export class RealtimeBindingNotAvailableError extends Error {
  constructor() {
    super(
      `[SupabaseRealtimeTransport] Real-time provider binding is not fully wired yet. ` +
        `Set REALTIME_PROVIDER=mock and ALLOW_MOCK_REALTIME=true for local dev and e2e. ` +
        `The real-provider binding is the deferred production target — do not call it before ` +
        `the real real-time enablement slice lands. ` +
        `See ADR-023 §2 for the mock-first sequencing rationale.`,
    );
    this.name = "RealtimeBindingNotAvailableError";
  }
}

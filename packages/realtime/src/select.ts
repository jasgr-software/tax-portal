/**
 * packages/realtime/src/select.ts — Env-driven real-time notification transport selector
 *
 * Selects exactly ONE active NotificationTransport binding based on the REALTIME_PROVIDER
 * environment variable. Exactly one binding is active per process.
 *
 * REALTIME_PROVIDER values:
 *   "supabase-realtime" (default) — SupabaseRealtimeTransport: real (deferred stub for now)
 *   "mock"                        — MockNotificationTransport: e2e + local dev
 *                                   (requires ALLOW_MOCK_REALTIME=true)
 *
 * Apps consume `getNotificationTransport()` and depend on the NotificationTransport port —
 * never on a concrete binding class.
 *
 * Security — FAIL-CLOSED, REAL-DEFAULT (ADR-023 §4):
 *
 *   This selector mirrors the esign seam (packages/esign/src/select.ts), which is the
 *   canonical ADR-023 reference in this repo. It sets the same fail-closed, real-default
 *   posture established by DECISION-E.
 *
 *   DEFAULT PROVIDER = supabase-realtime (real), NOT mock.
 *
 *   The mock binding is selectable ONLY with an explicit non-production opt-in:
 *   ALLOW_MOCK_REALTIME=true. Without the flag the selector binds the real (deferred-stub)
 *   binding or throws. It NEVER silently falls back to the mock.
 *
 *   REALTIME_PROVIDER=mock + ALLOW_MOCK_REALTIME unset/false → THROW (fail-closed)
 *   REALTIME_PROVIDER=supabase-realtime + ALLOW_MOCK_REALTIME=true → THROW (contradiction)
 *   REALTIME_PROVIDER=supabase-realtime, ALLOW_MOCK_REALTIME unset → SupabaseRealtimeTransport (stub)
 *   REALTIME_PROVIDER=mock, ALLOW_MOCK_REALTIME=true → MockNotificationTransport
 *   REALTIME_PROVIDER unset, ALLOW_MOCK_REALTIME unset → SupabaseRealtimeTransport (stub)
 *   REALTIME_PROVIDER=<unknown> → THROW
 *
 *   The guard keys on ALLOW_MOCK_REALTIME, NOT NODE_ENV — keying on NODE_ENV was the
 *   BUG-002-001 failure mode (NODE_ENV=production is always true for any built image,
 *   including the sanctioned e2e/local prod-built container). A real deployment sets
 *   REALTIME_PROVIDER=supabase-realtime and leaves ALLOW_MOCK_REALTIME unset → fail closed.
 *   An e2e/local prod-built container sets REALTIME_PROVIDER=mock + ALLOW_MOCK_REALTIME=true.
 *
 * Singleton: the transport instance is created once and cached for the process
 * lifetime (Next.js long-lived Node.js process, ADR-007).
 *
 * ADR-023: provider-seam & mock-first strategy. // ADR-023
 * ADR-006 / CS-TS-003: shared across apps/portal and apps/admin — one package, one port. // ADR-006
 */

import type { NotificationTransport } from "./port.js";
import { MockNotificationTransport } from "./bindings/mock.js";
import { SupabaseRealtimeTransport } from "./bindings/supabase-realtime.js";
import { SseBrowserMockTransport } from "./bindings/sse-browser.js";

// ─── Singleton ────────────────────────────────────────────────────────────────

let _transport: NotificationTransport | null = null;

/**
 * Returns the active NotificationTransport singleton for this process.
 * Reads REALTIME_PROVIDER once and caches the result.
 *
 * @returns The active NotificationTransport (real stub or mock).
 */
export function getNotificationTransport(): NotificationTransport {
  if (_transport) return _transport;
  _transport = createNotificationTransport();
  return _transport;
}

/**
 * Create a new NotificationTransport instance based on the current REALTIME_PROVIDER env.
 * Called once per process (singleton above). Exported for testing (reset via
 * resetNotificationTransportForTesting).
 *
 * DECISION-016-005b-RT (TASK-016-005b / ADR-023):
 * The browser is a separate process from the Next.js server. Server-side env vars
 * (REALTIME_PROVIDER, ALLOW_MOCK_REALTIME) are NOT inlined into the browser bundle.
 * In the browser context, these vars read as undefined. To make the selector work in
 * the browser, we read NEXT_PUBLIC_ variants as a FALLBACK when the server-side var
 * is absent (i.e. in the browser). The server-side path continues reading the non-
 * prefixed vars without change — the fallback only activates when the primary var
 * is undefined (browser context). // DECISION-016-005b-RT // ADR-023
 *
 * Both variants must be set in docker-compose.yml for the portal and admin services
 * so Next.js inlines NEXT_PUBLIC_* into the browser bundle at build time.
 * The contradiction and unknown-value guards are unchanged.
 */
export function createNotificationTransport(): NotificationTransport {
  // DECISION (TASK-016-003 / ADR-023 §4):
  // Default provider = supabase-realtime (real), NOT mock.
  // Mirrors the esign seam DECISION-E — fail-closed, real-default.
  // The guard keys on ALLOW_MOCK_REALTIME, NOT NODE_ENV (BUG-002-001 fix).
  //
  // DECISION-016-005b-RT: Read NEXT_PUBLIC_ variant as fallback when the server-side
  // var is absent (browser context — server vars are not inlined into the browser bundle).
  // The server path reads the non-prefixed vars exclusively; the browser reads NEXT_PUBLIC_.
  // Both variants must be set in docker-compose.yml for Next.js to inline them. // ADR-023
  const rawProvider =
    process.env["REALTIME_PROVIDER"] ??
    process.env["NEXT_PUBLIC_REALTIME_PROVIDER"]; // DECISION-016-005b-RT: browser fallback
  const provider = (rawProvider ?? "supabase-realtime").toLowerCase();

  // Guard: ALLOW_MOCK_REALTIME (not NODE_ENV) is the trust-boundary key.
  // See BUG-002-001 / ADR-023 §4: NODE_ENV cannot distinguish e2e from real production.
  // DECISION-016-005b-RT: same NEXT_PUBLIC_ fallback pattern for the allowMock flag. // ADR-023
  const rawAllowMock =
    process.env["ALLOW_MOCK_REALTIME"] ??
    process.env["NEXT_PUBLIC_ALLOW_MOCK_REALTIME"]; // DECISION-016-005b-RT: browser fallback
  const allowMock = (rawAllowMock ?? "").toLowerCase() === "true";

  // Fail-closed: the mock binding must NEVER be active without an explicit non-prod opt-in.
  // REALTIME_PROVIDER=mock + ALLOW_MOCK_REALTIME unset/false → THROW.
  // A real deployment sets REALTIME_PROVIDER=supabase-realtime and leaves ALLOW_MOCK_REALTIME unset.
  // An e2e/local container sets ALLOW_MOCK_REALTIME=true (docker-compose.yml portal/admin service).
  // ADR-023 §4 // ADR-023
  if (provider === "mock" && !allowMock) {
    throw new Error(
      "[packages/realtime] mock real-time transport is forbidden unless ALLOW_MOCK_REALTIME=true. " +
        "Set REALTIME_PROVIDER=supabase-realtime for a real deployment, or " +
        "REALTIME_PROVIDER=mock + ALLOW_MOCK_REALTIME=true for e2e/local dev. " +
        "The mock binding is unreachable in a production configuration (ADR-023 §4).",
    );
  }

  // Contradiction guard: REALTIME_PROVIDER=supabase-realtime + ALLOW_MOCK_REALTIME=true is an
  // insecure-design contradiction — mirrors the esign contradiction guard (DECISION-E).
  // A real deployment must never also permit the mock binding.
  // If you need local dev with REALTIME_PROVIDER=supabase-realtime, leave ALLOW_MOCK_REALTIME unset.
  if (provider === "supabase-realtime" && allowMock) {
    throw new Error(
      "[packages/realtime] REALTIME_PROVIDER=supabase-realtime and ALLOW_MOCK_REALTIME=true cannot be set together. " +
        "A real real-time deployment must leave ALLOW_MOCK_REALTIME unset. " +
        "ALLOW_MOCK_REALTIME=true is only valid with REALTIME_PROVIDER=mock (local dev / e2e).",
    );
  }

  switch (provider) {
    case "mock": {
      // Only reachable when ALLOW_MOCK_REALTIME=true (guard above). // ADR-023
      //
      // DECISION-016-005b-RT (TASK-016-005b): Browser context vs. server context.
      //
      // The in-process MockNotificationTransport is a per-process singleton — its
      // subscriber map is reachable only in the server process. The browser is a
      // separate process; it cannot receive publish() fan-out from the server's mock.
      //
      // Solution: the server hand is the in-process MockNotificationTransport (publish
      // side). The browser hand is SseBrowserMockTransport: it opens an EventSource to
      // the SSE bridge route, which subscribes to the server's mock and streams events.
      //
      // Detection: in the browser, REALTIME_PROVIDER (non-prefixed) is UNDEFINED — the
      // fallback read of NEXT_PUBLIC_REALTIME_PROVIDER is what resolves the provider to
      // "mock". On the server, REALTIME_PROVIDER is set directly. We detect the browser
      // context by checking whether the non-prefixed server var was originally undefined
      // (i.e., we are in the browser and fell back to NEXT_PUBLIC_). This is the minimal
      // discriminant — no `typeof window` (SSR boundary issue), no `globalThis.document`.
      //
      // The server always has REALTIME_PROVIDER set (from compose). The browser always
      // reads it as undefined and uses NEXT_PUBLIC_REALTIME_PROVIDER instead.
      //
      // CS-GEN-002: in-process MockNotificationTransport is NOT rewritten. // CS-GEN-002
      // CS-TS-003: shared binding shape for TASK-016-006 (admin) to consume. // CS-TS-003
      // ADR-023 §1/§4/§6 // DECISION-016-005b-RT
      const isBrowserContext = process.env["REALTIME_PROVIDER"] === undefined;
      if (isBrowserContext) {
        // Browser: use the SSE-backed variant that opens an EventSource to the bridge route.
        // The server's in-process mock fans out to the stream via the SSE route handler.
        return new SseBrowserMockTransport();
      }
      // Server: use the in-process mock (subscriber map reachable by server-side publish()).
      return new MockNotificationTransport();
    }
    case "supabase-realtime":
      // Selection completes; stub throws RealtimeBindingNotAvailableError at call-time.
      // When the real enablement slice lands, replace SupabaseRealtimeTransport with the
      // real provider integration — no change needed here.
      return new SupabaseRealtimeTransport();
    default:
      // Unknown binding: throw instead of silently falling back to mock.
      // A typo'd REALTIME_PROVIDER value must be caught at startup, not at runtime.
      throw new Error(
        `[packages/realtime] Unknown REALTIME_PROVIDER="${rawProvider}". ` +
          `Valid values: "supabase-realtime" (default/production), "mock" (local/e2e only — requires ALLOW_MOCK_REALTIME=true). ` +
          `Fix the REALTIME_PROVIDER env var and restart the process.`,
      );
  }
}

/**
 * Reset the cached transport (for testing only).
 * Call this in test teardown when you need to re-read REALTIME_PROVIDER.
 *
 * @internal — test use only. Do not call in production code.
 */
export function resetNotificationTransportForTesting(): void {
  _transport = null;
}

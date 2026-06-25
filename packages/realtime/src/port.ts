/**
 * packages/realtime/src/port.ts — NotificationTransport port interface
 *
 * Defines the contract all real-time notification bindings (mock + real-provider stub)
 * must satisfy. Apps import from this port — never from a concrete binding.
 *
 * ADR-023: Every external integration lives behind a port + bindings + fail-closed selector.
 *   The real-time transport choice (Supabase Realtime / SSE) has no dedicated ADR yet —
 *   this is a planning-flagged, non-blocking gap. The real binding is a call-time-throwing
 *   stub, exactly like DocusealESignatureProvider.
 *
 * ADR-006: This port is shared across both `apps/portal` (Client Portal) and
 *   `apps/admin` (Tax Portal) — the same transport port is consumed by both frontends.
 *   Do NOT fork the seam per app. // CS-TS-003
 *
 * REQ-MSG-012 / AC-MSG-012-01, AC-MSG-012-02:
 *   New notifications must surface without manual refresh. This transport port is the
 *   mechanism that delivers events from server to subscribed clients without a page reload.
 *   The end-to-end proof rides the UI consumer tasks (TASK-016-005/-006/-007).
 *
 * CS-GEN-001: No notification-payload PII, client identities, or linked-item keys
 *   in transport logs. The channel and event type are safe to log; the event payload
 *   must be treated as opaque at this layer — do not log payload contents.
 */

// ─── Channel ──────────────────────────────────────────────────────────────────

/**
 * A transport channel identifier — the logical subscription scope.
 *
 * Channels are opaque strings at the transport layer; the naming convention
 * (e.g. "user:<userId>", "engagement:<id>") is a consumer-level concern.
 *
 * CS-GEN-001: do not log the full channel string if it encodes a user identity
 * or engagement key. Truncate or omit from transport-level logs.
 */
export type NotificationChannel = string;

// ─── Event Shape ──────────────────────────────────────────────────────────────

/**
 * A notification event published to a channel.
 *
 * type:    Event discriminator (e.g. "notification.created", "badge.update").
 *          Safe to log — it carries no PII.
 * payload: Arbitrary JSON-serializable data the consumer interprets.
 *          MUST NOT contain PII, client identities, or linked-item keys
 *          that would violate CS-GEN-001 if logged at the transport layer.
 *          The transport layer passes payload through without inspection.
 *
 * ADR-023 §6: The mock binding is behavior-faithful — it delivers the same shape
 * the real provider would. It proves wiring, not security or durability.
 */
export interface NotificationEvent {
  type: string;
  payload: Record<string, unknown>;
}

// ─── Subscribe Callback ───────────────────────────────────────────────────────

/**
 * A subscriber callback invoked whenever a new event arrives on the channel.
 *
 * Called synchronously by the mock (in-process), and asynchronously by the
 * real provider when its event arrives. Consumers must not assume ordering
 * guarantees beyond what the provider delivers.
 */
export type NotificationSubscriber = (event: NotificationEvent) => void;

/**
 * A function returned by subscribe() that unsubscribes the listener when called.
 */
export type UnsubscribeFn = () => void;

// ─── Transport Port Interface ─────────────────────────────────────────────────

/**
 * NotificationTransport — the single interface all real-time notification bindings must implement.
 *
 * publish:   Server-side. Called by the emit path (e.g. a Server Action after writing a
 *            notification row) to push an event to all subscribers on the channel.
 * subscribe: Client-side or server-side. Returns an UnsubscribeFn; caller must invoke it
 *            on cleanup to prevent listener leaks.
 *
 * Both bindings (MockNotificationTransport and the real-provider stub) must satisfy
 * this interface. `src/select.ts` picks the active binding by REALTIME_PROVIDER.
 *
 * ADR-023 §1: the seam shape — no DI container, just a port + bindings + selector.
 * ADR-006 / CS-TS-003: consumed identically by both apps/portal and apps/admin.
 */
export interface NotificationTransport {
  /**
   * Publish a notification event to all subscribers on the given channel.
   *
   * Called from server-side emit paths. The transport delivers the event to
   * every active subscriber for the channel.
   *
   * CS-GEN-001: implementations must not log the event payload (it may carry
   * user-context data). Logging the channel type-prefix and event.type is safe.
   *
   * @param channel  The logical channel (e.g. "user:<userId>").
   * @param event    The notification event to deliver.
   */
  publish(channel: NotificationChannel, event: NotificationEvent): Promise<void>;

  /**
   * Subscribe to notification events on the given channel.
   *
   * Returns an UnsubscribeFn — the caller MUST invoke it on cleanup (component
   * unmount, request teardown) to prevent listener accumulation.
   *
   * The subscriber is invoked for each event published to the channel after
   * the subscription is registered.
   *
   * @param channel     The logical channel to listen on.
   * @param subscriber  Callback invoked on each incoming event.
   * @returns           A cleanup function that removes this subscriber.
   */
  subscribe(channel: NotificationChannel, subscriber: NotificationSubscriber): UnsubscribeFn;
}

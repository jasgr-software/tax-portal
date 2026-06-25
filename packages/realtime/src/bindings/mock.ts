/**
 * packages/realtime/src/bindings/mock.ts — Mock/test-double real-time transport binding
 *
 * The e2e/local-dev default. Selected when REALTIME_PROVIDER=mock AND ALLOW_MOCK_REALTIME=true.
 *
 * ADR-023 §6 (behavior-faithful, NOT security-faithful):
 *   This mock is deterministic and faithful to the port's behavior contract —
 *   same shapes, same synchronous publish→subscriber delivery the real provider
 *   yields at the seam. It proves wiring, NOT that a durable real-time channel
 *   was established.
 *   A green mock-bound suite MUST NOT be read as evidence the real integration is safe.
 *   The real-provider binding (a deferred enablement slice) is the release-gating
 *   provider that proves the actual real-time delivery (Supabase Realtime / SSE).
 *
 * ADR-023 §2: The notification feed UI ships against this mock; AC-MSG-012-01/-02
 *   are verified against it. The real-provider wiring is a separately-tracked slice.
 *
 * ADR-006 / CS-TS-003: consumed identically by both apps/portal and apps/admin.
 *
 * CS-GEN-001: publish() does NOT log the event payload — only the channel prefix
 *   and event type (both safe to log, no PII). // CS-GEN-001
 *
 * Behavior:
 *   publish    — synchronously invokes all subscribers registered on the channel.
 *   subscribe  — registers a subscriber and returns an unsubscribe function.
 *   No external calls; no side effects outside the in-process subscriber map.
 */

import type {
  NotificationTransport,
  NotificationChannel,
  NotificationEvent,
  NotificationSubscriber,
  UnsubscribeFn,
} from "../port.js";

// ─── MockNotificationTransport ────────────────────────────────────────────────

/**
 * MockNotificationTransport — the e2e/local-dev real-time notification binding.
 *
 * In-process subscriber map: publish() synchronously fans out to all subscribers
 * for the channel. This makes it deterministic and directly observable in e2e tests
 * without a real provider or async coordination.
 *
 * IMPORTANT: This binding proves wiring (the seam is connected). It does NOT
 * prove that a real durable real-time channel was established (ADR-023 §6).
 * Comments in this file must not claim otherwise.
 *
 * Multiple MockNotificationTransport instances are independent; they do not share
 * subscriber state. Use a singleton (via select.ts) or share the instance explicitly
 * in tests that need publish/subscribe to cross a call boundary.
 */
export class MockNotificationTransport implements NotificationTransport {
  /**
   * Subscriber registry: channel → Set of registered subscriber callbacks.
   * Private to this instance; subscribers do not bleed between instances.
   */
  private readonly _subscribers = new Map<
    NotificationChannel,
    Set<NotificationSubscriber>
  >();

  /**
   * Publish a notification event to all subscribers on the given channel.
   *
   * Delivery is synchronous and in-process — every subscriber registered on
   * the channel is called before publish() returns. This guarantees
   * observability in e2e tests without requiring async polling.
   *
   * CS-GEN-001: logs only the channel type-prefix and event type — never the
   * payload (which may carry user-context data). // CS-GEN-001
   *
   * ADR-023 §6: delivery is behavior-faithful (same shapes, same fan-out) but
   * does not prove real-provider durability or ordering guarantees.
   */
  async publish(channel: NotificationChannel, event: NotificationEvent): Promise<void> {
    // CS-GEN-001: do NOT log payload contents. Channel and type are safe.
    // (No logger wired at this layer — comment retained as the policy anchor.)
    const subscribers = this._subscribers.get(channel);
    if (!subscribers || subscribers.size === 0) {
      // No subscribers — event is delivered to nobody. This is valid behavior;
      // the real provider would also no-op when a channel has no listeners.
      return;
    }

    // Fan out synchronously to all registered subscribers.
    // DECISION (TASK-016-003): synchronous delivery is intentional for the mock —
    // it makes publish → subscribe arrival deterministic and directly testable.
    // The real-provider binding will use its own delivery mechanism (Supabase
    // Realtime push / SSE); the seam shape does not dictate delivery timing.
    for (const subscriber of subscribers) {
      subscriber(event);
    }
  }

  /**
   * Subscribe to notification events on the given channel.
   *
   * Returns an UnsubscribeFn — the caller MUST invoke it on cleanup to prevent
   * listener accumulation (component unmount, request teardown, test afterEach).
   *
   * The subscriber is invoked synchronously by publish() for each event published
   * to the channel after this subscription is registered.
   *
   * @param channel     The logical channel to listen on.
   * @param subscriber  Callback invoked on each incoming event.
   * @returns           A cleanup function that removes this subscriber.
   */
  subscribe(channel: NotificationChannel, subscriber: NotificationSubscriber): UnsubscribeFn {
    let channelSubscribers = this._subscribers.get(channel);
    if (!channelSubscribers) {
      channelSubscribers = new Set();
      this._subscribers.set(channel, channelSubscribers);
    }
    channelSubscribers.add(subscriber);

    // Return the unsubscribe cleanup function.
    return () => {
      const subs = this._subscribers.get(channel);
      if (subs) {
        subs.delete(subscriber);
        // Remove the channel entry entirely when the last subscriber is removed,
        // to avoid unbounded map growth in long-running test suites.
        if (subs.size === 0) {
          this._subscribers.delete(channel);
        }
      }
    };
  }

  /**
   * Returns the number of subscribers currently registered on the given channel.
   *
   * Exposed for test assertions — not part of the NotificationTransport port.
   * Do not call this from production code (it is not on the port interface).
   *
   * @internal — test use only.
   */
  subscriberCount(channel: NotificationChannel): number {
    return this._subscribers.get(channel)?.size ?? 0;
  }
}

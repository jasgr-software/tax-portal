/**
 * packages/realtime/src/realtime.test.ts — Unit tests for the real-time transport seam
 *
 * Covers (Tests-to-Write from TASK-016-003):
 *   1. mock transport publish/subscribe round-trips an event (subscriber observes published event)
 *   2. selector binds mock when REALTIME_PROVIDER=mock AND ALLOW_MOCK_REALTIME=true
 *   3. selector THROWS when REALTIME_PROVIDER=mock and ALLOW_MOCK_REALTIME unset (fail-closed)
 *   4. selector THROWS on REALTIME_PROVIDER=supabase-realtime + ALLOW_MOCK_REALTIME=true (contradiction)
 *   5. selector binds the real stub (SupabaseRealtimeTransport) by default — real-default
 *   6. unknown REALTIME_PROVIDER throws at selection
 *   7. index.ts barrel does NOT export binding classes
 *   8. TASK-016-005b (BUG-016-001 fix): browser-variant selection + no-throw subscribe
 *      - In browser context (REALTIME_PROVIDER absent, NEXT_PUBLIC_ set), selector returns
 *        SseBrowserMockTransport (not MockNotificationTransport, not SupabaseRealtimeTransport).
 *      - SseBrowserMockTransport.subscribe() does NOT throw (it opens an EventSource).
 *      - Fail-closed preserved: real/default config still binds SupabaseRealtimeTransport.
 *
 * AC-MSG-012-01, AC-MSG-012-02, AC-MSG-012-03: new notifications surface without manual refresh.
 *   The transport layer delivers the event; the end-to-end UI proof rides TASK-016-005b/-007.
 *   These tests verify the seam (publish→subscribe) functions correctly so consumers
 *   can depend on it.
 *
 * DECISION-016-005b-RT (TASK-016-005b): The browser-variant selection is tested by unsetting
 *   REALTIME_PROVIDER (simulating browser context — the non-NEXT_PUBLIC_ var is absent in
 *   the browser) and setting only NEXT_PUBLIC_REALTIME_PROVIDER + NEXT_PUBLIC_ALLOW_MOCK_REALTIME.
 *   The selector then branches to SseBrowserMockTransport. // DECISION-016-005b-RT // ADR-023
 *
 * ADR-023 §4: fail-closed selector (test 3 is the load-bearing fail-closed test). // ADR-023
 * CS-GEN-003: governing keys cited in comments throughout. // CS-GEN-003
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  createNotificationTransport,
  resetNotificationTransportForTesting,
  getNotificationTransport,
} from "./select.js";
import { MockNotificationTransport } from "./bindings/mock.js";
import { SupabaseRealtimeTransport } from "./bindings/supabase-realtime.js";
import { SseBrowserMockTransport } from "./bindings/sse-browser.js";

// ─── Helper: clean env before/after each test ─────────────────────────────────

afterEach(() => {
  // Clean up all transport selector env vars (server-side + NEXT_PUBLIC_ browser fallbacks).
  // DECISION-016-005b-RT: NEXT_PUBLIC_ vars must also be cleaned up to prevent test pollution. // ADR-023
  delete process.env["REALTIME_PROVIDER"];
  delete process.env["ALLOW_MOCK_REALTIME"];
  delete process.env["NEXT_PUBLIC_REALTIME_PROVIDER"];
  delete process.env["NEXT_PUBLIC_ALLOW_MOCK_REALTIME"];
  resetNotificationTransportForTesting();
});

// ─── Test 1: Mock transport publish/subscribe round-trip ──────────────────────

describe("MockNotificationTransport — publish/subscribe round-trip", () => {
  it("subscriber observes the published event on the same channel", async () => {
    // AC-MSG-012-01: new notifications surface without manual refresh.
    // The mock delivers events synchronously in-process, proving the seam works.
    const transport = new MockNotificationTransport();
    const received: Array<{ type: string; payload: Record<string, unknown> }> = [];

    transport.subscribe("user:test-user-001", (event) => {
      received.push(event);
    });

    await transport.publish("user:test-user-001", {
      type: "notification.created",
      payload: { notificationId: "n1" },
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("notification.created");
    expect(received[0]?.payload).toEqual({ notificationId: "n1" });
  });

  it("multiple subscribers on the same channel each receive the event", async () => {
    const transport = new MockNotificationTransport();
    const received1: string[] = [];
    const received2: string[] = [];

    transport.subscribe("user:fan-out", (event) => received1.push(event.type));
    transport.subscribe("user:fan-out", (event) => received2.push(event.type));

    await transport.publish("user:fan-out", {
      type: "badge.update",
      payload: { count: 3 },
    });

    expect(received1).toEqual(["badge.update"]);
    expect(received2).toEqual(["badge.update"]);
  });

  it("unsubscribe stops the subscriber from receiving further events", async () => {
    const transport = new MockNotificationTransport();
    const received: string[] = [];

    const unsubscribe = transport.subscribe("user:unsub-test", (event) => {
      received.push(event.type);
    });

    await transport.publish("user:unsub-test", { type: "notification.created", payload: {} });
    expect(received).toHaveLength(1);

    unsubscribe();

    await transport.publish("user:unsub-test", { type: "notification.created", payload: {} });
    // Subscriber was removed; still only 1 received.
    expect(received).toHaveLength(1);
  });

  it("publish to a channel with no subscribers does not throw", async () => {
    const transport = new MockNotificationTransport();

    // No subscribers registered — publish must be a no-op, not a throw.
    await expect(
      transport.publish("user:nobody", { type: "notification.created", payload: {} }),
    ).resolves.toBeUndefined();
  });

  it("events on different channels are isolated — subscribers do not cross-receive", async () => {
    const transport = new MockNotificationTransport();
    const receivedA: string[] = [];
    const receivedB: string[] = [];

    transport.subscribe("user:alice", (event) => receivedA.push(event.type));
    transport.subscribe("user:bob", (event) => receivedB.push(event.type));

    await transport.publish("user:alice", { type: "notification.created", payload: {} });

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(0); // Bob's channel not touched
  });

  it("subscriberCount reflects active subscriber count (test helper method)", () => {
    const transport = new MockNotificationTransport();

    expect(transport.subscriberCount("user:count-test")).toBe(0);

    const unsub1 = transport.subscribe("user:count-test", () => undefined);
    expect(transport.subscriberCount("user:count-test")).toBe(1);

    const unsub2 = transport.subscribe("user:count-test", () => undefined);
    expect(transport.subscriberCount("user:count-test")).toBe(2);

    unsub1();
    expect(transport.subscriberCount("user:count-test")).toBe(1);

    unsub2();
    expect(transport.subscriberCount("user:count-test")).toBe(0);
  });

  it("mock satisfies the NotificationTransport port interface (has all required methods)", () => {
    const transport = new MockNotificationTransport();
    expect(typeof transport.publish).toBe("function");
    expect(typeof transport.subscribe).toBe("function");
  });

  it("full round-trip: subscribe → publish → event observed (AC-MSG-012-01)", async () => {
    // AC-MSG-012-01: new notifications surface without manual refresh — transport layer.
    const transport = new MockNotificationTransport();
    let observedEvent: { type: string; payload: Record<string, unknown> } | null = null;

    transport.subscribe("engagement:eng-rt-01", (event) => {
      observedEvent = event;
    });

    await transport.publish("engagement:eng-rt-01", {
      type: "notification.created",
      payload: { notificationId: "notif-42" },
    });

    expect(observedEvent).not.toBeNull();
    expect(observedEvent?.type).toBe("notification.created");
  });
});

// ─── Test 2: selector binds mock with opt-in ─────────────────────────────────

describe("selector — mock opt-in (ADR-023 §4)", () => {
  it("binds MockNotificationTransport when REALTIME_PROVIDER=mock AND ALLOW_MOCK_REALTIME=true", () => {
    process.env["REALTIME_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_REALTIME"] = "true";

    const transport = createNotificationTransport();
    expect(transport).toBeInstanceOf(MockNotificationTransport);
  });

  it("singleton returns same instance on repeated getNotificationTransport() calls", () => {
    process.env["REALTIME_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_REALTIME"] = "true";

    const a = getNotificationTransport();
    const b = getNotificationTransport();
    expect(a).toBe(b);
  });

  it("returns a new instance after resetNotificationTransportForTesting()", () => {
    process.env["REALTIME_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_REALTIME"] = "true";

    const a = getNotificationTransport();
    resetNotificationTransportForTesting();
    const b = getNotificationTransport();

    expect(a).toBeInstanceOf(MockNotificationTransport);
    expect(b).toBeInstanceOf(MockNotificationTransport);
    expect(a).not.toBe(b);
  });
});

// ─── Test 3: fail-closed — mock without opt-in throws ────────────────────────

describe("selector — fail-closed (ADR-023 §4)", () => {
  it("THROWS when REALTIME_PROVIDER=mock and ALLOW_MOCK_REALTIME is unset (fail-closed)", () => {
    // This is the load-bearing fail-closed test — the selector must prevent the mock
    // from being active in a production configuration (ADR-023 §4). // ADR-023
    // ALLOW_MOCK_REALTIME is deliberately unset (afterEach cleanup ensures this).
    process.env["REALTIME_PROVIDER"] = "mock";

    expect(() => createNotificationTransport()).toThrow(
      /mock real-time transport is forbidden unless ALLOW_MOCK_REALTIME=true/,
    );
  });

  it("THROWS when REALTIME_PROVIDER=mock and ALLOW_MOCK_REALTIME=false (fail-closed)", () => {
    process.env["REALTIME_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_REALTIME"] = "false";

    expect(() => createNotificationTransport()).toThrow(
      /mock real-time transport is forbidden unless ALLOW_MOCK_REALTIME=true/,
    );
  });

  it("does NOT throw when REALTIME_PROVIDER unset and ALLOW_MOCK_REALTIME unset (default=real)", () => {
    // REALTIME_PROVIDER unset → defaults to "supabase-realtime"; ALLOW_MOCK_REALTIME unset → no contradiction.
    // Should NOT throw — selection completes with the real stub.
    delete process.env["REALTIME_PROVIDER"];
    delete process.env["ALLOW_MOCK_REALTIME"];

    expect(() => createNotificationTransport()).not.toThrow();
    const transport = createNotificationTransport();
    expect(transport).toBeInstanceOf(SupabaseRealtimeTransport);
  });
});

// ─── Test 4: contradiction guard ─────────────────────────────────────────────

describe("selector — contradiction guard (REALTIME_PROVIDER=real + ALLOW_MOCK_REALTIME=true)", () => {
  it("THROWS when REALTIME_PROVIDER=supabase-realtime and ALLOW_MOCK_REALTIME=true (contradiction)", () => {
    // Mirrors the esign contradiction guard (DECISION-E / BUG-002-001):
    // real + ALLOW_MOCK=true is a design contradiction — the real provider must not
    // also permit the mock opt-in. // ADR-023
    process.env["REALTIME_PROVIDER"] = "supabase-realtime";
    process.env["ALLOW_MOCK_REALTIME"] = "true";

    expect(() => createNotificationTransport()).toThrow(
      /REALTIME_PROVIDER=supabase-realtime and ALLOW_MOCK_REALTIME=true cannot be set together/,
    );
  });
});

// ─── Test 5: real default — real provider stub ────────────────────────────────

describe("selector — real-default (ADR-023 §4)", () => {
  it("binds SupabaseRealtimeTransport when REALTIME_PROVIDER=supabase-realtime, ALLOW_MOCK_REALTIME unset", () => {
    process.env["REALTIME_PROVIDER"] = "supabase-realtime";
    // ALLOW_MOCK_REALTIME is deliberately unset

    const transport = createNotificationTransport();
    expect(transport).toBeInstanceOf(SupabaseRealtimeTransport);
  });

  it("selection completes for supabase-realtime; stub throws RealtimeBindingNotAvailableError at call-time", async () => {
    process.env["REALTIME_PROVIDER"] = "supabase-realtime";

    // Selection must not throw
    const transport = createNotificationTransport();
    expect(transport).toBeInstanceOf(SupabaseRealtimeTransport);

    // But calling publish throws RealtimeBindingNotAvailableError
    await expect(
      transport.publish("user:test", { type: "notification.created", payload: {} }),
    ).rejects.toThrow(/Real-time provider binding is not fully wired yet/);

    // And calling subscribe throws RealtimeBindingNotAvailableError
    expect(() =>
      transport.subscribe("user:test", () => undefined),
    ).toThrow(/Real-time provider binding is not fully wired yet/);
  });

  it("binds SupabaseRealtimeTransport by default when REALTIME_PROVIDER is unset (real-default)", () => {
    // Default: REALTIME_PROVIDER unset → supabase-realtime. This is the real-default per ADR-023 §4.
    delete process.env["REALTIME_PROVIDER"];

    const transport = createNotificationTransport();
    expect(transport).toBeInstanceOf(SupabaseRealtimeTransport);
  });

  it("SupabaseRealtimeTransport satisfies the NotificationTransport port interface", () => {
    const stub = new SupabaseRealtimeTransport();
    expect(typeof stub.publish).toBe("function");
    expect(typeof stub.subscribe).toBe("function");
  });
});

// ─── Test 6: unknown provider throws ─────────────────────────────────────────

describe("selector — unknown provider (fail-closed, not fall-back)", () => {
  it("throws for unknown REALTIME_PROVIDER value", () => {
    process.env["REALTIME_PROVIDER"] = "unknown-binding";
    process.env["ALLOW_MOCK_REALTIME"] = "true";

    expect(() => createNotificationTransport()).toThrow(/Unknown REALTIME_PROVIDER/);
  });

  it("throws for a typo'd REALTIME_PROVIDER (e.g. 'supabase')", () => {
    process.env["REALTIME_PROVIDER"] = "supabase"; // typo — missing "-realtime"
    delete process.env["ALLOW_MOCK_REALTIME"];

    expect(() => createNotificationTransport()).toThrow(/Unknown REALTIME_PROVIDER/);
  });
});

// ─── Test 8: TASK-016-005b browser-variant selection + no-throw subscribe ────

/**
 * DECISION-016-005b-RT: In the browser context, the server-side env vars are absent
 * (REALTIME_PROVIDER is undefined; only NEXT_PUBLIC_* vars are inlined by Next.js).
 * The selector falls back to NEXT_PUBLIC_REALTIME_PROVIDER + NEXT_PUBLIC_ALLOW_MOCK_REALTIME
 * and, detecting isBrowserContext (REALTIME_PROVIDER === undefined), returns the
 * SseBrowserMockTransport instead of MockNotificationTransport.
 *
 * AC-MSG-012-03: badge reflects real-time arrival — SseBrowserMockTransport.subscribe()
 *   must NOT throw (unlike SupabaseRealtimeTransport which throws at call-time).
 *   The BUG-016-001 root cause was the silent-catch hiding the throw.
 *
 * ADR-023 §4: fail-closed preserved — real/default config still binds SupabaseRealtimeTransport.
 * DECISION-016-005b-RT // CS-GEN-002 // CS-GEN-003
 */
describe("TASK-016-005b — browser-variant selection (DECISION-016-005b-RT / ADR-023)", () => {
  // EventSource is a browser API; mock it for the Node.js test environment.
  // The mock records calls and provides a close spy so tests can verify the cleanup contract.
  const mockEventSourceClose = vi.fn();
  const MockEventSourceConstructor = vi.fn().mockImplementation((_url: string) => {
    return { close: mockEventSourceClose, onmessage: null as ((e: MessageEvent) => void) | null };
  });

  it("browser context (REALTIME_PROVIDER absent, NEXT_PUBLIC_=mock) → SseBrowserMockTransport", () => {
    // Simulate browser context: server-side var is absent; NEXT_PUBLIC_ is inlined.
    // DECISION-016-005b-RT: selector detects browser context via REALTIME_PROVIDER === undefined. // ADR-023
    delete process.env["REALTIME_PROVIDER"];
    process.env["NEXT_PUBLIC_REALTIME_PROVIDER"] = "mock";
    delete process.env["ALLOW_MOCK_REALTIME"];
    process.env["NEXT_PUBLIC_ALLOW_MOCK_REALTIME"] = "true";

    const transport = createNotificationTransport();
    expect(transport).toBeInstanceOf(SseBrowserMockTransport);
  });

  it("browser context — SseBrowserMockTransport.subscribe() does NOT throw (EventSource-based)", () => {
    // Set up browser context env
    delete process.env["REALTIME_PROVIDER"];
    process.env["NEXT_PUBLIC_REALTIME_PROVIDER"] = "mock";
    delete process.env["ALLOW_MOCK_REALTIME"];
    process.env["NEXT_PUBLIC_ALLOW_MOCK_REALTIME"] = "true";

    const transport = createNotificationTransport();
    expect(transport).toBeInstanceOf(SseBrowserMockTransport);

    // Install mock EventSource before calling subscribe()
    // SseBrowserMockTransport calls new EventSource(SSE_ROUTE_PATH) in subscribe().
    // We mock the global EventSource to prevent "EventSource is not defined" in Node.js.
    // This test verifies subscribe() does NOT throw — the core BUG-016-001 regression fix. // AC-MSG-012-03
    const originalEventSource = (globalThis as Record<string, unknown>)["EventSource"];
    try {
      (globalThis as Record<string, unknown>)["EventSource"] = MockEventSourceConstructor;

      // subscribe() must NOT throw (BUG-016-001 root cause: the stub threw, badge never subscribed).
      const subscriber = vi.fn();
      let unsubscribe: (() => void) | undefined;
      expect(() => {
        unsubscribe = transport.subscribe("user:test-channel", subscriber);
      }).not.toThrow();

      // subscribe() must return a valid UnsubscribeFn.
      expect(typeof unsubscribe).toBe("function");

      // EventSource must have been created with the SSE route path.
      expect(MockEventSourceConstructor).toHaveBeenCalledWith("/api/notifications/stream");

      // UnsubscribeFn must close the EventSource.
      unsubscribe?.();
      expect(mockEventSourceClose).toHaveBeenCalled();
    } finally {
      if (originalEventSource !== undefined) {
        (globalThis as Record<string, unknown>)["EventSource"] = originalEventSource;
      } else {
        delete (globalThis as Record<string, unknown>)["EventSource"];
      }
      MockEventSourceConstructor.mockClear();
      mockEventSourceClose.mockClear();
    }
  });

  it("browser context — publish() throws (browser must not publish; server-side only)", async () => {
    // SseBrowserMockTransport.publish() must throw a descriptive error when called.
    // Publication is server-side only (emitAndPublishNotification, packages/db). // ADR-023
    const transport = new SseBrowserMockTransport();

    await expect(
      transport.publish("user:test", { type: "notification.created", payload: {} }),
    ).rejects.toThrow(/publish\(\) must not be called from the browser/);
  });

  it("server context (REALTIME_PROVIDER=mock set) → MockNotificationTransport (in-process)", () => {
    // Server context: REALTIME_PROVIDER is set directly.
    // DECISION-016-005b-RT: server gets the in-process mock; browser gets the SSE variant. // ADR-023
    process.env["REALTIME_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_REALTIME"] = "true";
    // NEXT_PUBLIC_ may also be set on the server (it's set in compose) — should NOT change behavior.
    process.env["NEXT_PUBLIC_REALTIME_PROVIDER"] = "mock";
    process.env["NEXT_PUBLIC_ALLOW_MOCK_REALTIME"] = "true";

    const transport = createNotificationTransport();
    // Server gets MockNotificationTransport (in-process) — NOT SseBrowserMockTransport.
    expect(transport).toBeInstanceOf(MockNotificationTransport);
    expect(transport).not.toBeInstanceOf(SseBrowserMockTransport);
  });

  it("fail-closed preserved in browser context: NEXT_PUBLIC_ALLOW_MOCK_REALTIME unset → THROW", () => {
    // Even in browser context, fail-closed applies:
    // NEXT_PUBLIC_REALTIME_PROVIDER=mock without NEXT_PUBLIC_ALLOW_MOCK_REALTIME=true → THROW.
    // ADR-023 §4: the mock binding must NEVER be active without an explicit opt-in. // ADR-023
    delete process.env["REALTIME_PROVIDER"];
    process.env["NEXT_PUBLIC_REALTIME_PROVIDER"] = "mock";
    delete process.env["ALLOW_MOCK_REALTIME"];
    delete process.env["NEXT_PUBLIC_ALLOW_MOCK_REALTIME"];

    expect(() => createNotificationTransport()).toThrow(
      /mock real-time transport is forbidden unless ALLOW_MOCK_REALTIME=true/,
    );
  });

  it("fail-closed preserved in browser context: real/default → SupabaseRealtimeTransport (no mock fallback)", () => {
    // Browser context with no NEXT_PUBLIC_ vars set → falls back to supabase-realtime (real default).
    // ADR-023 §4: real-default — the mock is never the silent default. // ADR-023
    delete process.env["REALTIME_PROVIDER"];
    delete process.env["NEXT_PUBLIC_REALTIME_PROVIDER"];
    delete process.env["ALLOW_MOCK_REALTIME"];
    delete process.env["NEXT_PUBLIC_ALLOW_MOCK_REALTIME"];

    const transport = createNotificationTransport();
    expect(transport).toBeInstanceOf(SupabaseRealtimeTransport);
  });

  it("SseBrowserMockTransport satisfies the NotificationTransport port interface", () => {
    // The browser variant must implement the same port as the in-process mock. // ADR-023 §1
    const transport = new SseBrowserMockTransport();
    expect(typeof transport.publish).toBe("function");
    expect(typeof transport.subscribe).toBe("function");
  });
});

// ─── Test 7: barrel does not leak binding classes ────────────────────────────

describe("barrel (index.ts) — does not export binding classes", () => {
  it("barrel exports do NOT include MockNotificationTransport", async () => {
    const barrel = await import("./index.js");

    // The barrel must not carry the binding class // ADR-023
    expect("MockNotificationTransport" in barrel).toBe(false);
  });

  it("barrel exports do NOT include SupabaseRealtimeTransport", async () => {
    const barrel = await import("./index.js");

    expect("SupabaseRealtimeTransport" in barrel).toBe(false);
  });

  it("barrel exports do NOT include RealtimeBindingNotAvailableError", async () => {
    const barrel = await import("./index.js");

    expect("RealtimeBindingNotAvailableError" in barrel).toBe(false);
  });

  it("barrel exports do NOT include SseBrowserMockTransport (TASK-016-005b binding — internal)", async () => {
    // SseBrowserMockTransport is a new browser-variant binding (TASK-016-005b).
    // Like all binding classes, it must NOT be exported from the barrel (ADR-023 §1). // ADR-023
    const barrel = await import("./index.js");
    expect("SseBrowserMockTransport" in barrel).toBe(false);
  });

  it("barrel exports do NOT include createNotificationTransport (internal factory)", async () => {
    const barrel = await import("./index.js");

    expect("createNotificationTransport" in barrel).toBe(false);
  });

  it("barrel DOES export getNotificationTransport and resetNotificationTransportForTesting", async () => {
    const barrel = await import("./index.js");

    // Runtime-available exports from the barrel
    expect(typeof barrel.getNotificationTransport).toBe("function");
    expect(typeof barrel.resetNotificationTransportForTesting).toBe("function");

    // Types are compile-time only; verify no naming collision with runtime exports
    expect("NotificationTransport" in barrel).toBe(false); // interface only, no runtime class
    expect("NotificationEvent" in barrel).toBe(false); // interface only, no runtime class
  });
});

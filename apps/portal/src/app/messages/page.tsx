/**
 * apps/portal/src/app/messages/page.tsx
 *
 * CLIENT messages hub — thread list with per-viewer unread indicator.
 *
 * Renders all threads visible to the CLIENT viewer (both 'engagement' and 'general' kinds),
 * each annotated with the per-viewer unread indicator derived from listThreadsWithUnread.
 *
 * AC-MSG-005-01: new message → per-viewer unread indicator appears.
 * AC-MSG-005-02: both 'engagement' and 'general' thread kinds show the indicator.
 * AC-MSG-001-04: CLIENT can navigate to any thread they are a participant in.
 *
 * Pool strategy:
 *   Identity check: provider.getIdentity() (request-scoped headers).
 *   Threads read: listThreadsWithUnread (REQUEST POOL via withRequestContext — RLS FILTER).
 *     The SESSION_CONTEXT governs visibility; CLIENT sees only their threads.
 *
 * ADR-003: identity from verified session headers — never from URL params. // ADR-003
 * ADR-005: sec.pol_Thread FILTER is the sole visibility gate (no app-layer filtering). // ADR-005
 * ADR-006: /messages is apps/portal ONLY — CLIENT-facing; no start-general-thread affordance. // ADR-006
 * ADR-010: /messages is NOT public — requires CLIENT session. // ADR-010
 * CS-TS-001: listThreadsWithUnread uses the db wrapper (SESSION_CONTEXT). // CS-TS-001
 * CS-TS-003: mirrored at apps/admin/src/app/messages/page.tsx (admin has start-thread). // CS-TS-003
 * CS-GEN-001: no message bodies or PII logged. // CS-GEN-001
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-001-04 // AC-MSG-005-01 // AC-MSG-005-02
 * // ADR-003 // ADR-005 // ADR-006 // ADR-010 // CS-TS-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { listThreadsWithUnread, withRequestContext } from "@tax-portal/db";
import { ThreadList } from "./_components/ThreadList";

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Messages",
  description: "Your message threads.",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PortalMessagesPage() {
  // Defense-in-depth identity guard — ADR-010 middleware guarantees CLIENT before this page.
  // ADR-003: identity from verified session headers — never from URL params. // ADR-003
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "CLIENT") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-8 text-center"
          data-testid="portal-messages-unauthorized"
        >
          <p className="text-red-700 text-sm">
            Authentication required. Please sign in.
          </p>
        </div>
      </div>
    );
  }

  // Load thread list with per-viewer unread indicator.
  // ADR-003: withRequestContext sets SESSION_CONTEXT (CLIENT identity). // ADR-003
  // ADR-005: sec.pol_Thread FILTER governs visibility — no app-layer filtering added. // ADR-005
  // CS-TS-001: listThreadsWithUnread uses the db wrapper (SESSION_CONTEXT). // CS-TS-001
  // CS-GEN-001: thread metadata only — no message bodies fetched here. // CS-GEN-001
  // AC-MSG-005-01/-02: hasUnread decorated per thread. // AC-MSG-005-01 // AC-MSG-005-02
  let threads: Awaited<ReturnType<typeof listThreadsWithUnread>> = [];
  let loadError = false;

  try {
    threads = await withRequestContext(
      identity.clerkUserId, // CS-TS-004: from verified session
      identity.role,
      () => listThreadsWithUnread(), // ADR-005: RLS FILTER is the gate // AC-MSG-005-01/-02
    );
  } catch {
    // CS-GEN-001: no details logged to client. // CS-GEN-001
    loadError = true;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Back to dashboard */}
      <div className="mb-6">
        <a
          href="/dashboard"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← Back to Dashboard
        </a>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Messages</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your message threads. Engagement threads and direct messages appear here.
        </p>
      </div>

      {/* Load error */}
      {loadError && (
        <div
          role="alert"
          className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
          data-testid="portal-messages-load-error"
        >
          Could not load messages. Please refresh the page.
        </div>
      )}

      {/* Thread list panel */}
      <div
        className="rounded-lg border border-gray-200 bg-white overflow-hidden"
        data-testid="portal-messages-panel"
      >
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">
            Threads
            <span className="ml-2 text-xs font-normal text-gray-400">
              {threads.length} thread{threads.length !== 1 ? "s" : ""}
            </span>
          </h2>
        </div>

        {/* AC-MSG-005-01/-02: ThreadList renders per-viewer unread indicators */}
        {/* ADR-006: no start-general-thread affordance on the CLIENT surface */}
        <ThreadList threads={threads} />
      </div>
    </div>
  );
}

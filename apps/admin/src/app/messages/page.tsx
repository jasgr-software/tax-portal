/**
 * apps/admin/src/app/messages/page.tsx
 *
 * ACCOUNTANT messages hub — thread list with per-viewer unread indicator + start-general-thread.
 *
 * Renders all threads visible to the ACCOUNTANT viewer (both 'engagement' and 'general' kinds),
 * each annotated with the per-viewer unread indicator derived from listThreadsWithUnread.
 * Also renders the StartGeneralThread control (ACCOUNTANT-ONLY — AC-MSG-006-01, CS-TS-004).
 *
 * AC-MSG-005-01: new message → per-viewer unread indicator appears.
 * AC-MSG-005-02: both 'engagement' and 'general' thread kinds show the indicator.
 * AC-MSG-001-04: ACCOUNTANT can navigate to any thread and contribute.
 * AC-MSG-006-01: ACCOUNTANT can initiate a general thread with a specific client.
 * AC-MSG-002-01: start-general-thread is ACCOUNTANT-ONLY (CS-TS-004).
 *
 * DECISION (TASK-017-006): The StartGeneralThread control appears here with an empty
 * clients list; a dedicated follow-up is needed to wire the client-list read model
 * (listClients or similar) to populate the selector. The affordance itself is present
 * and guarded by the ACCOUNTANT role (CS-TS-004 — portal has no equivalent). // DECISION
 *
 * Pool strategy:
 *   Identity check: provider.getIdentity() (request-scoped headers).
 *   Threads read: listThreadsWithUnread (REQUEST POOL via withRequestContext — RLS FILTER).
 *     The SESSION_CONTEXT governs visibility; ACCOUNTANT sees all threads (IS_MEMBER=1).
 *
 * ADR-003: identity from verified session headers — never from URL params. // ADR-003
 * ADR-005: sec.pol_Thread FILTER is the sole visibility gate. // ADR-005
 * ADR-006: /messages in apps/admin — ACCOUNTANT surface; includes start-general-thread. // ADR-006
 * ADR-010: apps/admin has NO public routes; middleware guarantees ACCOUNTANT. // ADR-010
 * CS-TS-001: listThreadsWithUnread uses the db wrapper (SESSION_CONTEXT). // CS-TS-001
 * CS-TS-003: mirrored at apps/portal/src/app/messages/page.tsx (portal has no start-thread). // CS-TS-003
 * CS-TS-004: StartGeneralThread appears ONLY here — never in apps/portal. // CS-TS-004
 * CS-GEN-001: no message bodies or PII logged. // CS-GEN-001
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-001-04 // AC-MSG-002-01 // AC-MSG-005-01 // AC-MSG-005-02 // AC-MSG-006-01
 * // ADR-003 // ADR-005 // ADR-006 // ADR-010
 * // CS-TS-001 // CS-TS-003 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { listThreadsWithUnread, withRequestContext } from "@tax-portal/db";
import { ThreadList } from "./_components/ThreadList";
import { StartGeneralThread } from "./_components/StartGeneralThread";

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Messages",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminMessagesPage() {
  // Defense-in-depth identity guard — ADR-010 middleware guarantees ACCOUNTANT before this page.
  // ADR-003: identity from verified session headers — never from URL params. // ADR-003
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "ACCOUNTANT") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-red-200 p-8 text-center">
          <p className="text-sm text-red-600">Authentication required. Please sign in.</p>
        </div>
      </div>
    );
  }

  // Load thread list with per-viewer unread indicator.
  // ADR-003: withRequestContext sets SESSION_CONTEXT (ACCOUNTANT identity). // ADR-003
  // ADR-005: sec.pol_Thread FILTER governs visibility — ACCOUNTANT sees all threads. // ADR-005
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
    <div className="min-h-screen bg-gray-50">
      {/* Top nav — mirrors admin page pattern */}
      <nav className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="text-base font-bold text-gray-900">Tax Portal</span>
              <nav className="flex gap-4 text-sm" aria-label="Main navigation">
                <a href="/" className="text-gray-500 hover:text-gray-900 transition-colors">Dashboard</a>
                <a href="/engagements" className="text-gray-500 hover:text-gray-900 transition-colors">Engagements</a>
                <a href="/messages" className="font-medium text-gray-900">Messages</a>
              </nav>
            </div>
            <span className="text-xs text-gray-400 font-mono">{identity.clerkUserId}</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Messages</h1>
            <p className="mt-1 text-sm text-gray-500">
              All message threads. Engagement threads and direct client messages.
            </p>
          </div>

          {/*
            AC-MSG-006-01 / CS-TS-004: Start-general-thread affordance — ACCOUNTANT-ONLY.
            This control MUST NOT exist in apps/portal. // CS-TS-004 // ADR-006
            DECISION (TASK-017-006): clients list is empty until a listClients read model is
            wired here in a follow-up slice. The affordance is present and role-guarded. // DECISION
          */}
          <div data-testid="start-general-thread-section">
            <StartGeneralThread clients={[]} />
          </div>
        </div>

        {/* Load error */}
        {loadError && (
          <div
            role="alert"
            className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
            data-testid="admin-messages-load-error"
          >
            Could not load messages. Please refresh the page.
          </div>
        )}

        {/* Thread list panel */}
        <div
          className="rounded-lg border border-gray-200 bg-white overflow-hidden"
          data-testid="admin-messages-panel"
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
          {/* CS-TS-004: StartGeneralThread is above (ACCOUNTANT-ONLY — never in portal) */}
          <ThreadList threads={threads} />
        </div>
      </main>
    </div>
  );
}

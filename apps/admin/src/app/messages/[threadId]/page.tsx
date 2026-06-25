/**
 * apps/admin/src/app/messages/[threadId]/page.tsx
 *
 * ACCOUNTANT general-thread view — /messages/[threadId].
 *
 * Closes the gap surfaced by TASK-017-008 e2e: the ThreadList on the ACCOUNTANT surface
 * links general threads to /messages/{threadId}, but the route did not exist. This page
 * provides the missing read surface for the ACCOUNTANT.
 *
 * Renders the general thread's ordered message history + GeneralMessageComposer for the
 * ACCOUNTANT. On load, marks the thread as read (AC-MSG-005-04).
 *
 * SECURITY (REQ-MSG-003 — plain-text render):
 *   Message bodies rendered via ThreadView → MessageBody (packages/ui), which uses
 *   React text nodes ONLY. NEVER dangerouslySetInnerHTML.
 *   AC-MSG-003-02: `<script>alert(1)</script>` → literal text, not executed.
 *   AC-MSG-003-03: `<img>` tag renders verbatim; no inline image in the body.
 *
 * SECURITY (IDOR / ADR-005):
 *   getThreadById runs under request pool with RLS (sec.pol_Thread FILTER).
 *   The ACCOUNTANT (IS_MEMBER('app_admin_role')=1) sees all threads — no IDOR risk.
 *   A non-existent threadId returns null → 404. The policy is the sole gate (DECISION-017-002-A).
 *
 * AC-MSG-002-02: general thread visible to the accountant AND the associated client.
 * AC-MSG-002-03: messages in chronological order (createdAt ASC) — readable by both parties.
 * AC-MSG-001-04: ACCOUNTANT can read + contribute (ThreadView + GeneralMessageComposer).
 * AC-MSG-005-04: thread marked read on view (markGeneralThreadReadAction).
 * AC-MSG-003-01/-02/-03: plain-text verbatim render — MessageBody component.
 * AC-MSG-004-02/-03: attachments listed; download via requestGeneralAttachmentUrlAction.
 *
 * Pool strategy:
 *   Identity check: provider.getIdentity() (request-scoped headers).
 *   Thread resolve: getThreadById (REQUEST POOL via withRequestContext — RLS-governed).
 *     Non-existent threadId → null → 404. DECISION-017-002-A: no belt-and-suspenders WHERE.
 *   Messages read: listThreadMessages (REQUEST POOL via withRequestContext).
 *   Attachments: listMessageAttachments (REQUEST POOL via withRequestContext).
 *   Mark read: markGeneralThreadReadAction (fires on page load — AC-MSG-005-04).
 *
 * ADR-003: identity from verified session headers — never from URL params. // ADR-003
 * ADR-005: sec.pol_Thread / sec.pol_Message FILTER governs visibility. // ADR-005
 * ADR-006: /messages/[threadId] in apps/admin — ACCOUNTANT general-thread read surface. // ADR-006
 * ADR-010: apps/admin has NO public routes; middleware guarantees ACCOUNTANT. // ADR-010
 * CS-TS-001: request-pool reads via withRequestContext. // CS-TS-001
 * CS-TS-003: mirrored at apps/portal for CLIENT. // CS-TS-003
 * CS-GEN-001: no message bodies logged. // CS-GEN-001
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-002-02 // AC-MSG-002-03 // AC-MSG-001-04 // AC-MSG-005-04
 * // AC-MSG-003-01 // AC-MSG-003-02 // AC-MSG-003-03
 * // AC-MSG-004-02 // AC-MSG-004-03
 * // ADR-003 // ADR-005 // ADR-006 // ADR-010
 * // CS-TS-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  getThreadById,
  listThreadMessages,
  listMessageAttachments,
  withRequestContext,
} from "@tax-portal/db";
import type { MessageItem, MessageAttachmentItem } from "@tax-portal/db";
import { ThreadView } from "@/app/messages/_components/ThreadView";
import { GeneralMessageComposer } from "./GeneralMessageComposer";
import { markGeneralThreadReadAction } from "./actions";

// ─── Route params ─────────────────────────────────────────────────────────────

interface GeneralThreadPageProps {
  params: Promise<{ threadId: string }>;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Messages — Direct Thread",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminGeneralThreadPage({ params }: GeneralThreadPageProps) {
  const { threadId } = await params;

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

  // Resolve the thread — REQUEST POOL (RLS FILTER governs visibility).
  // DECISION-017-002-A: No WHERE beyond id — sec.pol_Thread is the sole gate.
  // ACCOUNTANT (IS_MEMBER=1) sees all threads. Non-existent id → null → notFound().
  // CS-TS-001: getThreadById under withRequestContext (SESSION_CONTEXT). // CS-TS-001
  //
  // NOTE: getThreadById + the null check MUST execute OUTSIDE the try-catch below.
  // notFound() throws a special Next.js internal error; catching it accidentally and
  // swallowing it (setting loadError=true) would silently render a broken page instead
  // of the correct 404. Resolving thread first ensures notFound() propagates cleanly.
  const thread = await withRequestContext(
    identity.clerkUserId, // CS-TS-004: from verified session
    identity.role,
    () => getThreadById(threadId), // DECISION-017-002-A: RLS is the sole gate
  );

  // Non-existent threadId → null → 404.
  // ADR-005: The ACCOUNTANT FILTER predicate admits IS_MEMBER=1 for all threads,
  // so null only occurs when the threadId genuinely does not exist. // ADR-005
  if (!thread) {
    notFound();
  }

  // AC-MSG-005-04: mark the thread as read on view (best-effort — fire-and-forget).
  // ADR-005: markGeneralThreadReadAction uses withRequestContext + RLS BLOCK. // ADR-005
  void markGeneralThreadReadAction(threadId);

  let messages: MessageItem[] = [];
  let attachmentsByMessageId: Record<string, MessageAttachmentItem[]> = {};
  let loadError = false;

  try {
    // Load messages — REQUEST POOL (RLS FILTER: ACCOUNTANT sees all messages).
    // CS-TS-001: listThreadMessages under withRequestContext (SESSION_CONTEXT). // CS-TS-001
    // AC-MSG-002-03: listThreadMessages returns messages in createdAt ASC order.
    // CS-GEN-001: message bodies loaded for display; NEVER logged. // CS-GEN-001
    messages = await withRequestContext(
      identity.clerkUserId,
      identity.role,
      () => listThreadMessages(thread.id), // AC-MSG-002-03
    );

    // Load attachments for each message — REQUEST POOL (RLS-governed).
    // AC-MSG-004-02: attachments visible to thread participants alongside the message.
    const attachmentPromises = messages.map(async (msg) => {
      const atts = await withRequestContext(
        identity.clerkUserId,
        identity.role,
        () => listMessageAttachments(msg.id), // AC-MSG-004-02
      );
      return [msg.id, atts] as const;
    });

    const attachmentResults = await Promise.all(attachmentPromises);
    attachmentsByMessageId = Object.fromEntries(attachmentResults);
  } catch (err) {
    // Load error — messages failed after authentication + thread resolution.
    // CS-GEN-001: no internals or message bodies logged to client. // CS-GEN-001
    void err; // suppress lint warning — we don't log the error body (CS-GEN-001)
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
        {/* Breadcrumb navigation */}
        <div className="mb-6">
          <a
            href="/messages"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← All Messages
          </a>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Direct Message</h1>
          <p className="mt-1 text-sm text-gray-500">
            Direct message thread with a client.
          </p>
        </div>

        {/* Load error */}
        {loadError && (
          <div
            role="alert"
            className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
            data-testid="admin-general-thread-load-error"
          >
            Could not load messages. Please refresh the page.
          </div>
        )}

        {/* Thread view + composer panel */}
        <div
          className="rounded-lg border border-gray-200 bg-white overflow-hidden"
          data-testid="admin-general-thread-panel"
        >
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">
              Conversation
            </h2>
          </div>

          {/* Message history — SECURITY: MessageBody uses React text nodes ONLY (AC-MSG-003-01/-02/-03) */}
          {/* AC-MSG-001-04: ACCOUNTANT reads here; composes via GeneralMessageComposer below */}
          {!loadError && (
            <ThreadView
              messages={messages}
              attachmentsByMessageId={attachmentsByMessageId}
              viewerClerkId={identity.clerkUserId}
            />
          )}

          {/* Message composer — AC-MSG-001-04: ACCOUNTANT can contribute to the general thread */}
          {!loadError && thread && (
            <GeneralMessageComposer threadId={thread.id} />
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * apps/admin/src/app/engagements/[engagementId]/messages/page.tsx
 *
 * ACCOUNTANT per-engagement thread view — read + reply + attach + retrieve.
 *
 * Renders the engagement's message thread for the ACCOUNTANT: ordered message list with
 * plain-text bodies and attachment lists, plus the MessageComposer for sending replies.
 * On load, marks the thread as read (AC-MSG-005-04).
 *
 * SECURITY (REQ-MSG-003 — plain-text render):
 *   Message bodies rendered via ThreadView → MessageBody (packages/ui), which uses
 *   React text nodes ONLY. NEVER dangerouslySetInnerHTML.
 *   AC-MSG-003-02: `<script>alert(1)</script>` → literal text, not executed.
 *   AC-MSG-003-03: `<img>` tag renders verbatim; no inline image in the body.
 *
 * AC-MSG-001-02: thread visible only to participants (RLS FILTER — request pool).
 * AC-MSG-001-04: ACCOUNTANT can read + contribute (ThreadView + MessageComposer).
 * AC-MSG-002-03: messages in chronological order (createdAt ASC).
 * AC-MSG-003-01/-02/-03: plain-text verbatim render — MessageBody component.
 * AC-MSG-004-02/-03: attachments listed; download via requestAttachmentUrlAction.
 * AC-MSG-005-04: thread marked read on view (markThreadReadAction).
 *
 * Pool strategy:
 *   Identity check: provider.getIdentity() (request-scoped headers).
 *   Thread resolve: getOrCreateEngagementThread (admin pool — idempotent).
 *   Messages read: listThreadMessages (REQUEST POOL via withRequestContext).
 *   Attachments: listMessageAttachments (REQUEST POOL via withRequestContext).
 *   Mark read: markThreadReadAction (fires on page load — AC-MSG-005-04).
 *
 * ADR-003: identity from verified session headers — never from URL params. // ADR-003
 * ADR-005: sec.pol_Thread / sec.pol_Message FILTER governs visibility. // ADR-005
 * ADR-006: /engagements/{id}/messages in apps/admin — ACCOUNTANT read + compose. // ADR-006
 * ADR-010: apps/admin has NO public routes; middleware guarantees ACCOUNTANT. // ADR-010
 * CS-TS-001: request-pool reads via withRequestContext. // CS-TS-001
 * CS-TS-003: mirrored at apps/portal for CLIENT. // CS-TS-003
 * CS-GEN-001: no message bodies logged. // CS-GEN-001
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-001-02 // AC-MSG-001-04 // AC-MSG-002-03
 * // AC-MSG-003-01 // AC-MSG-003-02 // AC-MSG-003-03
 * // AC-MSG-004-02 // AC-MSG-004-03 // AC-MSG-005-04
 * // ADR-003 // ADR-005 // ADR-006 // ADR-010
 * // CS-TS-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  getOrCreateEngagementThread,
  listThreadMessages,
  listMessageAttachments,
  withRequestContext,
} from "@tax-portal/db";
import type { MessageItem, MessageAttachmentItem } from "@tax-portal/db";
import { ThreadView } from "@/app/messages/_components/ThreadView";
import { MessageComposer } from "@/app/messages/_components/MessageComposer";
import { markThreadReadAction } from "./actions";

// ─── Route params ─────────────────────────────────────────────────────────────

interface MessagesPageProps {
  params: Promise<{ engagementId: string }>;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Messages — Engagement Thread",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminEngagementMessagesPage({ params }: MessagesPageProps) {
  const { engagementId } = await params;

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

  // AC-MSG-005-04: mark the thread as read on view (best-effort — idempotent fire-and-forget).
  // ADR-005: markThreadReadAction uses withRequestContext + RLS BLOCK (own-row only). // ADR-005
  void markThreadReadAction(engagementId);

  // Resolve (or create) the engagement thread — admin pool (idempotent, concurrent-safe).
  // ADR-003 §7: admin pool for server-authoritative get-or-create. // ADR-003
  // AC-MSG-001-01: one thread per engagement (@@unique enforced). // AC-MSG-001-01
  let thread: { id: string } | null = null;
  let messages: MessageItem[] = [];
  let attachmentsByMessageId: Record<string, MessageAttachmentItem[]> = {};
  let loadError = false;

  try {
    thread = await getOrCreateEngagementThread({ engagementId });

    // Load messages — REQUEST POOL (RLS FILTER governs visibility; ACCOUNTANT sees all).
    // CS-TS-001: listThreadMessages under withRequestContext (SESSION_CONTEXT). // CS-TS-001
    // ADR-005: sec.pol_Message FILTER: ACCOUNTANT (IS_MEMBER=1) sees all messages. // ADR-005
    // AC-MSG-002-03: listThreadMessages returns messages in createdAt ASC order.
    // CS-GEN-001: message bodies are loaded and displayed to the viewer; NEVER logged. // CS-GEN-001
    messages = await withRequestContext(
      identity.clerkUserId, // CS-TS-004: from verified session
      identity.role,
      () => listThreadMessages(thread!.id), // AC-MSG-002-03
    );

    // Load attachments for each message — REQUEST POOL (RLS-governed).
    // AC-MSG-004-02: attachments visible to thread participants alongside the message.
    // CS-TS-001: listMessageAttachments under withRequestContext. // CS-TS-001
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
  } catch {
    // CS-GEN-001: no internals or message bodies logged to client. // CS-GEN-001
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
                <a href="/messages" className="text-gray-500 hover:text-gray-900 transition-colors">Messages</a>
              </nav>
            </div>
            <span className="text-xs text-gray-400 font-mono">{identity.clerkUserId}</span>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb navigation — consistent with documents/document-requests sub-pages */}
        <div className="mb-2">
          <a
            href={`/engagements/${engagementId}`}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← Back to Engagement
          </a>
        </div>
        <div className="mb-6">
          <a
            href="/messages"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← All Messages
          </a>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Messages</h1>
          <p className="mt-1 text-sm text-gray-500">
            Engagement message thread with the client.
          </p>
          <p className="mt-1 text-xs text-gray-400 font-mono">
            Engagement: {engagementId}
          </p>
        </div>

        {/* Load error */}
        {loadError && (
          <div
            role="alert"
            className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
            data-testid="admin-engagement-messages-load-error"
          >
            Could not load messages. Please refresh the page.
          </div>
        )}

        {/* Thread view + composer panel */}
        <div
          className="rounded-lg border border-gray-200 bg-white overflow-hidden"
          data-testid="admin-engagement-messages-panel"
        >
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">
              Conversation
            </h2>
          </div>

          {/* Message history — SECURITY: MessageBody uses React text nodes ONLY (AC-MSG-003-01/-02/-03) */}
          {/* AC-MSG-001-04: ACCOUNTANT reads here; composes via MessageComposer below */}
          {!loadError && (
            <ThreadView
              messages={messages}
              attachmentsByMessageId={attachmentsByMessageId}
              viewerClerkId={identity.clerkUserId}
            />
          )}

          {/* Message composer — AC-MSG-001-04: ACCOUNTANT can contribute */}
          {!loadError && thread && (
            <MessageComposer engagementId={engagementId} />
          )}
        </div>

        {/* Sub-page navigation — consistent with other engagement detail sub-pages */}
        <div className="mt-4 flex gap-4 text-sm">
          <a
            href={`/engagements/${engagementId}/documents`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            Documents →
          </a>
          <a
            href={`/engagements/${engagementId}/document-requests`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            Document Requests →
          </a>
          <a
            href={`/engagements/${engagementId}/participants`}
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            Participants →
          </a>
        </div>
      </main>
    </div>
  );
}

/**
 * apps/admin/src/app/messages/_components/ThreadView.tsx
 *
 * Thread view for the ACCOUNTANT (admin) per-engagement messages page.
 *
 * Renders an ordered list of messages in the thread (chronological — AC-MSG-002-03),
 * each with its plain-text body and attachment list.
 *
 * SECURITY (REQ-MSG-003 — plain-text render):
 *   Message bodies rendered via MessageBody (packages/ui) which uses React text nodes ONLY.
 *   NEVER dangerouslySetInnerHTML. AC-MSG-003-01/-02/-03: markup/script/img renders verbatim.
 *
 * AC-MSG-002-03: messages displayed in chronological order (createdAt ASC).
 * AC-MSG-003-01/-02/-03: body rendered as plain text (MessageBody component).
 * AC-MSG-004-02: each message's attachments listed (AttachmentList component).
 * AC-MSG-001-04: both parties can read + contribute — ThreadView is the read surface.
 *
 * CS-TS-003: mirrors ThreadView in apps/portal (same render, per-surface imports). // CS-TS-003
 * ADR-006: admin surface (ACCOUNTANT-facing). // ADR-006
 * CS-GEN-001: no message bodies or PII in data-testid attributes. // CS-GEN-001
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-001-04 // AC-MSG-002-03 // AC-MSG-003-01 // AC-MSG-003-02 // AC-MSG-003-03
 * // AC-MSG-004-02 // CS-TS-003 // ADR-006 // CS-GEN-001 // CS-GEN-003
 */

import type { MessageItem, MessageAttachmentItem } from "@tax-portal/db";
import { MessageBody } from "@tax-portal/ui";
import { AttachmentList } from "./AttachmentList";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThreadViewProps {
  /** Messages in the thread, ordered by createdAt ASC (AC-MSG-002-03). */
  messages: MessageItem[];
  /** Attachments per message, keyed by messageId. */
  attachmentsByMessageId: Record<string, MessageAttachmentItem[]>;
  /** The viewing ACCOUNTANT's clerkUserId — used to distinguish sent vs. received. */
  viewerClerkId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * ThreadView — renders the ordered message history for a thread (ACCOUNTANT surface).
 *
 * AC-MSG-002-03: messages in chronological order.
 * AC-MSG-003-01/-02/-03: bodies rendered as plain text via MessageBody (React text nodes only).
 * AC-MSG-004-02: attachments listed beside each message.
 * AC-MSG-001-04: ACCOUNTANT reads + can compose (MessageComposer is the sibling component).
 *
 * // AC-MSG-001-04 // AC-MSG-002-03 // AC-MSG-003-01 // AC-MSG-003-02 // AC-MSG-003-03
 * // AC-MSG-004-02 // CS-TS-003 // ADR-006 // CS-GEN-001 // CS-GEN-003
 */
export function ThreadView({ messages, attachmentsByMessageId, viewerClerkId }: ThreadViewProps) {
  if (messages.length === 0) {
    return (
      <div
        className="px-4 py-8 text-center text-sm text-gray-500"
        data-testid="thread-view-empty"
      >
        No messages yet. Start the conversation below.
      </div>
    );
  }

  return (
    <ol
      className="divide-y divide-gray-100"
      data-testid="thread-view"
    >
      {/* AC-MSG-002-03: messages rendered in chronological order (sorted by server) */}
      {messages.map((msg) => (
        <MessageRow
          key={msg.id}
          message={msg}
          attachments={attachmentsByMessageId[msg.id] ?? []}
          isSentByViewer={msg.senderClerkId === viewerClerkId}
        />
      ))}
    </ol>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface MessageRowProps {
  message: MessageItem;
  attachments: MessageAttachmentItem[];
  isSentByViewer: boolean;
}

/**
 * MessageRow — renders one message bubble with body + attachments.
 *
 * SECURITY:
 *   Body rendered via <MessageBody> (React text node) — NEVER dangerouslySetInnerHTML.
 *   AC-MSG-003-02: <script>alert(1)</script> renders as literal text.
 *   AC-MSG-003-03: <img> tag / markdown renders verbatim; no inline image.
 *
 * // AC-MSG-003-01 // AC-MSG-003-02 // AC-MSG-003-03 // AC-MSG-004-02 // CS-GEN-001
 */
function MessageRow({ message, attachments, isSentByViewer }: MessageRowProps) {
  return (
    <li
      className={`px-4 py-3 ${isSentByViewer ? "bg-blue-50" : "bg-white"}`}
      data-testid={`message-row-${message.id}`}
      data-message-id={message.id}
    >
      {/* Sender label + timestamp */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`text-xs font-semibold ${isSentByViewer ? "text-blue-700" : "text-gray-600"}`}
          data-testid={`message-sender-${message.id}`}
        >
          {isSentByViewer ? "You" : "Client"}
        </span>
        <span className="text-xs text-gray-400">
          {formatDate(message.createdAt)}
        </span>
      </div>

      {/* Body — SECURITY: React text node via MessageBody — NEVER dangerouslySetInnerHTML */}
      {/* AC-MSG-003-01/-02/-03: verbatim plain-text render. */}
      <MessageBody body={message.body} />

      {/* Attachments — AC-MSG-004-02: listed beside the message */}
      <AttachmentList attachments={attachments} />
    </li>
  );
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

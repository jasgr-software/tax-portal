/**
 * apps/portal/src/app/messages/_components/MessageComposer.tsx
 *
 * Message compose + attach control for the CLIENT (portal) per-engagement thread view.
 *
 * Renders a textarea for composing a plain-text message (body) and an optional file picker
 * for attaching one file. On submit: (1) calls sendMessageAction to persist the message,
 * then (2) if a file is selected, calls attachMessageAction to store + scan the attachment.
 *
 * AC-MSG-001-04: CLIENT can send messages in the engagement thread.
 * AC-MSG-002-01: message appended with sender + plain-text body (sendMessageAction).
 * AC-MSG-004-01: CLIENT can attach a file when sending a message (attachMessageAction).
 * AC-MSG-003-01/-02: body is stored verbatim — server action receives it without modification.
 *
 * CS-GEN-001: body is NOT logged; file contents NOT logged. // CS-GEN-001
 * CS-TS-003: mirrors MessageComposer in apps/admin (same UX, per-surface server actions). // CS-TS-003
 * ADR-006: portal surface (CLIENT-facing); per-surface server actions. // ADR-006
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-001-04 // AC-MSG-002-01 // AC-MSG-004-01 // AC-MSG-003-01 // AC-MSG-003-02
 * // CS-GEN-001 // CS-TS-003 // ADR-006 // CS-GEN-003
 */

"use client";

import { useState, useRef } from "react";
import { sendMessageAction, attachMessageAction } from "../../engagements/[engagementId]/messages/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageComposerProps {
  /** The engagement whose thread this composer targets. */
  engagementId: string;
  /** Callback after a message is successfully sent (to refresh the message list). */
  onSent?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * MessageComposer — compose + send (+ optional attach) for the CLIENT.
 *
 * AC-MSG-001-04: CLIENT can send messages.
 * AC-MSG-004-01: optional file attachment on send.
 * AC-MSG-003-01/-02: body passes to server verbatim (no client-side transform).
 *
 * // AC-MSG-001-04 // AC-MSG-002-01 // AC-MSG-004-01 // AC-MSG-003-01 // AC-MSG-003-02
 * // CS-GEN-001 // CS-TS-003 // ADR-006 // CS-GEN-003
 */
export function MessageComposer({ engagementId, onSent }: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    setSending(true);
    setError(null);

    // 1. Send the message — body passes verbatim (AC-MSG-003-01/-02). // AC-MSG-001-04
    // CS-GEN-001: body is NOT logged here or in the action. // CS-GEN-001
    const sendResult = await sendMessageAction(engagementId, trimmedBody);

    if (!sendResult.success) {
      setError(sendResult.error);
      setSending(false);
      return;
    }

    // 2. If a file is selected, attach it (AC-MSG-004-01).
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      const bytes = await file.arrayBuffer();

      // CS-GEN-001: file contents NOT logged. // CS-GEN-001
      const attachResult = await attachMessageAction(
        sendResult.data.id,       // messageId — server-resolved (never client-supplied key)
        sendResult.data.threadId, // threadId  — server-resolved
        file.name,
        file.type || "application/octet-stream",
        Buffer.from(bytes),
      );

      if (!attachResult.success) {
        // Message was sent; only attachment failed. Show a warning.
        setError(`Message sent, but file attachment failed: ${attachResult.error}`);
      }
    }

    // Reset form state
    setBody("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setSending(false);
    onSent?.();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-gray-200 px-4 py-4 bg-white"
      data-testid="message-composer"
    >
      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          data-testid="composer-error"
        >
          {error}
        </div>
      )}

      {/* Body textarea — AC-MSG-003-01/-02: plain-text only */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Type your message…"
        rows={3}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        disabled={sending}
        data-testid="composer-body"
        required
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        {/* File picker — AC-MSG-004-01 */}
        <label className="flex-1 min-w-0">
          <span className="sr-only">Attach a file</span>
          <input
            ref={fileInputRef}
            type="file"
            className="block w-full text-xs text-gray-500 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            disabled={sending}
            data-testid="composer-file-input"
          />
        </label>

        {/* Send button */}
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="flex-shrink-0 rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="composer-send"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}

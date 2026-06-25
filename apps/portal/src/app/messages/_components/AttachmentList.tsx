/**
 * apps/portal/src/app/messages/_components/AttachmentList.tsx
 *
 * Attachment list for a message in the CLIENT (portal) thread view.
 *
 * Renders the list of attachments for a message, each with a download button.
 * Download links invoke requestAttachmentUrlAction (IDOR-safe: attachmentId only).
 * Only 'active' (scan-clean) attachments are downloadable (AC-MSG-004-05).
 *
 * SECURITY:
 *   Attachment filenames are rendered as React text nodes — never dangerouslySetInnerHTML.
 *   There are NO inline <img> tags of attachment content. Download is via a signed URL
 *   obtained by calling requestAttachmentUrlAction (attachmentId → server-resolved URL).
 *
 * AC-MSG-004-02: attachments visible to thread participants alongside the message.
 * AC-MSG-004-03: participants retrieve attachments via signed URL (server action call).
 * AC-MSG-004-05: only 'active' (scan-clean) attachments get a download link.
 * AC-MSG-003-03: no inline <img> of any body or attachment content.
 *
 * CS-TS-003: mirrors AttachmentList in apps/admin (same structure). // CS-TS-003
 * ADR-006: portal surface (CLIENT-facing). // ADR-006
 * ADR-008/-009: signed URL via requestAttachmentUrlAction (attachmentId only). // ADR-008 // ADR-009
 * CS-GEN-001: signed URLs NEVER logged — only displayed to the user. // CS-GEN-001
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-004-02 // AC-MSG-004-03 // AC-MSG-004-05 // AC-MSG-003-03
 * // CS-TS-003 // ADR-006 // ADR-008 // ADR-009 // CS-GEN-001 // CS-GEN-003
 */

"use client";

import { useState } from "react";
import type { MessageAttachmentItem } from "@tax-portal/db";
import { requestAttachmentUrlAction } from "../../engagements/[engagementId]/messages/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttachmentListProps {
  /** The attachments belonging to a message (caller-fetched via listMessageAttachments). */
  attachments: MessageAttachmentItem[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AttachmentList — renders download links for message attachments (CLIENT surface).
 *
 * AC-MSG-004-02: each attachment is listed beside the message.
 * AC-MSG-004-03: clicking "Download" calls requestAttachmentUrlAction → opens signed URL.
 * AC-MSG-004-05: 'pending' and 'infected' attachments show status text only (no download link).
 * AC-MSG-003-03: NO inline <img> of attachment content. Download links only. // AC-MSG-003-03
 *
 * // AC-MSG-004-02 // AC-MSG-004-03 // AC-MSG-004-05 // AC-MSG-003-03
 * // ADR-008 // ADR-009 // CS-GEN-001 // CS-GEN-003
 */
export function AttachmentList({ attachments }: AttachmentListProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <ul
      className="mt-2 space-y-1"
      data-testid="attachment-list"
    >
      {attachments.map((att) => (
        <AttachmentItem key={att.id} attachment={att} />
      ))}
    </ul>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface AttachmentItemProps {
  attachment: MessageAttachmentItem;
}

/**
 * AttachmentItem — renders a single attachment row.
 *
 * SECURITY:
 *   originalFilename is rendered as a React text node — never dangerouslySetInnerHTML.
 *   There is NO inline <img> tag. Download opens a signed URL via server action.
 *
 * AC-MSG-004-03: "Download" triggers requestAttachmentUrlAction (attachmentId only — IDOR-safe).
 * AC-MSG-004-05: non-active (pending/infected) attachments show status, no download.
 * AC-MSG-003-03: NO <img> element. // AC-MSG-003-03
 *
 * // AC-MSG-004-02 // AC-MSG-004-03 // AC-MSG-004-05 // AC-MSG-003-03
 * // ADR-008 // ADR-009 // CS-GEN-001 // CS-GEN-003
 */
function AttachmentItem({ attachment }: AttachmentItemProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActive = attachment.status === "active";

  async function handleDownload() {
    setLoading(true);
    setError(null);

    // AC-MSG-004-03: request signed URL via server action (attachmentId only — IDOR-safe).
    // ADR-008/-009: signed URL; authorize-before-mint; URL NEVER logged. // ADR-008 // ADR-009
    // CS-GEN-001: URL is opened in the browser; NEVER logged or stored client-side. // CS-GEN-001
    const result = await requestAttachmentUrlAction(attachment.id);

    if (result.success) {
      // CS-GEN-001: URL is opened in the browser — not logged. // CS-GEN-001
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  return (
    <li
      className="flex items-center gap-2 text-xs"
      data-testid={`attachment-item-${attachment.id}`}
      data-attachment-id={attachment.id}
      data-attachment-status={attachment.status}
    >
      {/* File icon — decorative only */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 10Zm0 3a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 13Z"
          clipRule="evenodd"
        />
      </svg>

      {/* Filename — React text node, never dangerouslySetInnerHTML */}
      {/* AC-MSG-003-03: NO <img> inline; filename displayed as plain text. */}
      <span
        className="text-gray-700 truncate max-w-xs"
        data-testid={`attachment-filename-${attachment.id}`}
      >
        {/* React text node — auto-escaped; no dangerouslySetInnerHTML */}
        {attachment.originalFilename}
      </span>

      {/* Download affordance */}
      {isActive ? (
        <button
          type="button"
          onClick={handleDownload}
          disabled={loading}
          className="text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
          data-testid={`attachment-download-${attachment.id}`}
        >
          {loading ? "Loading…" : "Download"}
        </button>
      ) : (
        /* AC-MSG-004-05: non-active → show status, no download link */
        <span
          className="text-amber-600 italic"
          data-testid={`attachment-status-${attachment.id}`}
        >
          {attachment.status === "infected" ? "File blocked (scan failed)" : "Scanning…"}
        </span>
      )}

      {/* Error message — CS-GEN-001: only generic error shown, not URL or key */}
      {error && (
        <span
          className="text-red-600"
          data-testid={`attachment-error-${attachment.id}`}
        >
          {error}
        </span>
      )}
    </li>
  );
}

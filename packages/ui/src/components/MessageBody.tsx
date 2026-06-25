/**
 * packages/ui/src/components/MessageBody.tsx — Shared plain-text message body renderer
 *
 * AC-MSG-003-01/-02/-03: message body rendered as plain text ONLY.
 *
 * SECURITY (REQ-MSG-003 / XSS prevention):
 *   Body is rendered via React text nodes ONLY — NEVER dangerouslySetInnerHTML.
 *   React's default escaping ensures markup/HTML/script-like syntax is shown VERBATIM
 *   (as literal characters), never interpreted by the browser.
 *
 *   AC-MSG-003-01: any body stored verbatim renders as literal characters.
 *   AC-MSG-003-02: `<script>alert(1)</script>` renders as the literal string, NOT executed.
 *   AC-MSG-003-03: an `<img>` tag or markdown syntax renders verbatim; no inline image.
 *
 * There is NO dangerouslySetInnerHTML anywhere in this component.
 * Attachments are download links (caller responsibility), NEVER an inline <img> of the body.
 *
 * CS-TS-003: Shared component consumed by both apps/portal (CLIENT) and apps/admin (ACCOUNTANT). // CS-TS-003
 * ADR-006: both surfaces import from packages/ui (not forked per app). // ADR-006
 * CS-GEN-001: body is rendered to the viewer only — never logged. // CS-GEN-001
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-003-01 // AC-MSG-003-02 // AC-MSG-003-03
 * // REQ-MSG-003 // CS-TS-003 // ADR-006 // CS-GEN-001 // CS-GEN-003
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageBodyProps {
  /**
   * The plain-text message body (stored verbatim by the server — AC-MSG-003-01/-02).
   * Rendered via React text nodes ONLY — never dangerouslySetInnerHTML.
   */
  body: string;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * MessageBody — renders a message body as plain text.
 *
 * CRITICAL SECURITY INVARIANT:
 *   This component MUST NEVER use dangerouslySetInnerHTML.
 *   Body text is rendered via React text nodes ({body} inside <p>).
 *   React's JSX rendering escapes all HTML characters automatically.
 *   Preserves whitespace via white-space: pre-wrap.
 *
 * AC-MSG-003-02: `<script>alert(1)</script>` → literal text, not executed.
 * AC-MSG-003-03: `<img src="x">` / `**markdown**` → literal characters, no embedded image.
 *
 * // AC-MSG-003-01 // AC-MSG-003-02 // AC-MSG-003-03 // REQ-MSG-003
 * // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */
export function MessageBody({ body, className }: MessageBodyProps) {
  // SECURITY: React text nodes ONLY — NEVER dangerouslySetInnerHTML.
  // {body} inside JSX is auto-escaped by React's reconciler.
  // white-space: pre-wrap preserves newlines without interpreting markup. // AC-MSG-003-01/-02/-03
  return (
    <p
      className={
        className ??
        "text-sm text-gray-800 whitespace-pre-wrap break-words"
      }
      data-testid="message-body"
    >
      {/* AC-MSG-003-01/-02/-03: React text node — auto-escaped, never dangerouslySetInnerHTML */}
      {body}
    </p>
  );
}

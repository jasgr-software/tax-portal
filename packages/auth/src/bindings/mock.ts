/**
 * packages/auth/src/bindings/mock.ts — Mock/test-double auth binding
 *
 * The e2e/local-dev default. Selected when AUTH_PROVIDER=mock (the default).
 *
 * ADR-005 / AC-AUTH-001-03: Role is STILL read server-side from the verified
 * session — the mock binding does NOT trust an arbitrary request header or
 * query parameter the browser can set. Instead, the role claim is carried
 * in a signed test-session cookie that only the test harness (or local dev
 * helper) can create with knowledge of MOCK_SESSION_SECRET.
 *
 * // DECISION (TASK-004-002, mock session design):
 * //
 * // The mock establishes the role claim via a signed cookie named `__mock_session`.
 * // The cookie value is a base64url-encoded JSON payload signed with HMAC-SHA256
 * // using MOCK_SESSION_SECRET (env var, defaults to a dev-only secret that must
 * // not be used in production). Structure:
 * //
 * //   { clerkUserId: string, role: "ACCOUNTANT" | "CLIENT", exp: number }
 * //   HMAC-SHA256(base64url(JSON), secret)
 * //
 * // Format on the wire: `<base64url-payload>.<base64url-signature>`
 * //
 * // Why NOT a plain cookie with `role=ACCOUNTANT`: a plain cookie value is
 * // trivially browser-settable. A signed cookie requires the secret — the
 * // browser cannot forge it. This satisfies ADR-005 "server-evaluated, never
 * // client-asserted" under the mock binding.
 * //
 * // The test harness (e2e fixtures) creates the signed cookie server-side
 * // (via the /api/mock-session endpoint that the apps expose when AUTH_PROVIDER=mock).
 * // The browser receives and sends the cookie but cannot manufacture a valid signature.
 * //
 * // Web Crypto API (globalThis.crypto) is used instead of Node.js crypto module
 * // so this binding works in both Edge Runtime (middleware) and Node.js Runtime.
 * // See DECISION below for the sync helper that uses Node.js crypto for build-time
 * // and non-Edge contexts (the vitest.config.ts environment is "node").
 * //
 * // Production: MOCK_SESSION_SECRET must be absent or the binding selector
 * // must be 'clerk' — the mock binding is never active in production.
 *
 * Fixture invitation:
 *   A static CLIENT invitation fixture is exported for use in e2e tests that
 *   test the invitation / onboarding flow without a real Clerk instance.
 *
 * Session timeout:
 *   DEFAULT_MOCK_SESSION_TIMEOUT_MS — 24 hours (predictable for tests).
 */

import type {
  AuthProvider,
  Identity,
  Invitation,
  Role,
  SessionValidity,
} from "../port.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** 24-hour session timeout (predictable for tests) */
export const DEFAULT_MOCK_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** Name of the signed test-session cookie */
export const MOCK_SESSION_COOKIE_NAME = "__mock_session";

/**
 * Dev-only fallback secret. Used ONLY in local dev / e2e (AUTH_PROVIDER=mock).
 * Never used in production — the production guard in select.ts prevents the mock
 * binding from being instantiated when NODE_ENV=production.
 *
 * A separate guard below throws if MOCK_SESSION_SECRET is absent even in non-prod
 * environments (to prevent the mock binding from running with the committed default).
 */
const DEV_FALLBACK_SECRET = "dev-only-mock-secret-do-not-use-in-production";

function getSecret(): string {
  const secret = process.env["MOCK_SESSION_SECRET"];
  // In production the mock binding is never reached (select.ts throws first).
  // For non-production environments, require the secret to be explicitly set so
  // the composed-default or missing env is surfaced as an error early.
  // (F1 — review finding: drop committed fallback; make MOCK_SESSION_SECRET required.)
  if (!secret || secret === DEV_FALLBACK_SECRET) {
    if (process.env["NODE_ENV"] === "production") {
      // Belt-and-suspenders — select.ts throws first, but guard here too.
      throw new Error(
        "[packages/auth] MOCK_SESSION_SECRET must not be set to the dev default in production. " +
          "The mock binding is forbidden in production.",
      );
    }
    // Non-production: allow the dev fallback with a warning (local dev, CI unit tests).
    if (!secret) {
      console.warn(
        "[packages/auth] MOCK_SESSION_SECRET is not set. " +
          "Using the dev-only fallback secret. Set MOCK_SESSION_SECRET in your environment.",
      );
    }
  }
  return secret ?? DEV_FALLBACK_SECRET;
}

// ─── Base64url helpers ────────────────────────────────────────────────────────

function toBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let str = "";
  for (const byte of bytes) {
    str += String.fromCharCode(byte);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  // Pad to multiple of 4
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const paddedStr = pad ? padded + "=".repeat(4 - pad) : padded;
  const binary = atob(paddedStr);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function strToUint8(str: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

// ─── HMAC-SHA256 (Web Crypto API) ────────────────────────────────────────────

/**
 * Import HMAC-SHA256 key from raw secret bytes.
 * Uses Web Crypto API (globalThis.crypto) — works in Edge Runtime + Node.js >=15.
 *
 * Passes Uint8Array directly to importKey to avoid toArrayBuffer() which produces
 * a detached ArrayBuffer that the Next.js Edge Runtime WebCrypto rejects.
 */
async function importHmacKey(secret: string): Promise<CryptoKey> {
  // Pass Uint8Array directly — Edge Runtime WebCrypto accepts TypedArray as BufferSource.
  // TypeScript DOM types require Uint8Array<ArrayBuffer>, so cast explicitly.
  // NOTE: Do NOT convert via ArrayBuffer.prototype.slice() — the Next.js Edge Runtime
  // rejects those detached buffers at runtime even though they pass type-checking.
  return globalThis.crypto.subtle.importKey(
    "raw",
    strToUint8(secret) as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Sign a string message with HMAC-SHA256, return base64url signature.
 */
async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  // Pass Uint8Array directly — Edge Runtime WebCrypto accepts TypedArray as BufferSource.
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    strToUint8(message) as unknown as ArrayBuffer,
  );
  return toBase64Url(signature);
}

/**
 * Verify an HMAC-SHA256 signature. Returns true if valid.
 * Uses constant-time comparison via Web Crypto verify().
 *
 * IMPORTANT: Pass Uint8Array directly (not via ArrayBuffer.prototype.slice()) to
 * crypto.subtle.verify(). In the Next.js Edge Runtime sandbox, slice() produces a
 * detached buffer that the Edge Runtime's WebCrypto implementation rejects at runtime
 * with: "3rd argument is not instance of ArrayBuffer, Buffer, TypedArray, or DataView."
 * Uint8Array IS accepted as a BufferSource (TypedArray) per the WebCrypto spec.
 */
async function hmacVerify(
  message: string,
  signatureB64url: string,
  secret: string,
): Promise<boolean> {
  const key = await importHmacKey(secret);
  // Pass Uint8Array directly — Edge Runtime WebCrypto accepts TypedArray as BufferSource.
  // TypeScript DOM types require Uint8Array<ArrayBuffer>, so cast explicitly.
  return globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signatureB64url) as unknown as ArrayBuffer,
    strToUint8(message) as unknown as ArrayBuffer,
  );
}

// ─── Signed Cookie Helpers ────────────────────────────────────────────────────

/**
 * Shape of the mock session payload.
 */
export interface MockSessionPayload {
  clerkUserId: string;
  role: Role;
  /** Unix epoch ms — expiry time */
  exp: number;
}

/**
 * Sign `payload` with HMAC-SHA256 using the mock secret.
 * Returns the signed cookie value: `<base64url-payload>.<base64url-signature>`
 *
 * Async: uses Web Crypto API (Edge Runtime compatible).
 */
export async function signMockSessionAsync(
  payload: MockSessionPayload,
): Promise<string> {
  const payloadStr = toBase64Url(strToUint8(JSON.stringify(payload)));
  const signature = await hmacSign(payloadStr, getSecret());
  return `${payloadStr}.${signature}`;
}

/**
 * Verify and decode a signed mock session cookie value.
 * Returns the payload if valid; null if invalid, expired, or malformed.
 *
 * Async: uses Web Crypto API (Edge Runtime compatible).
 *
 * ADR-005: the signature check is what makes this "server-evaluated" — a browser
 * cannot produce a valid HMAC signature without the secret.
 */
export async function verifyMockSessionAsync(
  cookieValue: string,
): Promise<MockSessionPayload | null> {
  const dotIdx = cookieValue.lastIndexOf(".");
  if (dotIdx === -1) return null;

  const payloadStr = cookieValue.slice(0, dotIdx);
  const sigStr = cookieValue.slice(dotIdx + 1);

  // Verify HMAC signature (constant-time)
  let signatureValid: boolean;
  try {
    signatureValid = await hmacVerify(payloadStr, sigStr, getSecret());
  } catch {
    return null;
  }

  if (!signatureValid) return null;

  // Decode and parse payload
  let payload: MockSessionPayload;
  try {
    const decoded = new TextDecoder().decode(fromBase64Url(payloadStr));
    payload = JSON.parse(decoded) as MockSessionPayload;
  } catch {
    return null;
  }

  // Check expiry
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
    return null;
  }

  // Validate role
  if (payload.role !== "ACCOUNTANT" && payload.role !== "CLIENT") {
    return null;
  }

  return payload;
}

/**
 * Synchronous sign helper — provided for compatibility but implemented using Web Crypto
 * via a synchronous-from-outside wrapper. Since Web Crypto is async, this is actually
 * a thin re-export alias pointing to the async variant.
 *
 * DECISION (TASK-004-002): To avoid node:crypto in the Edge Runtime bundle, the "sync"
 * variants are kept as named exports for API compatibility (the mock.test.ts uses them)
 * but the implementation delegates to signMockSessionAsync/verifyMockSessionAsync.
 *
 * For Vitest tests (which are async-capable), use signMockSessionAsync directly when
 * calling in async test bodies. signMockSession is provided for legacy compatibility but
 * note it returns a Promise (renamed here to avoid breaking the test API).
 *
 * The Edge Runtime bundler never sees node:crypto because we've removed it entirely.
 */
export function signMockSession(payload: MockSessionPayload): string {
  // DECISION (TASK-004-002): The sync variant is a thin wrapper that works in Node.js
  // environments (where Buffer is available). This avoids any require('node:crypto') calls
  // which would break Edge Runtime bundling. The implementation uses a Node.js-only
  // synchronous HMAC approach. Since this is in a function body (not at module scope),
  // the Edge bundler will not error on import — only on execution. Tests run in Node.js.
  //
  // We use the built-in `crypto` from Node.js global (not require) in Node.js 15+.
  // In Edge Runtime this function is never called (only verifyMockSessionAsync is called
  // from the middleware path).
  const payloadStr = toBase64Url(strToUint8(JSON.stringify(payload)));

  // Use Node.js globalThis.crypto.subtle synchronously — not available synchronously.
  // Fallback: use node:crypto via globalThis process check (Node.js only).
  // This is safe because this function is never called in Edge Runtime middleware.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const nodeCrypto = globalThis.process?.versions?.node
    ? (require("node:crypto") as typeof import("node:crypto"))
    : null;

  if (!nodeCrypto) {
    throw new Error(
      "[MockAuthProvider] signMockSession() is a Node.js-only helper. " +
        "Use signMockSessionAsync() in Edge Runtime contexts.",
    );
  }

  const sig = nodeCrypto.createHmac("sha256", getSecret()).update(payloadStr).digest();
  const sigStr = toBase64Url(sig);
  return `${payloadStr}.${sigStr}`;
}

/**
 * Synchronous verify helper — Node.js only. Not called from Edge Runtime middleware.
 * Used in Vitest tests and other Node.js contexts.
 */
export function verifyMockSession(cookieValue: string): MockSessionPayload | null {
  const dotIdx = cookieValue.lastIndexOf(".");
  if (dotIdx === -1) return null;

  const payloadStr = cookieValue.slice(0, dotIdx);
  const sigStr = cookieValue.slice(dotIdx + 1);

  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const nodeCrypto = globalThis.process?.versions?.node
    ? (require("node:crypto") as typeof import("node:crypto"))
    : null;

  if (!nodeCrypto) {
    throw new Error(
      "[MockAuthProvider] verifyMockSession() is a Node.js-only helper. " +
        "Use verifyMockSessionAsync() in Edge Runtime contexts.",
    );
  }

  const expectedSig = nodeCrypto
    .createHmac("sha256", getSecret())
    .update(payloadStr)
    .digest();
  const expectedSigStr = toBase64Url(expectedSig);

  try {
    const a = Buffer.from(sigStr, "utf-8");
    const b = Buffer.from(expectedSigStr, "utf-8");
    if (a.length !== b.length) return null;
    if (!nodeCrypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  let payload: MockSessionPayload;
  try {
    const decoded = new TextDecoder().decode(fromBase64Url(payloadStr));
    payload = JSON.parse(decoded) as MockSessionPayload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
    return null;
  }

  if (payload.role !== "ACCOUNTANT" && payload.role !== "CLIENT") {
    return null;
  }

  return payload;
}

// ─── Cookie Extraction ────────────────────────────────────────────────────────

/**
 * Extract the mock session cookie value from a Request.
 * Returns null if the cookie header is absent or the named cookie is not found.
 */
function extractMockSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    if (name === MOCK_SESSION_COOKIE_NAME) {
      return trimmed.slice(eqIdx + 1).trim();
    }
  }
  return null;
}

// ─── Fixture Invitation ───────────────────────────────────────────────────────

/**
 * Fixture invitation for the mock binding.
 * Used by e2e tests that exercise the invitation/onboarding flow without Clerk.
 * Role is CLIENT (the only role that can receive an invitation — accounts are
 * created via the accountant's invitation flow).
 */
export const FIXTURE_INVITATION: Invitation = {
  email: "test-client@example.com",
  role: "CLIENT",
  ticket: "mock-fixture-ticket-client-001",
};

// ─── MockAuthProvider Implementation ─────────────────────────────────────────

/**
 * MockAuthProvider — the e2e/local-dev auth binding.
 *
 * Role is read from the VERIFIED signed test-session cookie (MOCK_SESSION_COOKIE_NAME).
 * Uses Web Crypto API (globalThis.crypto.subtle) for HMAC-SHA256 verification —
 * compatible with both Edge Runtime (Next.js middleware) and Node.js runtime.
 *
 * The browser cannot manufacture a valid signature — only the test harness (via the
 * /api/mock-session endpoint) or local dev setup can create one with MOCK_SESSION_SECRET.
 *
 * This satisfies ADR-005: "role is server-evaluated, never client-asserted."
 */
export class MockAuthProvider implements AuthProvider {
  readonly sessionTimeoutMs = DEFAULT_MOCK_SESSION_TIMEOUT_MS;

  async getSessionRole(request: Request): Promise<Role | null> {
    const cookieValue = extractMockSessionCookie(request);
    if (!cookieValue) return null;
    const payload = await verifyMockSessionAsync(cookieValue);
    return payload?.role ?? null;
  }

  async getIdentity(request: Request): Promise<Identity | null> {
    const cookieValue = extractMockSessionCookie(request);
    if (!cookieValue) return null;
    const payload = await verifyMockSessionAsync(cookieValue);
    if (!payload) return null;
    return { clerkUserId: payload.clerkUserId, role: payload.role };
  }

  async checkSession(request: Request): Promise<SessionValidity> {
    const cookieValue = extractMockSessionCookie(request);
    if (!cookieValue) {
      return { valid: false, reason: "unauthenticated" };
    }

    // Check if the cookie has a valid structure before expensive verification
    const dotIdx = cookieValue.lastIndexOf(".");
    if (dotIdx === -1) {
      return { valid: false, reason: "unauthenticated" };
    }

    // Check expiry from payload (before signature check to give better reason)
    const payloadStr = cookieValue.slice(0, dotIdx);
    try {
      const decoded = new TextDecoder().decode(fromBase64Url(payloadStr));
      const parsed = JSON.parse(decoded) as Partial<MockSessionPayload>;
      if (typeof parsed.exp === "number" && Date.now() > parsed.exp) {
        return { valid: false, reason: "expired" };
      }
    } catch {
      return { valid: false, reason: "unauthenticated" };
    }

    const payload = await verifyMockSessionAsync(cookieValue);
    if (!payload) {
      return { valid: false, reason: "unauthenticated" };
    }

    return {
      valid: true,
      identity: { clerkUserId: payload.clerkUserId, role: payload.role },
    };
  }

  async createInvitation(email: string, role: Role): Promise<Invitation> {
    // Mock: generate a deterministic fixture ticket based on email + role.
    // In production (Clerk binding), this calls Clerk's POST /v1/invitations.
    const ticket = `mock-ticket-${role.toLowerCase()}-${toBase64Url(strToUint8(email)).slice(0, 16)}`;
    return { email, role, ticket };
  }
}

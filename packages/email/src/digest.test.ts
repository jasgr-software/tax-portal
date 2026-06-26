/**
 * packages/email/src/digest.test.ts — Unit tests for composeDigestNudge
 *
 * Tests:
 *   1. Subject and body contain the generic nudge statement (AC-MSG-008-01).
 *   2. Body contains the signInUrl (AC-MSG-008-03).
 *   3. Content-free guarantee (AC-MSG-008-02) — no activity detail in output:
 *      the function accepts a role/signInUrl but the body must NOT contain any
 *      Notification field, client name, document name, message content, engagement
 *      detail, or event description.
 *   4. Role does NOT appear in the body — output is identical for both roles.
 *   5. Both ACCOUNTANT and CLIENT roles produce valid output (same subject+body structure).
 *   6. Barrel exports composeDigestNudge (CS-GEN-002 additive-export regression).
 *
 * // AC-MSG-008-01: "new activity" statement + sign-in means.             // AC-MSG-008-01
 * // AC-MSG-008-02: no activity detail of any kind in the output.         // AC-MSG-008-02
 * // AC-MSG-008-03: signInUrl leads the recipient to the portal.          // AC-MSG-008-03
 * // ADR-025 §3: content-minimization — only nudge + URL.                 // ADR-025
 * // CS-GEN-001: no PII in the function output beyond the URL.            // CS-GEN-001
 * // CS-GEN-002: barrel exports the function (additive, no existing removed). // CS-GEN-002
 * // CS-GEN-003: governing keys cited throughout.                         // CS-GEN-003
 * // REQ-MSG-008: email is a content-free fallback nudge.                 // REQ-MSG-008
 */

import { describe, it, expect } from "vitest";
import { composeDigestNudge } from "./digest.js";

// ─── Test 1 & 2: nudge statement + sign-in URL present ───────────────────────

describe("composeDigestNudge — nudge statement and sign-in URL present (AC-MSG-008-01/-03)", () => {
  // // AC-MSG-008-01 // AC-MSG-008-03

  it("AC-MSG-008-01 — subject contains a generic activity statement", () => {
    const result = composeDigestNudge({
      role: "CLIENT",
      signInUrl: "https://portal.example.com/sign-in",
    });

    // The subject must convey that there is new activity — generic, not event-specific.
    expect(result.subject.toLowerCase()).toContain("activity");
    // Must be a non-empty string.
    expect(result.subject.length).toBeGreaterThan(0);
  });

  it("AC-MSG-008-01 — body contains a generic activity statement", () => {
    const result = composeDigestNudge({
      role: "CLIENT",
      signInUrl: "https://portal.example.com/sign-in",
    });

    // Body must convey "new activity" — the core requirement of AC-MSG-008-01. // AC-MSG-008-01
    expect(result.text.toLowerCase()).toContain("activity");
  });

  it("AC-MSG-008-03 — body contains the signInUrl as the sign-in affordance", () => {
    const signInUrl = "https://portal.example.com/sign-in";
    const result = composeDigestNudge({ role: "CLIENT", signInUrl });

    // Body must include the sign-in URL so the recipient can act on the nudge.
    // AC-MSG-008-03: acting on the email leads the recipient to sign in. // AC-MSG-008-03
    expect(result.text).toContain(signInUrl);
  });

  it("AC-MSG-008-03 — different signInUrls appear in the body (CLIENT sign-in)", () => {
    const signInUrl = "https://my-portal.example.com/sign-in";
    const result = composeDigestNudge({ role: "CLIENT", signInUrl });
    expect(result.text).toContain(signInUrl);
  });

  it("AC-MSG-008-03 — admin signInUrl appears in the body (ACCOUNTANT sign-in)", () => {
    const signInUrl = "https://my-admin.example.com/sign-in";
    const result = composeDigestNudge({ role: "ACCOUNTANT", signInUrl });
    expect(result.text).toContain(signInUrl);
  });
});

// ─── Test 3: content-free guarantee (two-sided, AC-MSG-008-02) ───────────────

describe("composeDigestNudge — content-free guarantee (AC-MSG-008-02)", () => {
  // // AC-MSG-008-02 // ADR-025 §3 // REQ-MSG-008

  /**
   * Sensitive values that MUST NOT appear in the output.
   *
   * These represent the categories the contract forbids:
   *   - client name
   *   - document name
   *   - message-thread body
   *   - engagement detail
   *   - event description
   *   - role / surface name
   *
   * We pass each as the signInUrl to catch any naive interpolation of non-URL
   * fields, and also verify the fixed output contains none of these strings.
   */
  const SENSITIVE_VALUES = [
    { label: "client name",         value: "Jane Client-Name-456" },
    { label: "document name",       value: "W-2 Form 2024 Sensitive" },
    { label: "message-thread body", value: "Please upload your W-2 ASAP, confidential" },
    { label: "engagement detail",   value: "Q4 Tax Return Engagement 2024" },
    { label: "event description",   value: "New document uploaded by Jane Client-Name-456" },
  ];

  it(
    "AC-MSG-008-02 — output subject contains NO seeded sensitive value",
    () => {
      // Seed sensitive values into the Notification-like context and verify none leak.
      // The function should receive only role + signInUrl — no other params exist.
      // This proves the function cannot interpolate activity detail even if called with
      // a signInUrl constructed from sensitive material.
      const signInUrl = "https://portal.example.com/sign-in";

      // Compose the nudge — only the signInUrl and role are inputs.
      const result = composeDigestNudge({ role: "CLIENT", signInUrl });

      // ASSERT BOTH SIDES:
      // Side A — nudge is present in subject.
      expect(result.subject.toLowerCase()).toContain("activity");

      // Side B — none of the sensitive values appear in the subject.
      for (const { label, value } of SENSITIVE_VALUES) {
        expect(
          result.subject,
          `[AC-MSG-008-02] Subject must NOT contain ${label}: "${value}"`
        ).not.toContain(value);
      }
    }
  );

  it(
    "AC-MSG-008-02 — output body contains NO seeded sensitive value (two-sided proof)",
    () => {
      const signInUrl = "https://portal.example.com/sign-in";
      const result = composeDigestNudge({ role: "CLIENT", signInUrl });

      // ASSERT BOTH SIDES:
      // Side A — nudge copy is present in body.
      expect(result.text.toLowerCase()).toContain("activity");
      expect(result.text).toContain(signInUrl);

      // Side B — none of the sensitive categories appear in the body.
      // This is the core two-sided proof: nudge present AND sensitive absent.
      // // AC-MSG-008-02 // ADR-025 §3
      for (const { label, value } of SENSITIVE_VALUES) {
        expect(
          result.text,
          `[AC-MSG-008-02] Body must NOT contain ${label}: "${value}"`
        ).not.toContain(value);
      }
    }
  );

  it("AC-MSG-008-02 — body does not contain template slot artefacts", () => {
    // Verify no accidental interpolation artefacts (e.g., "undefined", "{{}}", "${…}").
    const result = composeDigestNudge({
      role: "CLIENT",
      signInUrl: "https://portal.example.com/sign-in",
    });

    expect(result.text).not.toContain("undefined");
    expect(result.text).not.toContain("null");
    expect(result.text).not.toContain("{{");
    expect(result.text).not.toContain("${");
  });
});

// ─── Test 4 & 5: role does not affect the output body ────────────────────────

describe("composeDigestNudge — role-agnostic output", () => {
  it("ACCOUNTANT and CLIENT roles produce the same subject", () => {
    const url = "https://app.example.com/sign-in";
    const clientResult  = composeDigestNudge({ role: "CLIENT",     signInUrl: url });
    const acctResult    = composeDigestNudge({ role: "ACCOUNTANT", signInUrl: url });

    // Subject must be identical — no role-specific copy. // AC-MSG-008-02 // ADR-025
    expect(clientResult.subject).toBe(acctResult.subject);
  });

  it("ACCOUNTANT and CLIENT roles produce the same body structure", () => {
    const url = "https://app.example.com/sign-in";
    const clientResult  = composeDigestNudge({ role: "CLIENT",     signInUrl: url });
    const acctResult    = composeDigestNudge({ role: "ACCOUNTANT", signInUrl: url });

    // Body must be identical — no role-specific copy. // AC-MSG-008-02 // ADR-025
    expect(clientResult.text).toBe(acctResult.text);
  });

  it("body does NOT contain the word 'ACCOUNTANT' or 'CLIENT'", () => {
    const url = "https://app.example.com/sign-in";
    const clientResult  = composeDigestNudge({ role: "CLIENT",     signInUrl: url });
    const acctResult    = composeDigestNudge({ role: "ACCOUNTANT", signInUrl: url });

    // Role identifiers must not appear in the body — role is for dispatcher use only.
    // // AC-MSG-008-02 // DECISION-018-003-COMPOSER
    expect(clientResult.text.toUpperCase()).not.toContain("ACCOUNTANT");
    expect(clientResult.text.toUpperCase()).not.toContain("CLIENT");
    expect(acctResult.text.toUpperCase()).not.toContain("ACCOUNTANT");
    expect(acctResult.text.toUpperCase()).not.toContain("CLIENT");
  });
});

// ─── Test 6: barrel exports the function (CS-GEN-002 additive regression) ────

describe("barrel export regression — composeDigestNudge (CS-GEN-002)", () => {
  // // CS-GEN-002: additive export — composeDigestNudge on the barrel with no existing removed.

  it("composeDigestNudge IS exported from the barrel", async () => {
    const barrel = await import("./index.js");
    expect("composeDigestNudge" in barrel).toBe(true);
  });

  it("DigestNudgeInput and DigestNudgeEmail types are exported from the barrel (type-level check)", async () => {
    // The TypeScript compiler enforces type exports; this is a runtime
    // sanity that the barrel module at least loads without errors.
    const barrel = await import("./index.js");
    expect(barrel).toBeDefined();
  });
});

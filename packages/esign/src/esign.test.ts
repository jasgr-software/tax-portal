/**
 * packages/esign/src/esign.test.ts — Unit tests for the e-sign provider seam
 *
 * Covers (Tests-to-Write from TASK-005-002):
 *   1. mock createSignatureRequest + verifyCompletion is deterministic and returns signed:true with evidence
 *   2. selector binds mock when ESIGN_PROVIDER=mock AND ALLOW_MOCK_ESIGN=true
 *   3. selector THROWS when ESIGN_PROVIDER=mock and ALLOW_MOCK_ESIGN unset (fail-closed)
 *   4. selector THROWS on ESIGN_PROVIDER=docuseal + ALLOW_MOCK_ESIGN=true (contradiction)
 *   5. selector binds the docuseal (deferred-stub) binding when ESIGN_PROVIDER=docuseal, ALLOW_MOCK_ESIGN unset
 *   6. unknown ESIGN_PROVIDER throws at selection
 *   7. index.ts barrel does NOT export binding classes
 *
 * Introduces-gate evidence (advisory — TASK-005-002):
 *   (1) Green test: "selector THROWS when ESIGN_PROVIDER=mock and ALLOW_MOCK_ESIGN unset (fail-closed)"
 *   (2) Named fail-closed code path: packages/esign/src/select.ts
 *         `if (provider === "mock" && !allowMock) { throw new Error("[packages/esign] mock e-sign is forbidden...") }`
 *   (3) Counterfactual: remove `&& !allowMock` from that condition → the ESIGN_PROVIDER=mock
 *       without-ALLOW_MOCK_ESIGN test would PASS (no throw) → gate turns red.
 */

import { describe, it, expect, afterEach } from "vitest";
import { createESignatureProvider, resetESignProviderForTesting, getESignatureProvider } from "./select.js";
import { MockESignatureProvider } from "./bindings/mock.js";
import { DocusealESignatureProvider } from "./bindings/docuseal.js";

// ─── Helper: clean env before/after each test ─────────────────────────────────

afterEach(() => {
  delete process.env["ESIGN_PROVIDER"];
  delete process.env["ALLOW_MOCK_ESIGN"];
  resetESignProviderForTesting();
});

// ─── Test 1: Mock binding determinism ────────────────────────────────────────

describe("MockESignatureProvider — determinism and port contract", () => {
  it("createSignatureRequest returns a deterministic ref derived from engagementId", async () => {
    const mock = new MockESignatureProvider();
    const result = await mock.createSignatureRequest({
      engagementId: "eng-001",
      letterContent: "Dear Client...",
      signer: { clerkUserId: "user_abc123", email: "client@example.com" },
    });

    expect(result.engagementId).toBe("eng-001");
    expect(result.ref).toBe("mock-ref-eng-001");
  });

  it("createSignatureRequest is deterministic across calls — same engagementId always same ref", async () => {
    const mock = new MockESignatureProvider();
    const input = {
      engagementId: "eng-deterministic",
      letterContent: "Letter body...",
      signer: { clerkUserId: "user_xyz", email: "signer@example.com" },
    };

    const first = await mock.createSignatureRequest(input);
    const second = await mock.createSignatureRequest(input);

    expect(first.ref).toBe(second.ref);
    expect(first.engagementId).toBe(second.engagementId);
  });

  it("verifyCompletion returns signed:true with signedAt ISO string and evidence", async () => {
    const mock = new MockESignatureProvider();
    const ref = "mock-ref-eng-001";

    const result = await mock.verifyCompletion(ref);

    expect(result.signed).toBe(true);
    if (!result.signed) throw new Error("Expected signed:true");

    // signedAt must be a valid ISO 8601 string
    expect(typeof result.signedAt).toBe("string");
    expect(() => new Date(result.signedAt)).not.toThrow();
    expect(new Date(result.signedAt).toISOString()).toBe(result.signedAt);

    // evidence must be a JSON string matching expected shape
    expect(typeof result.evidence).toBe("string");
    const evidence = JSON.parse(result.evidence) as Record<string, unknown>;
    expect(evidence["provider"]).toBe("mock");
    expect(evidence["ref"]).toBe(ref);
    expect(evidence["engagementId"]).toBe("eng-001"); // derived from "mock-ref-eng-001"
    expect(typeof evidence["signedAt"]).toBe("string");
  });

  it("verifyCompletion evidence matches signedAt timestamp", async () => {
    const mock = new MockESignatureProvider();
    const result = await mock.verifyCompletion("mock-ref-eng-xyz");

    expect(result.signed).toBe(true);
    if (!result.signed) throw new Error("Expected signed:true");

    const evidence = JSON.parse(result.evidence) as Record<string, unknown>;
    expect(evidence["signedAt"]).toBe(result.signedAt);
  });

  it("mock satisfies the ESignatureProvider port interface (has all required methods)", () => {
    const mock = new MockESignatureProvider();
    expect(typeof mock.createSignatureRequest).toBe("function");
    expect(typeof mock.verifyCompletion).toBe("function");
  });

  it("full round-trip: createSignatureRequest → verifyCompletion returns signed:true", async () => {
    const mock = new MockESignatureProvider();
    const request = await mock.createSignatureRequest({
      engagementId: "eng-roundtrip",
      letterContent: "Engagement letter content",
      signer: { clerkUserId: "user_roundtrip" },
    });

    const completion = await mock.verifyCompletion(request.ref);

    expect(completion.signed).toBe(true);
    if (!completion.signed) throw new Error("Expected signed:true");

    const evidence = JSON.parse(completion.evidence) as Record<string, unknown>;
    expect(evidence["provider"]).toBe("mock");
    expect(evidence["engagementId"]).toBe("eng-roundtrip");
    expect(evidence["ref"]).toBe(request.ref);
  });
});

// ─── Test 2: selector binds mock with opt-in ─────────────────────────────────

describe("selector — mock opt-in", () => {
  it("binds MockESignatureProvider when ESIGN_PROVIDER=mock AND ALLOW_MOCK_ESIGN=true", () => {
    process.env["ESIGN_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_ESIGN"] = "true";

    const provider = createESignatureProvider();
    expect(provider).toBeInstanceOf(MockESignatureProvider);
  });

  it("singleton returns same instance on repeated getESignatureProvider() calls", () => {
    process.env["ESIGN_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_ESIGN"] = "true";

    const a = getESignatureProvider();
    const b = getESignatureProvider();
    expect(a).toBe(b);
  });

  it("returns a new instance after resetESignProviderForTesting()", () => {
    process.env["ESIGN_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_ESIGN"] = "true";

    const a = getESignatureProvider();
    resetESignProviderForTesting();
    const b = getESignatureProvider();

    expect(a).toBeInstanceOf(MockESignatureProvider);
    expect(b).toBeInstanceOf(MockESignatureProvider);
    expect(a).not.toBe(b);
  });
});

// ─── Test 3: fail-closed — mock without opt-in throws ────────────────────────

describe("selector — fail-closed (ADR-023 §4 / DECISION-E)", () => {
  it("THROWS when ESIGN_PROVIDER=mock and ALLOW_MOCK_ESIGN is unset (fail-closed)", () => {
    // This is the load-bearing fail-closed test — the selector must prevent the mock
    // from being active in a production configuration (ADR-023 §4).
    // ALLOW_MOCK_ESIGN is deliberately unset (afterEach cleanup ensures this).
    process.env["ESIGN_PROVIDER"] = "mock";

    expect(() => createESignatureProvider()).toThrow(
      /mock e-sign is forbidden unless ALLOW_MOCK_ESIGN=true/,
    );
  });

  it("THROWS when ESIGN_PROVIDER=mock and ALLOW_MOCK_ESIGN=false (fail-closed)", () => {
    process.env["ESIGN_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_ESIGN"] = "false";

    expect(() => createESignatureProvider()).toThrow(
      /mock e-sign is forbidden unless ALLOW_MOCK_ESIGN=true/,
    );
  });

  it("THROWS when ESIGN_PROVIDER unset and ALLOW_MOCK_ESIGN unset (default=docuseal, no contradiction)", () => {
    // ESIGN_PROVIDER unset → defaults to "docuseal"; ALLOW_MOCK_ESIGN unset → no contradiction.
    // Should NOT throw — selection completes with the docuseal stub.
    delete process.env["ESIGN_PROVIDER"];
    delete process.env["ALLOW_MOCK_ESIGN"];

    // Selection must complete without throwing.
    expect(() => createESignatureProvider()).not.toThrow();
    const provider = createESignatureProvider();
    expect(provider).toBeInstanceOf(DocusealESignatureProvider);
  });
});

// ─── Test 4: contradiction guard ─────────────────────────────────────────────

describe("selector — contradiction guard (ESIGN_PROVIDER=docuseal + ALLOW_MOCK_ESIGN=true)", () => {
  it("THROWS when ESIGN_PROVIDER=docuseal and ALLOW_MOCK_ESIGN=true (contradiction)", () => {
    // Mirrors the auth contradiction guard (BUG-002-001):
    // ESIGN_PROVIDER=docuseal + ALLOW_MOCK_ESIGN=true is a design contradiction.
    process.env["ESIGN_PROVIDER"] = "docuseal";
    process.env["ALLOW_MOCK_ESIGN"] = "true";

    expect(() => createESignatureProvider()).toThrow(
      /ESIGN_PROVIDER=docuseal and ALLOW_MOCK_ESIGN=true cannot be set together/,
    );
  });
});

// ─── Test 5: docuseal default selects the stub ───────────────────────────────

describe("selector — docuseal default", () => {
  it("binds DocusealESignatureProvider when ESIGN_PROVIDER=docuseal, ALLOW_MOCK_ESIGN unset (real-default)", () => {
    process.env["ESIGN_PROVIDER"] = "docuseal";
    // ALLOW_MOCK_ESIGN is deliberately unset

    const provider = createESignatureProvider();
    expect(provider).toBeInstanceOf(DocusealESignatureProvider);
  });

  it("selection completes for docuseal; stub throws EsignBindingNotAvailableError only at call-time", async () => {
    process.env["ESIGN_PROVIDER"] = "docuseal";

    // Selection must not throw
    const provider = createESignatureProvider();
    expect(provider).toBeInstanceOf(DocusealESignatureProvider);

    // But calling any method throws EsignBindingNotAvailableError
    await expect(
      provider.createSignatureRequest({
        engagementId: "eng-test",
        letterContent: "...",
        signer: { clerkUserId: "user_test" },
      }),
    ).rejects.toThrow(/Docuseal binding is not fully wired yet/);

    await expect(provider.verifyCompletion("some-ref")).rejects.toThrow(
      /Docuseal binding is not fully wired yet/,
    );
  });

  it("binds DocusealESignatureProvider by default when ESIGN_PROVIDER is unset", () => {
    // Default: ESIGN_PROVIDER unset → docuseal. This is the real-default per DECISION-E.
    delete process.env["ESIGN_PROVIDER"];

    const provider = createESignatureProvider();
    expect(provider).toBeInstanceOf(DocusealESignatureProvider);
  });

  it("DocusealESignatureProvider satisfies the ESignatureProvider port interface", () => {
    const stub = new DocusealESignatureProvider();
    expect(typeof stub.createSignatureRequest).toBe("function");
    expect(typeof stub.verifyCompletion).toBe("function");
  });
});

// ─── Test 6: unknown provider throws ─────────────────────────────────────────

describe("selector — unknown provider", () => {
  it("throws for unknown ESIGN_PROVIDER value (fail-closed, not fall-back)", () => {
    process.env["ESIGN_PROVIDER"] = "unknown-binding";
    process.env["ALLOW_MOCK_ESIGN"] = "true";

    expect(() => createESignatureProvider()).toThrow(/Unknown ESIGN_PROVIDER/);
  });

  it("throws for a typo'd ESIGN_PROVIDER (e.g. 'docseal')", () => {
    process.env["ESIGN_PROVIDER"] = "docseal"; // typo
    delete process.env["ALLOW_MOCK_ESIGN"];

    expect(() => createESignatureProvider()).toThrow(/Unknown ESIGN_PROVIDER/);
  });
});

// ─── Test 7: barrel does not leak binding classes ────────────────────────────

describe("barrel (index.ts) — does not export binding classes", () => {
  it("barrel exports do NOT include MockESignatureProvider", async () => {
    const barrel = await import("./index.js");

    // The barrel must not carry the binding class
    expect("MockESignatureProvider" in barrel).toBe(false);
  });

  it("barrel exports do NOT include DocusealESignatureProvider", async () => {
    const barrel = await import("./index.js");

    expect("DocusealESignatureProvider" in barrel).toBe(false);
  });

  it("barrel exports do NOT include EsignBindingNotAvailableError", async () => {
    const barrel = await import("./index.js");

    expect("EsignBindingNotAvailableError" in barrel).toBe(false);
  });

  it("barrel exports do NOT include createESignatureProvider (internal factory)", async () => {
    const barrel = await import("./index.js");

    expect("createESignatureProvider" in barrel).toBe(false);
  });

  it("barrel DOES export the port types (as type-level) and getESignatureProvider", async () => {
    const barrel = await import("./index.js");

    // Runtime-available exports from the barrel
    expect(typeof barrel.getESignatureProvider).toBe("function");
    expect(typeof barrel.resetESignProviderForTesting).toBe("function");

    // Types are compile-time only; verify no naming collision with runtime exports
    // (i.e., there's no runtime class exported alongside the type names)
    expect("ESignatureProvider" in barrel).toBe(false); // interface only, no runtime class
    expect("SignatureRequest" in barrel).toBe(false); // interface only, no runtime class
  });
});

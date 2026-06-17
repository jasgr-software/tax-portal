/**
 * packages/email/src/email.test.ts — Unit + integration tests for @tax-portal/email
 *
 * Tests:
 *   1. mock provider captures a sent message
 *   2. selector returns SMTP binding when EMAIL_PROVIDER=smtp
 *   3. selector returns mock binding when EMAIL_PROVIDER=mock
 *   4. selector throws for resend without RESEND_API_KEY (EmailBindingNotAvailableError)
 *   5. to/subject reject CRLF (header injection)
 *   6. SMTP binding delivers to Mailhog (integration — container-guarded)
 *   7. EmailProvider port runtime shape check (both bindings satisfy interface)
 *   8. Barrel does NOT export test-reset helpers (OE5 regression)
 *
 * The integration test (test 6) is guarded: if the Mailhog container is not
 * reachable on SMTP_HOST:SMTP_PORT, the test is skipped with a clear message
 * rather than failing the suite. The intent is to bring the full stack up and
 * exercise it for real when the container is available.
 *
 * SMTP_HOST defaults to "localhost"; SMTP_PORT defaults to 1025 (Mailhog).
 * To run the integration test: `docker compose up -d mailhog` first.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "vitest";

// Test-only imports — not from the barrel (OE5 compliance)
import {
  MockEmailProvider,
  resetMockEmailProviderForTesting,
  getSentEmailsForTesting,
} from "./bindings/mock.js";
import {
  SmtpEmailProvider,
  resetSmtpTransporterForTesting,
} from "./bindings/smtp.js";
import {
  ResendEmailProvider,
  EmailBindingNotAvailableError,
} from "./bindings/resend.js";
import {
  createEmailProvider,
  resetEmailProviderForTesting,
} from "./select.js";
import {
  stripHeaderInjection,
  EmailHeaderInjectionError,
} from "./port.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMailhogReachable(): Promise<boolean> {
  const host = process.env["SMTP_HOST"] ?? "localhost";
  const port = parseInt(process.env["SMTP_PORT"] ?? "1025", 10);

  return new Promise((resolve) => {
    // Use net.createConnection to probe the port without nodemailer overhead.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const net = require("net") as typeof import("net");
    const socket = net.createConnection({ host, port, timeout: 2000 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// ─── 1. Mock provider: captures sent messages ─────────────────────────────────

describe("MockEmailProvider — captures sent messages", () => {
  beforeEach(() => {
    resetMockEmailProviderForTesting();
  });

  it("send() returns a SentEmail with an id", async () => {
    const provider = new MockEmailProvider("sender@example.com");
    const result = await provider.send({
      to: "recipient@example.com",
      subject: "Hello",
      text: "Body",
    });
    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("string");
    expect(result.id.length).toBeGreaterThan(0);
  });

  it("sent message is retrievable from the in-memory store", async () => {
    const provider = new MockEmailProvider("sender@example.com");
    await provider.send({
      to: "client@example.com",
      subject: "Your invitation",
      text: "Please create an account.",
    });

    const captured = getSentEmailsForTesting();
    expect(captured).toHaveLength(1);
    expect(captured[0]?.to).toBe("client@example.com");
    expect(captured[0]?.subject).toBe("Your invitation");
    expect(captured[0]?.text).toBe("Please create an account.");
  });

  it("accumulates multiple messages in the store", async () => {
    const provider = new MockEmailProvider();
    await provider.send({ to: "a@example.com", subject: "A", text: "Body A" });
    await provider.send({ to: "b@example.com", subject: "B", text: "Body B" });

    const captured = getSentEmailsForTesting();
    expect(captured).toHaveLength(2);
    expect(captured[0]?.to).toBe("a@example.com");
    expect(captured[1]?.to).toBe("b@example.com");
  });

  it("resetMockEmailProviderForTesting() clears the store", async () => {
    const provider = new MockEmailProvider();
    await provider.send({ to: "x@example.com", subject: "X", text: "Body X" });
    expect(getSentEmailsForTesting()).toHaveLength(1);

    resetMockEmailProviderForTesting();
    expect(getSentEmailsForTesting()).toHaveLength(0);
  });

  it("fromAddress defaults to EMAIL_FROM env or test fallback", () => {
    const savedEmailFrom = process.env["EMAIL_FROM"];
    delete process.env["EMAIL_FROM"];
    try {
      const provider = new MockEmailProvider();
      expect(provider.fromAddress).toBe("noreply@test.example.com");
    } finally {
      if (savedEmailFrom !== undefined) {
        process.env["EMAIL_FROM"] = savedEmailFrom;
      }
    }
  });

  it("fromAddress uses EMAIL_FROM env when set", () => {
    const savedEmailFrom = process.env["EMAIL_FROM"];
    process.env["EMAIL_FROM"] = "from@my-firm.com";
    try {
      const provider = new MockEmailProvider();
      expect(provider.fromAddress).toBe("from@my-firm.com");
    } finally {
      if (savedEmailFrom !== undefined) {
        process.env["EMAIL_FROM"] = savedEmailFrom;
      } else {
        delete process.env["EMAIL_FROM"];
      }
    }
  });
});

// ─── 2 & 3. Selector: EMAIL_PROVIDER routing ─────────────────────────────────

describe("binding selector — EMAIL_PROVIDER routing", () => {
  afterEach(() => {
    delete process.env["EMAIL_PROVIDER"];
    delete process.env["RESEND_API_KEY"];
    resetEmailProviderForTesting();
  });

  it("returns SmtpEmailProvider when EMAIL_PROVIDER=smtp", () => {
    process.env["EMAIL_PROVIDER"] = "smtp";
    const provider = createEmailProvider();
    expect(provider).toBeInstanceOf(SmtpEmailProvider);
  });

  it("defaults to SmtpEmailProvider when EMAIL_PROVIDER is unset", () => {
    delete process.env["EMAIL_PROVIDER"];
    const provider = createEmailProvider();
    expect(provider).toBeInstanceOf(SmtpEmailProvider);
  });

  it("returns MockEmailProvider when EMAIL_PROVIDER=mock", () => {
    process.env["EMAIL_PROVIDER"] = "mock";
    const provider = createEmailProvider();
    expect(provider).toBeInstanceOf(MockEmailProvider);
  });

  it("throws EmailBindingNotAvailableError for resend without RESEND_API_KEY", () => {
    process.env["EMAIL_PROVIDER"] = "resend";
    delete process.env["RESEND_API_KEY"];
    expect(() => createEmailProvider()).toThrow(EmailBindingNotAvailableError);
  });

  it("throws EmailBindingNotAvailableError message for resend without key", () => {
    process.env["EMAIL_PROVIDER"] = "resend";
    delete process.env["RESEND_API_KEY"];
    expect(() => createEmailProvider()).toThrow(/Resend binding is not fully wired/);
  });

  it("returns ResendEmailProvider when EMAIL_PROVIDER=resend and RESEND_API_KEY is set", () => {
    process.env["EMAIL_PROVIDER"] = "resend";
    process.env["RESEND_API_KEY"] = "re_test_key_placeholder";
    const provider = createEmailProvider();
    expect(provider).toBeInstanceOf(ResendEmailProvider);
  });

  it("throws for unknown EMAIL_PROVIDER value (fail-closed)", () => {
    process.env["EMAIL_PROVIDER"] = "unknown-binding";
    expect(() => createEmailProvider()).toThrow(/Unknown EMAIL_PROVIDER/);
  });
});

// ─── 4 & 5. Header injection (OWASP CRLF) ────────────────────────────────────

describe("email header injection protection (OWASP)", () => {
  const crlfCases = [
    { label: "CR alone", value: "value\rextra" },
    { label: "LF alone", value: "value\nextra" },
    { label: "CRLF", value: "value\r\nextra" },
    { label: "LF at start", value: "\nBcc: attacker@evil.com" },
    { label: "CR at end", value: "innocent\r" },
  ];

  describe("stripHeaderInjection()", () => {
    it("passes clean values through unchanged", () => {
      expect(stripHeaderInjection("clean value")).toBe("clean value");
      expect(stripHeaderInjection("user@example.com")).toBe("user@example.com");
      expect(stripHeaderInjection("Subject line — no injection")).toBe(
        "Subject line — no injection",
      );
    });

    for (const { label, value } of crlfCases) {
      it(`throws EmailHeaderInjectionError for ${label}`, () => {
        expect(() => stripHeaderInjection(value)).toThrow(
          EmailHeaderInjectionError,
        );
      });
    }
  });

  describe("MockEmailProvider rejects CRLF in `to`", () => {
    beforeEach(() => resetMockEmailProviderForTesting());

    for (const { label, value } of crlfCases) {
      it(`throws EmailHeaderInjectionError when 'to' contains ${label}`, async () => {
        const provider = new MockEmailProvider();
        await expect(
          provider.send({ to: value, subject: "Clean", text: "Body" }),
        ).rejects.toThrow(EmailHeaderInjectionError);
      });
    }
  });

  describe("MockEmailProvider rejects CRLF in `subject`", () => {
    beforeEach(() => resetMockEmailProviderForTesting());

    for (const { label, value } of crlfCases) {
      it(`throws EmailHeaderInjectionError when 'subject' contains ${label}`, async () => {
        const provider = new MockEmailProvider();
        await expect(
          provider.send({ to: "clean@example.com", subject: value, text: "Body" }),
        ).rejects.toThrow(EmailHeaderInjectionError);
      });
    }
  });
});

// ─── 6. SMTP binding → Mailhog integration (container-guarded) ───────────────

describe("SmtpEmailProvider → Mailhog integration", () => {
  afterEach(() => {
    resetSmtpTransporterForTesting();
    delete process.env["EMAIL_FROM"];
  });

  it("delivers a message to Mailhog and it is retrievable via the HTTP API", async () => {
    const reachable = await isMailhogReachable();
    if (!reachable) {
      console.warn(
        "[SKIP] Mailhog SMTP not reachable on " +
          `${process.env["SMTP_HOST"] ?? "localhost"}:${process.env["SMTP_PORT"] ?? "1025"}. ` +
          "Run `docker compose up -d mailhog` to enable this integration test.",
      );
      return; // Skip gracefully — not a hard failure
    }

    // Unique subject to avoid cross-test pollution in Mailhog's message store
    const unique = `TASK-003-002-integration-${Date.now()}`;

    process.env["EMAIL_FROM"] = "test-sender@tax-portal.dev";
    const provider = new SmtpEmailProvider();
    const result = await provider.send({
      to: "test-recipient@tax-portal.dev",
      subject: unique,
      text: "Integration test from packages/email SmtpEmailProvider.",
    });

    // Verify that nodemailer returned a messageId
    expect(result.id).toBeTruthy();

    // Query the Mailhog HTTP API to verify the message was received.
    // The API is at http://MAILHOG_HOST:8025/api/v2/messages (or MAILHOG_HTTP_PORT).
    // We derive the HTTP port from MAILHOG_HTTP_PORT env or default 8025.
    const mailhogHttpHost = process.env["SMTP_HOST"] ?? "localhost";
    const mailhogHttpPort = process.env["MAILHOG_HTTP_PORT"] ?? "8025";
    const apiUrl = `http://${mailhogHttpHost}:${mailhogHttpPort}/api/v2/messages`;

    // Poll for up to 5 seconds for the message to appear (Mailhog is fast but async).
    let found = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !found) {
      const resp = await fetch(apiUrl);
      if (!resp.ok) {
        throw new Error(`Mailhog API returned ${resp.status}: ${resp.statusText}`);
      }
      const data = (await resp.json()) as {
        items: Array<{
          Content: { Headers: { Subject?: string[] } };
        }>;
      };
      for (const item of data.items) {
        const subjects = item?.Content?.Headers?.Subject ?? [];
        if (subjects.some((s) => s.includes(unique))) {
          found = true;
          break;
        }
      }
      if (!found) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    expect(found).toBe(true);
  });
});

// ─── 7. EmailProvider port runtime shape check ───────────────────────────────

describe("EmailProvider port — runtime shape check", () => {
  it("MockEmailProvider satisfies the port interface (has required methods)", () => {
    const provider = new MockEmailProvider();
    expect(typeof provider.send).toBe("function");
    expect(typeof provider.fromAddress).toBe("string");
  });

  it("SmtpEmailProvider satisfies the port interface (has required methods)", () => {
    const provider = new SmtpEmailProvider();
    expect(typeof provider.send).toBe("function");
    expect(typeof provider.fromAddress).toBe("string");
  });

  it("ResendEmailProvider satisfies the port interface when RESEND_API_KEY is set", () => {
    const saved = process.env["RESEND_API_KEY"];
    process.env["RESEND_API_KEY"] = "re_placeholder";
    try {
      const provider = new ResendEmailProvider();
      expect(typeof provider.send).toBe("function");
      expect(typeof provider.fromAddress).toBe("string");
    } finally {
      if (saved !== undefined) {
        process.env["RESEND_API_KEY"] = saved;
      } else {
        delete process.env["RESEND_API_KEY"];
      }
    }
  });
});

// ─── 8. OE5 barrel regression — test resets not on the public barrel ─────────

describe("barrel OE5 compliance — test resets not exported", () => {
  it("resetMockEmailProviderForTesting is NOT exported from the barrel", async () => {
    // Dynamic import the barrel and verify the test-reset is absent.
    const barrel = await import("./index.js");
    expect(
      "resetMockEmailProviderForTesting" in barrel,
    ).toBe(false);
  });

  it("getSentEmailsForTesting is NOT exported from the barrel", async () => {
    const barrel = await import("./index.js");
    expect("getSentEmailsForTesting" in barrel).toBe(false);
  });

  it("resetSmtpTransporterForTesting is NOT exported from the barrel", async () => {
    const barrel = await import("./index.js");
    expect("resetSmtpTransporterForTesting" in barrel).toBe(false);
  });

  it("resetEmailProviderForTesting is NOT exported from the barrel", async () => {
    const barrel = await import("./index.js");
    expect("resetEmailProviderForTesting" in barrel).toBe(false);
  });

  it("getEmailProvider IS exported from the barrel (sanity check)", async () => {
    const barrel = await import("./index.js");
    expect("getEmailProvider" in barrel).toBe(true);
  });

  it("EmailBindingNotAvailableError IS exported from the barrel", async () => {
    const barrel = await import("./index.js");
    expect("EmailBindingNotAvailableError" in barrel).toBe(true);
  });
});

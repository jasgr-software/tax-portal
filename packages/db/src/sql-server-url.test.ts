/**
 * packages/db/src/sql-server-url.test.ts
 *
 * Regression test for parseSqlServerUrl (BUG-019-001).
 *
 * Pins the `encrypt` default contract after the TASK-019-005 fix flipped the
 * absent-param default from `true` → `false` (sql-server-url.ts:59-66). This
 * test is the guard the Overwatch Audit (BRIEF-019, advisory finding #2)
 * recommended so the default cannot silently re-flip — the prior `true` default
 * made the raw mssql driver attempt a TLS handshake against SQL Server's
 * self-signed Docker cert (ESOCKET self-signed certificate), breaking admin
 * mock-session (recordAuthEvent) for all admin e2e since TASK-004-010.
 *
 * Pure-function unit test — no DB connection required.
 *
 * // ADR-003: identity propagation / connection-string conventions. // ADR-003
 * // CS-GEN-003: cite governing keys. // CS-GEN-003
 */

import { describe, it, expect } from "vitest";
import { parseSqlServerUrl } from "./sql-server-url.js";

describe("parseSqlServerUrl — encrypt default contract (BUG-019-001 regression)", () => {
  it("defaults encrypt=false when the connection string omits the encrypt param", () => {
    // The regression: a true default here is what produced ESOCKET against the
    // Docker self-signed cert and aligned poorly with Prisma's sqlserver
    // connector (which does not encrypt by default). // BUG-019-001
    const cfg = parseSqlServerUrl(
      "sqlserver://taxportal_admin:pw@localhost:1433;database=taxportal"
    );
    expect(cfg.options?.encrypt).toBe(false);
  });

  it("honors an explicit encrypt=true in the connection string", () => {
    const cfg = parseSqlServerUrl(
      "sqlserver://sa:pw@db.example.com:1433;database=taxportal;encrypt=true;trustServerCertificate=true"
    );
    expect(cfg.options?.encrypt).toBe(true);
    expect(cfg.options?.trustServerCertificate).toBe(true);
  });

  it("honors an explicit encrypt=false in the connection string", () => {
    const cfg = parseSqlServerUrl(
      "sqlserver://sa:pw@localhost:1433;database=taxportal;encrypt=false"
    );
    expect(cfg.options?.encrypt).toBe(false);
  });

  it("defaults trustServerCertificate=false when omitted", () => {
    const cfg = parseSqlServerUrl(
      "sqlserver://sa:pw@localhost:1433;database=taxportal"
    );
    expect(cfg.options?.trustServerCertificate).toBe(false);
  });

  it("parses host, port, and database from the param form", () => {
    const cfg = parseSqlServerUrl(
      "sqlserver://localhost;port=1433;database=taxportal;user=u;password=p"
    );
    expect(cfg.server).toBe("localhost");
    expect(cfg.port).toBe(1433);
    expect(cfg.database).toBe("taxportal");
    // encrypt default still false in the param form
    expect(cfg.options?.encrypt).toBe(false);
  });
});

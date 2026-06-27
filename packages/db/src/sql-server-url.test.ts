/**
 * packages/db/src/sql-server-url.test.ts
 *
 * Regression test for parseSqlServerUrl (BUG-019-001).
 *
 * Pins the `encrypt` default contract: absent encrypt param → true (in-transit TLS on).
 * The ESOCKET "self-signed certificate" error that motivated BUG-019-001 was a cert-TRUST
 * problem, not an encryption problem. The correct fix is trustServerCertificate=true in
 * local/CI connection strings — encryption stays ON. This test guards against silently
 * re-flipping the default back to false (which would disable in-transit TLS globally).
 *
 * Local/CI self-signed cert: handled by ;trustServerCertificate=true in DATABASE_URL
 * (.env.example). Production URLs omit trustServerCertificate (defaults false) so the
 * real cert is validated AND the connection is encrypted.
 *
 * Pure-function unit test — no DB connection required.
 *
 * // ADR-003: identity propagation / connection-string conventions. // ADR-003
 * // CS-GEN-003: cite governing keys. // CS-GEN-003
 */

import { describe, it, expect } from "vitest";
import { parseSqlServerUrl } from "./sql-server-url.js";

describe("parseSqlServerUrl — encrypt default contract (BUG-019-001 regression)", () => {
  it("defaults encrypt=true when the connection string omits the encrypt param", () => {
    // Secure default: in-transit TLS is ON unless explicitly disabled.
    // Local self-signed cert trust is handled by ;trustServerCertificate=true,
    // not by disabling encryption. // BUG-019-001 // ADR-003
    const cfg = parseSqlServerUrl(
      "sqlserver://taxportal_admin:pw@localhost:1433;database=taxportal"
    );
    expect(cfg.options?.encrypt).toBe(true);
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
    // encrypt default is true in the param form as well
    expect(cfg.options?.encrypt).toBe(true);
  });
});

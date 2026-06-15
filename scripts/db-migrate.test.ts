/**
 * scripts/db-migrate.test.ts — Unit tests for the Track A + Track B migration runner
 *
 * ADR-002 § Consequences: "The migration runner script (scripts/db-migrate.ts) is load-bearing
 * and gets full test coverage as part of Epic 001."
 *
 * Tests verify:
 *   1. Track A runs before Track B (ordering contract)
 *   2. Track B applies files in numeric order (db/migrations/*.sql then db/policies/*.sql)
 *   3. Already-applied migrations are skipped (idempotency)
 *   4. __db_migrations bookkeeping table is created and populated correctly
 *   5. Empty Track B no-ops cleanly (required: runner must be clean with no Track B files)
 *   6. Track B errors fail fast (halt on first error — ADR-002 ordering contract)
 *   7. parseSqlServerUrl parses Prisma-format URL correctly
 *   8. collectSqlFiles returns files in numeric order, skips non-.sql files
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runTrackB,
  runMigrations,
  collectSqlFiles,
  parseSqlServerUrl,
  type DbConnection,
  type ExecFn,
} from "./db-migrate.ts";

// ─── Test double: in-memory DbConnection ──────────────────────────────────────

function makeTestConnection(opts: {
  alreadyApplied?: string[];
  executeError?: { file: string; error: Error };
} = {}): DbConnection & { executedStatements: string[]; appliedFiles: string[] } {
  const alreadyApplied = new Set(opts.alreadyApplied ?? []);
  const executedStatements: string[] = [];
  const appliedFiles: string[] = [...(opts.alreadyApplied ?? [])];

  return {
    executedStatements,
    appliedFiles,

    async execute(sql: string): Promise<void> {
      executedStatements.push(sql.trim());

      // Simulate error on specific file content if requested
      if (opts.executeError) {
        const fileContent = opts.executeError.file;
        if (sql.includes(fileContent)) {
          throw opts.executeError.error;
        }
      }
    },

    async queryColumn(sql: string): Promise<string[]> {
      // Return already-applied files when querying __db_migrations
      if (sql.includes("__db_migrations")) {
        return [...alreadyApplied];
      }
      return [];
    },

    async close(): Promise<void> {
      // no-op for test double
    },
  };
}

// ─── Temporary directory helpers ──────────────────────────────────────────────

function makeTmpRepoRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tax-portal-test-"));
  fs.mkdirSync(path.join(dir, "db", "migrations"), { recursive: true });
  fs.mkdirSync(path.join(dir, "db", "policies"), { recursive: true });
  return dir;
}

function addSqlFile(dir: string, name: string, content: string): void {
  fs.writeFileSync(path.join(dir, name), content, "utf8");
}

function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("collectSqlFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "collect-sql-"));
  });

  afterEach(() => {
    rmrf(tmpDir);
  });

  it("returns empty array when directory does not exist", () => {
    const result = collectSqlFiles(path.join(tmpDir, "nonexistent"));
    expect(result).toEqual([]);
  });

  it("returns empty array when directory has no .sql files", () => {
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# hello");
    fs.writeFileSync(path.join(tmpDir, ".gitkeep"), "");
    const result = collectSqlFiles(tmpDir);
    expect(result).toEqual([]);
  });

  it("returns files in numeric prefix order", () => {
    addSqlFile(tmpDir, "0003-grants.sql", "-- grants");
    addSqlFile(tmpDir, "0001-tables.sql", "-- tables");
    addSqlFile(tmpDir, "0002-indexes.sql", "-- indexes");

    const result = collectSqlFiles(tmpDir);
    const basenames = result.map((f) => path.basename(f));
    expect(basenames).toEqual(["0001-tables.sql", "0002-indexes.sql", "0003-grants.sql"]);
  });

  it("skips non-.sql files", () => {
    addSqlFile(tmpDir, "0001-tables.sql", "-- tables");
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# not sql");
    fs.writeFileSync(path.join(tmpDir, ".gitkeep"), "");

    const result = collectSqlFiles(tmpDir);
    expect(result).toHaveLength(1);
    expect(path.basename(result[0]!)).toBe("0001-tables.sql");
  });
});

describe("parseSqlServerUrl", () => {
  it("parses a Prisma sqlserver:// URL", () => {
    const config = parseSqlServerUrl(
      "sqlserver://sa:DevPass1!@localhost:1433;database=taxportal;trustServerCertificate=true"
    );
    expect(config.server).toBe("localhost");
    expect(config.port).toBe(1433);
    expect(config.user).toBe("sa");
    expect(config.password).toBe("DevPass1!");
    expect(config.database).toBe("taxportal");
    expect((config.options as Record<string, unknown>)["trustServerCertificate"]).toBe(true);
  });

  it("parses an mssql:// URL", () => {
    const config = parseSqlServerUrl(
      "mssql://app_user:secret@dbhost:1433;database=taxportal;encrypt=true"
    );
    expect(config.server).toBe("dbhost");
    expect(config.user).toBe("app_user");
    expect(config.database).toBe("taxportal");
  });

  it("defaults trustServerCertificate to false", () => {
    const config = parseSqlServerUrl(
      "sqlserver://sa:pass@localhost:1433;database=taxportal"
    );
    expect((config.options as Record<string, unknown>)["trustServerCertificate"]).toBe(false);
  });

  it("defaults port to 1433 when not specified", () => {
    const config = parseSqlServerUrl(
      "sqlserver://sa:pass@localhost;database=taxportal"
    );
    expect(config.port).toBe(1433);
  });
});

describe("runTrackB", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = makeTmpRepoRoot();
  });

  afterEach(() => {
    rmrf(repoRoot);
  });

  it("no-ops cleanly when Track B directories are empty (no .sql files)", async () => {
    const conn = makeTestConnection();
    const result = await runTrackB(conn, repoRoot);

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("creates __db_migrations bookkeeping table on first run", async () => {
    const conn = makeTestConnection();
    await runTrackB(conn, repoRoot);

    // The CREATE TABLE statement should have been executed
    const hasCreateTable = conn.executedStatements.some((s) =>
      s.includes("__db_migrations")
    );
    expect(hasCreateTable).toBe(true);
  });

  it("applies db/migrations files before db/policies files (ordering contract)", async () => {
    addSqlFile(
      path.join(repoRoot, "db", "migrations"),
      "0001-create-tables.sql",
      "CREATE TABLE Foo (id INT);"
    );
    addSqlFile(
      path.join(repoRoot, "db", "policies"),
      "0001-rls-policy.sql",
      "CREATE SECURITY POLICY foo_policy;"
    );

    const conn = makeTestConnection();
    const result = await runTrackB(conn, repoRoot);

    expect(result.applied).toEqual(["0001-create-tables.sql", "0001-rls-policy.sql"]);
    expect(result.errors).toEqual([]);

    // Verify execution order: migration before policy
    const migIdx = conn.executedStatements.findIndex((s) =>
      s.includes("CREATE TABLE Foo")
    );
    const polIdx = conn.executedStatements.findIndex((s) =>
      s.includes("CREATE SECURITY POLICY")
    );
    expect(migIdx).toBeGreaterThanOrEqual(0);
    expect(polIdx).toBeGreaterThanOrEqual(0);
    expect(migIdx).toBeLessThan(polIdx);
  });

  it("applies multiple migration files in numeric order", async () => {
    const migrationsDir = path.join(repoRoot, "db", "migrations");
    addSqlFile(migrationsDir, "0003-grants.sql", "GRANT SELECT ON Foo TO app_user;");
    addSqlFile(migrationsDir, "0001-create-tables.sql", "CREATE TABLE Foo (id INT);");
    addSqlFile(migrationsDir, "0002-create-indexes.sql", "CREATE INDEX IX_Foo ON Foo(id);");

    const conn = makeTestConnection();
    const result = await runTrackB(conn, repoRoot);

    expect(result.applied).toEqual([
      "0001-create-tables.sql",
      "0002-create-indexes.sql",
      "0003-grants.sql",
    ]);
    expect(result.errors).toEqual([]);
  });

  it("skips already-applied migrations (idempotency)", async () => {
    const migrationsDir = path.join(repoRoot, "db", "migrations");
    addSqlFile(migrationsDir, "0001-create-tables.sql", "CREATE TABLE Foo (id INT);");
    addSqlFile(migrationsDir, "0002-create-indexes.sql", "CREATE INDEX IX_Foo ON Foo(id);");

    // Simulate 0001 already applied
    const conn = makeTestConnection({ alreadyApplied: ["0001-create-tables.sql"] });
    const result = await runTrackB(conn, repoRoot);

    expect(result.applied).toEqual(["0002-create-indexes.sql"]);
    expect(result.skipped).toEqual(["0001-create-tables.sql"]);
    expect(result.errors).toEqual([]);
  });

  it("second run of same files is fully idempotent (all skipped)", async () => {
    const migrationsDir = path.join(repoRoot, "db", "migrations");
    addSqlFile(migrationsDir, "0001-create-tables.sql", "CREATE TABLE Foo (id INT);");

    // First run
    const conn1 = makeTestConnection();
    await runTrackB(conn1, repoRoot);

    // Second run: simulate all previously applied
    const conn2 = makeTestConnection({ alreadyApplied: ["0001-create-tables.sql"] });
    const result2 = await runTrackB(conn2, repoRoot);

    expect(result2.applied).toEqual([]);
    expect(result2.skipped).toEqual(["0001-create-tables.sql"]);
    expect(result2.errors).toEqual([]);
  });

  it("records each applied migration in bookkeeping table", async () => {
    const migrationsDir = path.join(repoRoot, "db", "migrations");
    addSqlFile(migrationsDir, "0001-create-tables.sql", "CREATE TABLE Foo (id INT);");

    const conn = makeTestConnection();
    await runTrackB(conn, repoRoot);

    // Should have recorded the migration in __db_migrations
    const insertStmts = conn.executedStatements.filter((s) =>
      s.includes("INSERT INTO") && s.includes("__db_migrations")
    );
    expect(insertStmts).toHaveLength(1);
    expect(insertStmts[0]).toContain("0001-create-tables.sql");
  });

  it("fails fast on first error and does not continue (ADR-002 ordering contract)", async () => {
    const migrationsDir = path.join(repoRoot, "db", "migrations");
    addSqlFile(migrationsDir, "0001-bad.sql", "TRIGGER_ERROR_HERE;");
    addSqlFile(migrationsDir, "0002-good.sql", "CREATE TABLE Foo (id INT);");

    const conn = makeTestConnection({
      executeError: {
        file: "TRIGGER_ERROR_HERE",
        error: new Error("Syntax error near TRIGGER_ERROR_HERE"),
      },
    });
    const result = await runTrackB(conn, repoRoot);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.file).toBe("0001-bad.sql");
    // 0002-good.sql must NOT have been applied
    expect(result.applied).not.toContain("0002-good.sql");
    expect(result.skipped).not.toContain("0002-good.sql");
  });
});

describe("runMigrations — Track A before Track B (ordering contract)", () => {
  it("calls Track A execFn before Track B runs", async () => {
    // DECISION: Test the ordering contract via injected execFn (Track A)
    // and injected DbConnection (Track B). No real DB or prisma needed.
    const callOrder: string[] = [];

    const fakeExecFn: ExecFn = (cmd, _opts) => {
      callOrder.push(`track-a:${cmd}`);
      return "No pending migrations";
    };

    const repoRoot = makeTmpRepoRoot();
    // Create a fake prisma schema so Track A doesn't skip
    fs.mkdirSync(path.join(repoRoot, "prisma"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "prisma", "schema.prisma"), "// placeholder");

    const trackBConn = makeTestConnection();
    // Track the Track B connection.execute calls to verify ordering
    const origExecute = trackBConn.execute.bind(trackBConn);
    trackBConn.execute = async (sql: string) => {
      if (sql.includes("__db_migrations") || sql.includes("IF NOT EXISTS")) {
        callOrder.push("track-b:bookkeeping");
      }
      return origExecute(sql);
    };

    try {
      const result = await runMigrations({
        repoRoot,
        connectionUrl:
          "sqlserver://sa:DevPass1!@localhost:1433;database=taxportal;trustServerCertificate=true",
        dbConnection: trackBConn,
        execFn: fakeExecFn,
      });

      // Track A ran (execFn was called with the right command)
      expect(callOrder.some((c) => c.startsWith("track-a:"))).toBe(true);
      expect(callOrder[0]).toMatch(/track-a/);

      // Track A ran before Track B bookkeeping
      const trackAIdx = callOrder.findIndex((c) => c.startsWith("track-a:"));
      const trackBIdx = callOrder.findIndex((c) => c.startsWith("track-b:"));
      // Track B bookkeeping should come after Track A (or may not fire if no files)
      if (trackBIdx !== -1) {
        expect(trackAIdx).toBeLessThan(trackBIdx);
      }

      // Track B ran with empty dirs — no-op result
      expect(result.trackB.applied).toEqual([]);
      expect(result.trackB.errors).toEqual([]);

      // Track A output is captured
      expect(result.trackA.ran).toBe(true);
      expect(result.trackA.output).toBe("No pending migrations");
    } finally {
      rmrf(repoRoot);
    }
  });

  it("trackBOnly mode skips Track A entirely", async () => {
    const execCalls: string[] = [];
    const fakeExecFn: ExecFn = (cmd) => {
      execCalls.push(cmd);
      return "";
    };

    const repoRoot = makeTmpRepoRoot();
    const conn = makeTestConnection();

    try {
      const result = await runMigrations({
        repoRoot,
        connectionUrl:
          "sqlserver://sa:DevPass1!@localhost:1433;database=taxportal;trustServerCertificate=true",
        dbConnection: conn,
        execFn: fakeExecFn,
        trackBOnly: true,
      });

      // execFn must not have been called (Track A skipped)
      expect(execCalls).toHaveLength(0);
      expect(result.trackA.ran).toBe(false);
      expect(result.trackB.applied).toEqual([]);
    } finally {
      rmrf(repoRoot);
    }
  });

  it("trackAOnly mode runs Track A but does not apply Track B files", async () => {
    const execCalls: string[] = [];
    const fakeExecFn: ExecFn = (cmd) => {
      execCalls.push(cmd);
      return "No pending migrations";
    };

    const repoRoot = makeTmpRepoRoot();
    // Create a fake prisma schema so Track A doesn't skip
    fs.mkdirSync(path.join(repoRoot, "prisma"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "prisma", "schema.prisma"), "// placeholder");

    const migrationsDir = path.join(repoRoot, "db", "migrations");
    addSqlFile(migrationsDir, "0001-tables.sql", "CREATE TABLE Foo (id INT);");

    const conn = makeTestConnection();

    try {
      const result = await runMigrations({
        repoRoot,
        connectionUrl:
          "sqlserver://sa:DevPass1!@localhost:1433;database=taxportal;trustServerCertificate=true",
        dbConnection: conn,
        execFn: fakeExecFn,
        trackAOnly: true,
      });

      // Track A ran
      expect(execCalls).toContain("pnpm prisma migrate deploy");
      expect(result.trackA.ran).toBe(true);

      // Track B did not apply any files (trackAOnly)
      expect(result.trackB.applied).toEqual([]);
    } finally {
      rmrf(repoRoot);
    }
  });

  it("throws if DATABASE_URL_ADMIN is not set", async () => {
    const origEnv = process.env["DATABASE_URL_ADMIN"];
    delete process.env["DATABASE_URL_ADMIN"];

    const repoRoot = makeTmpRepoRoot();

    try {
      await expect(
        runMigrations({ repoRoot })
      ).rejects.toThrow("DATABASE_URL_ADMIN");
    } finally {
      if (origEnv !== undefined) process.env["DATABASE_URL_ADMIN"] = origEnv;
      rmrf(repoRoot);
    }
  });
});

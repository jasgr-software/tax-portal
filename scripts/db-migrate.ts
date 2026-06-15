#!/usr/bin/env tsx
/**
 * scripts/db-migrate.ts — Two-track database migration runner
 *
 * ADR-002 § Migration tracks:
 *   Track A — Prisma migrations (prisma/migrations/): runs `prisma migrate deploy`
 *   Track B — Raw SQL migrations in order:
 *               1. db/migrations/NNNN-*.sql    (schema extensions, grants, computed columns, etc.)
 *               2. db/policies/NNNN-*.sql      (CREATE SECURITY POLICY, predicate functions — ADR-005)
 *
 * Ordering contract (ADR-002):
 *   Track A runs first. Track B runs second against the Prisma-migrated schema.
 *   This ensures tables exist before security policies are defined against them.
 *
 * Bookkeeping:
 *   Applied Track B filenames are recorded in __db_migrations (app-owned, not Prisma-managed).
 *   Re-running the runner is idempotent — already-applied files are skipped.
 *
 * Authentication (ADR-007):
 *   Uses DATABASE_URL_ADMIN (elevated principal, no SESSION_CONTEXT).
 *   Never uses Managed Identity — SQL authentication only.
 *
 * Usage:
 *   pnpm db:migrate           # standard (Track A → Track B)
 *   pnpm db:policies:apply    # Track B only (idempotent re-apply of policies)
 *
 * Environment:
 *   DATABASE_URL_ADMIN  — sqlserver://sa:PASSWORD@host:1433;database=DATABASE;trustServerCertificate=true
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MigrationResult {
  trackA: TrackAResult;
  trackB: TrackBResult;
}

export interface TrackAResult {
  ran: boolean;
  output: string;
}

export interface TrackBResult {
  applied: string[];
  skipped: string[];
  errors: TrackBError[];
}

export interface TrackBError {
  file: string;
  error: string;
}

// ─── DB connection interface ───────────────────────────────────────────────────
// Allows injection of a test-double for unit tests (ADR-011 § Repository interface)

export interface DbConnection {
  /** Execute a SQL statement with no return value */
  execute(sql: string): Promise<void>;
  /** Query a single column of strings */
  queryColumn(sql: string): Promise<string[]>;
  /** Close the connection */
  close(): Promise<void>;
}

// ─── SQL Server connection (mssql) ────────────────────────────────────────────

export async function createMssqlConnection(connectionUrl: string): Promise<DbConnection> {
  // Dynamic import so the script can be loaded without mssql installed
  // (unit tests inject a stub; integration tests need mssql in devDependencies)
  const mssql = await import("mssql").then((m) => m.default ?? m);

  const config = parseSqlServerUrl(connectionUrl) as unknown as import("mssql").config;
  const pool = new mssql.ConnectionPool(config);
  await pool.connect();

  return {
    async execute(sql: string): Promise<void> {
      // Split on GO (case-insensitive, on its own line) so each batch is sent separately.
      // `GO` is a client-side batch separator (sqlcmd/SSMS) not valid T-SQL — the engine
      // rejects it if sent as part of the SQL text. Splitting preserves the ordering contract
      // (batches run in file order) and allows CREATE OR ALTER FUNCTION to be the sole
      // statement in its batch (required by SQL Server).
      const batches = sql
        .split(/^\s*GO\s*$/im)
        .map((b) => b.trim())
        .filter((b) => b.length > 0);
      for (const batch of batches) {
        await pool.request().batch(batch);
      }
    },
    async queryColumn(sql: string): Promise<string[]> {
      const result = await pool.request().query(sql);
      if (!result.recordset || result.recordset.length === 0) return [];
      const firstKey = Object.keys(result.recordset[0] ?? {})[0];
      if (firstKey === undefined) return [];
      return result.recordset.map((row: Record<string, unknown>) => String(row[firstKey] ?? ""));
    },
    async close(): Promise<void> {
      await pool.close();
    },
  };
}

/**
 * Parse a Prisma-format sqlserver:// URL into mssql ConnectionPool config.
 *
 * Prisma uses semicolons as parameter separators (not `?key=val`):
 *   sqlserver://user:pass@host:port;database=DB;trustServerCertificate=true
 *
 * The WHATWG URL API treats `;` as part of the pathname, so we parse
 * the authority (user/pass/host/port) with a regex and parse the
 * key=value pairs from the semicolon-separated remainder.
 */
export function parseSqlServerUrl(connectionUrl: string): Record<string, unknown> {
  // Strip the scheme prefix (sqlserver:// or mssql://)
  const withoutScheme = connectionUrl.replace(/^(?:sqlserver|mssql):\/\//, "");

  // Split on the first occurrence of `;` to separate authority from params
  const firstSemi = withoutScheme.indexOf(";");
  const authority = firstSemi === -1 ? withoutScheme : withoutScheme.slice(0, firstSemi);
  const paramStr = firstSemi === -1 ? "" : withoutScheme.slice(firstSemi + 1);

  // Parse semicolon-separated key=value pairs
  const params: Record<string, string> = {};
  for (const part of paramStr.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k) params[k] = v;
  }

  // Parse authority: [user:pass@]host[:port]
  let user: string | undefined;
  let password: string | undefined;
  let hostPort = authority;

  const atIdx = authority.lastIndexOf("@");
  if (atIdx !== -1) {
    const credentials = authority.slice(0, atIdx);
    hostPort = authority.slice(atIdx + 1);
    const colonIdx = credentials.indexOf(":");
    if (colonIdx === -1) {
      user = decodeURIComponent(credentials);
    } else {
      user = decodeURIComponent(credentials.slice(0, colonIdx));
      password = decodeURIComponent(credentials.slice(colonIdx + 1));
    }
  }

  let server = hostPort;
  let port = 1433;
  const portMatch = hostPort.match(/:(\d+)$/);
  if (portMatch) {
    port = parseInt(portMatch[1] ?? "1433", 10);
    server = hostPort.slice(0, hostPort.length - portMatch[0].length);
  }

  // Fall back to semicolon-param `user=` and `password=` if not in the authority section.
  // This supports both URL forms:
  //   Authority form: sqlserver://user:pass@host:port;database=DB;...
  //   Param form:     sqlserver://host;port=N;database=DB;user=U;password=P;...
  const resolvedUser = user ?? params["user"];
  const resolvedPassword = password ?? params["password"];
  const resolvedPort = port !== 1433 ? port : (params["port"] ? parseInt(params["port"], 10) : 1433);

  const database = params["database"] ?? "";
  const encrypt = (params["encrypt"] ?? "true").toLowerCase() !== "false";
  const trustServerCertificate =
    (params["trustServerCertificate"] ?? "false").toLowerCase() === "true";

  return {
    server,
    port: resolvedPort,
    user: resolvedUser,
    password: resolvedPassword,
    database: database || "master",
    options: {
      encrypt,
      trustServerCertificate,
    },
  };
}

// ─── Bookkeeping table ─────────────────────────────────────────────────────────

const BOOKKEEPING_TABLE = "__db_migrations";

const CREATE_BOOKKEEPING_SQL = `
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_NAME = '${BOOKKEEPING_TABLE}'
)
BEGIN
  CREATE TABLE [dbo].[${BOOKKEEPING_TABLE}] (
    [id]         INT IDENTITY(1,1) PRIMARY KEY,
    [filename]   NVARCHAR(255) NOT NULL,
    [applied_at] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT [UQ_${BOOKKEEPING_TABLE}_filename] UNIQUE ([filename])
  );
END
`;

async function ensureBookkeepingTable(conn: DbConnection): Promise<void> {
  await conn.execute(CREATE_BOOKKEEPING_SQL);
}

async function getAppliedMigrations(conn: DbConnection): Promise<Set<string>> {
  const rows = await conn.queryColumn(
    `SELECT [filename] FROM [dbo].[${BOOKKEEPING_TABLE}] ORDER BY [applied_at]`
  );
  return new Set(rows);
}

async function recordAppliedMigration(conn: DbConnection, filename: string): Promise<void> {
  await conn.execute(
    `INSERT INTO [dbo].[${BOOKKEEPING_TABLE}] ([filename]) VALUES (N'${filename.replace(/'/g, "''")}')`
  );
}

// ─── Track A — Prisma migrate deploy ─────────────────────────────────────────

export type ExecFn = (cmd: string, opts: Record<string, unknown>) => string;

export async function runTrackA(
  repoRoot: string,
  execFn?: ExecFn
): Promise<TrackAResult> {
  const prismaSchemaPath = path.join(repoRoot, "prisma", "schema.prisma");
  if (!fs.existsSync(prismaSchemaPath)) {
    return { ran: false, output: "prisma/schema.prisma not found — Track A skipped" };
  }

  const runner: ExecFn =
    execFn ??
    ((cmd, opts) =>
      execSync(cmd, {
        ...opts,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }) as unknown as string);

  try {
    const output = runner("pnpm prisma migrate deploy", {
      cwd: repoRoot,
      env: { ...process.env },
    });
    return { ran: true, output: (output ?? "").trim() };
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const combined = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n");
    throw new Error(`Track A (prisma migrate deploy) failed:\n${combined}`);
  }
}

// ─── Track B — Raw SQL migrations ─────────────────────────────────────────────

/**
 * Returns the ordered list of .sql files from a directory.
 * Files are sorted by their numeric prefix (NNNN) — non-.sql files are skipped.
 */
export function collectSqlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  return files
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => {
      const numA = parseInt(a.split("-")[0] ?? "0", 10);
      const numB = parseInt(b.split("-")[0] ?? "0", 10);
      return numA - numB;
    })
    .map((f) => path.join(dir, f));
}

export async function runTrackB(
  conn: DbConnection,
  repoRoot: string
): Promise<TrackBResult> {
  await ensureBookkeepingTable(conn);
  const applied = await getAppliedMigrations(conn);

  const migrationsDir = path.join(repoRoot, "db", "migrations");
  const policiesDir = path.join(repoRoot, "db", "policies");

  // Order: db/migrations/*.sql first, then db/policies/*.sql
  const migrationFiles = collectSqlFiles(migrationsDir);
  const policyFiles = collectSqlFiles(policiesDir);
  const allFiles = [...migrationFiles, ...policyFiles];

  const result: TrackBResult = { applied: [], skipped: [], errors: [] };

  for (const filePath of allFiles) {
    const filename = path.basename(filePath);

    if (applied.has(filename)) {
      result.skipped.push(filename);
      continue;
    }

    const sql = fs.readFileSync(filePath, "utf8");
    try {
      await conn.execute(sql);
      await recordAppliedMigration(conn, filename);
      result.applied.push(filename);
    } catch (err) {
      const error = err as { message?: string };
      result.errors.push({ file: filename, error: error.message ?? String(err) });
      // Fail fast — do not continue after an error (ADR-002 ordering contract)
      break;
    }
  }

  return result;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runMigrations(
  opts: {
    repoRoot?: string;
    connectionUrl?: string;
    trackAOnly?: boolean;
    trackBOnly?: boolean;
    /** Injected DB connection for testing */
    dbConnection?: DbConnection;
    /** Injected exec function for testing (replaces execSync in Track A) */
    execFn?: ExecFn;
  } = {}
): Promise<MigrationResult> {
  const repoRoot = opts.repoRoot ?? path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
  const connectionUrl = opts.connectionUrl ?? process.env["DATABASE_URL_ADMIN"];

  if (!connectionUrl) {
    throw new Error(
      "DATABASE_URL_ADMIN environment variable is required for database migrations (ADR-007: SQL authentication)"
    );
  }

  let trackAResult: TrackAResult = { ran: false, output: "skipped" };
  if (!opts.trackBOnly) {
    trackAResult = await runTrackA(repoRoot, opts.execFn);
  }

  let trackBResult: TrackBResult = { applied: [], skipped: [], errors: [] };
  const conn = opts.dbConnection ?? (await createMssqlConnection(connectionUrl));
  try {
    if (!opts.trackAOnly) {
      trackBResult = await runTrackB(conn, repoRoot);
    }
  } finally {
    await conn.close();
  }

  if (trackBResult.errors.length > 0) {
    const summary = trackBResult.errors
      .map((e) => `  ${e.file}: ${e.error}`)
      .join("\n");
    throw new Error(`Track B migration errors:\n${summary}`);
  }

  return { trackA: trackAResult, trackB: trackBResult };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const trackBOnly = args.includes("--track-b-only") || args.includes("--policies");
  const trackAOnly = args.includes("--track-a-only");

  console.log("=== tax-portal database migration runner ===");
  if (trackBOnly) console.log("Mode: Track B only (raw SQL + policies)");
  else if (trackAOnly) console.log("Mode: Track A only (Prisma)");
  else console.log("Mode: Track A (Prisma) → Track B (raw SQL + policies)");

  const result = await runMigrations({ trackAOnly, trackBOnly });

  if (!trackBOnly) {
    console.log("\n[Track A — Prisma migrate deploy]");
    if (result.trackA.ran) {
      console.log(result.trackA.output || "  (no output — no pending migrations)");
    } else {
      console.log(" ", result.trackA.output);
    }
  }

  if (!trackAOnly) {
    console.log("\n[Track B — Raw SQL migrations]");
    if (result.trackB.applied.length === 0 && result.trackB.skipped.length === 0) {
      console.log("  (no Track B files found — no-op)");
    } else {
      if (result.trackB.applied.length > 0) {
        console.log("  Applied:");
        for (const f of result.trackB.applied) console.log(`    + ${f}`);
      }
      if (result.trackB.skipped.length > 0) {
        console.log("  Already applied (skipped):");
        for (const f of result.trackB.skipped) console.log(`    ~ ${f}`);
      }
    }
  }

  console.log("\n=== migration complete ===");
}

// Run when executed directly (tsx scripts/db-migrate.ts)
// The ESM check: when the script is the main module
const isMain =
  process.argv[1] !== undefined &&
  url.fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error("\n[ERROR]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

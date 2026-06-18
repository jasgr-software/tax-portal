/**
 * packages/db/src/sql-server-url.ts — shared SQL Server URL parser
 *
 * Pure, dependency-free helper extracted from admin-connection.ts and
 * engagement.ts (OE-4: eliminate the third copy of this function).
 *
 * Parse a Prisma-format sqlserver:// URL into an mssql ConnectionPool config.
 * Supports both URL forms:
 *   Authority form: sqlserver://user:pass@host:port;database=DB;...
 *   Param form:     sqlserver://host;port=N;database=DB;user=U;password=P;...
 *
 * No circular dependency risk — this module imports nothing from the package.
 */

export function parseSqlServerUrl(connectionUrl: string): import("mssql").config {
  const withoutScheme = connectionUrl.replace(/^(?:sqlserver|mssql):\/\//, "");
  const firstSemi = withoutScheme.indexOf(";");
  const authority = firstSemi === -1 ? withoutScheme : withoutScheme.slice(0, firstSemi);
  const paramStr = firstSemi === -1 ? "" : withoutScheme.slice(firstSemi + 1);

  const params: Record<string, string> = {};
  for (const part of paramStr.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k) params[k] = v;
  }

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

  const resolvedUser = user ?? params["user"];
  const resolvedPassword = password ?? params["password"];
  const resolvedPort = port !== 1433 ? port : (params["port"] ? parseInt(params["port"], 10) : 1433);

  const encrypt = (params["encrypt"] ?? "true").toLowerCase() !== "false";
  const trustServerCertificate =
    (params["trustServerCertificate"] ?? "false").toLowerCase() === "true";

  return {
    server,
    port: resolvedPort,
    user: resolvedUser,
    password: resolvedPassword,
    database: params["database"] ?? "master",
    options: {
      encrypt,
      trustServerCertificate,
    },
  };
}

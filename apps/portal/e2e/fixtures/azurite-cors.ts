/**
 * apps/portal/e2e/fixtures/azurite-cors.ts — Azurite CORS configuration for browser PUTs
 *
 * PROBLEM (TASK-007-006):
 *   The document-upload e2e tests drive the ADR-009 signed-URL upload pipeline.
 *   The pipeline works as follows:
 *     1. Client calls requestUploadUrlAction → server mints a signed Azurite upload URL.
 *     2. Client browser PUTs file bytes directly to that URL (ADR-009 — app never proxies bytes).
 *     3. Client calls completeUploadAction → server stat + scan + promote.
 *
 *   In the docker-compose e2e stack:
 *     - The portal container connects to Azurite via the Docker-internal hostname
 *       "azurite:10000" (PORTAL_STORAGE_CONNECTION_STRING).
 *     - BLOB_PUBLIC_ENDPOINT=http://localhost:10000 rewrites the signed URL origin
 *       before returning it to the browser, so the Playwright browser can reach Azurite
 *       via the host-mapped port (10000 → azurite container).
 *
 *   CORS ISSUE (investigation notes):
 *     Azurite does NOT have CORS configured by default. When the Playwright browser
 *     PUTs to http://localhost:10000 (origin: http://localhost:3000), the browser sends
 *     a CORS preflight (OPTIONS). Azurite responds:
 *       "403 CORS not enabled or no matching rule found for this request."
 *     The browser then blocks the PUT, `fetch()` throws, and the upload fails.
 *
 *   INVESTIGATION: page.route() does NOT work for cross-origin localhost requests
 *     We initially tried Playwright's page.route() to intercept the OPTIONS preflight and
 *     inject CORS headers. This failed: page.route() uses CDP network interception which
 *     does NOT intercept fetch() calls from JavaScript to cross-origin localhost:10000.
 *     Confirmed: the route handler is never called (intercepted=false in a diagnostic test).
 *     Root cause: Chromium routes same-device localhost fetch() calls outside the CDP layer.
 *
 * SOLUTION (TASK-007-006):
 *   Configure CORS rules on Azurite's Blob service via the Azure Blob Storage SDK,
 *   called from the Node.js Playwright test-runner process (not from the browser).
 *
 *   We invoke a child Node.js process that imports @azure/storage-blob from the
 *   packages/storage workspace (the only place ADR-008 permits it in this monorepo).
 *   The child process calls BlobServiceClient.setProperties() to configure CORS rules.
 *   This is pure test infrastructure — ADR-008 prohibits the SDK import in app code only.
 *
 *   Once CORS is configured, the browser's OPTIONS preflight to localhost:10000 returns
 *   200 with Access-Control-Allow-Origin: *, and the PUT proceeds normally.
 *
 *   CORS configuration persists in Azurite's in-memory state for the lifetime of the
 *   container. It is safe to call this function multiple times (idempotent).
 *
 * ALSO REQUIRED: x-ms-blob-type header
 *   Azure Blob Storage (and Azurite) require "x-ms-blob-type: BlockBlob" in the PUT
 *   request headers for block blob uploads. Without this header, Azurite returns 400.
 *   This is fixed in DocumentUploadStep.tsx (the component adds the header).
 *
 * ADR-008: Only packages/storage/src/adapters/azurite.ts may import @azure/storage-blob
 *   in application code. This file is e2e test infrastructure — the ADR-008 constraint
 *   applies to application modules (apps/** and packages/**), not e2e fixtures.
 *   The SDK import here is mediated via a child process that loads the package from the
 *   packages/storage workspace (the same ADR-008 package boundary); the fixture itself
 *   does not import @azure/storage-blob at the module level.
 *
 * ADR-009: Client PUTs directly to storage — this fixture sets up the server-side CORS
 *   configuration so the browser can make cross-origin PUTs. The bytes still flow directly
 *   from the browser to Azurite.
 */

import { execSync } from "child_process";
import * as path from "path";

// Resolve the monorepo root relative to this file's location.
// The fixture lives at: apps/portal/e2e/fixtures/azurite-cors.ts
// Monorepo root is 5 levels up: fixture → e2e → portal → apps → root
// We use process.cwd() as the anchor (Playwright sets cwd to the project root,
// which is apps/portal). Then we climb two more levels to the monorepo root.
// DECISION (TASK-007-006): Avoid import.meta.url which may not be available in
// Playwright's CommonJS-based test loader (Playwright compiles .ts to CJS internally).
const PORTAL_ROOT = process.cwd(); // apps/portal (Playwright sets cwd to the config dir)
const MONOREPO_ROOT = path.resolve(PORTAL_ROOT, "../../");

// Path to @azure/storage-blob within the packages/storage workspace.
// ADR-008: this is the canonical location for the Azure Blob Storage SDK.
const SDK_PATH = path.join(
  MONOREPO_ROOT,
  "packages",
  "storage",
  "node_modules",
  "@azure",
  "storage-blob",
);

// Azurite devstoreaccount1 well-known public credentials (for local emulator only).
// These are documented as the default Azurite dev credentials — not a real secret.
const AZURITE_ACCOUNT_NAME = "devstoreaccount1";
const AZURITE_ACCOUNT_KEY =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

/**
 * Configure CORS rules on the Azurite Blob service.
 *
 * Calls BlobServiceClient.setProperties() via a child Node.js process that imports
 * the Azure SDK from the packages/storage workspace. The child process connects to
 * Azurite at http://{azuriteHost}:{azuritePort}/devstoreaccount1.
 *
 * Idempotent — safe to call multiple times (each call overwrites the CORS rules).
 * Persists for the lifetime of the Azurite container (in-memory; resets on restart).
 *
 * Call once in a test.beforeAll block (not beforeEach — one call per test run is enough).
 *
 * @param azuriteHost - Azurite hostname as seen from the Playwright test runner.
 *                      Defaults to "localhost" (the docker-compose mapped port).
 * @param azuritePort - Azurite port. Defaults to 10000.
 */
export async function configureAzuriteCors(
  azuriteHost = "localhost",
  azuritePort = 10000,
): Promise<void> {
  // Build the Azurite connection string using the host:port accessible from the test runner.
  const blobEndpoint = `http://${azuriteHost}:${azuritePort}/${AZURITE_ACCOUNT_NAME}`;
  const connectionString =
    `DefaultEndpointsProtocol=http;AccountName=${AZURITE_ACCOUNT_NAME};` +
    `AccountKey=${AZURITE_ACCOUNT_KEY};BlobEndpoint=${blobEndpoint}`;

  // Inline Node.js script that calls BlobServiceClient.setProperties().
  // Uses JSON.stringify for safe embedding of the connection string.
  const script = `
const { BlobServiceClient } = require(${JSON.stringify(SDK_PATH)});
const client = BlobServiceClient.fromConnectionString(${JSON.stringify(connectionString)});
client.setProperties({
  cors: [{
    allowedOrigins: '*',
    allowedMethods: 'DELETE,GET,HEAD,MERGE,POST,OPTIONS,PUT,PATCH',
    allowedHeaders: 'content-type,x-ms-blob-type,x-ms-version,x-ms-date,authorization,x-ms-client-request-id',
    exposedHeaders: 'etag,x-ms-request-id,x-ms-version',
    maxAgeInSeconds: 86400,
  }]
}).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
`;

  // Run in a child process synchronously. Throws on non-zero exit.
  execSync(`node --input-type=commonjs`, {
    input: script,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 10_000,
  });
}

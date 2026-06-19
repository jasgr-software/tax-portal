/**
 * packages/storage/src/select.ts — Env-driven FileStorage binding selector
 *
 * Selects exactly ONE active FileStorage binding based on the STORAGE_ADAPTER
 * environment variable. Exactly one binding is active per process.
 *
 * STORAGE_ADAPTER values:
 *   "azurite"  — AzuriteAdapter: local dev + CI (default)
 *   "memory"   — MemoryAdapter: unit tests only
 *   "cloud"    — Reserved for Phase-5 production adapter; THROWS in this build
 *
 * Security — FAIL-CLOSED BOOT (ADR-008 § Adapter binding):
 *
 *   STORAGE_ADAPTER=cloud        → THROW — no production adapter is bound in this build.
 *   STORAGE_ADAPTER=<unknown>    → THROW — unrecognized value caught at startup.
 *   STORAGE_ADAPTER=azurite      → AzuriteAdapter (reads STORAGE_CONNECTION_STRING, STORAGE_CONTAINER)
 *   STORAGE_ADAPTER=memory       → MemoryAdapter (test-only; no env vars required)
 *   STORAGE_ADAPTER unset        → THROW — explicit value required; no silent default.
 *
 *   A build that hasn't compiled a cloud adapter cannot accidentally run in cloud mode.
 *   This catches "forgot to wire the prod adapter" at startup, not at first file upload.
 *
 * Singleton: the adapter instance is created once and cached for the process lifetime
 * (Next.js long-lived Node.js process, ADR-007).
 *
 * Mirrors the fail-closed singleton pattern of packages/esign/src/select.ts.
 *
 * ADR-008: Object Storage Abstraction (Port-and-Adapter)
 * ADR-013: No cloud KMS/secrets SDK in app code
 * ADR-020: Encryption-at-rest is the adapter contract
 */

import type { FileStorage } from "./types.js";
import { AzuriteAdapter } from "./adapters/azurite.js";
import { MemoryAdapter } from "./adapters/memory.js";

// ─── Singleton ────────────────────────────────────────────────────────────────

let _storage: FileStorage | null = null;

/**
 * Returns the active FileStorage singleton for this process.
 * Reads STORAGE_ADAPTER once and caches the result.
 *
 * @returns The active FileStorage adapter.
 * @throws If STORAGE_ADAPTER=cloud (no production adapter bound in this build).
 * @throws If STORAGE_ADAPTER is unknown or unset.
 */
export function getStorage(): FileStorage {
  if (_storage) return _storage;
  _storage = makeStorage(process.env);
  return _storage;
}

/**
 * Create a new FileStorage instance based on the provided env.
 * Called once per process (singleton above). Exported for testing (reset via
 * resetStorageForTesting).
 *
 * @param env - The environment variable map (e.g., process.env).
 */
export function makeStorage(env: Record<string, string | undefined>): FileStorage {
  const rawAdapter = env["STORAGE_ADAPTER"];
  const adapter = rawAdapter?.toLowerCase();

  switch (adapter) {
    case "azurite": {
      const connectionString = env["STORAGE_CONNECTION_STRING"];
      if (!connectionString) {
        throw new Error(
          "[packages/storage] STORAGE_ADAPTER=azurite requires STORAGE_CONNECTION_STRING. " +
            "Set it to the Azurite connection string (e.g. DefaultEndpointsProtocol=http;" +
            "AccountName=devstoreaccount1;AccountKey=<key>;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1). " +
            "See .env.example for the full format.",
        );
      }
      const containerName =
        env["STORAGE_CONTAINER"] ?? "tax-portal-documents";
      return new AzuriteAdapter(connectionString, containerName);
    }

    case "memory":
      // Test-only adapter. No env vars required.
      return new MemoryAdapter();

    case "cloud":
      // FAIL-CLOSED: no production adapter is compiled into this build (ADR-008 § Adapter binding).
      // Phase-5 will supply a concrete binding; until then, any cloud-shaped env throws at startup.
      throw new Error(
        "[packages/storage] STORAGE_ADAPTER=cloud but no production adapter is bound in this build. " +
          "Epic 001 does not include a production adapter. " +
          "See ADR-008 — the cloud binding is a Phase-5 slot. " +
          "For local dev and CI use STORAGE_ADAPTER=azurite. " +
          "For unit tests use STORAGE_ADAPTER=memory.",
      );

    case undefined:
    default:
      throw new Error(
        `[packages/storage] Unknown or missing STORAGE_ADAPTER="${rawAdapter ?? ""}". ` +
          `Valid values: "azurite" (local dev/CI default), "memory" (unit tests only), ` +
          `"cloud" (Phase-5 production — not yet bound; throws). ` +
          `Set STORAGE_ADAPTER in your environment. See .env.example.`,
      );
  }
}

/**
 * Reset the cached adapter singleton (for testing only).
 * Call this in test teardown when you need to re-read STORAGE_ADAPTER.
 *
 * @internal — test use only. Do not call in production code.
 */
export function resetStorageForTesting(): void {
  _storage = null;
}

/**
 * packages/storage/src/index.ts — Barrel export for @tax-portal/storage
 *
 * Exports:
 *   - FileStorage port interface type (and all I/O types)
 *   - getStorage — singleton selector
 *   - resetStorageForTesting — test teardown helper
 *
 * INTENTIONALLY NOT EXPORTED:
 *   - AzuriteAdapter — adapter class must not be in the public barrel.
 *     Only the interface type is exposed to apps.
 *   - MemoryAdapter — adapter class must not be in the public barrel.
 *   - makeStorage — internal factory; import from "./select.js" in tests only.
 *
 * Apps import from @tax-portal/storage — never from a concrete adapter file.
 * The @azure/storage-blob SDK is confined to adapters/azurite.ts and must
 * never appear in apps/** route handlers or server actions (ADR-008/ADR-020).
 *
 * ADR-008: Object Storage Abstraction (Port-and-Adapter)
 * ADR-013: No cloud KMS/secrets SDK in app code
 * ADR-020: Encryption-at-rest is the adapter contract, NOT app code
 */

// ─── Port Interface Type ──────────────────────────────────────────────────────
// Apps code against FileStorage and the I/O types ONLY.
export type {
  FileStorage,
  PutInput,
  PutResult,
  SignedUrl,
  SignedUrlOptions,
  SignedUploadOptions,
  ObjectStat,
  ObjectSummary,
  ListOptions,
} from "./types.js";

// ─── Binding Selector ─────────────────────────────────────────────────────────
export { getStorage } from "./select.js";

// ─── Test Reset ───────────────────────────────────────────────────────────────
// Exported for test use only. Do NOT use in production code.
// Tests must call this in afterEach to clear the singleton between tests.
export { resetStorageForTesting } from "./select.js";

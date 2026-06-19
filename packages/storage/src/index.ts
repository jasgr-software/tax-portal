/**
 * packages/storage/src/index.ts — Barrel export for @tax-portal/storage
 *
 * Exports:
 *   - FileStorage port interface type (and all I/O types)
 *   - getStorage — singleton selector
 *   - resetStorageForTesting — test teardown helper
 *   - FileScanner port interface type + ScanVerdict + ScanObjectRef
 *   - getFileScanner — scanner singleton selector
 *   - resetScannerForTesting — scanner test teardown helper
 *   - validateUploadedBytes — MIME/magic-byte + size validation helper
 *   - ValidationResult, ValidateUploadedBytesInput, MAX_FILE_SIZE_BYTES
 *
 * INTENTIONALLY NOT EXPORTED:
 *   - AzuriteAdapter — adapter class must not be in the public barrel.
 *     Only the interface type is exposed to apps.
 *   - MemoryAdapter — adapter class must not be in the public barrel.
 *   - makeStorage — internal factory; import from "./select.js" in tests only.
 *   - MockFileScanner — binding class must not be in the public barrel.
 *   - CloudFileScanner — binding class must not be in the public barrel.
 *   - createFileScanner — internal factory; import from "./scanner/select.js" in tests only.
 *
 * Apps import from @tax-portal/storage — never from a concrete adapter/binding file.
 * The @azure/storage-blob SDK is confined to adapters/azurite.ts and must
 * never appear in apps/** route handlers or server actions (ADR-008/ADR-020).
 * No vendor scanner SDK may appear in app code — ADR-013/021.
 *
 * ADR-008: Object Storage Abstraction (Port-and-Adapter)
 * ADR-013: No cloud KMS/secrets SDK in app code
 * ADR-020: Encryption-at-rest is the adapter contract, NOT app code
 * ADR-021: File-upload safety — FileScanner port + MIME/size validation
 */

// ─── FileStorage Port Interface Type ─────────────────────────────────────────
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

// ─── FileStorage Binding Selector ─────────────────────────────────────────────
export { getStorage } from "./select.js";

// ─── FileStorage Test Reset ───────────────────────────────────────────────────
// Exported for test use only. Do NOT use in production code.
// Tests must call this in afterEach to clear the singleton between tests.
export { resetStorageForTesting } from "./select.js";

// ─── FileScanner Port Interface Type ─────────────────────────────────────────
// Apps code against FileScanner, ScanVerdict, and ScanObjectRef ONLY.
// Never import a concrete binding (MockFileScanner, CloudFileScanner) in app code.
export type { FileScanner, ScanVerdict, ScanObjectRef } from "./scanner/port.js";

// ─── FileScanner Binding Selector ────────────────────────────────────────────
export { getFileScanner } from "./scanner/select.js";

// ─── FileScanner Test Reset ───────────────────────────────────────────────────
// Exported for test use only. Do NOT use in production code.
// Tests must call this in afterEach to clear the scanner singleton between tests.
export { resetScannerForTesting } from "./scanner/select.js";

// ─── MIME/Size Validation Helper ──────────────────────────────────────────────
// validateUploadedBytes — magic-byte content-type check + 100 MB size cap.
// SAFETY CHECK, not a type allow-list (REQ-FILE-002 / AC-FILE-002-01 / ADR-021 §2).
export {
  validateUploadedBytes,
  MAX_FILE_SIZE_BYTES,
} from "./validation.js";
export type {
  ValidationResult,
  ValidateUploadedBytesInput,
} from "./validation.js";

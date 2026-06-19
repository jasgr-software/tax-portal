/**
 * packages/storage/src/validation.test.ts — validateUploadedBytes unit tests
 *
 * Covers:
 *   - MIME/magic-byte mismatch detection (exe bytes declared as PDF → mime-mismatch)
 *   - Uncommon-but-consistent type passes (NOT rejected — REQ-FILE-002 / AC-FILE-002-01)
 *   - Size cap enforcement (> 100 MB → too-large)
 *   - Pass cases (known types matching their declared type)
 *   - Edge cases (no bytes, empty bytes, size = exactly 100 MB)
 *
 * ADR-021 §2: magic-byte content sniff + size cap, NOT a type allow-list.
 * REQ-FILE-002 / AC-FILE-002-01: any content type accepted.
 */

import { describe, it, expect } from "vitest";
import { validateUploadedBytes, MAX_FILE_SIZE_BYTES } from "./validation.js";

// ─── Helpers — magic bytes ────────────────────────────────────────────────────

/** Windows PE / MZ header (executables: .exe, .dll, .com). */
const MZ_HEADER = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

/** PDF magic bytes (%PDF). */
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

/** PNG magic bytes. */
const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** ZIP magic bytes (PK header — also DOCX/XLSX). */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

/** JPEG magic bytes (FF D8 FF). */
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/** ELF magic bytes (Linux executables / shared libs). */
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);

/**
 * Arbitrary bytes that are NOT a known executable or a known file type signature.
 * Used to represent files whose type we don't have a magic signature for.
 */
const ARBITRARY_BYTES = Buffer.from([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
]);

// ─── Tests-to-Write-First (TASK-007-002 §Tests to Write First) ───────────────

describe("validateUploadedBytes — MIME mismatch detection", () => {
  it("rejects exe bytes (MZ header) declared as application/pdf → mime-mismatch", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      bytes: MZ_HEADER,
      sizeBytes: MZ_HEADER.length,
    });
    expect(result).toBe("mime-mismatch");
  });

  it("rejects ELF bytes declared as application/pdf → mime-mismatch", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      bytes: ELF_MAGIC,
      sizeBytes: ELF_MAGIC.length,
    });
    expect(result).toBe("mime-mismatch");
  });

  it("rejects exe bytes (MZ) declared as image/png → mime-mismatch", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "image/png",
      bytes: MZ_HEADER,
      sizeBytes: MZ_HEADER.length,
    });
    expect(result).toBe("mime-mismatch");
  });

  it("rejects PNG bytes declared as application/pdf → mime-mismatch", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      bytes: PNG_MAGIC,
      sizeBytes: PNG_MAGIC.length,
    });
    expect(result).toBe("mime-mismatch");
  });

  it("rejects ZIP bytes declared as image/jpeg → mime-mismatch", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "image/jpeg",
      bytes: ZIP_MAGIC,
      sizeBytes: ZIP_MAGIC.length,
    });
    expect(result).toBe("mime-mismatch");
  });
});

describe("validateUploadedBytes — uncommon/arbitrary type passes (NOT rejected — AC-FILE-002-01)", () => {
  /**
   * SDET FOCUS AREA: the helper must NOT reject an uncommon/arbitrary-but-internally-
   * consistent file type merely for its format.
   *
   * These tests verify that unknown types with non-executable bytes PASS through.
   * This is the explicit guarantee of REQ-FILE-002 / AC-FILE-002-01: any type accepted.
   */

  it("accepts an Apple Pages file (application/x-iwork-pages-sffpages) with arbitrary bytes", async () => {
    // Pages files are a ZIP-based format, but when declared as their own MIME type
    // we don't have a magic-to-type mapping for them → should pass (unknown type).
    // Use arbitrary bytes (not MZ/ELF/known-executable) to simulate an unknown format.
    const result = await validateUploadedBytes({
      declaredContentType: "application/x-iwork-pages-sffpages",
      bytes: ARBITRARY_BYTES,
      sizeBytes: ARBITRARY_BYTES.length,
    });
    expect(result).toBe("pass");
  });

  it("accepts a 3D model file (model/gltf-binary) with arbitrary bytes — uncommon type passes", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "model/gltf-binary",
      bytes: ARBITRARY_BYTES,
      sizeBytes: ARBITRARY_BYTES.length,
    });
    expect(result).toBe("pass");
  });

  it("accepts a chemical data file (chemical/x-mdl-molfile) with arbitrary bytes", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "chemical/x-mdl-molfile",
      bytes: ARBITRARY_BYTES,
      sizeBytes: ARBITRARY_BYTES.length,
    });
    expect(result).toBe("pass");
  });

  it("accepts an application/octet-stream with arbitrary bytes (binary blob — no known sig)", async () => {
    // application/octet-stream is mapped to the MZ/exe signatures in our table,
    // but arbitrary non-MZ bytes should pass through since the declared type
    // allows any binary content that doesn't match an executable signature.
    // DECISION: application/octet-stream IS in the MZ types list, meaning if bytes
    // are MZ we DON'T flag a mismatch (declared octet-stream + exe bytes is ambiguous —
    // the declared type is inherently generic). We test arbitrary bytes here.
    const result = await validateUploadedBytes({
      declaredContentType: "application/octet-stream",
      bytes: ARBITRARY_BYTES,
      sizeBytes: ARBITRARY_BYTES.length,
    });
    // Arbitrary non-MZ bytes declared as application/octet-stream:
    // TYPE_TO_SIGNATURES has entries for application/octet-stream (MZ),
    // so the known-sig check fires, and the bytes DON'T match MZ → this would be
    // 'mime-mismatch'. However, that is overly strict for a generic binary type.
    // DECISION (TASK-007-002): application/octet-stream is removed from the MZ types
    // list — it is too generic to key a signature check on. We verify the test intent:
    // the result should be 'pass' for arbitrary bytes + octet-stream.
    expect(result).toBe("pass");
  });

  it("accepts a completely unknown MIME type with arbitrary non-executable bytes", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "application/x-tax-portal-internal-v1",
      bytes: ARBITRARY_BYTES,
      sizeBytes: ARBITRARY_BYTES.length,
    });
    expect(result).toBe("pass");
  });

  it("accepts a text/plain file with arbitrary text bytes", async () => {
    const textBytes = Buffer.from("Hello, this is a plain text file.");
    const result = await validateUploadedBytes({
      declaredContentType: "text/plain",
      bytes: textBytes,
      sizeBytes: textBytes.length,
    });
    expect(result).toBe("pass");
  });
});

describe("validateUploadedBytes — size cap enforcement", () => {
  it("rejects bytes > 100 MB → too-large", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      bytes: PDF_MAGIC, // bytes themselves are small; sizeBytes is authoritative
      sizeBytes: MAX_FILE_SIZE_BYTES + 1,
    });
    expect(result).toBe("too-large");
  });

  it("rejects sizeBytes = 100 MB + 1 byte → too-large", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "image/jpeg",
      bytes: JPEG_MAGIC,
      sizeBytes: 100 * 1024 * 1024 + 1,
    });
    expect(result).toBe("too-large");
  });

  it("size check fires before MIME check — even a mime mismatch returns too-large when oversized", async () => {
    // sizeBytes > cap AND exe bytes declared as PDF → too-large wins (size checked first).
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      bytes: MZ_HEADER,
      sizeBytes: MAX_FILE_SIZE_BYTES + 1,
    });
    expect(result).toBe("too-large");
  });

  it("accepts sizeBytes = exactly 100 MB → pass", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      bytes: PDF_MAGIC,
      sizeBytes: MAX_FILE_SIZE_BYTES,
    });
    expect(result).toBe("pass");
  });

  it("MAX_FILE_SIZE_BYTES constant is 100 MB (104857600 bytes)", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(100 * 1024 * 1024);
    expect(MAX_FILE_SIZE_BYTES).toBe(104857600);
  });
});

describe("validateUploadedBytes — pass cases (known types, matching bytes)", () => {
  it("PDF bytes declared as application/pdf → pass", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      bytes: PDF_MAGIC,
      sizeBytes: PDF_MAGIC.length,
    });
    expect(result).toBe("pass");
  });

  it("PNG bytes declared as image/png → pass", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "image/png",
      bytes: PNG_MAGIC,
      sizeBytes: PNG_MAGIC.length,
    });
    expect(result).toBe("pass");
  });

  it("JPEG bytes declared as image/jpeg → pass", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "image/jpeg",
      bytes: JPEG_MAGIC,
      sizeBytes: JPEG_MAGIC.length,
    });
    expect(result).toBe("pass");
  });

  it("ZIP bytes declared as application/zip → pass", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "application/zip",
      bytes: ZIP_MAGIC,
      sizeBytes: ZIP_MAGIC.length,
    });
    expect(result).toBe("pass");
  });

  it("DOCX (ZIP bytes) declared as .docx MIME type → pass", async () => {
    const result = await validateUploadedBytes({
      declaredContentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: ZIP_MAGIC,
      sizeBytes: ZIP_MAGIC.length,
    });
    expect(result).toBe("pass");
  });

  it("Content-Type with charset param is handled gracefully (type extracted)", async () => {
    // "application/pdf; charset=binary" → extracts "application/pdf"
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf; charset=binary",
      bytes: PDF_MAGIC,
      sizeBytes: PDF_MAGIC.length,
    });
    expect(result).toBe("pass");
  });
});

describe("validateUploadedBytes — stream input", () => {
  it("accepts stream input for magic-byte detection (PDF bytes via stream)", async () => {
    const { Readable } = await import("node:stream");
    const stream = Readable.from(Buffer.concat([PDF_MAGIC, Buffer.alloc(100)]));
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      stream,
      sizeBytes: 108,
    });
    expect(result).toBe("pass");
  });

  it("detects mismatch from stream (MZ header via stream, declared as PDF)", async () => {
    const { Readable } = await import("node:stream");
    const stream = Readable.from(Buffer.concat([MZ_HEADER, Buffer.alloc(100)]));
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      stream,
      sizeBytes: 108,
    });
    expect(result).toBe("mime-mismatch");
  });

  it("when both bytes and stream are provided, bytes is used (stream ignored)", async () => {
    const { Readable } = await import("node:stream");
    // bytes = PDF magic; stream = MZ header — bytes wins.
    const stream = Readable.from(MZ_HEADER);
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      bytes: PDF_MAGIC,
      stream,
      sizeBytes: PDF_MAGIC.length,
    });
    expect(result).toBe("pass");
  });
});

describe("validateUploadedBytes — edge cases", () => {
  it("returns pass when neither bytes nor stream is provided (no bytes to check)", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(result).toBe("pass");
  });

  it("returns pass when bytes buffer is empty (0 length — no header to check)", async () => {
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      bytes: Buffer.alloc(0),
      sizeBytes: 0,
    });
    expect(result).toBe("pass");
  });

  it("returns pass when bytes are too short for known signature (partial header)", async () => {
    // Only 2 bytes — not enough to confirm PDF (needs 4: %PDF).
    const result = await validateUploadedBytes({
      declaredContentType: "application/pdf",
      bytes: Buffer.from([0x25, 0x50]), // partial %P
      sizeBytes: 2,
    });
    // Cannot confirm match or mismatch with only 2 bytes → pass (fail-open on truncation).
    expect(result).toBe("pass");
  });
});

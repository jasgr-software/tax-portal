/**
 * packages/storage/src/validation.ts — Upload safety validation helper
 *
 * validateUploadedBytes() — magic-byte content-type check + size cap.
 *
 * PURPOSE: This is a SAFETY CHECK, not a type allow-list.
 *
 *   ADR-009 / REQ-FILE-002 / AC-FILE-002-01: ANY content type is accepted.
 *   ADR-021 §2: Server-side validation confirms the *actual* content matches the
 *   claimed type (magic-byte/content sniffing) — rejecting mismatches (e.g. an
 *   .exe masquerading as application/pdf). "Any type" does NOT mean "no validation."
 *
 *   WHAT this checks:
 *     1. Bytes-vs-declared-type mismatch (magic-byte/signature sniff).
 *     2. File size exceeds 100 MB cap (ADR-009/021 — defense-in-depth).
 *
 *   WHAT this does NOT check:
 *     - Whether the declared content type is in some allowed-types list.
 *     - Whether the file format is "safe" or "dangerous" — AV scanning handles that.
 *     - Any restriction by file extension.
 *
 *   An unusual-but-internally-consistent type (e.g. application/x-iwork-pages-sffpages,
 *   model/gltf-binary, chemical/x-mdl-molfile) PASSES this check because:
 *     - The bytes match the declared type, OR
 *     - No magic-byte signature is known for that type (we never reject on "unknown").
 *
 * ADR-021 §2: Content-type / MIME validation.
 * ADR-009: Size limits (100 MB).
 * REQ-FILE-002 / AC-FILE-002-01: any content type accepted.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum file size in bytes — 100 MB (ADR-009 / ADR-021 §3). */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The result of validateUploadedBytes().
 *
 *   'pass'           — bytes match the declared content type AND size is within the cap.
 *   'mime-mismatch'  — the file's magic bytes do NOT match the declared content type
 *                      (e.g. Windows PE bytes declared as application/pdf).
 *   'too-large'      — sizeBytes > MAX_FILE_SIZE_BYTES (100 MB).
 *
 * A 'mime-mismatch' or 'too-large' result must prevent the file from being promoted
 * to active. The caller (TASK-007-004) is responsible for the state transition.
 */
export type ValidationResult = "pass" | "mime-mismatch" | "too-large";

/**
 * Input to validateUploadedBytes().
 *
 * Provide EITHER `bytes` (Buffer/Uint8Array already in memory) OR `stream`
 * (for large files where buffering is undesirable). At least one must be supplied;
 * if both are supplied, `bytes` is used and `stream` is ignored.
 *
 * `sizeBytes` is always required — it is the authoritative file size (from the
 * storage object stat, not the client-reported Content-Length).
 */
export interface ValidateUploadedBytesInput {
  /** The declared content type from the upload request / signed URL policy. */
  declaredContentType: string;
  /**
   * File bytes (first ~16 bytes are sufficient for magic-byte detection).
   * Provide this when the bytes are already in memory.
   */
  bytes?: Buffer | Uint8Array;
  /**
   * Readable stream of the file body.
   * Only the first 16 bytes are consumed (for magic-byte detection).
   * Provide this when you don't want to buffer the entire file.
   */
  stream?: NodeJS.ReadableStream;
  /**
   * File size in bytes (from the storage object stat after upload).
   * This is the authoritative size — not the client-reported header.
   */
  sizeBytes: number;
}

// ─── Magic-byte signatures ────────────────────────────────────────────────────

/**
 * Known magic-byte signatures — a minimal, non-exhaustive set covering the most
 * commonly misused file types (executables masquerading as other types).
 *
 * IMPORTANT DESIGN PRINCIPLE:
 *   We detect only KNOWN signatures and raise a mismatch when the DECLARED type
 *   says it should be one thing but the bytes say it is another known thing.
 *   We NEVER reject a file purely because we don't recognise its magic bytes —
 *   an unrecognised signature means the file type is beyond our known set, which
 *   is acceptable (REQ-FILE-002: any type accepted; AV scanning handles threats).
 *
 * This list is intentionally conservative:
 *   - Only types likely to be weaponised via type-spoofing are included.
 *   - Adding a type to this list does NOT mean we reject that type — it means
 *     we can detect when a file CLAIMS to be something else but IS this type.
 */
const MAGIC_SIGNATURES: ReadonlyArray<{
  /** MIME types whose actual file bytes start with this signature. */
  types: ReadonlyArray<string>;
  /** Byte offset at which the signature starts (0 for most types). */
  offset: number;
  /** The magic bytes. */
  bytes: ReadonlyArray<number>;
  /** Human-readable label for diagnostics. */
  label: string;
}> = [
  // PDF: %PDF
  {
    types: ["application/pdf"],
    offset: 0,
    bytes: [0x25, 0x50, 0x44, 0x46],
    label: "PDF",
  },
  // Windows PE (EXE, DLL, COM): MZ header
  // NOTE: application/octet-stream is intentionally EXCLUDED from this list.
  // It is too generic a type to key a magic-byte check on — many binary formats
  // legitimately use octet-stream as their declared type. Excluding it means
  // exe bytes declared as octet-stream are not flagged as a mismatch here; AV
  // scanning (FileScanner port) handles threat detection for such uploads.
  // See DECISION (TASK-007-002) in validation.test.ts.
  {
    types: [
      "application/x-msdownload",
      "application/x-msdos-program",
      "application/exe",
      "application/x-exe",
      "application/dos-exe",
      "application/x-winexe",
      "application/vnd.microsoft.portable-executable",
    ],
    offset: 0,
    bytes: [0x4d, 0x5a],
    label: "Windows PE (MZ)",
  },
  // ZIP (also DOCX, XLSX, PPTX, JAR, APK, etc.)
  {
    types: [
      "application/zip",
      "application/x-zip-compressed",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/java-archive",
      "application/vnd.android.package-archive",
    ],
    offset: 0,
    bytes: [0x50, 0x4b, 0x03, 0x04],
    label: "ZIP",
  },
  // GZIP
  {
    types: ["application/gzip", "application/x-gzip"],
    offset: 0,
    bytes: [0x1f, 0x8b],
    label: "GZIP",
  },
  // PNG
  {
    types: ["image/png"],
    offset: 0,
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    label: "PNG",
  },
  // JPEG
  {
    types: ["image/jpeg"],
    offset: 0,
    bytes: [0xff, 0xd8, 0xff],
    label: "JPEG",
  },
  // GIF87a / GIF89a
  {
    types: ["image/gif"],
    offset: 0,
    bytes: [0x47, 0x49, 0x46, 0x38],
    label: "GIF",
  },
  // WEBP (RIFF....WEBP — check offset 8 for WEBP marker)
  // Handled separately in isMagicMatch due to split offsets.
  // Not included in this table; WEBP images with image/webp pass by default.

  // ELF (Linux/Unix executables / shared libraries)
  {
    types: ["application/x-elf", "application/x-executable"],
    offset: 0,
    bytes: [0x7f, 0x45, 0x4c, 0x46],
    label: "ELF",
  },
  // Mach-O (macOS executables) — fat binary or single-arch
  {
    types: ["application/x-mach-binary"],
    offset: 0,
    bytes: [0xca, 0xfe, 0xba, 0xbe],
    label: "Mach-O fat binary",
  },
];

/**
 * Map from MIME type to the set of magic signatures it is KNOWN to match.
 * Computed once at module load.
 */
const TYPE_TO_SIGNATURES: Map<
  string,
  ReadonlyArray<(typeof MAGIC_SIGNATURES)[number]>
> = new Map();

for (const sig of MAGIC_SIGNATURES) {
  for (const t of sig.types) {
    const key = t.toLowerCase();
    const existing = TYPE_TO_SIGNATURES.get(key) ?? [];
    TYPE_TO_SIGNATURES.set(key, [...existing, sig]);
  }
}

/**
 * The set of MIME types whose ACTUAL bytes start with the Windows PE (MZ) header.
 * Used for cross-type detection: if the bytes are MZ but the declared type is NOT
 * in this set, that is a mismatch (exe masquerading as PDF, etc.).
 */
const EXECUTABLE_MAGIC_SIGNATURES = MAGIC_SIGNATURES.filter((s) =>
  ["Windows PE (MZ)", "ELF", "Mach-O fat binary"].includes(s.label),
);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate an uploaded file's bytes against its declared content type and the size cap.
 *
 * Returns:
 *   'pass'          — no mismatch found; file is within the size cap.
 *   'mime-mismatch' — the bytes DO NOT match the declared content type.
 *   'too-large'     — sizeBytes exceeds MAX_FILE_SIZE_BYTES (100 MB).
 *
 * Guaranteed NOT to throw (returns ValidationResult for all valid inputs).
 * Infrastructure failures (unreadable stream) may throw from the caller's perspective.
 *
 * @param input - See ValidateUploadedBytesInput.
 */
export async function validateUploadedBytes(
  input: ValidateUploadedBytesInput,
): Promise<ValidationResult> {
  // ── 1. Size check (defense-in-depth against storage-layer bypass) ──────────
  if (input.sizeBytes > MAX_FILE_SIZE_BYTES) {
    return "too-large";
  }

  // ── 2. Resolve the header bytes ────────────────────────────────────────────
  // We only need the first 16 bytes to identify any known magic signature.
  const HEADER_BYTES_NEEDED = 16;
  const header = await resolveHeader(input, HEADER_BYTES_NEEDED);

  // ── 3. MIME/magic-byte check ───────────────────────────────────────────────
  const mismatch = detectMimeMismatch(
    input.declaredContentType.toLowerCase().split(";")[0]!.trim(),
    header,
  );
  if (mismatch) {
    return "mime-mismatch";
  }

  return "pass";
}

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Resolve up to `maxBytes` from the input source (Buffer or stream).
 * Returns a Buffer containing the first `maxBytes` (or fewer, if the file is smaller).
 */
async function resolveHeader(
  input: ValidateUploadedBytesInput,
  maxBytes: number,
): Promise<Buffer> {
  if (input.bytes !== undefined) {
    // Already buffered — slice off the header.
    const buf = Buffer.isBuffer(input.bytes)
      ? input.bytes
      : Buffer.from(input.bytes);
    return buf.subarray(0, Math.min(buf.length, maxBytes));
  }

  if (input.stream) {
    return readPrefix(input.stream, maxBytes);
  }

  // Neither bytes nor stream provided — no header to check; cannot detect mismatch.
  return Buffer.alloc(0);
}

/**
 * Detect a MIME/magic-byte mismatch.
 *
 * Returns true when there is a KNOWN CONFLICT between the declared content type
 * and the detected magic bytes. Returns false when:
 *   - No known signature exists for the declared type (unknown → pass, not reject).
 *   - The declared type's signature matches the bytes.
 *   - The bytes are not long enough to determine whether a signature matches OR mismatches
 *     (fail-open on truncation: we can only signal a mismatch when bytes are long enough
 *      to definitively confirm the content IS a DIFFERENT known type).
 *
 * CROSS-TYPE DETECTION:
 *   Even when the declared type has no known signature, we still check if the
 *   bytes look like an executable (MZ/ELF/Mach-O) and the declared type is NOT
 *   a known executable type. This catches the "exe masquerading as PDF" case
 *   regardless of what declared type the attacker chose.
 */
function detectMimeMismatch(
  declaredType: string,
  header: Buffer,
): boolean {
  if (header.length === 0) {
    // No bytes to check — cannot detect mismatch. Pass through.
    return false;
  }

  // ── Case A: Declared type has known signatures ─────────────────────────────
  const knownSigs = TYPE_TO_SIGNATURES.get(declaredType);
  if (knownSigs && knownSigs.length > 0) {
    // The declared type HAS known signatures. We need to determine if the bytes
    // POSITIVELY match a DIFFERENT known type, not merely that they don't match
    // the declared type's signature (which could be due to truncation).
    //
    // Strategy:
    //   1. If the header is long enough for the declared type's signature AND
    //      no declared-type signature matches → check if the bytes match a DIFFERENT
    //      known type's signature (positive cross-type detection → mismatch).
    //   2. If the header is too short for ANY of the declared type's signatures →
    //      we cannot determine a mismatch (fail-open: pass through).

    // Check if we have enough bytes to test any of the declared type's signatures.
    const hasEnoughBytes = knownSigs.some(
      (sig) => header.length >= sig.offset + sig.bytes.length,
    );

    if (!hasEnoughBytes) {
      // Truncated header — cannot determine a mismatch. Pass through.
      return false;
    }

    // We have enough bytes. Check if any declared-type signature matches.
    const anyMatches = knownSigs.some((sig) =>
      matchesSignature(header, sig.offset, sig.bytes),
    );
    if (anyMatches) {
      return false; // Bytes match the declared type — no mismatch.
    }

    // No declared-type signature matches. Now check if the bytes match a DIFFERENT
    // known signature — that's a positive cross-type conflict (mismatch).
    const matchesOtherKnownType = MAGIC_SIGNATURES.some(
      (sig) =>
        // Exclude signatures that belong to the declared type.
        !sig.types.some((t) => t.toLowerCase() === declaredType) &&
        matchesSignature(header, sig.offset, sig.bytes),
    );

    if (matchesOtherKnownType) {
      return true; // Bytes definitively match a DIFFERENT known type → mismatch.
    }

    // Bytes don't match the declared type's signature, but also don't match any
    // other known type. This could be an unusual binary format or a truncated file.
    // We cannot signal a definitive mismatch — pass through (fail-open on ambiguity).
    return false;
  }

  // ── Case B: Declared type has NO known signatures ──────────────────────────
  // We don't know what bytes a Pages file, a GLTF, or an MDL mol file should start
  // with — so we cannot say "these bytes are wrong for that type." We do NOT reject.
  //
  // HOWEVER: if the bytes look like a known EXECUTABLE signature and the declared
  // type is NOT a known executable type, that IS a mismatch (exe masquerading as
  // an arbitrary/unknown type).
  const looksLikeExecutable = EXECUTABLE_MAGIC_SIGNATURES.some((sig) =>
    matchesSignature(header, sig.offset, sig.bytes),
  );
  if (looksLikeExecutable) {
    // Check if the declared type is itself a known executable type.
    const isKnownExecutableType = EXECUTABLE_MAGIC_SIGNATURES.some((sig) =>
      sig.types.some((t) => t.toLowerCase() === declaredType),
    );
    if (!isKnownExecutableType) {
      return true; // Executable bytes declared as a non-executable type → mismatch.
    }
  }

  return false;
}

/**
 * Test whether `header` contains `sigBytes` at `offset`.
 * Returns false if the header is too short to contain the signature.
 */
function matchesSignature(
  header: Buffer,
  offset: number,
  sigBytes: ReadonlyArray<number>,
): boolean {
  if (header.length < offset + sigBytes.length) return false;
  for (let i = 0; i < sigBytes.length; i++) {
    if (header[offset + i] !== sigBytes[i]) return false;
  }
  return true;
}

/**
 * Read up to `maxBytes` from a readable stream and return as a Buffer.
 * Pauses the stream after reading — only the prefix is consumed.
 */
async function readPrefix(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      stream.pause();
      resolve(Buffer.concat(chunks));
    };

    stream.on("data", (chunk: Buffer | string) => {
      if (done) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = maxBytes - total;
      if (remaining <= 0) {
        finish();
        return;
      }
      chunks.push(buf.subarray(0, Math.min(buf.length, remaining)));
      total += Math.min(buf.length, remaining);
      if (total >= maxBytes) finish();
    });

    stream.on("end", finish);
    stream.on("error", (err: Error) => {
      if (done) return;
      done = true;
      reject(err);
    });

    stream.resume();
  });
}

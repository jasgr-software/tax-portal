/**
 * packages/storage/src/ttl.ts — TTL policy constants and enforcement
 *
 * ADR-008 § TTL policy:
 *   - Download default: 300s (5 min); max: 3600s (1 hour)
 *   - Upload default:   900s (15 min); max: 3600s (1 hour)
 *
 * Requests for longer TTLs THROW. Adapters call assertDownloadTtl() and
 * assertUploadTtl() as the single enforcement point — never implement
 * TTL caps in caller code.
 *
 * ADR-009 §: all signing goes through packages/storage; this file is the
 * one auditable source for the cap values.
 */

export const TTL = {
  DOWNLOAD_DEFAULT_S: 300,
  DOWNLOAD_MAX_S: 3600,
  UPLOAD_DEFAULT_S: 900,
  UPLOAD_MAX_S: 3600,
} as const;

/**
 * Returns the effective download TTL in seconds.
 * Throws if the requested TTL exceeds the cap.
 */
export function resolveDownloadTtl(ttlSeconds?: number): number {
  const ttl = ttlSeconds ?? TTL.DOWNLOAD_DEFAULT_S;
  if (ttl > TTL.DOWNLOAD_MAX_S) {
    throw new Error(
      `[packages/storage] Requested download TTL ${ttl}s exceeds the maximum allowed ` +
        `${TTL.DOWNLOAD_MAX_S}s (ADR-008 § TTL policy). ` +
        `Use a shorter TTL or a service-to-service copy for long-lived access.`,
    );
  }
  return ttl;
}

/**
 * Returns the effective upload TTL in seconds.
 * Throws if the requested TTL exceeds the cap.
 */
export function resolveUploadTtl(ttlSeconds?: number): number {
  const ttl = ttlSeconds ?? TTL.UPLOAD_DEFAULT_S;
  if (ttl > TTL.UPLOAD_MAX_S) {
    throw new Error(
      `[packages/storage] Requested upload TTL ${ttl}s exceeds the maximum allowed ` +
        `${TTL.UPLOAD_MAX_S}s (ADR-008 § TTL policy). ` +
        `Use a shorter TTL or a service-to-service copy for long-lived access.`,
    );
  }
  return ttl;
}

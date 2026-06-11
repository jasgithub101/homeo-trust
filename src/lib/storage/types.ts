import "server-only";

/**
 * Storage abstraction (the "storage port") for private patient attachments.
 *
 * Every driver (local disk, S3-compatible object store, …) implements this same
 * interface so the rest of the app never depends on a concrete backend. Storage
 * keys are ALWAYS server-generated and opaque (`patients/{patientId}/{attachmentId}/{cuid}`):
 * they carry no PII, no raw filename, and are never client-supplied.
 *
 * Security note: attachments are private by default. A driver must NEVER place
 * blobs under a publicly-served path, and `getSignedUrl` must mint short-lived,
 * unguessable URLs only. Authorization is enforced upstream on every request —
 * a signed URL/token is defense-in-depth, never the primary access gate.
 */

export interface PutObjectInput {
  /** Opaque, server-generated storage key (never client-supplied). */
  key: string;
  /** Raw file bytes. */
  body: Buffer;
  /** Validated MIME type (already passed the upload allow-list). */
  contentType: string;
}

export interface StoragePort {
  /** Persist bytes under `key`. Overwrites are not expected (keys are unique). */
  put(input: PutObjectInput): Promise<void>;

  /**
   * Open a readable Web stream of the object's bytes for the download route to
   * pipe into a `Response`. Throws if the object does not exist.
   */
  getStream(key: string): Promise<ReadableStream<Uint8Array>>;

  /** Best-effort removal of the blob (used to roll back a failed upload). */
  delete(key: string): Promise<void>;

  /**
   * Mint a short-lived, unguessable URL granting temporary read access to the
   * object. `expiresInSeconds` is clamped by the driver to a small window
   * (60–300s). For object stores this is a provider-signed URL; for local disk
   * it is an HMAC-token URL back to the authenticated download route (the token
   * alone never grants access — the session check still runs).
   */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;

  /** True if an object exists at `key`. */
  exists(key: string): Promise<boolean>;
}

/** Supported storage drivers, selected via `STORAGE_DRIVER`. */
export type StorageDriver = "local" | "s3";

/** Signed-URL TTL bounds (seconds). Drivers clamp requests into this window. */
export const SIGNED_URL_MIN_TTL = 60;
export const SIGNED_URL_MAX_TTL = 300;

export function clampSignedUrlTtl(seconds: number): number {
  if (!Number.isFinite(seconds)) return SIGNED_URL_MIN_TTL;
  return Math.min(SIGNED_URL_MAX_TTL, Math.max(SIGNED_URL_MIN_TTL, Math.floor(seconds)));
}

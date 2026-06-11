import "server-only";
import {
  clampSignedUrlTtl,
  type PutObjectInput,
  type StoragePort,
} from "./types";

/**
 * S3-compatible object-storage driver — DESIGN STUB (Phase 7).
 *
 * This driver is intentionally NOT wired to a live bucket yet. It documents the
 * production shape so swapping `STORAGE_DRIVER=s3` later is a config change, not
 * a refactor. Every method throws until the AWS SDK v3 wiring + bucket are
 * provisioned (a later infrastructure phase — explicitly out of Phase 7 scope).
 *
 * Intended implementation (AWS SDK v3, S3-compatible — AWS, MinIO, R2, …):
 *   - `put`         → PutObjectCommand (private ACL; ServerSideEncryption).
 *                     Set ContentType + ContentDisposition=attachment (non-image)
 *                     so presigned-URL responses carry the same anti-sniffing
 *                     posture the local download route enforces via headers.
 *   - `getStream`   → GetObjectCommand; adapt `Body` (a web stream) to the port.
 *   - `delete`      → DeleteObjectCommand.
 *   - `getSignedUrl`→ @aws-sdk/s3-request-presigner getSignedUrl({ expiresIn }),
 *                     clamped to the 60–300s window; the download route 302s to it.
 *   - `exists`      → HeadObjectCommand (404 → false).
 *
 * Config comes from env (see src/lib/env.ts): STORAGE_S3_BUCKET, STORAGE_S3_REGION,
 * STORAGE_S3_ENDPOINT (optional, for non-AWS), STORAGE_S3_ACCESS_KEY_ID,
 * STORAGE_S3_SECRET_ACCESS_KEY, STORAGE_S3_FORCE_PATH_STYLE (optional).
 *
 * Security invariants the real driver must keep: bucket is PRIVATE (no public
 * ACL / no public bucket policy), objects are encrypted at rest, and only
 * short-lived presigned URLs are ever handed out — never a stable public URL.
 */
export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export class S3Storage implements StoragePort {
  constructor(private readonly config: S3Config) {}

  private notWired(): never {
    throw new Error(
      "S3Storage is a design stub and is not wired to a bucket yet. " +
        "Set STORAGE_DRIVER=local for development, or implement the AWS SDK v3 " +
        "calls described in src/lib/storage/s3.ts before enabling S3.",
    );
  }

  // The signatures below match StoragePort exactly so the real implementation
  // is a drop-in. `void` references keep the unused params honest for lint.
  async put(_input: PutObjectInput): Promise<void> {
    void _input;
    this.notWired();
  }

  async getStream(_key: string): Promise<ReadableStream<Uint8Array>> {
    void _key;
    this.notWired();
  }

  async delete(_key: string): Promise<void> {
    void _key;
    this.notWired();
  }

  async getSignedUrl(_key: string, expiresInSeconds: number): Promise<string> {
    void _key;
    void clampSignedUrlTtl(expiresInSeconds);
    this.notWired();
  }

  async exists(_key: string): Promise<boolean> {
    void _key;
    this.notWired();
  }
}

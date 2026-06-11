import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { env } from "@/lib/env";
import { signKey } from "./signing";
import {
  clampSignedUrlTtl,
  type PutObjectInput,
  type StoragePort,
} from "./types";

/**
 * Local-disk storage driver for development.
 *
 * Blobs live under a gitignored, NON-public base directory (default
 * `var/attachments/`) — never under `public/`, so they are never statically
 * served. Reads/writes go through this driver; the only way to fetch bytes is
 * the authenticated download route.
 *
 * Keys are server-generated and opaque. We still defensively reject any key
 * that could escape the base directory (path traversal) before touching disk.
 */
export class LocalDiskStorage implements StoragePort {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    // Resolve relative to the process cwd (repo root in dev).
    this.baseDir = resolve(baseDir ?? env().STORAGE_LOCAL_DIR);
  }

  /** Resolve a key to an absolute path, guaranteeing it stays inside baseDir. */
  private resolveKey(key: string): string {
    if (!key || key.includes("\0") || key.includes("..")) {
      throw new Error("Invalid storage key");
    }
    const full = resolve(this.baseDir, key);
    // The resolved path must be the base dir itself or strictly within it.
    if (full !== this.baseDir && !full.startsWith(this.baseDir + sep)) {
      throw new Error("Storage key escapes base directory");
    }
    return full;
  }

  async put({ key, body }: PutObjectInput): Promise<void> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    // `wx` would fail on overwrite; keys are unique cuids so a plain write is
    // fine and keeps a retried upload idempotent.
    await writeFile(full, body);
  }

  async getStream(key: string): Promise<ReadableStream<Uint8Array>> {
    const full = this.resolveKey(key);
    // Throw early with a clear error if missing, rather than a late stream error.
    await stat(full);
    const nodeStream = createReadStream(full);
    return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  }

  async delete(key: string): Promise<void> {
    const full = this.resolveKey(key);
    await rm(full, { force: true });
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    // The "signed URL" for local dev is an HMAC-token URL pointing back at the
    // authenticated download route. The token proves server-minting + freshness;
    // it is NOT an access grant on its own (the route still checks the session).
    const ttl = clampSignedUrlTtl(expiresInSeconds);
    const expiresAtMs = Date.now() + ttl * 1000;
    const sig = signKey(key, expiresAtMs);

    // Key shape is patients/{patientId}/{attachmentId}/{cuid} — derive the route.
    const [, patientId, attachmentId] = key.split("/");
    if (!patientId || !attachmentId) {
      throw new Error("Cannot derive download URL from storage key");
    }
    const base = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const params = new URLSearchParams({ exp: String(expiresAtMs), sig });
    return `${base}/patients/${patientId}/attachments/${attachmentId}/download?${params.toString()}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }
}

/** Build the conventional storage key for an attachment. Opaque, no PII. */
export function buildAttachmentKey(
  patientId: string,
  attachmentId: string,
  blobId: string,
): string {
  return join("patients", patientId, attachmentId, blobId);
}

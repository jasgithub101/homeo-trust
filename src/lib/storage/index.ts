import "server-only";
import { env } from "@/lib/env";
import { LocalDiskStorage } from "./local";
import type { StoragePort } from "./types";

/**
 * Storage factory. Selects the driver from `STORAGE_DRIVER` (default "local").
 * The instance is cached per server process so drivers can hold connections.
 *
 * The S3 driver is loaded with a dynamic `import("./s3")` ONLY when
 * `STORAGE_DRIVER=s3`, so local-disk installs (the common self-hosted case)
 * never pull the S3 driver — or, once it's wired, the AWS SDK — into the
 * server bundle. `getStorage()` is therefore async; the default local path
 * still loads statically and the `StoragePort` interface is unchanged.
 *
 * Import `getStorage()` from server-side code only (Server Actions, route
 * handlers, lib/). Never expose a driver or a raw blob to the client.
 */
let cached: StoragePort | null = null;

export async function getStorage(): Promise<StoragePort> {
  if (cached) return cached;

  const { STORAGE_DRIVER } = env();
  switch (STORAGE_DRIVER) {
    case "s3": {
      const { S3Storage } = await import("./s3");
      cached = new S3Storage({
        bucket: env().STORAGE_S3_BUCKET ?? "",
        region: env().STORAGE_S3_REGION ?? "",
        endpoint: env().STORAGE_S3_ENDPOINT,
        accessKeyId: env().STORAGE_S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: env().STORAGE_S3_SECRET_ACCESS_KEY ?? "",
        forcePathStyle: env().STORAGE_S3_FORCE_PATH_STYLE,
      });
      break;
    }
    case "local":
    default:
      cached = new LocalDiskStorage();
      break;
  }
  return cached;
}

export { buildAttachmentKey } from "./local";
export type { StoragePort, PutObjectInput } from "./types";

/**
 * No-op virus-scan seam (Phase 7). A real implementation (e.g. ClamAV / a
 * scanning service) belongs to a later hardening phase. Left here so the upload
 * flow has a single, explicit place to gate on scan results in the future.
 * Currently returns "skipped" and never blocks an upload.
 */
export async function scanOnUpload(_key: string): Promise<"skipped"> {
  void _key;
  return "skipped";
}

/**
 * Validated server-side environment variables.
 *
 * Import this only in server-side code (Server Actions, API routes, lib/).
 * Validation is LAZY: it runs the first time `env()` is called at request time,
 * not at module import. This keeps `next build` working without a populated
 * `.env.local`, while still failing fast at runtime if required vars are missing.
 *
 * Never log secret values from here.
 */
import { z } from "zod";

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Direct (non-pooled) connection used by Prisma migrations/seeding. Optional
  // at app runtime; in development it points at the same local database.
  DIRECT_URL: z.string().optional(),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 chars (used to HMAC session tokens)"),

  // Defaulted
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Attachment storage (Phase 7). `local` (default) writes blobs to a
  // gitignored, non-public directory; `s3` is the design stub for an
  // S3-compatible object store (not wired yet — see src/lib/storage/s3.ts).
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("var/attachments"),
  STORAGE_S3_BUCKET: z.string().optional(),
  STORAGE_S3_REGION: z.string().optional(),
  STORAGE_S3_ENDPOINT: z.string().optional(),
  STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_S3_FORCE_PATH_STYLE: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Log only the field names/messages, never the values.
    console.error(
      "Invalid environment variables:",
      result.error.flatten().fieldErrors,
    );
    throw new Error("Invalid environment variables — check .env.local");
  }
  cached = result.data;
  return cached;
}

import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env files. Load .env then .env.local
// (Next.js convention), with .env.local taking precedence.
loadEnv();
loadEnv({ path: ".env.local", override: true });

export default defineConfig({
  datasource: {
    // Migrations/introspection use the direct (non-pooled) connection.
    // In development DIRECT_URL and DATABASE_URL point at the same local DB.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});

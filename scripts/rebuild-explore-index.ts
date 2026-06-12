/**
 * Rebuild the de-identified ExploreCaseIndex from the raw clinical tables.
 *
 * Idempotent and safe to re-run (decision D6): it upserts one index row per
 * qualifying patient and deletes index rows whose patient no longer qualifies.
 * De-identification is centralized in `src/lib/explore/projection.ts`; this
 * script is a thin CLI wrapper around `rebuildExploreIndex`.
 *
 *   pnpm exec tsx scripts/rebuild-explore-index.ts
 *
 * Because there are no on-write sync hooks yet, the index is only as fresh as
 * the last run of this script (or the admin "Refresh Explore index" action).
 */
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { rebuildExploreIndex } from "../src/lib/explore/rebuild";

loadEnv();
loadEnv({ path: ".env.local", override: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

async function main() {
  const result = await rebuildExploreIndex(prisma);
  console.info(
    `Explore index rebuilt: scanned ${result.scanned} qualifying patient(s), ` +
      `upserted ${result.upserted}, deleted ${result.deleted} stale row(s), ` +
      `kept ${result.citiesKept} city cohort(s) (>= min cohort).`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

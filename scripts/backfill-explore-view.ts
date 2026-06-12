/**
 * ONE-TIME backfill — Explore access permission.
 *
 * Context: Phase 8 makes `explore.view` the single gate for the de-identified
 * Explore page (decision D7 folds the old `explore.filter` breadth into
 * `explore.view`). To preserve any pre-existing intent, this grants
 * `explore.view` to **existing** non-ADMIN roles that already hold a related
 * Explore permission but not yet the view gate.
 *
 * Like the Phase 5.1 / Phase 7 backfills, this is intentionally NOT part of
 * `prisma/seed.ts`: future roles must receive `explore.view` explicitly. Run
 * once during the Phase 8 upgrade:
 *
 *   pnpm exec tsx scripts/backfill-explore-view.ts
 *
 * Idempotent and non-destructive: only adds the missing link (via upsert) and
 * never removes anything. ADMIN already holds every permission, so it is skipped.
 */
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ADMIN_ROLE_NAME } from "../src/lib/permissions/keys";

loadEnv();
loadEnv({ path: ".env.local", override: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

// Holding any of these meant a role was previously intended to use Explore.
const RELATED_KEYS = ["explore.filter", "explore.viewDoctorName"];

async function main() {
  const view = await prisma.permission.findUnique({
    where: { key: "explore.view" },
    select: { id: true },
  });
  if (!view) {
    throw new Error(
      "explore.view permission not found. Run `pnpm db:seed` first.",
    );
  }

  const roles = await prisma.role.findMany({
    where: { name: { not: ADMIN_ROLE_NAME } },
    select: {
      id: true,
      name: true,
      rolePermissions: { select: { permission: { select: { key: true } } } },
    },
  });

  let granted = 0;
  for (const role of roles) {
    const keys = new Set(role.rolePermissions.map((rp) => rp.permission.key));
    const worksWithExplore = RELATED_KEYS.some((k) => keys.has(k));
    if (!worksWithExplore || keys.has("explore.view")) continue;

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: view.id },
      },
      update: {},
      create: { roleId: role.id, permissionId: view.id },
    });
    granted += 1;
    console.info(`Granted explore.view to role "${role.name}".`);
  }

  console.info(
    granted === 0
      ? "No roles needed backfill (no Explore-holding role missing the view gate)."
      : `Backfill complete: granted explore.view to ${granted} role(s).`,
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

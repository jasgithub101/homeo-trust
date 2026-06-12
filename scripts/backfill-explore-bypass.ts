/**
 * ONE-TIME backfill — Explore cohort-minimum bypass permission.
 *
 * Context: Phase 8 adds `explore.bypassCohortMinimum`, which lifts the <5-case
 * suppression backstop (D2) for a viewer. Per the approved "no restriction by
 * default" decision, the default Explore experience is UNSUPPRESSED, so this
 * grants the bypass to the SAME roles that have `explore.view`. To enforce the
 * privacy floor on a role later, an admin simply leaves this permission
 * ungranted / revokes it in the role-permission matrix.
 *
 * Like the other Phase 5.1 / 7 / 8 backfills, this is intentionally NOT part of
 * `prisma/seed.ts`: future roles must receive the bypass explicitly. Run once
 * during the Phase 8 upgrade, AFTER `backfill-explore-view.ts`:
 *
 *   pnpm exec tsx scripts/backfill-explore-bypass.ts
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

async function main() {
  const bypass = await prisma.permission.findUnique({
    where: { key: "explore.bypassCohortMinimum" },
    select: { id: true },
  });
  if (!bypass) {
    throw new Error(
      "explore.bypassCohortMinimum permission not found. Run `pnpm db:seed` first.",
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
    // Default-grant to every role that can use Explore.
    const usesExplore = keys.has("explore.view");
    if (!usesExplore || keys.has("explore.bypassCohortMinimum")) continue;

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: bypass.id },
      },
      update: {},
      create: { roleId: role.id, permissionId: bypass.id },
    });
    granted += 1;
    console.info(`Granted explore.bypassCohortMinimum to role "${role.name}".`);
  }

  console.info(
    granted === 0
      ? "No roles needed backfill (no explore.view role missing the bypass)."
      : `Backfill complete: granted explore.bypassCohortMinimum to ${granted} role(s).`,
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

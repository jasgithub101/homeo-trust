/**
 * ONE-TIME backfill — patient breadth permissions.
 *
 * Context: Phase 5.1 split patient access into BREADTH (`patient.viewAssigned` /
 * `patient.viewAll`) and DEPTH (`patient.viewSensitive` / `patient.viewDeidentified`).
 * Before this change, any role with a depth permission implicitly saw its
 * related patients. To preserve that behavior, this script grants
 * `patient.viewAssigned` to **existing** non-ADMIN roles that hold a depth
 * permission but no breadth permission yet.
 *
 * This is intentionally NOT part of `prisma/seed.ts`: future roles must receive
 * breadth permissions explicitly. Run once during the Phase 5.1 upgrade:
 *
 *   pnpm exec tsx scripts/backfill-patient-view-assigned.ts
 *
 * Idempotent and non-destructive: it only adds the missing `viewAssigned` link
 * (via upsert) and never removes anything. Re-running is safe, but it is meant
 * as a one-shot — by design it will also touch any later role that still
 * matches the predicate, so run it during the upgrade, not on a schedule.
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

const DEPTH_KEYS = ["patient.viewSensitive", "patient.viewDeidentified"];
const BREADTH_KEYS = ["patient.viewAssigned", "patient.viewAll"];

async function main() {
  const viewAssigned = await prisma.permission.findUnique({
    where: { key: "patient.viewAssigned" },
    select: { id: true },
  });
  if (!viewAssigned) {
    throw new Error(
      "patient.viewAssigned permission not found. Run `pnpm db:seed` first.",
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
    const hasDepth = DEPTH_KEYS.some((k) => keys.has(k));
    const hasBreadth = BREADTH_KEYS.some((k) => keys.has(k));
    if (!hasDepth || hasBreadth) continue;

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: viewAssigned.id,
        },
      },
      update: {},
      create: { roleId: role.id, permissionId: viewAssigned.id },
    });
    granted += 1;
    console.info(`Granted patient.viewAssigned to role "${role.name}".`);
  }

  console.info(
    granted === 0
      ? "No roles needed backfill (all depth-holding roles already have breadth)."
      : `Backfill complete: granted patient.viewAssigned to ${granted} role(s).`,
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

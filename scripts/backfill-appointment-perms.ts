/**
 * ONE-TIME backfill — appointment permissions (Feature A1).
 *
 * Grants `appointment.view` + `appointment.create` to existing non-ADMIN roles
 * that already hold a clinical permission (so clinical staff keep working with
 * the new appointments feature). `appointment.manage` is intentionally NOT
 * backfilled — it is granted explicitly per role.
 *
 * Like the Phase 5.1 / Phase 7 backfills, this is intentionally NOT part of
 * `prisma/seed.ts`: future roles must receive these keys explicitly. Run once:
 *
 *   pnpm exec tsx scripts/backfill-appointment-perms.ts
 *
 * Idempotent and non-destructive: only adds missing links (upsert), never
 * removes anything. ADMIN already holds every permission, so it is skipped.
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

// Holding any of these marks a role as "clinical" — it should be able to see
// and schedule a patient's appointments.
const CLINICAL_MARKER_KEYS = [
  "case.view",
  "treatment.create",
  "issue.view",
  "patient.viewAssigned",
];

const GRANT_KEYS = ["appointment.view", "appointment.create"];

async function main() {
  const grantPerms = await prisma.permission.findMany({
    where: { key: { in: GRANT_KEYS } },
    select: { id: true, key: true },
  });
  if (grantPerms.length !== GRANT_KEYS.length) {
    throw new Error(
      "appointment.view / appointment.create not found. Run `pnpm db:seed` first.",
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
    const isClinical = CLINICAL_MARKER_KEYS.some((k) => keys.has(k));
    if (!isClinical) continue;

    for (const perm of grantPerms) {
      if (keys.has(perm.key)) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
      granted += 1;
      console.info(`Granted ${perm.key} to role "${role.name}".`);
    }
  }

  console.info(
    granted === 0
      ? "No roles needed backfill (no clinical role missing appointment keys)."
      : `Backfill complete: granted ${granted} appointment permission link(s).`,
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

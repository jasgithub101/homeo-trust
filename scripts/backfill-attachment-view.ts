/**
 * ONE-TIME backfill — attachment breadth permission.
 *
 * Context: Phase 7 introduces `attachment.view` as the BREADTH gate for
 * attachments (list metadata + download non-sensitive files). Before this,
 * attachment access was implied by the depth/action permissions
 * (`attachment.viewSensitive` / `attachment.upload` / `attachment.delete`).
 * To preserve existing behavior, this script grants `attachment.view` to
 * **existing** non-ADMIN roles that hold any attachment permission but do not
 * yet have the new breadth key.
 *
 * Like the Phase 5.1 patient backfill, this is intentionally NOT part of
 * `prisma/seed.ts`: future roles must receive `attachment.view` explicitly.
 * Run once during the Phase 7 upgrade:
 *
 *   pnpm exec tsx scripts/backfill-attachment-view.ts
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

// Holding any of these meant a role previously worked with attachments.
const RELATED_KEYS = [
  "attachment.viewSensitive",
  "attachment.upload",
  "attachment.delete",
];

async function main() {
  const view = await prisma.permission.findUnique({
    where: { key: "attachment.view" },
    select: { id: true },
  });
  if (!view) {
    throw new Error(
      "attachment.view permission not found. Run `pnpm db:seed` first.",
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
    const worksWithAttachments = RELATED_KEYS.some((k) => keys.has(k));
    if (!worksWithAttachments || keys.has("attachment.view")) continue;

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: view.id },
      },
      update: {},
      create: { roleId: role.id, permissionId: view.id },
    });
    granted += 1;
    console.info(`Granted attachment.view to role "${role.name}".`);
  }

  console.info(
    granted === 0
      ? "No roles needed backfill (no attachment-holding role missing breadth)."
      : `Backfill complete: granted attachment.view to ${granted} role(s).`,
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

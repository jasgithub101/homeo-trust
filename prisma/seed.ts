/**
 * Seed: permissions catalog, the fixed ADMIN system role, and the first admin.
 *
 * Idempotent — safe to run repeatedly (upserts only; no destructive ops).
 * Run with: `pnpm db:seed` (or automatically after `pnpm db:migrate`).
 *
 * Admin bootstrap is configured via env (validated below), so no secret is
 * hardcoded. The first admin is created with mustChangePassword = true and must
 * set a new password on first login.
 */
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { z } from "zod";
import { PERMISSIONS, ADMIN_ROLE_NAME } from "../src/lib/permissions/keys";

loadEnv();
loadEnv({ path: ".env.local", override: true });

const seedEnvSchema = z.object({
  FIRST_ADMIN_NAME: z.string().min(1, "FIRST_ADMIN_NAME is required"),
  FIRST_ADMIN_EMAIL: z.string().email("FIRST_ADMIN_EMAIL must be a valid email"),
  FIRST_ADMIN_USERNAME: z
    .string()
    .min(3, "FIRST_ADMIN_USERNAME must be at least 3 chars"),
  // Temporary password — the admin is forced to change it on first login, so a
  // modest floor is enough here; the runtime policy enforces 12+ on change.
  FIRST_ADMIN_TEMP_PASSWORD: z
    .string()
    .min(8, "FIRST_ADMIN_TEMP_PASSWORD must be at least 8 chars"),
});

// argon2id is the @node-rs/argon2 default; matches src/lib/auth/password.ts.
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

// Use the direct (non-pooled) connection for this one-off admin operation,
// falling back to DATABASE_URL. For local dev both point to the same database.
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

async function main() {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "Cannot seed — missing/invalid admin bootstrap env:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Invalid seed environment. See .env.example for ADMIN_* vars.");
  }
  const adminEnv = parsed.data;

  // 1. Permissions (upsert by key).
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, description: p.description, category: p.category },
      create: p,
    });
  }
  console.info(`Seeded ${PERMISSIONS.length} permissions.`);

  // 2. ADMIN system role.
  const adminRole = await prisma.role.upsert({
    where: { name: ADMIN_ROLE_NAME },
    update: { isSystemRole: true },
    create: {
      name: ADMIN_ROLE_NAME,
      description: "Initial system role with all permissions.",
      isSystemRole: true,
    },
  });

  // 3. Link every permission to the ADMIN role.
  const allPermissions = await prisma.permission.findMany({ select: { id: true } });
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id },
      },
      update: {},
      create: { roleId: adminRole.id, permissionId: perm.id },
    });
  }
  console.info(`Linked ${allPermissions.length} permissions to ${ADMIN_ROLE_NAME}.`);

  // 4. First admin user (upsert by email). Created with forced password change.
  const adminEmail = adminEnv.FIRST_ADMIN_EMAIL.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  const passwordHash = await hash(
    adminEnv.FIRST_ADMIN_TEMP_PASSWORD,
    ARGON2_OPTIONS,
  );

  const adminUser = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        // Do not silently reset an existing admin's password on re-seed.
        data: { active: true },
      })
    : await prisma.user.create({
        data: {
          name: adminEnv.FIRST_ADMIN_NAME,
          email: adminEmail,
          username: adminEnv.FIRST_ADMIN_USERNAME,
          passwordHash,
          active: true,
          mustChangePassword: true,
        },
      });

  // 5. Assign ADMIN role to the first admin.
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  if (existing) {
    console.info(
      `Admin user already existed (${adminEmail}) — ensured active and ADMIN role assigned. Password left unchanged.`,
    );
  } else {
    console.info(
      `Created first admin (${adminEmail}). mustChangePassword = true; set a new password on first login.`,
    );
  }
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

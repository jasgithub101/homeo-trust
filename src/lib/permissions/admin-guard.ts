import "server-only";
import { db } from "@/lib/db";
import { ADMIN_ROLE_NAME } from "./keys";

/**
 * Guards that protect the ADMIN system role and prevent admin lockout.
 *
 * An "active admin" is an active user who holds the ADMIN system role. The
 * system must never reach zero active admins, so any operation that would remove
 * the ADMIN role from the last active admin (or, later, deactivate them) must be
 * blocked. These helpers are reused by user-role assignment now and by future
 * deactivation.
 */

/** The ADMIN system role (id + name), or null if somehow missing. */
export async function getAdminRole(): Promise<{ id: string; name: string } | null> {
  return db.role.findFirst({
    where: { name: ADMIN_ROLE_NAME, isSystemRole: true },
    select: { id: true, name: true },
  });
}

/** Count active users who currently hold the ADMIN system role. */
export async function countActiveAdmins(): Promise<number> {
  return db.user.count({
    where: {
      active: true,
      userRoles: {
        some: { role: { name: ADMIN_ROLE_NAME, isSystemRole: true } },
      },
    },
  });
}

export interface LastAdminCheck {
  ok: boolean;
  /** Present when ok === false. */
  reason?: string;
}

/**
 * Verify that replacing `userId`'s roles with `nextRoleIds` would not remove the
 * ADMIN role from the last active admin. Returns `{ ok: false, reason }` to be
 * surfaced as a user-facing error instead of throwing.
 */
export async function checkNotRemovingLastAdmin(
  userId: string,
  nextRoleIds: string[],
): Promise<LastAdminCheck> {
  const adminRole = await getAdminRole();
  if (!adminRole) return { ok: true };

  const target = await db.user.findUnique({
    where: { id: userId },
    select: {
      active: true,
      userRoles: { select: { roleId: true } },
    },
  });
  if (!target) return { ok: true };

  const currentlyHasAdmin = target.userRoles.some(
    (ur) => ur.roleId === adminRole.id,
  );
  const willHaveAdmin = nextRoleIds.includes(adminRole.id);

  // Only a transition that removes ADMIN from an active admin can cause lockout.
  if (!(currentlyHasAdmin && target.active && !willHaveAdmin)) {
    return { ok: true };
  }

  const activeAdmins = await countActiveAdmins();
  if (activeAdmins <= 1) {
    return {
      ok: false,
      reason: "Cannot remove the ADMIN role from the last administrator.",
    };
  }
  return { ok: true };
}

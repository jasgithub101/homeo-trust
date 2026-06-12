"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions/check";
import { hashPassword, destroyAllUserSessions } from "@/lib/auth";
import { generateTempPassword } from "@/lib/auth/temp-password";
import {
  getAdminRole,
  checkNotRemovingLastAdmin,
} from "@/lib/permissions/admin-guard";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { setUserRolesSchema } from "@/lib/validation/role";

export interface UserRolesState {
  error?: string;
  success?: string;
}

export async function setUserRolesAction(
  _prev: UserRolesState,
  formData: FormData,
): Promise<UserRolesState> {
  const actor = await requirePermission("user.assignRole");

  const parsed = setUserRolesSchema.safeParse({
    userId: formData.get("userId"),
    roleIds: formData.getAll("roleIds"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  const { userId } = parsed.data;
  const nextRoleIds = Array.from(new Set(parsed.data.roleIds));

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, userRoles: { select: { roleId: true } } },
  });
  if (!target) return { error: "User not found." };

  // All selected roles must exist.
  if (nextRoleIds.length > 0) {
    const found = await db.role.count({ where: { id: { in: nextRoleIds } } });
    if (found !== nextRoleIds.length) {
      return { error: "One or more selected roles no longer exist." };
    }
  }

  const currentRoleIds = new Set(target.userRoles.map((ur) => ur.roleId));
  const nextSet = new Set(nextRoleIds);

  // Changing ADMIN-role membership requires admin access (prevents a future
  // non-admin role-assigner from minting or removing admins).
  const adminRole = await getAdminRole();
  if (adminRole) {
    const adminChanged =
      currentRoleIds.has(adminRole.id) !== nextSet.has(adminRole.id);
    if (adminChanged && !actor.isAdmin) {
      return {
        error: "Only an administrator can assign or remove the ADMIN role.",
      };
    }
  }

  // Last-admin lockout protection.
  const lockCheck = await checkNotRemovingLastAdmin(userId, nextRoleIds);
  if (!lockCheck.ok) return { error: lockCheck.reason };

  const toRemove = [...currentRoleIds].filter((id) => !nextSet.has(id));
  const toAdd = nextRoleIds.filter((id) => !currentRoleIds.has(id));

  if (toRemove.length === 0 && toAdd.length === 0) {
    return { success: "No changes." };
  }

  await db.$transaction([
    db.userRole.deleteMany({
      where: { userId, roleId: { in: toRemove.length ? toRemove : ["__none__"] } },
    }),
    db.userRole.createMany({
      data: toAdd.map((roleId) => ({
        userId,
        roleId,
        assignedByUserId: actor.id,
      })),
      skipDuplicates: true,
    }),
  ]);

  await writeAuditLog({
    action: AUDIT_ACTIONS.USER_ROLES_CHANGED,
    actorUserId: actor.id,
    entityType: "User",
    entityId: userId,
    metadata: { added: toAdd, removed: toRemove },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  return { success: "Roles updated." };
}

export interface ResetPasswordState {
  error?: string;
  /** Present only on success — shown ONCE to the admin, never persisted/logged. */
  tempPassword?: string;
  username?: string;
}

/**
 * Admin "forgot password" reset: generate a temp password, force a change on
 * next login, invalidate ALL of the target's sessions, and return the temp
 * password for one-time on-screen display so the admin can hand it over in
 * person. The temp password is NEVER emailed, persisted in plaintext, or logged.
 *
 * Authorization (decision D3 + rider):
 * - gated on `user.update`;
 * - self-reset is refused (use Change password instead);
 * - resetting a user who holds ADMIN additionally requires the actor to be an
 *   admin — a reset hands the actor a credential that authenticates AS the
 *   target, so it must not be a privilege-escalation path. NOTE: the user-detail
 *   page is admin-only today, so only admins reach this action; if that page is
 *   ever opened to non-admin `user.update` holders, this guard must be
 *   strengthened (e.g. refuse to reset any user whose privileges exceed yours).
 */
export async function resetUserPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const actor = await requirePermission("user.update");

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Invalid request." };
  if (userId === actor.id) {
    return { error: "Use Change password to change your own password." };
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, userRoles: { select: { roleId: true } } },
  });
  if (!target) return { error: "User not found." };

  const adminRole = await getAdminRole();
  const targetIsAdmin = adminRole
    ? target.userRoles.some((ur) => ur.roleId === adminRole.id)
    : false;
  if (targetIsAdmin && !actor.isAdmin) {
    return { error: "Only an administrator can reset an administrator's password." };
  }

  // Generate + hash the temp password. The plaintext is returned to the caller
  // for one-time display and never stored or logged.
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: true },
  });

  // The old credential is gone/compromised — invalidate every target session.
  await destroyAllUserSessions(userId);

  await writeAuditLog({
    action: AUDIT_ACTIONS.PASSWORD_RESET_BY_ADMIN,
    actorUserId: actor.id,
    entityType: "User",
    entityId: userId,
    // ids only — never the temp password or a hash.
    metadata: { targetIsAdmin },
  });

  revalidatePath(`/admin/users/${userId}`);
  return { tempPassword, username: target.username };
}

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions/check";
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

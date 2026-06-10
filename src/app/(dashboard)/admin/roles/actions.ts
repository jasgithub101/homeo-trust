"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions/check";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import {
  createRoleSchema,
  updateRoleSchema,
  setRolePermissionsSchema,
  deleteRoleSchema,
} from "@/lib/validation/role";

export interface RoleFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

function emptyToNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

/** Find a role by name, case-insensitive (for friendly duplicate detection). */
async function findRoleByName(name: string, excludeId?: string) {
  return db.role.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}

export async function createRoleAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requirePermission("role.create");

  const parsed = createRoleSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { name, description } = parsed.data;

  if (await findRoleByName(name)) {
    return { fieldErrors: { name: ["A role with this name already exists"] } };
  }

  let role: { id: string };
  try {
    role = await db.role.create({
      data: { name, description: emptyToNull(description), isSystemRole: false },
      select: { id: true },
    });
  } catch {
    return { error: "Could not create the role. Please try again." };
  }

  await writeAuditLog({
    action: AUDIT_ACTIONS.ROLE_CREATED,
    actorUserId: actor.id,
    entityType: "Role",
    entityId: role.id,
    metadata: { name },
  });

  revalidatePath("/admin/roles");
  redirect(`/admin/roles/${role.id}`);
}

export async function updateRoleAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requirePermission("role.update");

  const parsed = updateRoleSchema.safeParse({
    roleId: formData.get("roleId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { roleId, name, description } = parsed.data;

  const role = await db.role.findUnique({
    where: { id: roleId },
    select: { id: true, isSystemRole: true },
  });
  if (!role) return { error: "Role not found." };
  if (role.isSystemRole) {
    return { error: "System roles cannot be edited." };
  }

  if (await findRoleByName(name, roleId)) {
    return { fieldErrors: { name: ["A role with this name already exists"] } };
  }

  await db.role.update({
    where: { id: roleId },
    data: { name, description: emptyToNull(description) },
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.ROLE_UPDATED,
    actorUserId: actor.id,
    entityType: "Role",
    entityId: roleId,
    metadata: { name },
  });

  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${roleId}`);
  return { success: "Role updated." };
}

export async function setRolePermissionsAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requirePermission("permission.assign");

  const parsed = setRolePermissionsSchema.safeParse({
    roleId: formData.get("roleId"),
    permissionKeys: formData.getAll("permissionKeys"),
  });
  if (!parsed.success) {
    return { error: "Invalid permission selection." };
  }
  const { roleId, permissionKeys } = parsed.data;

  const role = await db.role.findUnique({
    where: { id: roleId },
    select: { id: true, isSystemRole: true },
  });
  if (!role) return { error: "Role not found." };
  if (role.isSystemRole) {
    return { error: "System role permissions cannot be changed." };
  }

  const perms = await db.permission.findMany({
    where: { key: { in: permissionKeys } },
    select: { id: true },
  });

  // Replace-set the role's permissions in one transaction.
  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId } }),
    db.rolePermission.createMany({
      data: perms.map((p) => ({ roleId, permissionId: p.id })),
      skipDuplicates: true,
    }),
  ]);

  await writeAuditLog({
    action: AUDIT_ACTIONS.ROLE_PERMISSIONS_CHANGED,
    actorUserId: actor.id,
    entityType: "Role",
    entityId: roleId,
    metadata: { permissionKeys, count: permissionKeys.length },
  });

  revalidatePath(`/admin/roles/${roleId}`);
  return { success: `Saved ${permissionKeys.length} permission(s).` };
}

export async function deleteRoleAction(
  _prev: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const actor = await requirePermission("role.delete");

  const parsed = deleteRoleSchema.safeParse({ roleId: formData.get("roleId") });
  if (!parsed.success) return { error: "Invalid request." };
  const { roleId } = parsed.data;

  const role = await db.role.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      name: true,
      isSystemRole: true,
      _count: { select: { userRoles: true } },
    },
  });
  if (!role) return { error: "Role not found." };

  if (role.isSystemRole) {
    return { error: "System roles cannot be deleted." };
  }

  if (role._count.userRoles > 0) {
    await writeAuditLog({
      action: AUDIT_ACTIONS.ROLE_DELETE_BLOCKED,
      actorUserId: actor.id,
      entityType: "Role",
      entityId: roleId,
      metadata: { reason: "assigned_users", assignedUserCount: role._count.userRoles },
    });
    return {
      error: `This role is assigned to ${role._count.userRoles} user(s). Unassign it before deleting.`,
    };
  }

  await db.role.delete({ where: { id: roleId } });

  await writeAuditLog({
    action: AUDIT_ACTIONS.ROLE_DELETED,
    actorUserId: actor.id,
    entityType: "Role",
    entityId: roleId,
    metadata: { name: role.name },
  });

  revalidatePath("/admin/roles");
  redirect("/admin/roles");
}

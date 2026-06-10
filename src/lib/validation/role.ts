import { z } from "zod";
import { ADMIN_ROLE_NAME, isPermissionKey } from "@/lib/permissions/keys";

/**
 * Zod schemas for Phase 3 role/permission management. All inputs are validated
 * server-side before any database write.
 */

// Human-readable role names are allowed (e.g. "Senior Consultant"). The
// reserved system role name "ADMIN" cannot be created/used for new roles.
const roleName = z
  .string()
  .trim()
  .min(2, "Role name must be at least 2 characters")
  .max(60, "Role name is too long")
  .refine((v) => v.toUpperCase() !== ADMIN_ROLE_NAME, {
    message: `"${ADMIN_ROLE_NAME}" is a reserved system role name`,
  });

const roleDescription = z
  .string()
  .trim()
  .max(200, "Description is too long")
  .optional()
  .or(z.literal(""));

export const createRoleSchema = z.object({
  name: roleName,
  description: roleDescription,
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: roleName,
  description: roleDescription,
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const setRolePermissionsSchema = z.object({
  roleId: z.string().min(1),
  // Only accept keys that exist in the catalog.
  permissionKeys: z.array(z.string().refine(isPermissionKey, "Unknown permission")),
});
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;

export const setUserRolesSchema = z.object({
  userId: z.string().min(1),
  roleIds: z.array(z.string().min(1)),
});
export type SetUserRolesInput = z.infer<typeof setUserRolesSchema>;

export const deleteRoleSchema = z.object({
  roleId: z.string().min(1),
});

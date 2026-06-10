import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ADMIN_ROLE_NAME, type PermissionKey } from "@/lib/permissions/keys";
import { validateSession } from "./session";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  username: string;
  active: boolean;
  mustChangePassword: boolean;
  isAdmin: boolean;
  permissions: Set<string>;
}

/**
 * Resolve the authenticated user for the current request, or null.
 *
 * Wrapped in React `cache` so multiple calls within one request (layout, page,
 * actions) reuse a single DB round-trip. Returns the user's effective
 * permission set and an `isAdmin` flag (membership of the ADMIN system role).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await validateSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      active: true,
      mustChangePassword: true,
      userRoles: {
        select: {
          role: {
            select: {
              name: true,
              isSystemRole: true,
              rolePermissions: {
                select: { permission: { select: { key: true } } },
              },
            },
          },
        },
      },
    },
  });

  // validateSession already rejects inactive users, but double-check here.
  if (!user || !user.active) return null;

  const permissions = new Set<string>();
  let isAdmin = false;
  for (const ur of user.userRoles) {
    if (ur.role.isSystemRole && ur.role.name === ADMIN_ROLE_NAME) {
      isAdmin = true;
    }
    for (const rp of ur.role.rolePermissions) {
      permissions.add(rp.permission.key);
    }
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    isAdmin,
    permissions,
  };
});

/**
 * Require an authenticated, active user. Redirects to /login if absent.
 * Use in server components, layouts, and server actions.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** True if the user holds the permission, or is an admin (admin = super access). */
export function userHasPermission(
  user: CurrentUser,
  key: PermissionKey,
): boolean {
  return user.isAdmin || user.permissions.has(key);
}

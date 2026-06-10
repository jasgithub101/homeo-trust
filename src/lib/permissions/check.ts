import "server-only";
import {
  type CurrentUser,
  getCurrentUser,
  requireUser,
  userHasPermission,
} from "@/lib/auth/current-user";
import type { PermissionKey } from "./keys";

/**
 * Server-side authorization helpers. Every sensitive server action / loader must
 * call one of these. UI hiding is for UX only and is never sufficient.
 *
 * Phase 2 implements the request-scoped helpers needed for auth + admin user
 * creation. Patient-scoped helpers (canViewSensitivePatient, canEditPatient,
 * etc.) arrive with the clinical schema in later phases.
 */

/** Boolean check against the current user (or a provided one). */
export async function hasPermission(key: PermissionKey): Promise<boolean> {
  const user = await getCurrentUser();
  return user ? userHasPermission(user, key) : false;
}

/**
 * Ensure the current user holds a permission. Redirects to /login if
 * unauthenticated; throws if authenticated but unauthorized.
 */
export async function requirePermission(
  key: PermissionKey,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!userHasPermission(user, key)) {
    throw new Error(`Forbidden: missing permission "${key}"`);
  }
  return user;
}

/** Ensure the current user has admin (super) access. */
export async function requireAdminAccess(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) {
    throw new Error("Forbidden: admin access required");
  }
  return user;
}

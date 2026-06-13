import "server-only";
import { db } from "@/lib/db";
import { ADMIN_ROLE_NAME } from "./keys";
import type { CurrentUser } from "@/lib/auth/current-user";

/**
 * Privilege-tier checks (Phase 10b, Residual 2).
 *
 * User-management actions that hand the actor effective control over a target
 * account — password reset (returns a credential that authenticates AS the
 * target) and role assignment (can grant the target permissions) — must not be
 * usable to escalate. The rule is a SUBSET (outrank-or-equal) check: a non-admin
 * actor may only act on a target whose permissions they already hold, and may
 * only grant permissions they already hold. Admins bypass (they hold all).
 *
 * Lateral-tier actions (target's permissions == actor's) are intentionally
 * PERMITTED — acceptable for a helpdesk / co-admin model; over-restricting would
 * block equal-rank peers from helping each other. This trades that lateral risk
 * for not blocking legitimate same-tier operations; it never permits escalation.
 *
 * These checks are layered ON TOP OF the existing permission gate
 * (`requirePermission`), the explicit ADMIN-target guard, and the last-admin
 * guard — they do not replace them.
 */

export interface EffectivePermissions {
  /** Holds the fixed ADMIN system role (⇒ effectively every permission). */
  isAdmin: boolean;
  /** Explicit permission keys granted via this user's roles. */
  permissions: Set<string>;
}

/**
 * Compute a user's effective permissions from their role assignments. ADMIN
 * membership is surfaced as `isAdmin` (an admin outranks everyone regardless of
 * the explicit set). A missing/role-less user yields an empty, non-admin set.
 */
export async function getEffectivePermissions(
  userId: string,
): Promise<EffectivePermissions> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
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

  const permissions = new Set<string>();
  let isAdmin = false;
  for (const ur of user?.userRoles ?? []) {
    if (ur.role.isSystemRole && ur.role.name === ADMIN_ROLE_NAME) isAdmin = true;
    for (const rp of ur.role.rolePermissions) permissions.add(rp.permission.key);
  }
  return { isAdmin, permissions };
}

/**
 * Does the actor outrank-or-equal the target? True iff the actor is admin, OR
 * the target is not admin AND every permission the target holds is also held by
 * the actor (target ⊆ actor). Blocks escalation; permits lateral-tier.
 */
export function actorOutranks(
  actor: CurrentUser,
  target: EffectivePermissions,
): boolean {
  if (actor.isAdmin) return true;
  if (target.isAdmin) return false;
  for (const key of target.permissions) {
    if (!actor.permissions.has(key)) return false;
  }
  return true;
}

/**
 * Does the actor hold every permission key in `keys`? Used to forbid granting a
 * permission the actor does not themselves hold. Admins hold all.
 */
export function actorHoldsAll(
  actor: CurrentUser,
  keys: Iterable<string>,
): boolean {
  if (actor.isAdmin) return true;
  for (const key of keys) {
    if (!actor.permissions.has(key)) return false;
  }
  return true;
}

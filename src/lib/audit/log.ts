import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Append-only audit logging for sensitive actions (docs/SECURITY_MODEL.md §6).
 *
 * Audit writes must never break the primary flow, so failures are swallowed and
 * logged to the server console instead of thrown. Never put passwords or raw
 * session tokens in `metadata`.
 */

export const AUDIT_ACTIONS = {
  LOGIN: "login",
  FAILED_LOGIN: "failed_login",
  LOGOUT: "logout",
  PASSWORD_CHANGED: "password_changed",
  USER_CREATED: "user_created",
  // Phase 3 — roles & permissions
  ROLE_CREATED: "role_created",
  ROLE_UPDATED: "role_updated",
  ROLE_DELETED: "role_deleted",
  ROLE_DELETE_BLOCKED: "role_delete_blocked",
  ROLE_PERMISSIONS_CHANGED: "role_permissions_changed",
  USER_ROLES_CHANGED: "user_roles_changed",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

interface AuditInput {
  action: AuditAction;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function writeAuditLog({
  action,
  actorUserId = null,
  entityType = null,
  entityId = null,
  metadata = null,
}: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action,
        actorUserId,
        entityType,
        entityId,
        metadata: metadata
          ? (metadata as Prisma.InputJsonValue)
          : undefined,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", { action, err });
  }
}

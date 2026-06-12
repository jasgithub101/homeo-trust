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
  // Admin reset of another user's password. Metadata is ids/enums ONLY — never
  // the temp password or any hash.
  PASSWORD_RESET_BY_ADMIN: "password_reset_by_admin",
  USER_CREATED: "user_created",
  // Phase 3 — roles & permissions
  ROLE_CREATED: "role_created",
  ROLE_UPDATED: "role_updated",
  ROLE_DELETED: "role_deleted",
  ROLE_DELETE_BLOCKED: "role_delete_blocked",
  ROLE_PERMISSIONS_CHANGED: "role_permissions_changed",
  USER_ROLES_CHANGED: "user_roles_changed",
  // Phase 5 — patients & doctor-patient relationships
  PATIENT_CREATED: "patient_created",
  PATIENT_UPDATED: "patient_updated",
  PATIENT_VIEWED: "patient_viewed",
  DPR_CREATED: "dpr_created",
  DPR_ENDED: "dpr_ended",
  DPR_TRANSFERRED: "dpr_transferred",
  // Phase 6 — clinical workflow (case/issue/symptom/treatment).
  // *_DELETED here means soft-delete/archive (rows are preserved). Metadata
  // carries ids/enums + optional short deletionReason only — never PII or
  // clinical free text.
  CASE_CREATED: "case_created",
  CASE_UPDATED: "case_updated",
  CASE_VIEWED: "case_viewed",
  ISSUE_CREATED: "issue_created",
  ISSUE_UPDATED: "issue_updated",
  ISSUE_DELETED: "issue_deleted",
  SYMPTOM_CREATED: "symptom_created",
  SYMPTOM_UPDATED: "symptom_updated",
  SYMPTOM_DELETED: "symptom_deleted",
  TREATMENT_CREATED: "treatment_created",
  TREATMENT_UPDATED: "treatment_updated",
  TREATMENT_DELETED: "treatment_deleted",
  // Phase 7 — attachments. *_DELETED is soft-delete/archive (blob retained,
  // row hidden). Metadata = ids/enums/sizeBytes/scope + optional short reason
  // only. NEVER log fileName (may carry PII), file bytes, or free text.
  ATTACHMENT_UPLOADED: "attachment_uploaded",
  ATTACHMENT_VIEWED: "attachment_viewed",
  ATTACHMENT_DELETED: "attachment_deleted",
  // Phase 8 — de-identified Explore. Metadata is PII-SAFE ONLY: filters as
  // enums/bands/coarse location, resultCount, and a suppressed flag. NEVER log
  // result patient ids, anonymous case codes, names, or any free text.
  EXPLORE_SEARCHED: "explore_searched",
  // Retained but NO LONGER EMITTED: the Explore view refactor removed the index
  // refresh action. Kept so historical audit rows with this action stay labeled.
  EXPLORE_INDEX_REFRESHED: "explore_index_refreshed",
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

import "server-only";
import type { Prisma } from "@prisma/client";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/audit/log";

/**
 * Single source of truth for the treatment "Next follow-up" → Appointment link
 * (Feature A1.5). Called INSIDE the treatment action's $transaction so a sync
 * failure rolls back the treatment write.
 *
 * Invariant: at most one ACTIVE (deletedAt: null) FOLLOW_UP appointment per
 * treatment. Behavior:
 *  - date set, no active linked    → create (allDay, SCHEDULED, createdByUserId)
 *  - date set, active linked exists → update its scheduledAt
 *  - date cleared, active linked    → soft-delete it ("follow-up cleared")
 * A previously-cleared (soft-deleted) appointment is NEVER un-deleted — re-set
 * creates a fresh one (honors archive-not-delete).
 *
 * Returns the audit intent for the caller to flush AFTER the tx commits (audit
 * writes use the non-transactional client), or null when nothing changed.
 */
export interface FollowUpSyncAudit {
  action: AuditAction;
  appointmentId: string;
  status: string;
}

export async function syncFollowUpAppointment(
  tx: Prisma.TransactionClient,
  args: {
    treatmentEntryId: string;
    patientId: string;
    nextFollowUpDate: string | null | undefined;
    userId: string;
  },
): Promise<FollowUpSyncAudit | null> {
  const { treatmentEntryId, patientId, userId } = args;
  const date = (args.nextFollowUpDate ?? "").trim();

  const existing = await tx.appointment.findFirst({
    where: { treatmentEntryId, type: "FOLLOW_UP", deletedAt: null },
    select: { id: true },
  });

  if (date) {
    const scheduledAt = new Date(date);
    if (existing) {
      const u = await tx.appointment.update({
        where: { id: existing.id },
        data: { scheduledAt },
        select: { id: true, status: true },
      });
      return {
        action: AUDIT_ACTIONS.APPOINTMENT_UPDATED,
        appointmentId: u.id,
        status: u.status,
      };
    }
    const c = await tx.appointment.create({
      data: {
        patientId,
        treatmentEntryId,
        scheduledAt,
        allDay: true,
        type: "FOLLOW_UP",
        status: "SCHEDULED",
        createdByUserId: userId,
      },
      select: { id: true, status: true },
    });
    return {
      action: AUDIT_ACTIONS.APPOINTMENT_CREATED,
      appointmentId: c.id,
      status: c.status,
    };
  }

  // Date cleared → soft-delete the active linked appointment (never un-delete).
  if (existing) {
    const d = await tx.appointment.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        deletedByUserId: userId,
        deletionReason: "follow-up cleared",
      },
      select: { id: true, status: true },
    });
    return {
      action: AUDIT_ACTIONS.APPOINTMENT_DELETED,
      appointmentId: d.id,
      status: d.status,
    };
  }

  return null;
}

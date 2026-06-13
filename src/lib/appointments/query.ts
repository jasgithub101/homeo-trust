import "server-only";
import { db } from "@/lib/db";

/**
 * List a patient's appointments (newest-scheduled first is unhelpful for a
 * calendar, so ascending by scheduledAt). Soft-deleted rows are excluded.
 *
 * `showSensitive` gates the free-text `notes` column: de-identified-only viewers
 * (in scope, no patient.viewSensitive) get the slot/type/status but NOT the note
 * (Prisma `notes: false`). The caller has already authorized patient scope.
 */
export function listAppointmentsForPatient(
  patientId: string,
  showSensitive: boolean,
) {
  return db.appointment.findMany({
    where: { patientId, deletedAt: null },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      scheduledAt: true,
      durationMinutes: true,
      allDay: true,
      type: true,
      status: true,
      notes: showSensitive,
    },
  });
}

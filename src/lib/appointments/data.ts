import type { AppointmentType } from "@prisma/client";
import type {
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from "@/lib/validation/appointment";

/** Trim a string field, returning null when empty. */
function txt(v?: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

function int(v: number | "" | undefined): number | null {
  return typeof v === "number" ? v : null;
}

/**
 * Appointment scalar columns (no relations — the action wires patientId and
 * createdByUserId). The status is not set here (create defaults to SCHEDULED;
 * status transitions go through changeAppointmentStatusAction).
 */
export function toAppointmentScalars(
  input: CreateAppointmentInput | UpdateAppointmentInput,
) {
  return {
    scheduledAt: new Date(input.scheduledAt),
    durationMinutes: int(input.durationMinutes),
    allDay: input.allDay === "on" || input.allDay === "true",
    type: input.type as AppointmentType,
    notes: txt(input.notes),
  };
}

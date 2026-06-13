"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canCreateAppointment,
  canManageAppointment,
} from "@/lib/permissions/patient-access";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  changeAppointmentStatusSchema,
  softDeleteAppointmentSchema,
} from "@/lib/validation/appointment";
import { toAppointmentScalars } from "@/lib/appointments/data";
import type { ClinicalActionState } from "@/lib/clinical/form-state";

function readAppointmentForm(formData: FormData) {
  return {
    scheduledAt: formData.get("scheduledAt") ?? "",
    durationMinutes: formData.get("durationMinutes") ?? "",
    allDay: formData.get("allDay") ?? "",
    type: formData.get("type") ?? "",
    notes: formData.get("notes") ?? "",
  };
}

/**
 * Re-derive the appointment and assert it belongs to `patientId` and is not
 * archived. IDOR guard: an appointment id from another patient resolves to a
 * null/mismatch here, so the caller returns notFound()-equivalent.
 */
async function loadOwned(appointmentId: string, patientId: string) {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, patientId: true, deletedAt: true },
  });
  if (!appt || appt.patientId !== patientId) return null;
  return appt;
}

// ---------- Create ----------
export async function createAppointmentAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = createAppointmentSchema.safeParse({
    patientId: formData.get("patientId"),
    ...readAppointmentForm(formData),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { patientId } = parsed.data;

  if (!(await canCreateAppointment(user, patientId))) {
    return { error: "You do not have permission to schedule appointments." };
  }

  const appt = await db.appointment.create({
    data: {
      patientId,
      createdByUserId: user.id,
      ...toAppointmentScalars(parsed.data),
    },
    select: { id: true, type: true, status: true },
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.APPOINTMENT_CREATED,
    actorUserId: user.id,
    entityType: "Appointment",
    entityId: appt.id,
    // ids/enums only — never notes or the exact scheduledAt.
    metadata: { patientId, type: appt.type, status: appt.status },
  });

  revalidatePath(`/patients/${patientId}/appointments`);
  redirect(`/patients/${patientId}/appointments/${appt.id}`);
}

// ---------- Update (reschedule/edit) ----------
export async function updateAppointmentAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = updateAppointmentSchema.safeParse({
    patientId: formData.get("patientId"),
    appointmentId: formData.get("appointmentId"),
    ...readAppointmentForm(formData),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { patientId, appointmentId } = parsed.data;

  if (!(await canManageAppointment(user, patientId))) {
    return { error: "You do not have permission to manage this appointment." };
  }

  const appt = await loadOwned(appointmentId, patientId);
  if (!appt) return { error: "Appointment not found." };
  if (appt.deletedAt) return { error: "This appointment has been archived." };

  const updated = await db.appointment.update({
    where: { id: appointmentId },
    data: toAppointmentScalars(parsed.data),
    select: { type: true, status: true },
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.APPOINTMENT_UPDATED,
    actorUserId: user.id,
    entityType: "Appointment",
    entityId: appointmentId,
    metadata: { patientId, type: updated.type, status: updated.status },
  });

  revalidatePath(`/patients/${patientId}/appointments`);
  revalidatePath(`/patients/${patientId}/appointments/${appointmentId}`);
  return { success: "Appointment saved." };
}

// ---------- Status change (complete / cancel / no-show / reschedule back) ----------
export async function changeAppointmentStatusAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = changeAppointmentStatusSchema.safeParse({
    patientId: formData.get("patientId"),
    appointmentId: formData.get("appointmentId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Invalid request." };
  const { patientId, appointmentId, status } = parsed.data;

  if (!(await canManageAppointment(user, patientId))) {
    return { error: "You do not have permission to manage this appointment." };
  }

  const appt = await loadOwned(appointmentId, patientId);
  if (!appt) return { error: "Appointment not found." };
  if (appt.deletedAt) return { error: "This appointment has been archived." };

  const updated = await db.appointment.update({
    where: { id: appointmentId },
    data: { status },
    select: { type: true, status: true },
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.APPOINTMENT_STATUS_CHANGED,
    actorUserId: user.id,
    entityType: "Appointment",
    entityId: appointmentId,
    metadata: { patientId, type: updated.type, status: updated.status },
  });

  revalidatePath(`/patients/${patientId}/appointments`);
  revalidatePath(`/patients/${patientId}/appointments/${appointmentId}`);
  return { success: "Status updated." };
}

// ---------- Archive (soft-delete; "created in error") ----------
export async function archiveAppointmentAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = softDeleteAppointmentSchema.safeParse({
    patientId: formData.get("patientId"),
    appointmentId: formData.get("appointmentId"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { error: "Invalid request." };
  const { patientId, appointmentId, reason } = parsed.data;

  if (!(await canManageAppointment(user, patientId))) {
    return { error: "You do not have permission to manage this appointment." };
  }

  const appt = await loadOwned(appointmentId, patientId);
  if (!appt) return { error: "Appointment not found." };
  if (appt.deletedAt) return { error: "This appointment is already archived." };

  await db.appointment.update({
    where: { id: appointmentId },
    data: {
      deletedAt: new Date(),
      deletedByUserId: user.id,
      deletionReason: reason?.trim() || null,
    },
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.APPOINTMENT_DELETED,
    actorUserId: user.id,
    entityType: "Appointment",
    entityId: appointmentId,
    metadata: { patientId, deletionReason: reason?.trim() || null },
  });

  revalidatePath(`/patients/${patientId}/appointments`);
  redirect(`/patients/${patientId}/appointments`);
}

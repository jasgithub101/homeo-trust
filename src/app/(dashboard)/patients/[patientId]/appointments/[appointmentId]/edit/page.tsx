import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canManageAppointment,
  canViewSensitivePatient,
} from "@/lib/permissions/patient-access";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";

/** Format a Date to the local "YYYY-MM-DDTHH:mm" a datetime-local input expects. */
function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export default async function EditAppointmentPage({
  params,
}: {
  params: Promise<{ patientId: string; appointmentId: string }>;
}) {
  const { patientId, appointmentId } = await params;
  const user = await requireUser();

  if (!(await canManageAppointment(user, patientId))) notFound();
  const showSensitive = await canViewSensitivePatient(user, patientId);

  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      patientId: true,
      scheduledAt: true,
      durationMinutes: true,
      allDay: true,
      type: true,
      deletedAt: true,
      notes: showSensitive,
    },
  });
  if (!appt || appt.patientId !== patientId || appt.deletedAt) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/patients/${patientId}/appointments/${appt.id}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Appointment
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">
          Edit appointment
        </h1>
      </div>

      <AppointmentForm
        patientId={patientId}
        mode="edit"
        appointmentId={appt.id}
        defaults={{
          scheduledAt: toDateTimeLocal(new Date(appt.scheduledAt)),
          durationMinutes:
            appt.durationMinutes != null ? String(appt.durationMinutes) : "",
          allDay: appt.allDay,
          type: appt.type,
          notes: "notes" in appt ? (appt.notes ?? "") : "",
        }}
      />
    </div>
  );
}

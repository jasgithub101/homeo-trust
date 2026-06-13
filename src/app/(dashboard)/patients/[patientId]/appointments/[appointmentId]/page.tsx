import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canViewAppointments,
  canManageAppointment,
  canViewSensitivePatient,
} from "@/lib/permissions/patient-access";
import { prettyEnum } from "@/lib/format/enum";
import { AppointmentManage } from "@/components/appointments/AppointmentManage";

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ patientId: string; appointmentId: string }>;
}) {
  const { patientId, appointmentId } = await params;
  const user = await requireUser();

  if (!(await canViewAppointments(user, patientId))) notFound();
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
      status: true,
      deletedAt: true,
      notes: showSensitive,
    },
  });
  // IDOR guard: appointment must belong to this patient and not be archived.
  if (!appt || appt.patientId !== patientId || appt.deletedAt) notFound();

  const canManage = await canManageAppointment(user, patientId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={`/patients/${patientId}/appointments`}
            className="text-sm text-brand-700 hover:underline"
          >
            ← Appointments
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">
            {prettyEnum(appt.type)} appointment
          </h1>
        </div>
        {canManage ? (
          <Link
            href={`/patients/${patientId}/appointments/${appt.id}/edit`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </Link>
        ) : null}
      </div>

      <dl className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-slate-500">When</dt>
          <dd className="text-sm text-slate-900">
            {appt.allDay
              ? `${new Date(appt.scheduledAt).toLocaleDateString()} (all-day)`
              : new Date(appt.scheduledAt).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Status</dt>
          <dd className="text-sm text-slate-900">{prettyEnum(appt.status)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Type</dt>
          <dd className="text-sm text-slate-900">{prettyEnum(appt.type)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Duration</dt>
          <dd className="text-sm text-slate-900">
            {appt.durationMinutes ? `${appt.durationMinutes} min` : "—"}
          </dd>
        </div>
        {showSensitive ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-slate-500">Notes</dt>
            <dd className="text-sm text-slate-900">{appt.notes || "—"}</dd>
          </div>
        ) : null}
      </dl>

      {canManage ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Manage</h2>
          <AppointmentManage
            patientId={patientId}
            appointmentId={appt.id}
            currentStatus={appt.status}
          />
        </section>
      ) : null}
    </div>
  );
}

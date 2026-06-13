import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  canViewAppointments,
  canCreateAppointment,
  canViewSensitivePatient,
} from "@/lib/permissions/patient-access";
import { ClinicalNav } from "@/components/clinical/ClinicalNav";
import { prettyEnum } from "@/lib/format/enum";
import { listAppointmentsForPatient } from "@/lib/appointments/query";

export default async function AppointmentsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireUser();

  if (!(await canViewAppointments(user, patientId))) notFound();
  const showSensitive = await canViewSensitivePatient(user, patientId);

  const appointments = await listAppointmentsForPatient(patientId, showSensitive);
  const canCreate = await canCreateAppointment(user, patientId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={`/patients/${patientId}`}
            className="text-sm text-brand-700 hover:underline"
          >
            ← Patient
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">
            Appointments
          </h1>
        </div>
        {canCreate ? (
          <Link
            href={`/patients/${patientId}/appointments/new`}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Schedule appointment
          </Link>
        ) : null}
      </div>

      <ClinicalNav patientId={patientId} active="appointments" />

      {appointments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No appointments scheduled.
        </p>
      ) : (
        <ul className="space-y-2">
          {appointments.map((a) => (
            <li key={a.id}>
              <Link
                href={`/patients/${patientId}/appointments/${a.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900">
                    {a.allDay
                      ? new Date(a.scheduledAt).toLocaleDateString()
                      : new Date(a.scheduledAt).toLocaleString()}
                    {a.allDay ? " · All-day" : ""}
                  </span>
                  <span className="text-xs text-slate-500">
                    {prettyEnum(a.status)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  {prettyEnum(a.type)}
                  {a.durationMinutes ? ` · ${a.durationMinutes} min` : ""}
                </p>
                {showSensitive && a.notes ? (
                  <p className="mt-1 text-xs text-slate-500">{a.notes}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

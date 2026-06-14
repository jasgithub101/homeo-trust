import Link from "next/link";
import { prettyEnum } from "@/lib/format/enum";
import type { MyUpcomingAppointment } from "@/lib/permissions/patient-access";

/**
 * Doctor-dashboard "my patients' upcoming appointments" (A2). Presentational
 * only — the scope/permission gating and the depth-gated patient name are
 * resolved server-side before this renders. Each row links to the appointment
 * detail, which re-checks scope on open.
 */
export function UpcomingAppointments({
  appointments,
}: {
  appointments: MyUpcomingAppointment[];
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">
        Upcoming appointments
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Your treating &amp; consulting patients, next 14 days.
      </p>

      {appointments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No upcoming appointments for your patients.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {appointments.map((a) => (
            <li key={a.id}>
              <Link
                href={`/patients/${a.patientId}/appointments/${a.id}`}
                className="flex items-center justify-between gap-4 py-2.5 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {a.patientName ?? `Patient ${a.patientCode}`}
                  </p>
                  <p className="text-xs text-slate-500">{prettyEnum(a.type)}</p>
                </div>
                <span className="flex-shrink-0 text-xs text-slate-600">
                  {new Date(a.scheduledAt).toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

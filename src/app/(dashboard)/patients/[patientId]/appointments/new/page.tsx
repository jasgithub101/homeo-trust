import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canCreateAppointment } from "@/lib/permissions/patient-access";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";

export default async function NewAppointmentPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireUser();

  if (!(await canCreateAppointment(user, patientId))) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/patients/${patientId}/appointments`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Appointments
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">
          Schedule appointment
        </h1>
      </div>

      <AppointmentForm patientId={patientId} mode="create" />
    </div>
  );
}

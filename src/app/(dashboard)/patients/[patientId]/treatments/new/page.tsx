import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAddTreatmentEntry } from "@/lib/permissions/patient-access";
import { loadDoctorOptions } from "@/lib/patients/doctors";
import { loadIssueOptions } from "@/lib/clinical/options";
import { TreatmentEntryForm } from "@/components/clinical/TreatmentEntryForm";
import { toDateInput } from "@/lib/patients/display";

export default async function NewTreatmentPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireUser();

  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { id: true, caseRecord: { select: { id: true } } },
  });
  if (!patient) notFound();

  if (!(await canAddTreatmentEntry(user, patientId))) {
    redirect(`/patients/${patientId}/treatments`);
  }

  // A TreatmentEntry must attach to the patient's single CaseRecord.
  if (!patient.caseRecord) {
    return (
      <div className="space-y-6">
        <div>
          <Link href={`/patients/${patientId}/treatments`} className="text-sm text-brand-700 hover:underline">
            ← Treatments
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Add treatment</h1>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          This patient has no case record yet. Create the case record before
          adding treatment entries.{" "}
          <Link href={`/patients/${patientId}/case/edit`} className="font-medium underline">
            Create case
          </Link>
        </div>
      </div>
    );
  }

  const [doctors, issues] = await Promise.all([
    loadDoctorOptions(),
    loadIssueOptions(patientId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/patients/${patientId}/treatments`} className="text-sm text-brand-700 hover:underline">
          ← Treatments
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Add treatment</h1>
      </div>
      <TreatmentEntryForm
        patientId={patientId}
        doctors={doctors}
        issues={issues}
        defaults={{ treatmentDate: toDateInput(new Date()) }}
      />
    </div>
  );
}

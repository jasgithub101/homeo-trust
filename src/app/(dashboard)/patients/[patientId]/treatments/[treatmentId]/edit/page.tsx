import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditTreatment } from "@/lib/permissions/patient-access";
import { loadDoctorOptions } from "@/lib/patients/doctors";
import { loadIssueOptions } from "@/lib/clinical/options";
import {
  TreatmentEntryForm,
  type TreatmentDefaults,
} from "@/components/clinical/TreatmentEntryForm";
import { toDateInput } from "@/lib/patients/display";

export default async function EditTreatmentPage({
  params,
}: {
  params: Promise<{ patientId: string; treatmentId: string }>;
}) {
  const { patientId, treatmentId } = await params;
  const user = await requireUser();

  const t = await db.treatmentEntry.findUnique({
    where: { id: treatmentId },
    select: {
      patientId: true,
      deletedAt: true,
      entryType: true,
      treatmentDate: true,
      patientIssueId: true,
      medicineName: true,
      potency: true,
      dosage: true,
      frequency: true,
      duration: true,
      instructions: true,
      followUpNotes: true,
      symptomChanges: true,
      patientCondition: true,
      improvementScore: true,
      nextFollowUpDate: true,
      participants: {
        select: { participantType: true, doctorProfileId: true },
      },
    },
  });
  if (!t || t.patientId !== patientId || t.deletedAt) notFound();

  if (!(await canEditTreatment(user, patientId))) {
    redirect(`/patients/${patientId}/treatments/${treatmentId}`);
  }

  // A1.5: prefill "Next follow-up" from the linked active FOLLOW_UP appointment;
  // fall back to the deprecated column for any row not yet backfilled.
  const followUpAppt = await db.appointment.findFirst({
    where: { treatmentEntryId: treatmentId, type: "FOLLOW_UP", deletedAt: null },
    select: { scheduledAt: true },
  });
  const followUpDate = followUpAppt?.scheduledAt ?? t.nextFollowUpDate;

  const [doctors, issues] = await Promise.all([
    loadDoctorOptions(),
    loadIssueOptions(patientId),
  ]);

  const defaults: TreatmentDefaults = {
    entryType: t.entryType,
    treatmentDate: toDateInput(t.treatmentDate),
    patientIssueId: t.patientIssueId ?? "",
    medicineName: t.medicineName ?? "",
    potency: t.potency ?? "",
    dosage: t.dosage ?? "",
    frequency: t.frequency ?? "",
    duration: t.duration ?? "",
    instructions: t.instructions ?? "",
    followUpNotes: t.followUpNotes ?? "",
    symptomChanges: t.symptomChanges ?? "",
    patientCondition: t.patientCondition ?? "",
    improvementScore: t.improvementScore ?? "",
    nextFollowUpDate: toDateInput(followUpDate),
    treatingDoctorProfileIds: t.participants
      .filter((p) => p.participantType === "TREATING_DOCTOR")
      .map((p) => p.doctorProfileId),
    consultingDoctorProfileIds: t.participants
      .filter((p) => p.participantType === "CONSULTING_DOCTOR")
      .map((p) => p.doctorProfileId),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/patients/${patientId}/treatments/${treatmentId}`} className="text-sm text-brand-700 hover:underline">
          ← Treatment
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Edit treatment</h1>
      </div>
      <TreatmentEntryForm
        patientId={patientId}
        treatmentId={treatmentId}
        doctors={doctors}
        issues={issues}
        defaults={defaults}
      />
    </div>
  );
}

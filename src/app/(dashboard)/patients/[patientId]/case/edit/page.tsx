import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canCreateCase, canEditCase } from "@/lib/permissions/patient-access";
import {
  CaseRecordForm,
  type CaseRecordDefaults,
} from "@/components/clinical/CaseRecordForm";

export default async function CaseEditPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireUser();

  // Verify the patient exists and is in scope.
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { id: true },
  });
  if (!patient) notFound();

  const existing = await db.caseRecord.findUnique({
    where: { patientId },
    select: {
      chiefComplaint: true,
      caseDescription: true,
      medicalHistory: true,
      familyHistory: true,
      physicalGenerals: true,
      mentalGenerals: true,
      modalities: true,
      diagnosisNotes: true,
      repertoryNotes: true,
    },
  });

  const allowed = existing
    ? await canEditCase(user, patientId)
    : await canCreateCase(user, patientId);
  if (!allowed) redirect(`/patients/${patientId}/case`);

  const defaults: CaseRecordDefaults = {
    chiefComplaint: existing?.chiefComplaint ?? "",
    caseDescription: existing?.caseDescription ?? "",
    medicalHistory: existing?.medicalHistory ?? "",
    familyHistory: existing?.familyHistory ?? "",
    physicalGenerals: existing?.physicalGenerals ?? "",
    mentalGenerals: existing?.mentalGenerals ?? "",
    modalities: existing?.modalities ?? "",
    diagnosisNotes: existing?.diagnosisNotes ?? "",
    repertoryNotes: existing?.repertoryNotes ?? "",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/patients/${patientId}/case`} className="text-sm text-brand-700 hover:underline">
          ← Case record
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">
          {existing ? "Edit case record" : "Create case record"}
        </h1>
      </div>
      <CaseRecordForm patientId={patientId} defaults={defaults} exists={!!existing} />
    </div>
  );
}

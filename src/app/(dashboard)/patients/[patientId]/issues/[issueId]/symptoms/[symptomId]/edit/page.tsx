import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditSymptom } from "@/lib/permissions/patient-access";
import { SymptomForm, type SymptomDefaults } from "@/components/clinical/SymptomForm";

export default async function EditSymptomPage({
  params,
}: {
  params: Promise<{ patientId: string; issueId: string; symptomId: string }>;
}) {
  const { patientId, issueId, symptomId } = await params;
  const user = await requireUser();

  const symptom = await db.patientSymptom.findUnique({
    where: { id: symptomId },
    select: {
      symptomName: true,
      description: true,
      severity: true,
      duration: true,
      modalities: true,
      triggers: true,
      location: true,
      deletedAt: true,
      patientIssueId: true,
      patientIssue: { select: { patientId: true, deletedAt: true } },
    },
  });
  if (
    !symptom ||
    symptom.patientIssueId !== issueId ||
    symptom.patientIssue.patientId !== patientId ||
    symptom.deletedAt ||
    symptom.patientIssue.deletedAt
  ) {
    notFound();
  }

  if (!(await canEditSymptom(user, patientId))) {
    redirect(`/patients/${patientId}/issues/${issueId}`);
  }

  const defaults: SymptomDefaults = {
    symptomName: symptom.symptomName,
    description: symptom.description ?? "",
    severity: symptom.severity ?? "",
    duration: symptom.duration ?? "",
    modalities: symptom.modalities ?? "",
    triggers: symptom.triggers ?? "",
    location: symptom.location ?? "",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/patients/${patientId}/issues/${issueId}`} className="text-sm text-brand-700 hover:underline">
          ← Issue
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Edit symptom</h1>
      </div>
      <SymptomForm patientId={patientId} issueId={issueId} symptomId={symptomId} defaults={defaults} />
    </div>
  );
}

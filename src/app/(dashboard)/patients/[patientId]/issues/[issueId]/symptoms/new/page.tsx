import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canCreateSymptom } from "@/lib/permissions/patient-access";
import { SymptomForm } from "@/components/clinical/SymptomForm";

export default async function NewSymptomPage({
  params,
}: {
  params: Promise<{ patientId: string; issueId: string }>;
}) {
  const { patientId, issueId } = await params;
  const user = await requireUser();

  const issue = await db.patientIssue.findUnique({
    where: { id: issueId },
    select: { patientId: true, deletedAt: true },
  });
  if (!issue || issue.patientId !== patientId || issue.deletedAt) notFound();

  if (!(await canCreateSymptom(user, patientId))) {
    redirect(`/patients/${patientId}/issues/${issueId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/patients/${patientId}/issues/${issueId}`} className="text-sm text-brand-700 hover:underline">
          ← Issue
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Add symptom</h1>
      </div>
      <SymptomForm patientId={patientId} issueId={issueId} />
    </div>
  );
}

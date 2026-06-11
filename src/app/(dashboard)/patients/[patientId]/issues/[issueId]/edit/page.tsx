import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditIssue } from "@/lib/permissions/patient-access";
import { IssueForm, type IssueDefaults } from "@/components/clinical/IssueForm";
import { toDateInput } from "@/lib/patients/display";

export default async function EditIssuePage({
  params,
}: {
  params: Promise<{ patientId: string; issueId: string }>;
}) {
  const { patientId, issueId } = await params;
  const user = await requireUser();

  const issue = await db.patientIssue.findUnique({
    where: { id: issueId },
    select: {
      patientId: true,
      title: true,
      description: true,
      status: true,
      onsetDate: true,
      deletedAt: true,
    },
  });
  if (!issue || issue.patientId !== patientId || issue.deletedAt) notFound();

  if (!(await canEditIssue(user, patientId))) {
    redirect(`/patients/${patientId}/issues/${issueId}`);
  }

  const defaults: IssueDefaults = {
    title: issue.title,
    description: issue.description,
    status: issue.status,
    onsetDate: toDateInput(issue.onsetDate),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/patients/${patientId}/issues/${issueId}`} className="text-sm text-brand-700 hover:underline">
          ← Issue
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Edit issue</h1>
      </div>
      <IssueForm patientId={patientId} issueId={issueId} defaults={defaults} />
    </div>
  );
}

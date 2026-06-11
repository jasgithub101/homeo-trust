import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canCreateIssue } from "@/lib/permissions/patient-access";
import { IssueForm } from "@/components/clinical/IssueForm";

export default async function NewIssuePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireUser();

  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { id: true },
  });
  if (!patient) notFound();

  if (!(await canCreateIssue(user, patientId))) redirect(`/patients/${patientId}/issues`);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/patients/${patientId}/issues`} className="text-sm text-brand-700 hover:underline">
          ← Issues
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Add issue</h1>
      </div>
      <IssueForm patientId={patientId} />
    </div>
  );
}

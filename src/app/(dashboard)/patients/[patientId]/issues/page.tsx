import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewIssues, canCreateIssue } from "@/lib/permissions/patient-access";
import { ClinicalNav } from "@/components/clinical/ClinicalNav";
import { IssueStatusBadge } from "@/components/clinical/IssueStatusBadge";

export default async function IssuesPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireUser();

  if (!(await canViewIssues(user, patientId))) notFound();

  // Archived issues are hidden from the normal list (deletedAt: null).
  const issues = await db.patientIssue.findMany({
    where: { patientId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      onsetDate: true,
      _count: { select: { symptoms: { where: { deletedAt: null } } } },
    },
  });

  const canCreate = await canCreateIssue(user, patientId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/patients/${patientId}`} className="text-sm text-brand-700 hover:underline">
            ← Patient
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Issues</h1>
        </div>
        {canCreate ? (
          <Link
            href={`/patients/${patientId}/issues/new`}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add issue
          </Link>
        ) : null}
      </div>

      <ClinicalNav patientId={patientId} active="issues" />

      {issues.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No issues recorded yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {issues.map((i) => (
            <li key={i.id}>
              <Link
                href={`/patients/${patientId}/issues/${i.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{i.title}</p>
                  <p className="text-xs text-slate-500">
                    {i._count.symptoms} symptom{i._count.symptoms === 1 ? "" : "s"}
                  </p>
                </div>
                <IssueStatusBadge status={i.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

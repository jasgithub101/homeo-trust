import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canViewIssues,
  canEditIssue,
  canArchiveIssue,
  canViewSymptoms,
  canCreateSymptom,
  canEditSymptom,
  canArchiveSymptom,
  canViewAttachment,
  canUploadAttachment,
  canViewSensitiveAttachment,
  canDeleteAttachment,
} from "@/lib/permissions/patient-access";
import { IssueStatusBadge } from "@/components/clinical/IssueStatusBadge";
import { ArchiveButton } from "@/components/clinical/ArchiveButton";
import { AttachmentsSection } from "@/components/attachments/AttachmentsSection";
import {
  archiveIssueAction,
  archiveSymptomAction,
} from "../actions";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ patientId: string; issueId: string }>;
}) {
  const { patientId, issueId } = await params;
  const user = await requireUser();

  if (!(await canViewIssues(user, patientId))) notFound();

  const issue = await db.patientIssue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      patientId: true,
      title: true,
      description: true,
      status: true,
      onsetDate: true,
      deletedAt: true,
    },
  });
  // Archived issues are not shown in normal navigation.
  if (!issue || issue.patientId !== patientId || issue.deletedAt) notFound();

  const showSymptoms = await canViewSymptoms(user, patientId);
  const [
    canEdit,
    canArchive,
    canAddSymptom,
    canEditSym,
    canArchiveSym,
    showAttachments,
    canUploadAtt,
    canViewSensitiveAtt,
    canDeleteAtt,
  ] = await Promise.all([
    canEditIssue(user, patientId),
    canArchiveIssue(user, patientId),
    canCreateSymptom(user, patientId),
    canEditSymptom(user, patientId),
    canArchiveSymptom(user, patientId),
    canViewAttachment(user, patientId),
    canUploadAttachment(user, patientId),
    canViewSensitiveAttachment(user, patientId),
    canDeleteAttachment(user, patientId),
  ]);

  const symptoms = showSymptoms
    ? await db.patientSymptom.findMany({
        where: { patientIssueId: issueId, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          symptomName: true,
          description: true,
          severity: true,
          duration: true,
          modalities: true,
          triggers: true,
          location: true,
        },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/patients/${patientId}/issues`} className="text-sm text-brand-700 hover:underline">
          ← Issues
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900">{issue.title}</h1>
          <IssueStatusBadge status={issue.status} />
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Issue</h2>
          {canEdit ? (
            <Link
              href={`/patients/${patientId}/issues/${issueId}/edit`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </Link>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap text-sm text-slate-900">{issue.description}</p>
        {issue.onsetDate ? (
          <p className="mt-3 text-xs text-slate-500">
            Onset: {new Date(issue.onsetDate).toLocaleDateString()}
          </p>
        ) : null}
        {canArchive ? (
          <div className="mt-4">
            <ArchiveButton
              action={archiveIssueAction}
              patientId={patientId}
              id={issueId}
              entityLabel="issue"
            />
          </div>
        ) : null}
      </section>

      {showSymptoms ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Symptoms</h2>
            {canAddSymptom ? (
              <Link
                href={`/patients/${patientId}/issues/${issueId}/symptoms/new`}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Add symptom
              </Link>
            ) : null}
          </div>

          {symptoms.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              No symptoms recorded for this issue.
            </p>
          ) : (
            <ul className="space-y-3">
              {symptoms.map((s) => (
                <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {s.symptomName}
                        {s.severity != null ? (
                          <span className="ml-2 text-xs text-slate-500">severity {s.severity}/10</span>
                        ) : null}
                      </p>
                      {s.description ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{s.description}</p>
                      ) : null}
                      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                        {s.duration ? <span>Duration: {s.duration}</span> : null}
                        {s.location ? <span>Location: {s.location}</span> : null}
                        {s.triggers ? <span>Triggers: {s.triggers}</span> : null}
                        {s.modalities ? <span>Modalities: {s.modalities}</span> : null}
                      </dl>
                    </div>
                    {canEditSym ? (
                      <Link
                        href={`/patients/${patientId}/issues/${issueId}/symptoms/${s.id}/edit`}
                        className="shrink-0 text-sm text-brand-700 hover:underline"
                      >
                        Edit
                      </Link>
                    ) : null}
                  </div>
                  {canArchiveSym ? (
                    <div className="mt-3">
                      <ArchiveButton
                        action={archiveSymptomAction}
                        patientId={patientId}
                        id={s.id}
                        entityLabel="symptom"
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {showAttachments ? (
        <AttachmentsSection
          patientId={patientId}
          parentType="issue"
          parentId={issueId}
          canUpload={canUploadAtt}
          canViewSensitive={canViewSensitiveAtt}
          canDelete={canDeleteAtt}
        />
      ) : null}
    </div>
  );
}

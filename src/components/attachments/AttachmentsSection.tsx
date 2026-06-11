import { db } from "@/lib/db";
import { prettyEnum } from "@/lib/format/enum";
import { ArchiveButton } from "@/components/clinical/ArchiveButton";
import { archiveAttachmentAction } from "@/app/(dashboard)/patients/[patientId]/attachments/actions";
import type { AttachmentParentType } from "@/lib/validation/attachment";
import { AttachmentUploadForm } from "./AttachmentUploadForm";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PARENT_FIELD: Record<AttachmentParentType, "patientIssueId" | "caseRecordId" | "treatmentEntryId"> = {
  issue: "patientIssueId",
  case: "caseRecordId",
  treatment: "treatmentEntryId",
};

/**
 * Attachments for one parent entity (issue / case / treatment). Renders the
 * (non-archived) list and, when permitted, the upload form and archive control.
 *
 * Depth-aware: when a file is `isSensitive` and the viewer lacks
 * `attachment.viewSensitive`, the download link is replaced with a locked label.
 * This is a UI convenience only — the download route re-checks on every request,
 * so hiding the link is never the actual access control.
 */
export async function AttachmentsSection({
  patientId,
  parentType,
  parentId,
  canUpload,
  canViewSensitive,
  canDelete,
}: {
  patientId: string;
  parentType: AttachmentParentType;
  parentId: string;
  canUpload: boolean;
  canViewSensitive: boolean;
  canDelete: boolean;
}) {
  const attachments = await db.patientAttachment.findMany({
    where: { [PARENT_FIELD[parentType]]: parentId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileType: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      description: true,
      isSensitive: true,
      createdAt: true,
    },
  });

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-900">Attachments</h2>

      {attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No attachments.
        </p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => {
            const locked = a.isSensitive && !canViewSensitive;
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <span className="truncate">{a.fileName}</span>
                    {a.isSensitive ? (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                        Sensitive
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {prettyEnum(a.fileType)} · {formatBytes(a.sizeBytes)} ·{" "}
                    {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                  {a.description ? (
                    <p className="mt-1 text-sm text-slate-700">{a.description}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {locked ? (
                    <span className="text-xs text-slate-400">
                      Sensitive — no access
                    </span>
                  ) : (
                    <a
                      href={`/patients/${patientId}/attachments/${a.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      Download
                    </a>
                  )}
                  {canDelete ? (
                    <ArchiveButton
                      action={archiveAttachmentAction}
                      patientId={patientId}
                      id={a.id}
                      entityLabel="attachment"
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canUpload ? (
        <AttachmentUploadForm
          patientId={patientId}
          parentType={parentType}
          parentId={parentId}
        />
      ) : null}
    </section>
  );
}

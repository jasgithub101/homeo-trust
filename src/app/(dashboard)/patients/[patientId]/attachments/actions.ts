"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canUploadAttachment,
  canDeleteAttachment,
  patientScopeLabel,
} from "@/lib/permissions/patient-access";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import {
  attachmentUploadSchema,
  attachmentArchiveSchema,
  validateUploadedFile,
  type AttachmentParentType,
} from "@/lib/validation/attachment";
import { getStorage, buildAttachmentKey, scanOnUpload } from "@/lib/storage";
import type { ClinicalActionState } from "@/lib/clinical/form-state";

/** Revalidate the parent detail page (and the patient's attachments index). */
function revalidateParent(
  patientId: string,
  parentType: AttachmentParentType,
  parentId: string,
) {
  revalidatePath(`/patients/${patientId}/attachments`);
  switch (parentType) {
    case "issue":
      revalidatePath(`/patients/${patientId}/issues/${parentId}`);
      break;
    case "case":
      revalidatePath(`/patients/${patientId}/case`);
      break;
    case "treatment":
      revalidatePath(`/patients/${patientId}/treatments/${parentId}`);
      break;
  }
}

/**
 * Resolve the parent clinical entity, asserting it belongs to `patientId` and
 * (for soft-deletable parents) is NOT archived. Returns the Prisma FK field to
 * set on the attachment, or an error message. CaseRecord is not archivable.
 */
async function resolveParent(
  parentType: AttachmentParentType,
  parentId: string,
  patientId: string,
): Promise<
  | { ok: true; fk: "patientIssueId" | "caseRecordId" | "treatmentEntryId" }
  | { ok: false; error: string }
> {
  switch (parentType) {
    case "issue": {
      const issue = await db.patientIssue.findUnique({
        where: { id: parentId },
        select: { patientId: true, deletedAt: true },
      });
      if (!issue || issue.patientId !== patientId) {
        return { ok: false, error: "Issue not found." };
      }
      if (issue.deletedAt) {
        return { ok: false, error: "Cannot add attachments to an archived issue." };
      }
      return { ok: true, fk: "patientIssueId" };
    }
    case "case": {
      const caseRecord = await db.caseRecord.findUnique({
        where: { id: parentId },
        select: { patientId: true },
      });
      if (!caseRecord || caseRecord.patientId !== patientId) {
        return { ok: false, error: "Case not found." };
      }
      return { ok: true, fk: "caseRecordId" };
    }
    case "treatment": {
      const treatment = await db.treatmentEntry.findUnique({
        where: { id: parentId },
        select: { patientId: true, deletedAt: true },
      });
      if (!treatment || treatment.patientId !== patientId) {
        return { ok: false, error: "Treatment not found." };
      }
      if (treatment.deletedAt) {
        return { ok: false, error: "Cannot add attachments to an archived treatment." };
      }
      return { ok: true, fk: "treatmentEntryId" };
    }
  }
}

// ---------- Upload ----------
export async function uploadAttachmentAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = attachmentUploadSchema.safeParse({
    patientId: formData.get("patientId"),
    parentType: formData.get("parentType"),
    parentId: formData.get("parentId"),
    fileType: formData.get("fileType"),
    description: formData.get("description") ?? "",
    isSensitive: formData.get("isSensitive") ?? undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { patientId, parentType, parentId, fileType, description } = parsed.data;
  // Private by default: only an explicit "false" downgrades sensitivity.
  const isSensitive = parsed.data.isSensitive !== false;

  // Permission AND patient scope (admin bypasses) — never trust the client.
  if (!(await canUploadAttachment(user, patientId))) {
    return { error: "You do not have permission to upload attachments for this patient." };
  }

  // The uploaded file.
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  const fileError = validateUploadedFile({ mimeType: file.type, sizeBytes: file.size });
  if (fileError) return { error: fileError };

  // Parent must belong to this patient and not be archived.
  const parent = await resolveParent(parentType, parentId, patientId);
  if (!parent.ok) return { error: parent.error };

  // Server-generated, opaque storage key (no PII, no raw filename).
  const attachmentId = randomUUID();
  const blobId = randomUUID();
  const key = buildAttachmentKey(patientId, attachmentId, blobId);

  const storage = getStorage();
  const body = Buffer.from(await file.arrayBuffer());
  await storage.put({ key, body, contentType: file.type });

  // Virus-scan seam (no-op in Phase 7).
  await scanOnUpload(key);

  try {
    await db.patientAttachment.create({
      data: {
        id: attachmentId,
        patientId,
        [parent.fk]: parentId,
        uploadedByUserId: user.id,
        fileType,
        fileName: file.name,
        storagePath: key,
        mimeType: file.type,
        sizeBytes: file.size,
        description: description?.trim() || null,
        isSensitive,
      },
      select: { id: true },
    });
  } catch (err) {
    // DB write failed after the blob was stored — best-effort rollback so we
    // don't leave an orphaned blob with no row pointing at it.
    await storage.delete(key).catch(() => {});
    console.error("[attachment] create failed; rolled back blob", err);
    return { error: "Could not save the attachment. Please try again." };
  }

  await writeAuditLog({
    action: AUDIT_ACTIONS.ATTACHMENT_UPLOADED,
    actorUserId: user.id,
    entityType: "PatientAttachment",
    entityId: attachmentId,
    // PII-safe: ids/enums/size/scope only. Never fileName, bytes, or free text.
    metadata: {
      attachmentId,
      patientId,
      parentType,
      parentId,
      fileType,
      sizeBytes: file.size,
      isSensitive,
      scope: patientScopeLabel(user),
    },
  });

  revalidateParent(patientId, parentType, parentId);
  return { success: "Attachment uploaded." };
}

// ---------- Archive (soft-delete) ----------
export async function archiveAttachmentAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = attachmentArchiveSchema.safeParse({
    patientId: formData.get("patientId"),
    id: formData.get("id"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { error: "Invalid request." };
  const { patientId, id, reason } = parsed.data;

  if (!(await canDeleteAttachment(user, patientId))) {
    return { error: "You do not have permission to archive this attachment." };
  }

  const attachment = await db.patientAttachment.findUnique({
    where: { id },
    select: {
      id: true,
      patientId: true,
      deletedAt: true,
      fileType: true,
      sizeBytes: true,
      patientIssueId: true,
      caseRecordId: true,
      treatmentEntryId: true,
    },
  });
  // Cross-patient tamper guard + already-archived guard.
  if (!attachment || attachment.patientId !== patientId) {
    return { error: "Attachment not found." };
  }
  if (attachment.deletedAt) return { error: "This attachment is already archived." };

  // Soft-delete only: the row is hidden but the stored blob is RETAINED.
  // (Blob garbage-collection is deferred future work — see the phase report.)
  await db.patientAttachment.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedByUserId: user.id,
      deletionReason: reason?.trim() || null,
    },
  });

  const parentType: AttachmentParentType | null = attachment.patientIssueId
    ? "issue"
    : attachment.caseRecordId
      ? "case"
      : attachment.treatmentEntryId
        ? "treatment"
        : null;

  await writeAuditLog({
    action: AUDIT_ACTIONS.ATTACHMENT_DELETED,
    actorUserId: user.id,
    entityType: "PatientAttachment",
    entityId: id,
    metadata: {
      attachmentId: id,
      patientId,
      parentType,
      fileType: attachment.fileType,
      sizeBytes: attachment.sizeBytes,
      scope: patientScopeLabel(user),
      deletionReason: reason?.trim() || null,
    },
  });

  const parentId =
    attachment.patientIssueId ??
    attachment.caseRecordId ??
    attachment.treatmentEntryId ??
    undefined;
  if (parentType && parentId) revalidateParent(patientId, parentType, parentId);
  else revalidatePath(`/patients/${patientId}/attachments`);

  return { success: "Attachment archived." };
}

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canCreateCase, canEditCase } from "@/lib/permissions/patient-access";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { caseRecordSchema } from "@/lib/validation/clinical";
import { toCaseScalars } from "@/lib/clinical/data";
import type { ClinicalActionState } from "@/lib/clinical/form-state";

/**
 * Create-or-edit the single CaseRecord for a patient. Exactly one case per
 * patient is enforced by the unique `patientId` (DB) and by upserting here:
 * if a case already exists we update it (requires case.update), otherwise we
 * create it (requires case.create). Access is permission AND relationship.
 */
export async function upsertCaseRecordAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = caseRecordSchema.safeParse({
    patientId: formData.get("patientId"),
    chiefComplaint: formData.get("chiefComplaint") ?? "",
    caseDescription: formData.get("caseDescription") ?? "",
    medicalHistory: formData.get("medicalHistory") ?? "",
    familyHistory: formData.get("familyHistory") ?? "",
    physicalGenerals: formData.get("physicalGenerals") ?? "",
    mentalGenerals: formData.get("mentalGenerals") ?? "",
    modalities: formData.get("modalities") ?? "",
    diagnosisNotes: formData.get("diagnosisNotes") ?? "",
    repertoryNotes: formData.get("repertoryNotes") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { patientId } = parsed.data;

  const existing = await db.caseRecord.findUnique({
    where: { patientId },
    select: { id: true },
  });

  const allowed = existing
    ? await canEditCase(user, patientId)
    : await canCreateCase(user, patientId);
  if (!allowed) {
    return { error: "You do not have permission to edit this case." };
  }

  const scalars = toCaseScalars(parsed.data);

  if (existing) {
    await db.caseRecord.update({ where: { id: existing.id }, data: scalars });
    await writeAuditLog({
      action: AUDIT_ACTIONS.CASE_UPDATED,
      actorUserId: user.id,
      entityType: "CaseRecord",
      entityId: existing.id,
    });
  } else {
    const created = await db.caseRecord.create({
      data: { patientId, ...scalars },
      select: { id: true },
    });
    await writeAuditLog({
      action: AUDIT_ACTIONS.CASE_CREATED,
      actorUserId: user.id,
      entityType: "CaseRecord",
      entityId: created.id,
    });
  }

  revalidatePath(`/patients/${patientId}/case`);
  revalidatePath(`/patients/${patientId}/timeline`);
  return { success: "Case saved." };
}

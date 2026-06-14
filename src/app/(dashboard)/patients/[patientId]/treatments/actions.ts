"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canAddTreatmentEntry,
  canEditTreatment,
  canArchiveTreatment,
} from "@/lib/permissions/patient-access";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import {
  createTreatmentSchema,
  updateTreatmentSchema,
  archiveSchema,
} from "@/lib/validation/clinical";
import { toTreatmentScalars } from "@/lib/clinical/data";
import type { ClinicalActionState } from "@/lib/clinical/form-state";
import {
  syncFollowUpAppointment,
  type FollowUpSyncAudit,
} from "@/lib/appointments/sync";

/** Flush the follow-up appointment audit AFTER the tx commits — ids/enums only. */
async function auditFollowUp(
  userId: string,
  patientId: string,
  a: FollowUpSyncAudit | null,
) {
  if (!a) return;
  await writeAuditLog({
    action: a.action,
    actorUserId: userId,
    entityType: "Appointment",
    entityId: a.appointmentId,
    metadata: { patientId, type: "FOLLOW_UP", status: a.status, viaTreatment: true },
  });
}

/** Form payload → schema input (multi-value doctor lists use getAll). */
function readTreatmentForm(formData: FormData) {
  return {
    entryType: formData.get("entryType") ?? "",
    treatmentDate: formData.get("treatmentDate") ?? "",
    patientIssueId: formData.get("patientIssueId") ?? "",
    medicineName: formData.get("medicineName") ?? "",
    potency: formData.get("potency") ?? "",
    dosage: formData.get("dosage") ?? "",
    frequency: formData.get("frequency") ?? "",
    duration: formData.get("duration") ?? "",
    instructions: formData.get("instructions") ?? "",
    followUpNotes: formData.get("followUpNotes") ?? "",
    symptomChanges: formData.get("symptomChanges") ?? "",
    patientCondition: formData.get("patientCondition") ?? "",
    improvementScore: formData.get("improvementScore") ?? "",
    nextFollowUpDate: formData.get("nextFollowUpDate") ?? "",
    treatingDoctorProfileIds: formData.getAll("treatingDoctorProfileIds").map(String),
    consultingDoctorProfileIds: formData.getAll("consultingDoctorProfileIds").map(String),
  };
}

/**
 * Validate the issue link (optional) and the doctor-profile selections.
 * Returns either an error state or the resolved/cleaned ids.
 *
 * - patientIssueId, if present, must belong to the patient and not be archived.
 * - Treating/consulting ids must all be real DoctorProfile rows (never User
 *   ids; non-doctors have no profile). A doctor listed as treating is removed
 *   from the consulting list so the two roles don't double up.
 */
async function resolveLinks(
  patientId: string,
  patientIssueId: string,
  treatingIds: string[],
  consultingIds: string[],
): Promise<
  | { error: ClinicalActionState }
  | { issueId: string | null; treating: string[]; consulting: string[] }
> {
  let issueId: string | null = null;
  if (patientIssueId) {
    const issue = await db.patientIssue.findUnique({
      where: { id: patientIssueId },
      select: { patientId: true, deletedAt: true },
    });
    if (!issue || issue.patientId !== patientId || issue.deletedAt) {
      return { error: { fieldErrors: { patientIssueId: ["Invalid issue."] } } };
    }
    issueId = patientIssueId;
  }

  const consulting = consultingIds.filter((id) => !treatingIds.includes(id));
  const allIds = Array.from(new Set([...treatingIds, ...consulting]));
  const found = await db.doctorProfile.findMany({
    where: { id: { in: allIds } },
    select: { id: true },
  });
  if (found.length !== allIds.length) {
    return {
      error: {
        fieldErrors: { treatingDoctorProfileIds: ["One or more selected doctors are invalid."] },
      },
    };
  }

  return { issueId, treating: treatingIds, consulting };
}

function participantRows(
  treatmentEntryId: string,
  treating: string[],
  consulting: string[],
): Prisma.TreatmentDoctorParticipantCreateManyInput[] {
  return [
    ...treating.map((doctorProfileId) => ({
      treatmentEntryId,
      doctorProfileId,
      participantType: "TREATING_DOCTOR" as const,
    })),
    ...consulting.map((doctorProfileId) => ({
      treatmentEntryId,
      doctorProfileId,
      participantType: "CONSULTING_DOCTOR" as const,
    })),
  ];
}

// ---------- Create ----------
export async function createTreatmentAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = createTreatmentSchema.safeParse({
    patientId: formData.get("patientId"),
    ...readTreatmentForm(formData),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { patientId } = parsed.data;

  if (!(await canAddTreatmentEntry(user, patientId))) {
    return { error: "You do not have permission to add treatment entries." };
  }

  // TreatmentEntry requires the patient's single CaseRecord.
  const caseRecord = await db.caseRecord.findUnique({
    where: { patientId },
    select: { id: true },
  });
  if (!caseRecord) {
    return { error: "Create the patient's case record before adding treatments." };
  }

  const links = await resolveLinks(
    patientId,
    parsed.data.patientIssueId ?? "",
    parsed.data.treatingDoctorProfileIds,
    parsed.data.consultingDoctorProfileIds,
  );
  if ("error" in links) return links.error;

  const scalars = toTreatmentScalars(parsed.data);

  const { entryId, followUpAudit } = await db.$transaction(async (tx) => {
    const entry = await tx.treatmentEntry.create({
      data: {
        patientId,
        caseRecordId: caseRecord.id,
        patientIssueId: links.issueId,
        ...scalars,
      },
      select: { id: true },
    });
    await tx.treatmentDoctorParticipant.createMany({
      data: participantRows(entry.id, links.treating, links.consulting),
    });
    // Route the form's "Next follow-up" date to a linked FOLLOW_UP appointment
    // (A1.5). In the same tx → a sync failure rolls back the treatment write.
    const followUpAudit = await syncFollowUpAppointment(tx, {
      treatmentEntryId: entry.id,
      patientId,
      nextFollowUpDate: parsed.data.nextFollowUpDate,
      userId: user.id,
    });
    return { entryId: entry.id, followUpAudit };
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.TREATMENT_CREATED,
    actorUserId: user.id,
    entityType: "TreatmentEntry",
    entityId: entryId,
    metadata: {
      patientId,
      entryType: parsed.data.entryType,
      treatingCount: links.treating.length,
      consultingCount: links.consulting.length,
    },
  });
  await auditFollowUp(user.id, patientId, followUpAudit);

  revalidatePath(`/patients/${patientId}/treatments`);
  revalidatePath(`/patients/${patientId}/appointments`);
  revalidatePath(`/patients/${patientId}/timeline`);
  redirect(`/patients/${patientId}/treatments/${entryId}`);
}

// ---------- Update ----------
export async function updateTreatmentAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = updateTreatmentSchema.safeParse({
    patientId: formData.get("patientId"),
    treatmentId: formData.get("treatmentId"),
    ...readTreatmentForm(formData),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { patientId, treatmentId } = parsed.data;

  if (!(await canEditTreatment(user, patientId))) {
    return { error: "You do not have permission to edit this treatment entry." };
  }

  const entry = await db.treatmentEntry.findUnique({
    where: { id: treatmentId },
    select: { id: true, patientId: true, deletedAt: true },
  });
  if (!entry || entry.patientId !== patientId) return { error: "Treatment not found." };
  if (entry.deletedAt) return { error: "This treatment entry has been archived." };

  const links = await resolveLinks(
    patientId,
    parsed.data.patientIssueId ?? "",
    parsed.data.treatingDoctorProfileIds,
    parsed.data.consultingDoctorProfileIds,
  );
  if ("error" in links) return links.error;

  const scalars = toTreatmentScalars(parsed.data);

  // Replace the participant set transactionally (clean re-insert).
  const followUpAudit = await db.$transaction(async (tx) => {
    await tx.treatmentEntry.update({
      where: { id: treatmentId },
      data: { patientIssueId: links.issueId, ...scalars },
    });
    await tx.treatmentDoctorParticipant.deleteMany({
      where: { treatmentEntryId: treatmentId },
    });
    await tx.treatmentDoctorParticipant.createMany({
      data: participantRows(treatmentId, links.treating, links.consulting),
    });
    // Sync the linked FOLLOW_UP appointment from the form date (A1.5).
    return syncFollowUpAppointment(tx, {
      treatmentEntryId: treatmentId,
      patientId,
      nextFollowUpDate: parsed.data.nextFollowUpDate,
      userId: user.id,
    });
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.TREATMENT_UPDATED,
    actorUserId: user.id,
    entityType: "TreatmentEntry",
    entityId: treatmentId,
    metadata: { patientId, entryType: parsed.data.entryType },
  });
  await auditFollowUp(user.id, patientId, followUpAudit);

  revalidatePath(`/patients/${patientId}/treatments`);
  revalidatePath(`/patients/${patientId}/treatments/${treatmentId}`);
  revalidatePath(`/patients/${patientId}/appointments`);
  revalidatePath(`/patients/${patientId}/timeline`);
  return { success: "Treatment entry saved." };
}

// ---------- Archive (soft-delete) ----------
export async function archiveTreatmentAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = archiveSchema.safeParse({
    patientId: formData.get("patientId"),
    id: formData.get("id"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { error: "Invalid request." };
  const { patientId, id, reason } = parsed.data;

  if (!(await canArchiveTreatment(user, patientId))) {
    return { error: "You do not have permission to archive this treatment entry." };
  }

  const entry = await db.treatmentEntry.findUnique({
    where: { id },
    select: { id: true, patientId: true, deletedAt: true },
  });
  if (!entry || entry.patientId !== patientId) return { error: "Treatment not found." };
  if (entry.deletedAt) return { error: "This treatment entry is already archived." };

  await db.treatmentEntry.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedByUserId: user.id,
      deletionReason: reason?.trim() || null,
    },
  });
  await writeAuditLog({
    action: AUDIT_ACTIONS.TREATMENT_DELETED,
    actorUserId: user.id,
    entityType: "TreatmentEntry",
    entityId: id,
    metadata: { patientId, deletionReason: reason?.trim() || null },
  });

  revalidatePath(`/patients/${patientId}/treatments`);
  revalidatePath(`/patients/${patientId}/timeline`);
  redirect(`/patients/${patientId}/treatments`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canCreateIssue,
  canEditIssue,
  canArchiveIssue,
  canCreateSymptom,
  canEditSymptom,
  canArchiveSymptom,
} from "@/lib/permissions/patient-access";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import {
  createIssueSchema,
  updateIssueSchema,
  createSymptomSchema,
  updateSymptomSchema,
  archiveSchema,
} from "@/lib/validation/clinical";
import { toIssueScalars, toSymptomScalars } from "@/lib/clinical/data";
import type { ClinicalActionState } from "@/lib/clinical/form-state";

function revalidateIssue(patientId: string, issueId?: string) {
  revalidatePath(`/patients/${patientId}/issues`);
  if (issueId) revalidatePath(`/patients/${patientId}/issues/${issueId}`);
  revalidatePath(`/patients/${patientId}/timeline`);
}

// ---------- Issue: create ----------
export async function createIssueAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = createIssueSchema.safeParse({
    patientId: formData.get("patientId"),
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    status: formData.get("status") ?? "ACTIVE",
    onsetDate: formData.get("onsetDate") ?? "",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { patientId } = parsed.data;

  if (!(await canCreateIssue(user, patientId))) {
    return { error: "You do not have permission to add issues for this patient." };
  }

  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { id: true },
  });
  if (!patient) return { error: "Patient not found." };

  const created = await db.patientIssue.create({
    data: { patientId, ...toIssueScalars(parsed.data) },
    select: { id: true },
  });
  await writeAuditLog({
    action: AUDIT_ACTIONS.ISSUE_CREATED,
    actorUserId: user.id,
    entityType: "PatientIssue",
    entityId: created.id,
    metadata: { patientId, status: parsed.data.status },
  });

  revalidateIssue(patientId, created.id);
  redirect(`/patients/${patientId}/issues/${created.id}`);
}

// ---------- Issue: update ----------
export async function updateIssueAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = updateIssueSchema.safeParse({
    patientId: formData.get("patientId"),
    issueId: formData.get("issueId"),
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    status: formData.get("status") ?? "ACTIVE",
    onsetDate: formData.get("onsetDate") ?? "",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { patientId, issueId } = parsed.data;

  if (!(await canEditIssue(user, patientId))) {
    return { error: "You do not have permission to edit this issue." };
  }

  // Ownership: issue must belong to this patient and not be archived.
  const issue = await db.patientIssue.findUnique({
    where: { id: issueId },
    select: { id: true, patientId: true, deletedAt: true },
  });
  if (!issue || issue.patientId !== patientId) return { error: "Issue not found." };
  if (issue.deletedAt) return { error: "This issue has been archived." };

  await db.patientIssue.update({
    where: { id: issueId },
    data: toIssueScalars(parsed.data),
  });
  await writeAuditLog({
    action: AUDIT_ACTIONS.ISSUE_UPDATED,
    actorUserId: user.id,
    entityType: "PatientIssue",
    entityId: issueId,
    metadata: { patientId, status: parsed.data.status },
  });

  revalidateIssue(patientId, issueId);
  return { success: "Issue updated." };
}

// ---------- Issue: archive (soft-delete) ----------
export async function archiveIssueAction(
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

  if (!(await canArchiveIssue(user, patientId))) {
    return { error: "You do not have permission to archive this issue." };
  }

  const issue = await db.patientIssue.findUnique({
    where: { id },
    select: { id: true, patientId: true, deletedAt: true },
  });
  if (!issue || issue.patientId !== patientId) return { error: "Issue not found." };
  if (issue.deletedAt) return { error: "This issue is already archived." };

  // Soft-delete only: row is preserved; child symptoms and linked treatments
  // are intentionally left untouched (kept independent per Phase 6 decision).
  await db.patientIssue.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedByUserId: user.id,
      deletionReason: reason?.trim() || null,
    },
  });
  await writeAuditLog({
    action: AUDIT_ACTIONS.ISSUE_DELETED,
    actorUserId: user.id,
    entityType: "PatientIssue",
    entityId: id,
    metadata: { patientId, deletionReason: reason?.trim() || null },
  });

  revalidateIssue(patientId, id);
  redirect(`/patients/${patientId}/issues`);
}

// ---------- Symptom helpers ----------
/** Verify a symptom's parent issue belongs to the patient; returns the issue. */
async function loadIssueForSymptom(issueId: string, patientId: string) {
  const issue = await db.patientIssue.findUnique({
    where: { id: issueId },
    select: { id: true, patientId: true, deletedAt: true },
  });
  if (!issue || issue.patientId !== patientId) return null;
  return issue;
}

// ---------- Symptom: create ----------
export async function createSymptomAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = createSymptomSchema.safeParse({
    patientId: formData.get("patientId"),
    issueId: formData.get("issueId"),
    symptomName: formData.get("symptomName") ?? "",
    description: formData.get("description") ?? "",
    severity: formData.get("severity") ?? "",
    duration: formData.get("duration") ?? "",
    modalities: formData.get("modalities") ?? "",
    triggers: formData.get("triggers") ?? "",
    location: formData.get("location") ?? "",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { patientId, issueId } = parsed.data;

  if (!(await canCreateSymptom(user, patientId))) {
    return { error: "You do not have permission to add symptoms." };
  }

  const issue = await loadIssueForSymptom(issueId, patientId);
  if (!issue) return { error: "Issue not found." };
  if (issue.deletedAt) return { error: "Cannot add symptoms to an archived issue." };

  const created = await db.patientSymptom.create({
    data: { patientIssueId: issueId, ...toSymptomScalars(parsed.data) },
    select: { id: true },
  });
  await writeAuditLog({
    action: AUDIT_ACTIONS.SYMPTOM_CREATED,
    actorUserId: user.id,
    entityType: "PatientSymptom",
    entityId: created.id,
    metadata: { patientId, issueId },
  });

  revalidateIssue(patientId, issueId);
  redirect(`/patients/${patientId}/issues/${issueId}`);
}

// ---------- Symptom: update ----------
export async function updateSymptomAction(
  _prev: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const user = await requireUser();

  const parsed = updateSymptomSchema.safeParse({
    patientId: formData.get("patientId"),
    issueId: formData.get("issueId"),
    symptomId: formData.get("symptomId"),
    symptomName: formData.get("symptomName") ?? "",
    description: formData.get("description") ?? "",
    severity: formData.get("severity") ?? "",
    duration: formData.get("duration") ?? "",
    modalities: formData.get("modalities") ?? "",
    triggers: formData.get("triggers") ?? "",
    location: formData.get("location") ?? "",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { patientId, issueId, symptomId } = parsed.data;

  if (!(await canEditSymptom(user, patientId))) {
    return { error: "You do not have permission to edit this symptom." };
  }

  const symptom = await db.patientSymptom.findUnique({
    where: { id: symptomId },
    select: { id: true, patientIssueId: true, deletedAt: true },
  });
  if (!symptom || symptom.patientIssueId !== issueId) {
    return { error: "Symptom not found." };
  }
  if (symptom.deletedAt) return { error: "This symptom has been archived." };
  const issue = await loadIssueForSymptom(issueId, patientId);
  if (!issue) return { error: "Issue not found." };

  await db.patientSymptom.update({
    where: { id: symptomId },
    data: toSymptomScalars(parsed.data),
  });
  await writeAuditLog({
    action: AUDIT_ACTIONS.SYMPTOM_UPDATED,
    actorUserId: user.id,
    entityType: "PatientSymptom",
    entityId: symptomId,
    metadata: { patientId, issueId },
  });

  revalidateIssue(patientId, issueId);
  return { success: "Symptom updated." };
}

// ---------- Symptom: archive (soft-delete) ----------
export async function archiveSymptomAction(
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

  if (!(await canArchiveSymptom(user, patientId))) {
    return { error: "You do not have permission to archive this symptom." };
  }

  const symptom = await db.patientSymptom.findUnique({
    where: { id },
    select: {
      id: true,
      deletedAt: true,
      patientIssue: { select: { id: true, patientId: true } },
    },
  });
  if (!symptom || symptom.patientIssue.patientId !== patientId) {
    return { error: "Symptom not found." };
  }
  if (symptom.deletedAt) return { error: "This symptom is already archived." };

  await db.patientSymptom.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedByUserId: user.id,
      deletionReason: reason?.trim() || null,
    },
  });
  await writeAuditLog({
    action: AUDIT_ACTIONS.SYMPTOM_DELETED,
    actorUserId: user.id,
    entityType: "PatientSymptom",
    entityId: id,
    metadata: { patientId, issueId: symptom.patientIssue.id, deletionReason: reason?.trim() || null },
  });

  revalidateIssue(patientId, symptom.patientIssue.id);
  return { success: "Symptom archived." };
}

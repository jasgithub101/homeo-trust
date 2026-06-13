"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canEditPatient,
  canManagePatientDoctors,
  canViewSensitivePatient,
  isCurrentPrimaryTreatingDoctor,
} from "@/lib/permissions/patient-access";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { toPatientScalars } from "@/lib/patients/patient-data";
import {
  updatePatientSchema,
  assignDoctorSchema,
  transferPatientSchema,
  endRelationshipSchema,
} from "@/lib/validation/patient";

export interface PatientActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
}

// ---------- Update patient ----------
export async function updatePatientAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const user = await requireUser();

  const parsed = updatePatientSchema.safeParse({
    patientId: formData.get("patientId"),
    name: formData.get("name"),
    gender: formData.get("gender") ?? "UNSPECIFIED",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    age: formData.get("age") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    city: formData.get("city") ?? "",
    state: formData.get("state") ?? "",
    country: formData.get("country") ?? "",
    occupation: formData.get("occupation") ?? "",
    emergencyContactName: formData.get("emergencyContactName") ?? "",
    emergencyContactRelation: formData.get("emergencyContactRelation") ?? "",
    emergencyContactPhone: formData.get("emergencyContactPhone") ?? "",
    emergencyContactAddress: formData.get("emergencyContactAddress") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { patientId } = parsed.data;

  // Editing PII requires both edit rights and the right to see the PII.
  const [editable, canSee] = await Promise.all([
    canEditPatient(user, patientId),
    canViewSensitivePatient(user, patientId),
  ]);
  if (!editable || !canSee) {
    return { error: "You do not have permission to edit this patient." };
  }

  await db.patient.update({
    where: { id: patientId },
    data: toPatientScalars(parsed.data),
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.PATIENT_UPDATED,
    actorUserId: user.id,
    entityType: "Patient",
    entityId: patientId,
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  return { success: "Patient updated." };
}

// ---------- Assign doctor ----------
export async function assignDoctorAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const user = await requireUser();

  const parsed = assignDoctorSchema.safeParse({
    patientId: formData.get("patientId"),
    doctorProfileId: formData.get("doctorProfileId"),
    relationshipType: formData.get("relationshipType"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { patientId, doctorProfileId, relationshipType, notes } = parsed.data;

  // Authorization branches on relationship type (patientId comes from the route,
  // and the primary check is server-derived — no client trust):
  //  - CONSULTING: managers/admin OR the patient's CURRENT primary treating
  //    doctor (the primary may add consultants without patient.assignDoctor).
  //  - PRIMARY_TREATING / ASSISTING: managers/admin only (canManagePatientDoctors).
  const isConsulting = relationshipType === "CONSULTING";
  const isManager = await canManagePatientDoctors(user, patientId);
  const allowed = isConsulting
    ? isManager || (await isCurrentPrimaryTreatingDoctor(user, patientId))
    : isManager;
  if (!allowed) {
    return {
      error: isConsulting
        ? "You do not have permission to add a consulting doctor to this patient."
        : "You do not have permission to manage this patient's doctors.",
    };
  }
  // True only when reached via the primary-only path (for audit + self-guard).
  const viaPrimaryDoctor = isConsulting && !isManager;

  const doctor = await db.doctorProfile.findUnique({
    where: { id: doctorProfileId },
    select: { id: true },
  });
  if (!doctor) return { fieldErrors: { doctorProfileId: ["Doctor not found."] } };

  // A doctor cannot be assigned as their own consulting doctor (notably the
  // primary self-consulting on the primary-only path).
  if (isConsulting && doctorProfileId === user.doctorProfileId) {
    return {
      fieldErrors: {
        doctorProfileId: ["A doctor cannot be added as their own consulting doctor."],
      },
    };
  }

  // One current PRIMARY_TREATING doctor per patient — app check + DB backstop.
  if (relationshipType === "PRIMARY_TREATING") {
    const existingPrimary = await db.doctorPatientRelationship.findFirst({
      where: { patientId, relationshipType: "PRIMARY_TREATING", isCurrentlyTreating: true },
      select: { id: true },
    });
    if (existingPrimary) {
      return {
        error:
          "This patient already has a current primary treating doctor. Use Transfer to change it.",
      };
    }
  }

  // No duplicate active consulting relationship for the same (patient, doctor).
  if (isConsulting) {
    const dupConsult = await db.doctorPatientRelationship.findFirst({
      where: {
        patientId,
        doctorProfileId,
        relationshipType: "CONSULTING",
        isCurrentlyTreating: true,
      },
      select: { id: true },
    });
    if (dupConsult) {
      return { error: "This doctor is already a current consulting doctor for this patient." };
    }
  }

  try {
    await db.doctorPatientRelationship.create({
      data: {
        patientId,
        doctorProfileId,
        relationshipType,
        isCurrentlyTreating: true,
        notes: notes?.trim() || null,
        assignedByUserId: user.id,
      },
    });
  } catch {
    // Partial unique index backstop (race on current primary).
    return {
      error:
        "Could not assign — this patient may already have a current primary treating doctor.",
    };
  }

  await writeAuditLog({
    action: AUDIT_ACTIONS.DPR_CREATED,
    actorUserId: user.id,
    entityType: "Patient",
    entityId: patientId,
    // ids/enums only. viaPrimaryDoctor records the relationship-derived path
    // (primary adding a consultant without patient.assignDoctor).
    metadata: { doctorProfileId, relationshipType, viaPrimaryDoctor },
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  return { success: "Doctor assigned." };
}

// ---------- Transfer (end old primary + create new primary) ----------
export async function transferPatientAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const user = await requireUser();

  const parsed = transferPatientSchema.safeParse({
    patientId: formData.get("patientId"),
    newDoctorProfileId: formData.get("newDoctorProfileId"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { patientId, newDoctorProfileId, notes } = parsed.data;

  if (!(await canManagePatientDoctors(user, patientId))) {
    return { error: "You do not have permission to manage this patient's doctors." };
  }

  const doctor = await db.doctorProfile.findUnique({
    where: { id: newDoctorProfileId },
    select: { id: true },
  });
  if (!doctor) return { fieldErrors: { newDoctorProfileId: ["Doctor not found."] } };

  const currentPrimary = await db.doctorPatientRelationship.findFirst({
    where: { patientId, relationshipType: "PRIMARY_TREATING", isCurrentlyTreating: true },
    select: { id: true, doctorProfileId: true },
  });
  if (!currentPrimary) {
    return {
      error:
        "This patient has no current primary treating doctor. Use Assign instead.",
    };
  }
  if (currentPrimary.doctorProfileId === newDoctorProfileId) {
    return {
      fieldErrors: {
        newDoctorProfileId: ["This doctor is already the primary treating doctor."],
      },
    };
  }

  // Close old then create new in one transaction (order keeps the partial
  // unique index satisfied: at most one current primary at any time).
  await db.$transaction([
    db.doctorPatientRelationship.update({
      where: { id: currentPrimary.id },
      data: { isCurrentlyTreating: false, endDate: new Date() },
    }),
    db.doctorPatientRelationship.create({
      data: {
        patientId,
        doctorProfileId: newDoctorProfileId,
        relationshipType: "PRIMARY_TREATING",
        isCurrentlyTreating: true,
        notes: notes?.trim() || null,
        assignedByUserId: user.id,
      },
    }),
  ]);

  await writeAuditLog({
    action: AUDIT_ACTIONS.DPR_TRANSFERRED,
    actorUserId: user.id,
    entityType: "Patient",
    entityId: patientId,
    metadata: {
      fromDoctorProfileId: currentPrimary.doctorProfileId,
      toDoctorProfileId: newDoctorProfileId,
    },
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  return { success: "Patient transferred." };
}

// ---------- End a relationship (soft close — never delete) ----------
export async function endRelationshipAction(
  _prev: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const user = await requireUser();

  const parsed = endRelationshipSchema.safeParse({
    patientId: formData.get("patientId"),
    relationshipId: formData.get("relationshipId"),
  });
  if (!parsed.success) return { error: "Invalid request." };
  const { patientId, relationshipId } = parsed.data;

  if (!(await canManagePatientDoctors(user, patientId))) {
    return { error: "You do not have permission to manage this patient's doctors." };
  }

  const rel = await db.doctorPatientRelationship.findUnique({
    where: { id: relationshipId },
    select: { id: true, patientId: true, isCurrentlyTreating: true, doctorProfileId: true },
  });
  if (!rel || rel.patientId !== patientId) {
    return { error: "Relationship not found." };
  }
  if (!rel.isCurrentlyTreating) {
    return { error: "This relationship has already ended." };
  }

  await db.doctorPatientRelationship.update({
    where: { id: rel.id },
    data: { isCurrentlyTreating: false, endDate: new Date() },
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.DPR_ENDED,
    actorUserId: user.id,
    entityType: "Patient",
    entityId: patientId,
    metadata: { relationshipId: rel.id, doctorProfileId: rel.doctorProfileId },
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/patients");
  return { success: "Relationship ended." };
}

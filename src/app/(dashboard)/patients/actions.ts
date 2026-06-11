"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions/check";
import { userHasPermission } from "@/lib/auth/current-user";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { createPatientSchema } from "@/lib/validation/patient";
import { toPatientScalars } from "@/lib/patients/patient-data";
import { generateUniquePatientCode } from "@/lib/patients/patient-code";

export interface CreatePatientState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: {
    patientId: string;
    patientCode: string;
    canView: boolean;
    assignedSelf: boolean;
  };
}

export async function createPatientAction(
  _prev: CreatePatientState,
  formData: FormData,
): Promise<CreatePatientState> {
  const actor = await requirePermission("patient.create");

  const parsed = createPatientSchema.safeParse({
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
    initialDoctorProfileId: formData.get("initialDoctorProfileId") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;
  const initialDoctorProfileId = input.initialDoctorProfileId?.trim() || null;

  // Assigning an initial doctor requires assignDoctor permission (or admin) and
  // an existing DoctorProfile (never a generic User / non-doctor).
  if (initialDoctorProfileId) {
    if (!(actor.isAdmin || userHasPermission(actor, "patient.assignDoctor"))) {
      return {
        fieldErrors: {
          initialDoctorProfileId: [
            "You do not have permission to assign a doctor.",
          ],
        },
      };
    }
    const doctor = await db.doctorProfile.findUnique({
      where: { id: initialDoctorProfileId },
      select: { id: true },
    });
    if (!doctor) {
      return { fieldErrors: { initialDoctorProfileId: ["Doctor not found."] } };
    }
  }

  const patientCode = await generateUniquePatientCode();
  const scalars = toPatientScalars(input);

  let patient: { id: string };
  try {
    patient = await db.patient.create({
      data: {
        ...scalars,
        patientCode,
        doctorRelationships: initialDoctorProfileId
          ? {
              create: {
                doctorProfileId: initialDoctorProfileId,
                relationshipType: "PRIMARY_TREATING",
                isCurrentlyTreating: true,
                assignedByUserId: actor.id,
              },
            }
          : undefined,
      },
      select: { id: true },
    });
  } catch {
    return { error: "Could not create the patient. Please try again." };
  }

  await writeAuditLog({
    action: AUDIT_ACTIONS.PATIENT_CREATED,
    actorUserId: actor.id,
    entityType: "Patient",
    entityId: patient.id,
    metadata: { assignedInitialDoctor: Boolean(initialDoctorProfileId) },
  });
  if (initialDoctorProfileId) {
    await writeAuditLog({
      action: AUDIT_ACTIONS.DPR_CREATED,
      actorUserId: actor.id,
      entityType: "Patient",
      entityId: patient.id,
      metadata: {
        doctorProfileId: initialDoctorProfileId,
        relationshipType: "PRIMARY_TREATING",
        viaCreate: true,
      },
    });
  }

  const assignedSelf =
    !!actor.doctorProfileId && initialDoctorProfileId === actor.doctorProfileId;
  const canView = actor.isAdmin || assignedSelf;

  revalidatePath("/patients");
  return {
    success: { patientId: patient.id, patientCode, canView, assignedSelf },
  };
}

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
  const postedDoctorId = input.initialDoctorProfileId?.trim() || null;
  const isAssigner =
    actor.isAdmin || userHasPermission(actor, "patient.assignDoctor");

  // Resolve the single DoctorProfile (if any) that will drive the new patient's
  // PRIMARY_TREATING relationship. Tri-state authorization:
  //  1) Assigner (admin / patient.assignDoctor): honor the explicit picker (may
  //     be null = "None", or another doctor). The form pre-selects self, but the
  //     choice is theirs. The target DoctorProfile must exist.
  //  2) Non-assigner WITH a DoctorProfile: SELF-CLAIM only. Any posted id (even a
  //     forged other-doctor id) is IGNORED; we use only the server-side
  //     actor.doctorProfileId. This closes the "doctor locked out of the patient
  //     they just created" gap without granting the privileged ability to assign
  //     *other* doctors.
  //  3) Non-assigner WITHOUT a DoctorProfile (e.g. reception): never honor a
  //     client-supplied doctor — reject a posted id; the patient is still created
  //     with no relationship.
  let assignedDoctorProfileId: string | null = null;

  if (isAssigner) {
    if (postedDoctorId) {
      const doctor = await db.doctorProfile.findUnique({
        where: { id: postedDoctorId },
        select: { id: true },
      });
      if (!doctor) {
        return { fieldErrors: { initialDoctorProfileId: ["Doctor not found."] } };
      }
      assignedDoctorProfileId = postedDoctorId;
    }
  } else if (actor.doctorProfileId) {
    // Self-assignment only — posted id is deliberately ignored (tamper guard).
    assignedDoctorProfileId = actor.doctorProfileId;
  } else if (postedDoctorId) {
    return {
      fieldErrors: {
        initialDoctorProfileId: [
          "You do not have permission to assign a doctor.",
        ],
      },
    };
  }

  const selfAssigned =
    !!actor.doctorProfileId && assignedDoctorProfileId === actor.doctorProfileId;

  const patientCode = await generateUniquePatientCode();
  const scalars = toPatientScalars(input);

  let patient: { id: string };
  try {
    patient = await db.patient.create({
      data: {
        ...scalars,
        patientCode,
        // Exactly one (or none) PRIMARY_TREATING current relationship — explicit
        // picker (assigner) or self-claim (non-assigner doctor), resolved above.
        // Nested create = one implicit transaction: if this DPR insert fails, the
        // patient insert rolls back. A brand-new patient has no other DPR rows, so
        // the dpr_one_current_primary_per_patient partial unique index is safe.
        doctorRelationships: assignedDoctorProfileId
          ? {
              create: {
                doctorProfileId: assignedDoctorProfileId,
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
    metadata: { assignedInitialDoctor: Boolean(assignedDoctorProfileId) },
  });
  if (assignedDoctorProfileId) {
    await writeAuditLog({
      action: AUDIT_ACTIONS.DPR_CREATED,
      actorUserId: actor.id,
      entityType: "Patient",
      entityId: patient.id,
      // ids/enums only. selfAssigned distinguishes a doctor claiming their own
      // new patient (no assignDoctor needed) from an assigner picking a doctor.
      metadata: {
        doctorProfileId: assignedDoctorProfileId,
        relationshipType: "PRIMARY_TREATING",
        viaCreate: true,
        selfAssigned,
      },
    });
  }

  const canView = actor.isAdmin || selfAssigned;

  revalidatePath("/patients");
  return {
    success: {
      patientId: patient.id,
      patientCode,
      canView,
      assignedSelf: selfAssigned,
    },
  };
}

import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  type CurrentUser,
  userHasPermission,
} from "@/lib/auth/current-user";

/**
 * Patient access control: permissions PLUS DoctorPatientRelationship.
 *
 * Access model (per Phase 5 decisions):
 * - Admin = super access (sees/edits/manages all patients).
 * - A non-admin is "related" to a patient if their DoctorProfile has ANY
 *   DoctorPatientRelationship row (current OR past) for that patient.
 * - Sensitive PII requires `patient.viewSensitive` AND (admin OR related).
 *   Having a relationship without the permission is NOT enough.
 * - Non-doctor users have no DoctorProfile, so they are related to no one.
 */

/** True if the user's DoctorProfile has any relationship (current or past). */
export async function isRelatedToPatient(
  user: CurrentUser,
  patientId: string,
): Promise<boolean> {
  if (!user.doctorProfileId) return false;
  const rel = await db.doctorPatientRelationship.findFirst({
    where: { patientId, doctorProfileId: user.doctorProfileId },
    select: { id: true },
  });
  return rel !== null;
}

/** Can the user open the Patients section at all? */
export function canAccessPatientsSection(user: CurrentUser): boolean {
  return (
    user.isAdmin ||
    userHasPermission(user, "patient.viewSensitive") ||
    userHasPermission(user, "patient.viewDeidentified")
  );
}

/** Admin OR (patient.viewSensitive AND related). Controls raw PII exposure. */
export async function canViewSensitivePatient(
  user: CurrentUser,
  patientId: string,
): Promise<boolean> {
  if (user.isAdmin) return true;
  if (!userHasPermission(user, "patient.viewSensitive")) return false;
  return isRelatedToPatient(user, patientId);
}

/** Admin OR (patient.update AND related). */
export async function canEditPatient(
  user: CurrentUser,
  patientId: string,
): Promise<boolean> {
  if (user.isAdmin) return true;
  if (!userHasPermission(user, "patient.update")) return false;
  return isRelatedToPatient(user, patientId);
}

/** Admin OR (patient.assignDoctor AND related). For managing existing patients. */
export async function canManagePatientDoctors(
  user: CurrentUser,
  patientId: string,
): Promise<boolean> {
  if (user.isAdmin) return true;
  if (!userHasPermission(user, "patient.assignDoctor")) return false;
  return isRelatedToPatient(user, patientId);
}

/** Can the user open a patient's detail at all (admin or related)? */
export async function canViewPatient(
  user: CurrentUser,
  patientId: string,
): Promise<boolean> {
  if (user.isAdmin) return true;
  return isRelatedToPatient(user, patientId);
}

/**
 * Prisma `where` filter scoping the patient list:
 * - admin → all patients
 * - doctor → only patients their DoctorProfile is related to
 * - non-doctor non-admin → none
 */
export function patientListWhere(user: CurrentUser): Prisma.PatientWhereInput {
  if (user.isAdmin) return {};
  if (!user.doctorProfileId) return { id: { in: [] } };
  return {
    doctorRelationships: {
      some: { doctorProfileId: user.doctorProfileId },
    },
  };
}

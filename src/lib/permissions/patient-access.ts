import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  type CurrentUser,
  userHasPermission,
} from "@/lib/auth/current-user";
import type { PermissionKey } from "./keys";

/**
 * Patient access control: two orthogonal axes, plus admin bypass.
 *
 * BREADTH (which patients a user may reach) — `isPatientInScope`:
 * - admin OR `patient.viewAll` → every patient (works even without a
 *   DoctorProfile; it is NOT relationship-based).
 * - `patient.viewAssigned` → only patients the user's DoctorProfile is related
 *   to via DoctorPatientRelationship (current OR past).
 * - otherwise → no patients.
 *
 * DEPTH (which fields) — `canViewSensitivePatient`:
 * - admin OR (`patient.viewSensitive` AND in scope) → full PII.
 * - otherwise → de-identified only.
 *
 * The axes are independent: a depth permission NEVER grants row scope, and a
 * breadth permission NEVER reveals PII. A `viewAll` holder without a depth
 * permission safely sees every patient de-identified.
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

/** Breadth: admin OR `patient.viewAll` (independent of any relationship). */
export function canViewAllPatients(user: CurrentUser): boolean {
  return user.isAdmin || userHasPermission(user, "patient.viewAll");
}

/**
 * BREADTH gate — may this user reach this specific patient at all?
 * admin/viewAll → any patient; viewAssigned → only related patients; else none.
 * Every depth/action helper layers its permission on top of this.
 */
export async function isPatientInScope(
  user: CurrentUser,
  patientId: string,
): Promise<boolean> {
  if (canViewAllPatients(user)) return true;
  if (userHasPermission(user, "patient.viewAssigned")) {
    return isRelatedToPatient(user, patientId);
  }
  return false;
}

/** Can the user open the Patients section at all? Breadth-based. */
export function canAccessPatientsSection(user: CurrentUser): boolean {
  return (
    user.isAdmin ||
    userHasPermission(user, "patient.viewAll") ||
    userHasPermission(user, "patient.viewAssigned")
  );
}

/** DEPTH: admin OR (patient.viewSensitive AND in scope). Controls raw PII. */
export async function canViewSensitivePatient(
  user: CurrentUser,
  patientId: string,
): Promise<boolean> {
  if (user.isAdmin) return true;
  if (!userHasPermission(user, "patient.viewSensitive")) return false;
  return isPatientInScope(user, patientId);
}

/** Admin OR (patient.update AND in scope). */
export async function canEditPatient(
  user: CurrentUser,
  patientId: string,
): Promise<boolean> {
  if (user.isAdmin) return true;
  if (!userHasPermission(user, "patient.update")) return false;
  return isPatientInScope(user, patientId);
}

/** Admin OR (patient.assignDoctor AND in scope). For managing existing patients. */
export async function canManagePatientDoctors(
  user: CurrentUser,
  patientId: string,
): Promise<boolean> {
  if (user.isAdmin) return true;
  if (!userHasPermission(user, "patient.assignDoctor")) return false;
  return isPatientInScope(user, patientId);
}

/** Can the user open a patient's detail at all? Pure breadth gate. */
export async function canViewPatient(
  user: CurrentUser,
  patientId: string,
): Promise<boolean> {
  return isPatientInScope(user, patientId);
}

/**
 * Clinical access (Phase 6): action permission AND patient breadth scope,
 * admin bypasses. A permission alone is never enough — the patient must also be
 * in the user's scope (viewAll → any; viewAssigned → related). Reused by every
 * clinical page loader and server action.
 */
async function permittedAndRelated(
  user: CurrentUser,
  patientId: string,
  key: PermissionKey,
): Promise<boolean> {
  if (user.isAdmin) return true;
  if (!userHasPermission(user, key)) return false;
  return isPatientInScope(user, patientId);
}

// --- Case ---
export const canViewCase = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "case.view");
export const canCreateCase = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "case.create");
export const canEditCase = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "case.update");

// --- Issue ---
export const canViewIssues = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "issue.view");
export const canCreateIssue = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "issue.create");
export const canEditIssue = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "issue.update");
export const canArchiveIssue = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "issue.delete");

// --- Symptom ---
export const canViewSymptoms = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "symptom.view");
export const canCreateSymptom = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "symptom.create");
export const canEditSymptom = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "symptom.update");
export const canArchiveSymptom = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "symptom.delete");

// --- Treatment ---
export const canViewTreatments = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "treatment.view");
export const canAddTreatmentEntry = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "treatment.create");
export const canEditTreatment = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "treatment.update");
export const canArchiveTreatment = (u: CurrentUser, p: string) =>
  permittedAndRelated(u, p, "treatment.delete");

/**
 * Prisma `where` filter scoping the patient list (BREADTH):
 * - admin OR `patient.viewAll` → all patients (no DoctorProfile required)
 * - `patient.viewAssigned` with a DoctorProfile → only related patients
 * - otherwise (incl. viewAssigned without a DoctorProfile) → none
 */
export function patientListWhere(user: CurrentUser): Prisma.PatientWhereInput {
  if (canViewAllPatients(user)) return {};
  if (userHasPermission(user, "patient.viewAssigned") && user.doctorProfileId) {
    return {
      doctorRelationships: {
        some: { doctorProfileId: user.doctorProfileId },
      },
    };
  }
  return { id: { in: [] } };
}

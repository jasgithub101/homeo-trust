/**
 * Central permission catalog.
 *
 * This is the single source of truth for permission keys, mirroring
 * docs/SECURITY_MODEL.md §4. The seed script inserts every entry here as a
 * `Permission` row, and runtime checks reference these keys.
 *
 * NOTE: Phase 2 only seeds and enforces a minimal subset of behavior. The full
 * catalog is seeded so roles/permissions can be assigned in Phase 3 without a
 * migration. There are NO fixed DOCTOR/REGIONAL_HEAD roles — only the ADMIN
 * system role is fixed, and it holds every permission below.
 */

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
  category: string;
}

export const PERMISSIONS = [
  // User and Role Management
  { key: "user.create", label: "Create user", description: "Create new users.", category: "User & Role Management" },
  { key: "user.update", label: "Update user", description: "Update user details.", category: "User & Role Management" },
  { key: "user.deactivate", label: "Deactivate user", description: "Deactivate a user account.", category: "User & Role Management" },
  { key: "user.assignRole", label: "Assign role", description: "Assign roles to users.", category: "User & Role Management" },
  { key: "role.create", label: "Create role", description: "Create new roles.", category: "User & Role Management" },
  { key: "role.update", label: "Update role", description: "Update existing roles.", category: "User & Role Management" },
  { key: "role.delete", label: "Delete role", description: "Delete roles.", category: "User & Role Management" },
  { key: "permission.assign", label: "Assign permission", description: "Assign permissions to roles.", category: "User & Role Management" },

  // Patient
  // Breadth (which patients) and depth (which fields) are orthogonal. Breadth =
  // viewAssigned | viewAll (admin bypasses). Depth = viewSensitive |
  // viewDeidentified. A depth permission NEVER grants row scope; a breadth
  // permission NEVER reveals PII. viewAll works for users without a
  // DoctorProfile (it is not relationship-based).
  { key: "patient.create", label: "Create patient", description: "Create patient records.", category: "Patient" },
  { key: "patient.viewAssigned", label: "View assigned patients", description: "See only patients you are related to via doctor assignment (breadth).", category: "Patient" },
  { key: "patient.viewAll", label: "View all patients", description: "See all patients in the system, regardless of assignment (breadth).", category: "Patient" },
  { key: "patient.viewSensitive", label: "View sensitive patient", description: "View full sensitive patient PII (depth). Does not grant row scope.", category: "Patient" },
  { key: "patient.viewDeidentified", label: "View de-identified patient", description: "View de-identified patient data (depth). Does not grant row scope.", category: "Patient" },
  { key: "patient.update", label: "Update patient", description: "Update patient records.", category: "Patient" },
  { key: "patient.delete", label: "Delete patient", description: "Delete patient records.", category: "Patient" },
  { key: "patient.assignDoctor", label: "Assign doctor", description: "Assign doctors to patients.", category: "Patient" },

  // Case
  { key: "case.create", label: "Create case", description: "Create case records.", category: "Case" },
  { key: "case.view", label: "View case", description: "View case records.", category: "Case" },
  { key: "case.update", label: "Update case", description: "Update case records.", category: "Case" },
  { key: "case.delete", label: "Delete case", description: "Delete case records.", category: "Case" },

  // Issue
  { key: "issue.create", label: "Create issue", description: "Create patient issues.", category: "Issue" },
  { key: "issue.view", label: "View issue", description: "View patient issues.", category: "Issue" },
  { key: "issue.update", label: "Update issue", description: "Update patient issues.", category: "Issue" },
  { key: "issue.delete", label: "Delete issue", description: "Delete patient issues.", category: "Issue" },

  // Symptom
  { key: "symptom.create", label: "Create symptom", description: "Create patient symptoms.", category: "Symptom" },
  { key: "symptom.view", label: "View symptom", description: "View patient symptoms.", category: "Symptom" },
  { key: "symptom.update", label: "Update symptom", description: "Update patient symptoms.", category: "Symptom" },
  { key: "symptom.delete", label: "Delete symptom", description: "Delete patient symptoms.", category: "Symptom" },

  // Treatment
  { key: "treatment.create", label: "Create treatment", description: "Create treatment entries.", category: "Treatment" },
  { key: "treatment.view", label: "View treatment", description: "View treatment entries.", category: "Treatment" },
  { key: "treatment.update", label: "Update treatment", description: "Update treatment entries.", category: "Treatment" },
  { key: "treatment.delete", label: "Delete treatment", description: "Delete treatment entries.", category: "Treatment" },

  // Attachments
  // Breadth (`attachment.view`) lists metadata and downloads non-sensitive
  // files. Depth (`attachment.viewSensitive`) additionally unlocks the bytes of
  // files marked sensitive. Both still require the patient to be in scope.
  { key: "attachment.upload", label: "Upload attachment", description: "Upload attachments.", category: "Attachments" },
  { key: "attachment.view", label: "View attachment", description: "List attachment metadata and download non-sensitive files (breadth).", category: "Attachments" },
  { key: "attachment.viewSensitive", label: "View sensitive attachment", description: "Download files marked sensitive (depth). Does not grant breadth.", category: "Attachments" },
  { key: "attachment.delete", label: "Delete attachment", description: "Archive (soft-delete) attachments.", category: "Attachments" },

  // Explore
  { key: "explore.view", label: "View Explore", description: "Access the de-identified Explore page.", category: "Explore" },
  { key: "explore.filter", label: "Filter Explore", description: "Filter de-identified Explore records.", category: "Explore" },
  { key: "explore.bypassCohortMinimum", label: "Bypass Explore cohort minimum", description: "See Explore results for cohorts smaller than the privacy minimum (lifts the <5-case suppression backstop only; never reveals PII).", category: "Explore" },
  { key: "explore.viewDoctorName", label: "View doctor name in Explore", description: "Reveal doctor names in Explore (hidden by default).", category: "Explore" },

  // AI
  { key: "ai.use", label: "Use AI assistant", description: "Use the privacy-safe AI case assistant.", category: "AI" },
  { key: "ai.viewLogs", label: "View AI logs", description: "View AI search logs.", category: "AI" },

  // Audit
  { key: "audit.view", label: "View audit logs", description: "View the audit log.", category: "Audit" },
  { key: "audit.export", label: "Export audit logs", description: "Export the audit log.", category: "Audit" },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

/** Name of the single fixed system role. */
export const ADMIN_ROLE_NAME = "ADMIN";

/** Set of all valid permission keys, for fast membership/validation checks. */
export const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(
  PERMISSIONS.map((p) => p.key),
);

/** Type guard: is the given string a known permission key? */
export function isPermissionKey(key: string): key is PermissionKey {
  return PERMISSION_KEY_SET.has(key);
}

/** Permissions grouped by category, preserving catalog order, for UI rendering. */
export function groupPermissionsByCategory(): {
  category: string;
  permissions: PermissionDefinition[];
}[] {
  const groups: { category: string; permissions: PermissionDefinition[] }[] = [];
  const index = new Map<string, PermissionDefinition[]>();
  for (const p of PERMISSIONS) {
    let bucket = index.get(p.category);
    if (!bucket) {
      bucket = [];
      index.set(p.category, bucket);
      groups.push({ category: p.category, permissions: bucket });
    }
    bucket.push(p);
  }
  return groups;
}

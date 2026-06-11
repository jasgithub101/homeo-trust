import { z } from "zod";

/**
 * Zod schemas for Phase 6 clinical workflow: CaseRecord, PatientIssue,
 * PatientSymptom, TreatmentEntry (+ TreatmentDoctorParticipant), and archive.
 *
 * All inputs are validated server-side before any DB write. No PII and no
 * clinical free text is ever logged. `deletionReason` is a short operator label
 * (e.g. "duplicate", "entered in error"), never clinical content.
 */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const optionalDate = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date");

const score1to10 = z
  .union([z.coerce.number().int().min(1).max(10), z.literal("")])
  .optional();

// Enum value tuples (mirror the Prisma enums) — also drive the form <select>s.
export const ISSUE_STATUS_VALUES = [
  "ACTIVE",
  "RESOLVED",
  "CHRONIC",
  "RECURRING",
] as const;

export const TREATMENT_ENTRY_TYPES = [
  "PRESCRIPTION",
  "FOLLOW_UP",
  "PRESCRIPTION_AND_FOLLOW_UP",
  "NOTE",
] as const;

export const PATIENT_CONDITION_VALUES = [
  "IMPROVED",
  "SAME",
  "WORSENED",
] as const;

// ---------- CaseRecord (create + edit share one upsert action) ----------
export const caseRecordSchema = z.object({
  patientId: z.string().min(1),
  chiefComplaint: z.string().trim().min(1, "Chief complaint is required").max(2000),
  caseDescription: z.string().trim().min(1, "Case description is required").max(8000),
  medicalHistory: optionalText(8000),
  familyHistory: optionalText(8000),
  physicalGenerals: optionalText(8000),
  mentalGenerals: optionalText(8000),
  modalities: optionalText(4000),
  diagnosisNotes: optionalText(8000),
  repertoryNotes: optionalText(8000),
});
export type CaseRecordInput = z.infer<typeof caseRecordSchema>;

// ---------- PatientIssue ----------
const issueFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(4000),
  status: z.enum(ISSUE_STATUS_VALUES).default("ACTIVE"),
  onsetDate: optionalDate,
};

export const createIssueSchema = z.object({
  patientId: z.string().min(1),
  ...issueFields,
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = z.object({
  patientId: z.string().min(1),
  issueId: z.string().min(1),
  ...issueFields,
});
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

// ---------- PatientSymptom ----------
const symptomFields = {
  symptomName: z.string().trim().min(1, "Symptom name is required").max(200),
  description: optionalText(4000),
  severity: score1to10,
  duration: optionalText(120),
  modalities: optionalText(2000),
  triggers: optionalText(2000),
  location: optionalText(200),
};

export const createSymptomSchema = z.object({
  patientId: z.string().min(1),
  issueId: z.string().min(1),
  ...symptomFields,
});
export type CreateSymptomInput = z.infer<typeof createSymptomSchema>;

export const updateSymptomSchema = z.object({
  patientId: z.string().min(1),
  issueId: z.string().min(1),
  symptomId: z.string().min(1),
  ...symptomFields,
});
export type UpdateSymptomInput = z.infer<typeof updateSymptomSchema>;

// ---------- TreatmentEntry (+ doctor participants) ----------
// Doctor selectors carry DoctorProfile.id values (never User.id). Treating
// requires at least one; consulting is optional.
const doctorIdList = z
  .array(z.string().min(1))
  .transform((arr) => Array.from(new Set(arr.filter((v) => v.length > 0))));

const treatmentFields = {
  entryType: z.enum(TREATMENT_ENTRY_TYPES),
  treatmentDate: z
    .string()
    .trim()
    .min(1, "Treatment date is required")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  patientIssueId: z.string().optional().or(z.literal("")),
  medicineName: optionalText(200),
  potency: optionalText(80),
  dosage: optionalText(120),
  frequency: optionalText(120),
  duration: optionalText(120),
  instructions: optionalText(4000),
  followUpNotes: optionalText(8000),
  symptomChanges: optionalText(8000),
  patientCondition: z.enum(PATIENT_CONDITION_VALUES).optional().or(z.literal("")),
  improvementScore: score1to10,
  nextFollowUpDate: optionalDate,
  treatingDoctorProfileIds: doctorIdList.refine(
    (arr) => arr.length >= 1,
    "Select at least one treating doctor",
  ),
  consultingDoctorProfileIds: doctorIdList,
};

export const createTreatmentSchema = z.object({
  patientId: z.string().min(1),
  ...treatmentFields,
});
export type CreateTreatmentInput = z.infer<typeof createTreatmentSchema>;

export const updateTreatmentSchema = z.object({
  patientId: z.string().min(1),
  treatmentId: z.string().min(1),
  ...treatmentFields,
});
export type UpdateTreatmentInput = z.infer<typeof updateTreatmentSchema>;

// ---------- Archive (soft-delete) — issue / symptom / treatment ----------
// `reason` is a short operator label only. Never clinical free text or PII.
export const archiveSchema = z.object({
  patientId: z.string().min(1),
  id: z.string().min(1),
  reason: optionalText(200),
});
export type ArchiveInput = z.infer<typeof archiveSchema>;

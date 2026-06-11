import type {
  IssueStatus,
  PatientCondition,
  TreatmentEntryType,
} from "@prisma/client";
import type {
  CaseRecordInput,
  CreateIssueInput,
  CreateSymptomInput,
  CreateTreatmentInput,
  UpdateIssueInput,
  UpdateSymptomInput,
  UpdateTreatmentInput,
} from "@/lib/validation/clinical";

/** Trim a string field, returning null when empty. */
function txt(v?: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

function date(v?: string | null): Date | null {
  const t = (v ?? "").trim();
  return t ? new Date(t) : null;
}

function int(v: number | "" | undefined): number | null {
  return typeof v === "number" ? v : null;
}

/** CaseRecord scalar columns (chiefComplaint/caseDescription required). */
export function toCaseScalars(input: CaseRecordInput) {
  return {
    chiefComplaint: input.chiefComplaint.trim(),
    caseDescription: input.caseDescription.trim(),
    medicalHistory: txt(input.medicalHistory),
    familyHistory: txt(input.familyHistory),
    physicalGenerals: txt(input.physicalGenerals),
    mentalGenerals: txt(input.mentalGenerals),
    modalities: txt(input.modalities),
    diagnosisNotes: txt(input.diagnosisNotes),
    repertoryNotes: txt(input.repertoryNotes),
  };
}

/** PatientIssue scalar columns. */
export function toIssueScalars(input: CreateIssueInput | UpdateIssueInput) {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    status: input.status as IssueStatus,
    onsetDate: date(input.onsetDate),
  };
}

/** PatientSymptom scalar columns. */
export function toSymptomScalars(
  input: CreateSymptomInput | UpdateSymptomInput,
) {
  return {
    symptomName: input.symptomName.trim(),
    description: txt(input.description),
    severity: int(input.severity),
    duration: txt(input.duration),
    modalities: txt(input.modalities),
    triggers: txt(input.triggers),
    location: txt(input.location),
  };
}

/**
 * TreatmentEntry scalar columns (no relations — the action wires patientId/
 * caseRecordId/patientIssueId and the participant rows). Empty enum strings
 * normalize to null.
 */
export function toTreatmentScalars(
  input: CreateTreatmentInput | UpdateTreatmentInput,
) {
  return {
    entryType: input.entryType as TreatmentEntryType,
    treatmentDate: new Date(input.treatmentDate),
    medicineName: txt(input.medicineName),
    potency: txt(input.potency),
    dosage: txt(input.dosage),
    frequency: txt(input.frequency),
    duration: txt(input.duration),
    instructions: txt(input.instructions),
    followUpNotes: txt(input.followUpNotes),
    symptomChanges: txt(input.symptomChanges),
    patientCondition: (input.patientCondition || null) as PatientCondition | null,
    improvementScore: int(input.improvementScore),
    nextFollowUpDate: date(input.nextFollowUpDate),
  };
}

import { z } from "zod";

/**
 * Zod schemas for Phase 5 patient management + doctor-patient relationships.
 * All inputs are validated server-side before any DB write. No PII is logged.
 */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

export const GENDER_VALUES = ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"] as const;

// Relationship types selectable when assigning a doctor (TRANSFERRED_* is not
// user-selectable in Phase 5 — transfer is its own flow).
export const ASSIGNABLE_RELATIONSHIP_TYPES = [
  "PRIMARY_TREATING",
  "CONSULTING",
  "ASSISTING",
] as const;

const patientFields = {
  name: z.string().trim().min(1, "Name is required").max(120),
  gender: z.enum(GENDER_VALUES).default("UNSPECIFIED"),
  // Accept an empty string (cleared) or a valid date; coerced in the action.
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  age: z
    .union([z.coerce.number().int().min(0).max(150), z.literal("")])
    .optional(),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(254)
    .optional()
    .or(z.literal("")),
  address: optionalText(300),
  city: optionalText(120),
  state: optionalText(120),
  country: optionalText(120),
  occupation: optionalText(120),
  emergencyContactName: optionalText(120),
  emergencyContactRelation: optionalText(80),
  emergencyContactPhone: optionalText(40),
  emergencyContactAddress: optionalText(300),
};

export const createPatientSchema = z.object({
  ...patientFields,
  // Optional initial PRIMARY_TREATING doctor (must be an existing DoctorProfile).
  initialDoctorProfileId: z.string().min(1).optional().or(z.literal("")),
});
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = z.object({
  patientId: z.string().min(1),
  ...patientFields,
});
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

export const assignDoctorSchema = z.object({
  patientId: z.string().min(1),
  doctorProfileId: z.string().min(1, "Select a doctor"),
  relationshipType: z.enum(ASSIGNABLE_RELATIONSHIP_TYPES),
  notes: optionalText(500),
});
export type AssignDoctorInput = z.infer<typeof assignDoctorSchema>;

export const transferPatientSchema = z.object({
  patientId: z.string().min(1),
  newDoctorProfileId: z.string().min(1, "Select the new treating doctor"),
  notes: optionalText(500),
});
export type TransferPatientInput = z.infer<typeof transferPatientSchema>;

export const endRelationshipSchema = z.object({
  patientId: z.string().min(1),
  relationshipId: z.string().min(1),
});
export type EndRelationshipInput = z.infer<typeof endRelationshipSchema>;

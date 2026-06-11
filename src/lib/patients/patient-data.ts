import type { Prisma } from "@prisma/client";
import type {
  CreatePatientInput,
  UpdatePatientInput,
} from "@/lib/validation/patient";

/** Trim a string field, returning null when empty. */
function txt(v?: string | null): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

/**
 * Map validated create/update input to Patient scalar columns. Normalizes empty
 * strings to null, parses dateOfBirth, lowercases email, and coerces age.
 */
export function toPatientScalars(
  input: CreatePatientInput | UpdatePatientInput,
): Prisma.PatientCreateInput {
  return {
    name: input.name.trim(),
    gender: input.gender,
    dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
    age: typeof input.age === "number" ? input.age : null,
    phone: txt(input.phone),
    email: input.email ? input.email.trim().toLowerCase() : null,
    address: txt(input.address),
    city: txt(input.city),
    state: txt(input.state),
    country: txt(input.country),
    occupation: txt(input.occupation),
    emergencyContactName: txt(input.emergencyContactName),
    emergencyContactRelation: txt(input.emergencyContactRelation),
    emergencyContactPhone: txt(input.emergencyContactPhone),
    emergencyContactAddress: txt(input.emergencyContactAddress),
  } as Prisma.PatientCreateInput;
}

import "server-only";
import { db } from "@/lib/db";
import type { DoctorOption } from "@/components/patients/CreatePatientForm";

/**
 * Selectable treating doctors = existing DoctorProfile rows (never generic
 * Users / non-doctors). Label uses the linked user's name + specialization.
 */
export async function loadDoctorOptions(): Promise<DoctorOption[]> {
  const profiles = await db.doctorProfile.findMany({
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      specialization: true,
      user: { select: { name: true } },
    },
  });
  return profiles.map((p) => ({
    id: p.id,
    label: p.specialization
      ? `${p.user.name} — ${p.specialization}`
      : p.user.name,
  }));
}

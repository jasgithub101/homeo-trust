/**
 * Build PII-gated treating/consulting doctor labels for a treatment entry.
 *
 * Identified viewers (showSensitive) see the doctor's name; de-identified
 * viewers see a neutral handle (specialization or "Doctor") — never the name.
 * Mirrors the Phase 5 patient-detail doctor-label rule. `user.name` is only
 * present in the row when the caller selected it under showSensitive.
 */
interface ParticipantRow {
  participantType: string;
  doctorProfile: {
    specialization: string | null;
    user: { name?: string };
  };
}

function label(p: ParticipantRow, showSensitive: boolean): string {
  if (showSensitive && p.doctorProfile.user.name) return p.doctorProfile.user.name;
  return p.doctorProfile.specialization
    ? `Doctor (${p.doctorProfile.specialization})`
    : "Doctor";
}

export function participantLabels(
  participants: ParticipantRow[],
  showSensitive: boolean,
): { treating: string[]; consulting: string[] } {
  const treating: string[] = [];
  const consulting: string[] = [];
  for (const p of participants) {
    const l = label(p, showSensitive);
    if (p.participantType === "TREATING_DOCTOR") treating.push(l);
    else if (p.participantType === "CONSULTING_DOCTOR") consulting.push(l);
  }
  return { treating, consulting };
}

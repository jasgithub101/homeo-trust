import "server-only";
import { db } from "@/lib/db";
import { participantLabels } from "./doctor-label";

/**
 * Build a merged, chronological patient timeline from the clinical sources:
 * patient creation, doctor assignment history, case record, issues, symptoms,
 * treatments, and follow-ups.
 *
 * Privacy: doctor names are shown only when `showSensitive`; otherwise neutral
 * handles are used (same rule as the rest of Phase 6). Archived issues/symptoms/
 * treatments are excluded unless `showArchived` is set, and are clearly marked
 * when included.
 */
export type TimelineKind =
  | "patient"
  | "assignment"
  | "case"
  | "issue"
  | "symptom"
  | "treatment"
  | "followup";

export interface TimelineEvent {
  date: Date;
  kind: TimelineKind;
  title: string;
  detail?: string;
  href?: string;
  archived?: boolean;
}

export async function buildTimeline(
  patientId: string,
  opts: { showSensitive: boolean; showArchived: boolean },
): Promise<TimelineEvent[]> {
  const { showSensitive, showArchived } = opts;
  const archiveFilter = showArchived ? {} : { deletedAt: null };

  const [
    patient,
    relationships,
    caseRecord,
    issues,
    symptoms,
    treatments,
    followUpAppointments,
  ] = await Promise.all([
      db.patient.findUnique({
        where: { id: patientId },
        select: { createdAt: true },
      }),
      db.doctorPatientRelationship.findMany({
        where: { patientId },
        orderBy: { startDate: "asc" },
        select: {
          relationshipType: true,
          startDate: true,
          endDate: true,
          doctorProfile: {
            select: { specialization: true, user: { select: { id: true, name: showSensitive } } },
          },
        },
      }),
      db.caseRecord.findUnique({
        where: { patientId },
        select: { createdAt: true },
      }),
      db.patientIssue.findMany({
        where: { patientId, ...archiveFilter },
        select: { id: true, title: true, status: true, createdAt: true, deletedAt: true },
      }),
      db.patientSymptom.findMany({
        where: { patientIssue: { patientId }, ...archiveFilter },
        select: {
          id: true,
          symptomName: true,
          createdAt: true,
          deletedAt: true,
          patientIssue: { select: { id: true, title: true } },
        },
      }),
      db.treatmentEntry.findMany({
        where: { patientId, ...archiveFilter },
        select: {
          id: true,
          treatmentDate: true,
          entryType: true,
          medicineName: true,
          deletedAt: true,
          participants: {
            select: {
              participantType: true,
              doctorProfile: {
                select: { specialization: true, user: { select: { id: true, name: showSensitive } } },
              },
            },
          },
        },
      }),
      // Follow-ups now come from FOLLOW_UP appointments (A1.5), not the
      // deprecated TreatmentEntry.nextFollowUpDate. Cleared (soft-deleted)
      // follow-ups never appear (deletedAt: null), independent of showArchived.
      db.appointment.findMany({
        where: { patientId, type: "FOLLOW_UP", deletedAt: null },
        select: { id: true, scheduledAt: true },
      }),
    ]);

  const events: TimelineEvent[] = [];

  if (patient) {
    events.push({ date: patient.createdAt, kind: "patient", title: "Patient created" });
  }

  for (const r of relationships) {
    const name =
      showSensitive && r.doctorProfile.user.name
        ? r.doctorProfile.user.name
        : r.doctorProfile.specialization
          ? `Doctor (${r.doctorProfile.specialization})`
          : "Doctor";
    const type = r.relationshipType.replace(/_/g, " ").toLowerCase();
    events.push({
      date: r.startDate,
      kind: "assignment",
      title: `Doctor assigned (${type})`,
      detail: name,
    });
    if (r.endDate) {
      events.push({
        date: r.endDate,
        kind: "assignment",
        title: "Doctor relationship ended",
        detail: name,
      });
    }
  }

  if (caseRecord) {
    events.push({
      date: caseRecord.createdAt,
      kind: "case",
      title: "Case record created",
      href: `/patients/${patientId}/case`,
    });
  }

  for (const i of issues) {
    events.push({
      date: i.createdAt,
      kind: "issue",
      title: `Issue: ${i.title}`,
      detail: i.status.charAt(0) + i.status.slice(1).toLowerCase(),
      href: `/patients/${patientId}/issues/${i.id}`,
      archived: !!i.deletedAt,
    });
  }

  for (const s of symptoms) {
    events.push({
      date: s.createdAt,
      kind: "symptom",
      title: `Symptom: ${s.symptomName}`,
      detail: `under ${s.patientIssue.title}`,
      href: `/patients/${patientId}/issues/${s.patientIssue.id}`,
      archived: !!s.deletedAt,
    });
  }

  for (const t of treatments) {
    const labels = participantLabels(t.participants, showSensitive);
    const type = t.entryType.replace(/_/g, " ").toLowerCase();
    events.push({
      date: t.treatmentDate,
      kind: "treatment",
      title: `Treatment: ${type}`,
      detail: [t.medicineName, labels.treating.join(", ")].filter(Boolean).join(" · ") || undefined,
      href: `/patients/${patientId}/treatments/${t.id}`,
      archived: !!t.deletedAt,
    });
  }

  for (const a of followUpAppointments) {
    events.push({
      date: a.scheduledAt,
      kind: "followup",
      title: "Follow-up scheduled",
      href: `/patients/${patientId}/appointments/${a.id}`,
    });
  }

  // Newest first.
  events.sort((a, b) => b.date.getTime() - a.date.getTime());
  return events;
}

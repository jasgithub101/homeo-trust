import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canViewTreatments,
  canEditTreatment,
  canArchiveTreatment,
  canViewSensitivePatient,
  canViewAttachment,
  canUploadAttachment,
  canViewSensitiveAttachment,
  canDeleteAttachment,
} from "@/lib/permissions/patient-access";
import { ArchiveButton } from "@/components/clinical/ArchiveButton";
import { AttachmentsSection } from "@/components/attachments/AttachmentsSection";
import { prettyEnum } from "@/lib/format/enum";
import { participantLabels } from "@/lib/clinical/doctor-label";
import { archiveTreatmentAction } from "../actions";

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-1 border-b border-slate-100 py-3 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export default async function TreatmentDetailPage({
  params,
}: {
  params: Promise<{ patientId: string; treatmentId: string }>;
}) {
  const { patientId, treatmentId } = await params;
  const user = await requireUser();

  if (!(await canViewTreatments(user, patientId))) notFound();
  const showSensitive = await canViewSensitivePatient(user, patientId);

  const t = await db.treatmentEntry.findUnique({
    where: { id: treatmentId },
    select: {
      id: true,
      patientId: true,
      deletedAt: true,
      treatmentDate: true,
      entryType: true,
      medicineName: true,
      potency: true,
      dosage: true,
      frequency: true,
      duration: true,
      instructions: true,
      followUpNotes: true,
      symptomChanges: true,
      patientCondition: true,
      improvementScore: true,
      nextFollowUpDate: true,
      patientIssue: { select: { id: true, title: true, deletedAt: true } },
      participants: {
        select: {
          participantType: true,
          doctorProfile: {
            select: { specialization: true, user: { select: { id: true, name: showSensitive } } },
          },
        },
      },
    },
  });
  if (!t || t.patientId !== patientId || t.deletedAt) notFound();

  // A1.5: the follow-up date now lives on a linked active FOLLOW_UP appointment.
  // Fall back to the deprecated column for any row not yet backfilled.
  const followUpAppt = await db.appointment.findFirst({
    where: { treatmentEntryId: t.id, type: "FOLLOW_UP", deletedAt: null },
    select: { scheduledAt: true },
  });
  const followUpDate = followUpAppt?.scheduledAt ?? t.nextFollowUpDate;

  const [
    canEdit,
    canArchive,
    showAttachments,
    canUploadAtt,
    canViewSensitiveAtt,
    canDeleteAtt,
  ] = await Promise.all([
    canEditTreatment(user, patientId),
    canArchiveTreatment(user, patientId),
    canViewAttachment(user, patientId),
    canUploadAttachment(user, patientId),
    canViewSensitiveAttachment(user, patientId),
    canDeleteAttachment(user, patientId),
  ]);
  const labels = participantLabels(t.participants, showSensitive);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/patients/${patientId}/treatments`} className="text-sm text-brand-700 hover:underline">
            ← Treatments
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">
            {prettyEnum(t.entryType)}
          </h1>
          <p className="text-sm text-slate-500">
            {new Date(t.treatmentDate).toLocaleDateString()}
          </p>
        </div>
        {canEdit ? (
          <Link
            href={`/patients/${patientId}/treatments/${treatmentId}/edit`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </Link>
        ) : null}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <dl>
          <Row label="Treating doctor(s)" value={labels.treating.join(", ") || null} />
          <Row label="Consulting doctor(s)" value={labels.consulting.join(", ") || null} />
          <Row
            label="Related issue"
            value={t.patientIssue && !t.patientIssue.deletedAt ? t.patientIssue.title : null}
          />
          <Row label="Medicine" value={t.medicineName} />
          <Row label="Potency" value={t.potency} />
          <Row label="Dosage" value={t.dosage} />
          <Row label="Frequency" value={t.frequency} />
          <Row label="Duration" value={t.duration} />
          <Row label="Instructions" value={t.instructions} />
          <Row label="Follow-up notes" value={t.followUpNotes} />
          <Row label="Symptom changes" value={t.symptomChanges} />
          <Row label="Patient condition" value={t.patientCondition ? prettyEnum(t.patientCondition) : null} />
          <Row label="Improvement score" value={t.improvementScore != null ? `${t.improvementScore}/10` : null} />
          <Row
            label="Next follow-up"
            value={followUpDate ? new Date(followUpDate).toLocaleDateString() : null}
          />
        </dl>
      </section>

      {canArchive ? (
        <ArchiveButton
          action={archiveTreatmentAction}
          patientId={patientId}
          id={treatmentId}
          entityLabel="treatment entry"
        />
      ) : null}

      {showAttachments ? (
        <AttachmentsSection
          patientId={patientId}
          parentType="treatment"
          parentId={treatmentId}
          canUpload={canUploadAtt}
          canViewSensitive={canViewSensitiveAtt}
          canDelete={canDeleteAtt}
        />
      ) : null}
    </div>
  );
}

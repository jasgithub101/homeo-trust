import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canViewTreatments,
  canAddTreatmentEntry,
  canViewSensitivePatient,
} from "@/lib/permissions/patient-access";
import { ClinicalNav } from "@/components/clinical/ClinicalNav";
import { prettyEnum } from "@/lib/format/enum";
import { participantLabels } from "@/lib/clinical/doctor-label";

export default async function TreatmentsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireUser();

  if (!(await canViewTreatments(user, patientId))) notFound();
  const showSensitive = await canViewSensitivePatient(user, patientId);

  const entries = await db.treatmentEntry.findMany({
    where: { patientId, deletedAt: null },
    orderBy: { treatmentDate: "desc" },
    select: {
      id: true,
      treatmentDate: true,
      entryType: true,
      medicineName: true,
      potency: true,
      patientCondition: true,
      patientIssue: { select: { title: true, deletedAt: true } },
      participants: {
        select: {
          participantType: true,
          doctorProfile: {
            select: { specialization: true, user: { select: { name: showSensitive } } },
          },
        },
      },
    },
  });

  const canCreate = await canAddTreatmentEntry(user, patientId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/patients/${patientId}`} className="text-sm text-brand-700 hover:underline">
            ← Patient
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Treatments</h1>
        </div>
        {canCreate ? (
          <Link
            href={`/patients/${patientId}/treatments/new`}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add treatment
          </Link>
        ) : null}
      </div>

      <ClinicalNav patientId={patientId} active="treatments" />

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No treatment entries yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((t) => {
            const labels = participantLabels(t.participants, showSensitive);
            return (
              <li key={t.id}>
                <Link
                  href={`/patients/${patientId}/treatments/${t.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">
                      {prettyEnum(t.entryType)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(t.treatmentDate).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    {t.medicineName
                      ? `${t.medicineName}${t.potency ? ` ${t.potency}` : ""}`
                      : "—"}
                    {t.patientCondition ? ` · ${prettyEnum(t.patientCondition)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {labels.treating.length ? `Treating: ${labels.treating.join(", ")}` : "No treating doctor"}
                    {t.patientIssue && !t.patientIssue.deletedAt ? ` · Issue: ${t.patientIssue.title}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

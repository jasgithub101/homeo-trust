import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canViewCase, canEditCase } from "@/lib/permissions/patient-access";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { ClinicalNav } from "@/components/clinical/ClinicalNav";

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-1 border-b border-slate-100 py-3 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="whitespace-pre-wrap text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireUser();

  if (!(await canViewCase(user, patientId))) notFound();

  const caseRecord = await db.caseRecord.findUnique({
    where: { patientId },
    select: {
      id: true,
      chiefComplaint: true,
      caseDescription: true,
      medicalHistory: true,
      familyHistory: true,
      physicalGenerals: true,
      mentalGenerals: true,
      modalities: true,
      diagnosisNotes: true,
      repertoryNotes: true,
      updatedAt: true,
    },
  });

  const canEdit = await canEditCase(user, patientId);

  if (caseRecord) {
    await writeAuditLog({
      action: AUDIT_ACTIONS.CASE_VIEWED,
      actorUserId: user.id,
      entityType: "CaseRecord",
      entityId: caseRecord.id,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/patients/${patientId}`} className="text-sm text-brand-700 hover:underline">
          ← Patient
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Case record</h1>
      </div>

      <ClinicalNav patientId={patientId} active="case" />

      {!caseRecord ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            No case record yet. Each patient has exactly one case record.
          </p>
          {canEdit ? (
            <Link
              href={`/patients/${patientId}/case/edit`}
              className="mt-4 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Create case
            </Link>
          ) : null}
        </div>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Details</h2>
            {canEdit ? (
              <Link
                href={`/patients/${patientId}/case/edit`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit case
              </Link>
            ) : null}
          </div>
          <dl>
            <Field label="Chief complaint" value={caseRecord.chiefComplaint} />
            <Field label="Case description" value={caseRecord.caseDescription} />
            <Field label="Medical history" value={caseRecord.medicalHistory} />
            <Field label="Family history" value={caseRecord.familyHistory} />
            <Field label="Physical generals" value={caseRecord.physicalGenerals} />
            <Field label="Mental generals" value={caseRecord.mentalGenerals} />
            <Field label="Modalities" value={caseRecord.modalities} />
            <Field label="Diagnosis notes" value={caseRecord.diagnosisNotes} />
            <Field label="Repertory notes" value={caseRecord.repertoryNotes} />
          </dl>
        </section>
      )}
    </div>
  );
}

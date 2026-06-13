import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canViewPatient,
  canViewSensitivePatient,
  canEditPatient,
  canManagePatientDoctors,
  canViewAllPatients,
} from "@/lib/permissions/patient-access";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { loadDoctorOptions } from "@/lib/patients/doctors";
import { ageRange } from "@/lib/patients/display";
import {
  AssignmentHistory,
  type HistoryRow,
} from "@/components/patients/AssignmentHistory";
import { AssignDoctorForm } from "@/components/patients/AssignDoctorForm";
import { TransferPatientForm } from "@/components/patients/TransferPatientForm";
import { ClinicalNav } from "@/components/clinical/ClinicalNav";

function prettyGender(g: string): string {
  return g.charAt(0) + g.slice(1).toLowerCase();
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireUser();

  if (!(await canViewPatient(user, patientId))) notFound();

  const [showSensitive, canEdit, canManage] = await Promise.all([
    canViewSensitivePatient(user, patientId),
    canEditPatient(user, patientId),
    canManagePatientDoctors(user, patientId),
  ]);

  // De-identified viewers never receive raw PII columns from the DB.
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      patientCode: true,
      gender: true,
      age: true,
      city: true,
      state: true,
      country: true,
      occupation: true,
      createdAt: true,
      name: showSensitive,
      dateOfBirth: showSensitive,
      phone: showSensitive,
      email: showSensitive,
      address: showSensitive,
      emergencyContactName: showSensitive,
      emergencyContactRelation: showSensitive,
      emergencyContactPhone: showSensitive,
      emergencyContactAddress: showSensitive,
      doctorRelationships: {
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          relationshipType: true,
          startDate: true,
          endDate: true,
          isCurrentlyTreating: true,
          doctorProfile: {
            select: {
              id: true,
              specialization: true,
              user: { select: { id: true, name: showSensitive } },
            },
          },
        },
      },
    },
  });
  if (!patient) notFound();

  // Breadth used to reach this patient, for attributability of cross-patient
  // access by viewAll holders. admin > all > assigned.
  const scope = user.isAdmin
    ? "admin"
    : canViewAllPatients(user)
      ? "all"
      : "assigned";

  await writeAuditLog({
    action: AUDIT_ACTIONS.PATIENT_VIEWED,
    actorUserId: user.id,
    entityType: "Patient",
    entityId: patient.id,
    metadata: { sensitive: showSensitive, scope },
  });

  // Doctor labels: identified viewers see the doctor name; de-identified viewers
  // see a neutral handle (specialization only) — never the doctor's name.
  const historyRows: HistoryRow[] = patient.doctorRelationships.map((r, i) => {
    const name = showSensitive
      ? (r.doctorProfile.user as { name: string }).name
      : null;
    const label =
      name ??
      (r.doctorProfile.specialization
        ? `Doctor (${r.doctorProfile.specialization})`
        : `Doctor #${patient.doctorRelationships.length - i}`);
    return {
      id: r.id,
      doctorLabel: label,
      relationshipType: r.relationshipType,
      startDate: r.startDate,
      endDate: r.endDate,
      isCurrentlyTreating: r.isCurrentlyTreating,
    };
  });

  const hasCurrentPrimary = patient.doctorRelationships.some(
    (r) => r.isCurrentlyTreating && r.relationshipType === "PRIMARY_TREATING",
  );
  // UI hint only — the server action re-derives this authoritatively. A current
  // primary treating doctor (even without patient.assignDoctor) may add
  // consultants, so they also need the doctor picker.
  const isPrimaryHere =
    !!user.doctorProfileId &&
    patient.doctorRelationships.some(
      (r) =>
        r.isCurrentlyTreating &&
        r.relationshipType === "PRIMARY_TREATING" &&
        r.doctorProfile.id === user.doctorProfileId,
    );
  const doctors = canManage || isPrimaryHere ? await loadDoctorOptions() : [];

  const dob =
    showSensitive && patient.dateOfBirth
      ? new Date(patient.dateOfBirth).toLocaleDateString()
      : null;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/patients" className="text-sm text-brand-700 hover:underline">
            ← Patients
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">
            {showSensitive && patient.name ? patient.name : patient.patientCode}
          </h1>
          <p className="text-sm text-slate-500">
            <code>{patient.patientCode}</code>
            {!showSensitive ? " · de-identified view" : ""}
          </p>
        </div>
        {canEdit ? (
          <Link
            href={`/patients/${patient.id}/edit`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit details
          </Link>
        ) : null}
      </div>

      <ClinicalNav patientId={patient.id} active="overview" />

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Details</h2>
        <dl>
          <DetailRow label="Gender" value={prettyGender(patient.gender)} />
          <DetailRow
            label={showSensitive ? "Age" : "Age range"}
            value={showSensitive ? String(patient.age ?? "—") : ageRange(patient.age)}
          />
          {showSensitive ? (
            <>
              <DetailRow label="Date of birth" value={dob ?? "—"} />
              <DetailRow label="Phone" value={patient.phone ?? "—"} />
              <DetailRow label="Email" value={patient.email ?? "—"} />
              <DetailRow label="Address" value={patient.address ?? "—"} />
            </>
          ) : null}
          <DetailRow label="City" value={patient.city ?? "—"} />
          <DetailRow label="State" value={patient.state ?? "—"} />
          <DetailRow label="Country" value={patient.country ?? "—"} />
          <DetailRow label="Occupation" value={patient.occupation ?? "—"} />
        </dl>
      </section>

      {showSensitive ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Emergency contact
          </h2>
          <dl>
            <DetailRow label="Name" value={patient.emergencyContactName ?? "—"} />
            <DetailRow label="Relation" value={patient.emergencyContactRelation ?? "—"} />
            <DetailRow label="Phone" value={patient.emergencyContactPhone ?? "—"} />
            <DetailRow label="Address" value={patient.emergencyContactAddress ?? "—"} />
          </dl>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Doctor assignments</h2>
        <AssignmentHistory
          patientId={patient.id}
          rows={historyRows}
          canManage={canManage}
        />

        {canManage ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Assign a doctor
              </h3>
              <AssignDoctorForm patientId={patient.id} doctors={doctors} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="mb-1 text-sm font-semibold text-slate-900">
                Transfer primary doctor
              </h3>
              <p className="mb-3 text-xs text-slate-500">
                Ends the current primary treating doctor and assigns a new one.
                History is preserved.
              </p>
              {hasCurrentPrimary ? (
                <TransferPatientForm patientId={patient.id} doctors={doctors} />
              ) : (
                <p className="text-sm text-slate-500">
                  No current primary treating doctor. Use Assign above.
                </p>
              )}
            </div>
          </div>
        ) : isPrimaryHere ? (
          // Primary treating doctor without patient.assignDoctor: may add
          // consulting doctors to this patient only (no primary/transfer powers).
          <div className="max-w-md rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">
              Add a consulting doctor
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              As this patient&apos;s primary treating doctor, you can bring in
              consulting doctors. They gain access to this patient only.
            </p>
            <AssignDoctorForm
              patientId={patient.id}
              doctors={doctors}
              lockType="CONSULTING"
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

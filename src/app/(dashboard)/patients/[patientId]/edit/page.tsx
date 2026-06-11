import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canEditPatient,
  canViewSensitivePatient,
} from "@/lib/permissions/patient-access";
import { EditPatientForm } from "@/components/patients/EditPatientForm";
import { type PatientDefaults } from "@/components/patients/PatientFields";
import { toDateInput } from "@/lib/patients/display";

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const user = await requireUser();

  // Editing PII requires both edit rights and the right to see the PII.
  const [editable, canSee] = await Promise.all([
    canEditPatient(user, patientId),
    canViewSensitivePatient(user, patientId),
  ]);
  if (!editable || !canSee) redirect(`/patients/${patientId}`);

  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      patientCode: true,
      name: true,
      gender: true,
      dateOfBirth: true,
      age: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      state: true,
      country: true,
      occupation: true,
      emergencyContactName: true,
      emergencyContactRelation: true,
      emergencyContactPhone: true,
      emergencyContactAddress: true,
    },
  });
  if (!patient) notFound();

  const defaults: PatientDefaults = {
    name: patient.name,
    gender: patient.gender,
    dateOfBirth: toDateInput(patient.dateOfBirth),
    age: patient.age ?? "",
    phone: patient.phone ?? "",
    email: patient.email ?? "",
    address: patient.address ?? "",
    city: patient.city ?? "",
    state: patient.state ?? "",
    country: patient.country ?? "",
    occupation: patient.occupation ?? "",
    emergencyContactName: patient.emergencyContactName ?? "",
    emergencyContactRelation: patient.emergencyContactRelation ?? "",
    emergencyContactPhone: patient.emergencyContactPhone ?? "",
    emergencyContactAddress: patient.emergencyContactAddress ?? "",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/patients/${patient.id}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to patient
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">
          Edit patient
        </h1>
        <p className="text-sm text-slate-500">
          <code>{patient.patientCode}</code>
        </p>
      </div>

      <EditPatientForm patientId={patient.id} defaults={defaults} />
    </div>
  );
}

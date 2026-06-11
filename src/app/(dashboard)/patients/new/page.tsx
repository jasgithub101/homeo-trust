import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, userHasPermission } from "@/lib/auth";
import { CreatePatientForm } from "@/components/patients/CreatePatientForm";
import { loadDoctorOptions } from "@/lib/patients/doctors";

export default async function NewPatientPage() {
  const user = await requireUser();
  // Creating a patient requires patient.create (admins always allowed).
  if (!user.isAdmin && !userHasPermission(user, "patient.create")) {
    redirect("/patients");
  }

  // The initial-doctor select is only useful to users who can assign doctors.
  const canAssign =
    user.isAdmin || userHasPermission(user, "patient.assignDoctor");
  const doctors = canAssign ? await loadDoctorOptions() : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/patients" className="text-sm text-brand-700 hover:underline">
          ← Patients
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">New patient</h1>
        <p className="text-sm text-slate-500">
          Enter the patient&apos;s details. Fields other than name are optional.
        </p>
      </div>

      <CreatePatientForm
        doctors={doctors}
        isAdmin={user.isAdmin}
        selfDoctorProfileId={user.doctorProfileId}
      />
    </div>
  );
}

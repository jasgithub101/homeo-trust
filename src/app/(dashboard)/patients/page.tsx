import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, userHasPermission } from "@/lib/auth";
import {
  canAccessPatientsSection,
  canViewAllPatients,
  patientListWhere,
} from "@/lib/permissions/patient-access";
import { ageRange } from "@/lib/patients/display";

export default async function PatientsPage() {
  const user = await requireUser();
  if (!canAccessPatientsSection(user)) redirect("/dashboard");

  const showSensitive =
    user.isAdmin || userHasPermission(user, "patient.viewSensitive");
  const canCreate = user.isAdmin || userHasPermission(user, "patient.create");
  const viewingAll = canViewAllPatients(user);
  const scopeLabel = viewingAll
    ? "Viewing all patients"
    : "Viewing assigned patients";
  const where = patientListWhere(user);

  // Only fetch identifying fields (name + current doctor name) when the viewer
  // is allowed to see them; de-identified viewers get masked rows.
  const currentPrimary = {
    where: { isCurrentlyTreating: true, relationshipType: "PRIMARY_TREATING" as const },
    select: { doctorProfile: { select: { user: { select: { name: showSensitive } } } } },
  };

  const patients = await db.patient.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      patientCode: true,
      gender: true,
      age: true,
      city: true,
      name: showSensitive,
      doctorRelationships: currentPrimary,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Patients</h1>
          <p className="text-sm text-slate-500">
            {scopeLabel} · {patients.length} patient(s).
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/patients/new"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Create patient
          </Link>
        ) : null}
      </div>

      {patients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No patients to show. {canCreate ? "Create one to get started." : ""}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                {showSensitive ? <th className="px-4 py-3 font-medium">Name</th> : null}
                <th className="px-4 py-3 font-medium">Gender</th>
                <th className="px-4 py-3 font-medium">{showSensitive ? "Age" : "Age range"}</th>
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium">Primary doctor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((p) => {
                const primary = p.doctorRelationships[0];
                const doctorName = showSensitive
                  ? (primary?.doctorProfile.user.name ?? "—")
                  : primary
                    ? "Assigned"
                    : "—";
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/patients/${p.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {p.patientCode}
                      </Link>
                    </td>
                    {showSensitive ? (
                      <td className="px-4 py-3 text-slate-900">{p.name ?? "—"}</td>
                    ) : null}
                    <td className="px-4 py-3 text-slate-600">
                      {p.gender.charAt(0) + p.gender.slice(1).toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {showSensitive ? (p.age ?? "—") : ageRange(p.age)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.city ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{doctorName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

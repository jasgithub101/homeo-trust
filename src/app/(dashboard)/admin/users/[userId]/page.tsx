import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminAccess } from "@/lib/permissions/check";
import { RoleAssignmentForm } from "@/components/admin/RoleAssignmentForm";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdminAccess();
  const { userId } = await params;

  const [user, roles] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        active: true,
        mustChangePassword: true,
        doctorProfile: {
          select: {
            qualification: true,
            registrationNumber: true,
            specialization: true,
          },
        },
        userRoles: { select: { roleId: true } },
      },
    }),
    db.role.findMany({
      orderBy: [{ isSystemRole: "desc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, isSystemRole: true },
    }),
  ]);

  if (!user) notFound();

  const assignedRoleIds = user.userRoles.map((ur) => ur.roleId);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link href="/admin/users" className="text-xs text-brand-700 hover:underline">
          ← Users
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-slate-900">{user.name}</h1>
          <span
            className={
              user.active
                ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-700"
                : "rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600"
            }
          >
            {user.active ? "Active" : "Inactive"}
          </span>
          {user.mustChangePassword ? (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              Pending password
            </span>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Detail label="Username" value={user.username} />
        <Detail label="Email" value={user.email} />
        {user.doctorProfile ? (
          <>
            <Detail label="Qualification" value={user.doctorProfile.qualification} />
            <Detail
              label="Registration number"
              value={user.doctorProfile.registrationNumber ?? "—"}
            />
            <Detail
              label="Specialization"
              value={user.doctorProfile.specialization ?? "—"}
            />
          </>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Roles</h2>
        <p className="text-sm text-slate-500">
          Roles grant permissions. A user can have zero or more roles.
        </p>
        <RoleAssignmentForm
          userId={user.id}
          roles={roles}
          assignedRoleIds={assignedRoleIds}
        />
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm text-slate-800">{value}</p>
    </div>
  );
}

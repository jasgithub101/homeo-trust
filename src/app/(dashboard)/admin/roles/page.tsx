import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminAccess } from "@/lib/permissions/check";

export default async function RolesPage() {
  await requireAdminAccess();

  const roles = await db.role.findMany({
    orderBy: [{ isSystemRole: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      isSystemRole: true,
      _count: { select: { rolePermissions: true, userRoles: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Roles</h1>
          <p className="text-sm text-slate-500">{roles.length} role(s).</p>
        </div>
        <Link
          href="/admin/roles/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Create role
        </Link>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No roles yet. Create a role to start granting permissions.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Permissions</th>
                <th className="px-4 py-3 font-medium">Users</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/roles/${r.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {r.name}
                    </Link>
                    {r.isSystemRole ? (
                      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                        System
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r._count.rolePermissions}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r._count.userRoles}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

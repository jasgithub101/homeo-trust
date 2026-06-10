import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminAccess } from "@/lib/permissions/check";

export default async function UsersPage() {
  // Server-side authorization — not just UI hiding.
  await requireAdminAccess();

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      active: true,
      mustChangePassword: true,
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">{users.length} user(s).</p>
        </div>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Create user
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {u.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{u.username}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3 text-slate-600">
                  {u.userRoles.length
                    ? u.userRoles.map((r) => r.role.name).join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      u.active
                        ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-700"
                        : "rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600"
                    }
                  >
                    {u.active ? "Active" : "Inactive"}
                  </span>
                  {u.mustChangePassword ? (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                      Pending password
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

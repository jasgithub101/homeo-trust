import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminAccess } from "@/lib/permissions/check";
import { groupPermissionsByCategory } from "@/lib/permissions/keys";
import { RoleForm } from "@/components/admin/RoleForm";
import { PermissionMatrix } from "@/components/admin/PermissionMatrix";
import { DeleteRoleButton } from "@/components/admin/DeleteRoleButton";
import { updateRoleAction } from "../actions";

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  await requireAdminAccess();
  const { roleId } = await params;

  const role = await db.role.findUnique({
    where: { id: roleId },
    select: {
      id: true,
      name: true,
      description: true,
      isSystemRole: true,
      rolePermissions: { select: { permission: { select: { key: true } } } },
      userRoles: {
        select: { user: { select: { id: true, name: true, username: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!role) notFound();

  const isSystem = role.isSystemRole;
  const selectedKeys = role.rolePermissions.map((rp) => rp.permission.key);
  const groups = groupPermissionsByCategory();

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link href="/admin/roles" className="text-xs text-brand-700 hover:underline">
          ← Roles
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-slate-900">{role.name}</h1>
          {isSystem ? (
            <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
              System role — protected
            </span>
          ) : null}
        </div>
        {isSystem ? (
          <p className="text-sm text-slate-500">
            The ADMIN system role always holds every permission and cannot be
            renamed, edited, or deleted.
          </p>
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Details</h2>
        <RoleForm
          action={updateRoleAction}
          role={{ id: role.id, name: role.name, description: role.description }}
          submitLabel="Save changes"
          disabled={isSystem}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Permissions</h2>
        <PermissionMatrix
          roleId={role.id}
          groups={groups}
          selectedKeys={isSystem ? groups.flatMap((g) => g.permissions.map((p) => p.key)) : selectedKeys}
          disabled={isSystem}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Users with this role ({role.userRoles.length})
        </h2>
        {role.userRoles.length === 0 ? (
          <p className="text-sm text-slate-500">No users have this role.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {role.userRoles.map((ur) => (
              <li key={ur.user.id} className="px-4 py-2 text-sm">
                <Link
                  href={`/admin/users/${ur.user.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {ur.user.name}
                </Link>
                <span className="ml-2 text-slate-400">{ur.user.username}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!isSystem ? (
        <section className="space-y-3 border-t border-slate-200 pt-6">
          <h2 className="text-sm font-semibold text-slate-900">Danger zone</h2>
          <DeleteRoleButton
            roleId={role.id}
            disabled={role.userRoles.length > 0}
            disabledReason={
              role.userRoles.length > 0
                ? `Assigned to ${role.userRoles.length} user(s). Unassign before deleting.`
                : undefined
            }
          />
        </section>
      ) : null}
    </div>
  );
}

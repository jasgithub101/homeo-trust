import Link from "next/link";
import { requireAdminAccess } from "@/lib/permissions/check";
import { RoleForm } from "@/components/admin/RoleForm";
import { createRoleAction } from "../actions";

export default async function NewRolePage() {
  await requireAdminAccess();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/admin/roles" className="text-xs text-brand-700 hover:underline">
          ← Roles
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Create role</h1>
        <p className="text-sm text-slate-500">
          Give the role a name, then assign permissions on the next screen.
        </p>
      </div>
      <RoleForm action={createRoleAction} submitLabel="Create role" />
    </div>
  );
}

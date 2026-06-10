import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminAccess } from "@/lib/permissions/check";
import { CreateUserForm } from "./CreateUserForm";

export default async function NewUserPage() {
  // Server-side authorization — not just UI hiding.
  await requireAdminAccess();

  const roles = await db.role.findMany({
    orderBy: [{ isSystemRole: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isSystemRole: true },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/admin/users" className="text-xs text-brand-700 hover:underline">
          ← Users
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Create user</h1>
        <p className="text-sm text-slate-500">
          Creates a login with a temporary password. The user must set a new
          password on first sign-in. Add a doctor profile only if they are a
          clinical doctor; grant access with roles.
        </p>
      </div>
      <CreateUserForm roles={roles} />
    </div>
  );
}

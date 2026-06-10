import Link from "next/link";
import { requireAdminAccess } from "@/lib/permissions/check";
import { CreateDoctorForm } from "./CreateDoctorForm";

export default async function NewUserPage() {
  // Server-side authorization — not just UI hiding.
  await requireAdminAccess();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/admin/users" className="text-xs text-brand-700 hover:underline">
          ← Users
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Create doctor</h1>
        <p className="text-sm text-slate-500">
          Creates a login with a temporary password. The doctor must set a new
          password on first sign-in.
        </p>
      </div>
      <CreateDoctorForm />
    </div>
  );
}

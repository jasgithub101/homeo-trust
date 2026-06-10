import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          Welcome, {user.name}
        </h1>
        <p className="text-sm text-slate-500">
          {user.isAdmin
            ? "You have administrator access."
            : "You are signed in."}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Your access</h2>
        <p className="mt-1 text-sm text-slate-500">
          {user.isAdmin
            ? "Admin — full permissions."
            : user.permissions.size > 0
              ? `${user.permissions.size} permission(s) assigned.`
              : "No permissions assigned yet. An administrator will grant access."}
        </p>
      </div>

      <p className="text-xs text-slate-400">
        Clinical features (patients, cases, treatments) arrive in later phases.
      </p>
    </div>
  );
}

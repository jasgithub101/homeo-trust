import { requireUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/branding";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await requireUser();
  const forced = user.mustChangePassword;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-sm font-semibold tracking-tight text-slate-900">
            {APP_NAME}
          </p>
          <h1 className="text-xl font-semibold text-slate-900">
            {forced ? "Set a new password" : "Change password"}
          </h1>
          <p className="text-sm text-slate-500">
            {forced
              ? "For security, you must set a new password before continuing."
              : "Update your account password."}
          </p>
        </div>
        <ChangePasswordForm forced={forced} />
      </div>
    </main>
  );
}

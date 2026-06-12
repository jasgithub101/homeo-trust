import Link from "next/link";
import { APP_NAME } from "@/lib/branding";

/**
 * Logged-out "Forgot password?" page. Intentionally a STATIC message — there is
 * no self-service email recovery. It never takes an identifier and never
 * confirms whether an account exists, so it cannot be used for user enumeration.
 * Password recovery is admin-driven: an administrator resets the password and
 * hands over a temporary one in person.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-1 text-center">
          <p className="text-sm font-semibold tracking-tight text-slate-900">
            {APP_NAME}
          </p>
          <h1 className="text-xl font-semibold text-slate-900">
            Forgot your password?
          </h1>
        </div>
        <p className="text-sm text-slate-600">
          Password resets are handled by an administrator. Please contact your
          administrator, who can set a new temporary password for you to use at
          your next sign-in.
        </p>
        <Link
          href="/login"
          className="block rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}

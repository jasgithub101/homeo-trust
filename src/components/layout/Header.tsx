import { logoutAction } from "@/app/(auth)/actions";
import type { AppShellUser } from "./AppShell";

export function Header({ user }: { user: AppShellUser }) {
  return (
    <header className="flex h-14 flex-shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6">
      <div className="flex-1">
        <h1 className="text-sm font-medium text-slate-900">Dashboard</h1>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">{user.name}</span>
        {user.isAdmin ? (
          <span className="rounded bg-brand-100 px-2 py-0.5 text-xs text-brand-700">
            Admin
          </span>
        ) : null}
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

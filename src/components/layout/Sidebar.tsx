import Link from "next/link";
import { APP_NAME } from "@/lib/branding";
import type { AppShellUser } from "./AppShell";

const CLINICAL_ITEMS = [{ label: "Dashboard", href: "/dashboard", icon: "⊞" }];

const PATIENTS_ITEM = { label: "Patients", href: "/patients", icon: "☺" };

const EXPLORE_ITEM = { label: "Explore", href: "/explore", icon: "◎" };

const ADMIN_ITEMS = [
  { label: "Users", href: "/admin/users", icon: "◈" },
  { label: "Roles", href: "/admin/roles", icon: "◉" },
];

export function Sidebar({ user }: { user: AppShellUser }) {
  return (
    <aside className="flex w-60 flex-shrink-0 flex-col bg-slate-900 text-slate-100">
      <div className="border-b border-slate-700 px-5 py-5">
        <span className="text-base font-semibold tracking-tight text-white">
          {APP_NAME}
        </span>
        <p className="mt-0.5 text-xs text-slate-400">Clinical System</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-slate-500">
          Clinical
        </p>
        {CLINICAL_ITEMS.map((item) => (
          <SidebarLink key={item.href} {...item} />
        ))}
        {user.canViewPatients ? <SidebarLink {...PATIENTS_ITEM} /> : null}
        {user.canUseExplore ? <SidebarLink {...EXPLORE_ITEM} /> : null}

        {user.isAdmin ? (
          <>
            <p className="mt-4 px-2 py-1 text-xs font-medium uppercase tracking-wider text-slate-500">
              Administration
            </p>
            {ADMIN_ITEMS.map((item) => (
              <SidebarLink key={item.href} {...item} />
            ))}
          </>
        ) : null}
      </nav>
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </Link>
  );
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "⊞" },
  { label: "Patients", href: "/patients", icon: "♥" },
  { label: "Explore", href: "/explore", icon: "⊙" },
];

const ADMIN_ITEMS = [
  { label: "Users", href: "/admin/users", icon: "◈" },
  { label: "Roles", href: "/admin/roles", icon: "◉" },
  { label: "Audit Log", href: "/admin/audit", icon: "◎" },
];

export function Sidebar() {
  return (
    <aside className="w-60 flex-shrink-0 bg-slate-900 text-slate-100 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-700">
        <span className="text-base font-semibold tracking-tight text-white">
          Homeo Trust
        </span>
        <p className="text-xs text-slate-400 mt-0.5">Clinical System</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p className="px-2 py-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
          Clinical
        </p>
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.href} {...item} />
        ))}

        <p className="px-2 py-1 mt-4 text-xs font-medium text-slate-500 uppercase tracking-wider">
          Administration
        </p>
        {ADMIN_ITEMS.map((item) => (
          <SidebarLink key={item.href} {...item} />
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-slate-700">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-300">
            ?
          </div>
          <div className="min-w-0">
            <p className="text-sm text-slate-200 truncate">Not signed in</p>
            <p className="text-xs text-slate-500">Phase 2 will add auth</p>
          </div>
        </div>
      </div>
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
    <a
      href={href}
      className="flex items-center gap-2.5 px-2 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </a>
  );
}

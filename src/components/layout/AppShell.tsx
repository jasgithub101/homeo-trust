import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export interface AppShellUser {
  name: string;
  isAdmin: boolean;
  canViewPatients: boolean;
  canUseExplore: boolean;
}

export function AppShell({
  user,
  children,
}: {
  user: AppShellUser;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
        <footer className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-2 text-xs text-slate-400">
          Built by Jaswanth Pasumarthy
        </footer>
      </div>
    </div>
  );
}

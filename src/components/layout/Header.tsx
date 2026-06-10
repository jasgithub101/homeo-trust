export function Header() {
  return (
    <header className="h-14 flex-shrink-0 border-b border-slate-200 bg-white flex items-center px-6 gap-4">
      <div className="flex-1">
        <h1 className="text-sm font-medium text-slate-900">Dashboard</h1>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">
          Phase 1 — Setup
        </span>
      </div>
    </header>
  );
}

const STYLES: Record<string, string> = {
  ACTIVE: "bg-amber-100 text-amber-800",
  RESOLVED: "bg-green-100 text-green-800",
  CHRONIC: "bg-purple-100 text-purple-800",
  RECURRING: "bg-blue-100 text-blue-800",
};

export function IssueStatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

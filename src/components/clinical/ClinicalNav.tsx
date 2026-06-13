import Link from "next/link";

/**
 * Tab nav across a patient's clinical sections. Tabs are navigational only —
 * each target page enforces its own permission+relationship guard server-side
 * (an unauthorized tab resolves to notFound), so showing the tabs leaks nothing.
 */
type Tab =
  | "overview"
  | "case"
  | "issues"
  | "treatments"
  | "appointments"
  | "attachments"
  | "timeline";

const TABS: { key: Tab; label: string; sub: string }[] = [
  { key: "overview", label: "Overview", sub: "" },
  { key: "case", label: "Case", sub: "/case" },
  { key: "issues", label: "Issues", sub: "/issues" },
  { key: "treatments", label: "Treatments", sub: "/treatments" },
  { key: "appointments", label: "Appointments", sub: "/appointments" },
  { key: "attachments", label: "Attachments", sub: "/attachments" },
  { key: "timeline", label: "Timeline", sub: "/timeline" },
];

export function ClinicalNav({
  patientId,
  active,
}: {
  patientId: string;
  active: Tab;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const href = `/patients/${patientId}${t.sub}`;
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={href}
            className={
              "border-b-2 px-3 py-2 text-sm font-medium " +
              (isActive
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

import { prettyEnum } from "@/lib/format/enum";
import { EXPLORE_MIN_COHORT } from "@/lib/explore/constants";
import type { ExploreResult, ExploreRow } from "@/lib/explore/query";

/**
 * Renders Explore results. On the `suppressed` state (matching cohort smaller
 * than EXPLORE_MIN_COHORT, including zero) it shows ONLY a "broaden filters"
 * message — never any row and never the count, so a small cohort cannot be
 * re-identified or even sized. Every value shown here comes straight from the
 * de-identified view allow-list; there is no PII to render. (Phase 10b removed
 * the free-text Issues/Symptoms/Medicines columns — see the view migration.)
 */
export function ExploreResults({ result }: { result: ExploreResult }) {
  if (result.status === "suppressed") {
    return (
      <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-8 text-center">
        <p className="text-sm text-amber-800">
          To protect patient privacy, results are hidden when fewer than{" "}
          {EXPLORE_MIN_COHORT} cases match. Broaden your filters and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        {result.resultCount} matching case(s).
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Case</th>
              <th className="px-4 py-3 font-medium">Age</th>
              <th className="px-4 py-3 font-medium">Gender</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Month</th>
              <th className="px-4 py-3 font-medium">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.rows.map((row) => (
              <tr key={row.anonymousCaseCode} className="align-top hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-700">
                  {row.anonymousCaseCode}
                </td>
                <td className="px-4 py-3 text-slate-600">{row.ageRange ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {row.gender ? prettyEnum(row.gender) : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">{formatLocation(row)}</td>
                <td className="px-4 py-3 text-slate-600">{row.caseMonth ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {row.improvementTrend ? prettyEnum(row.improvementTrend) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Coarse location: city only when retained by the index, else state/country. */
function formatLocation(row: ExploreRow): string {
  const parts = [row.city, row.state, row.country].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length > 0 ? parts.join(", ") : "—";
}

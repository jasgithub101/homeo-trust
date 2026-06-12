import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  canUseExplore,
  canBypassCohortMinimum,
} from "@/lib/permissions/explore-access";
import { exploreFilterSchema, type ExploreFilters } from "@/lib/validation/explore";
import { runExploreSearch } from "@/lib/explore/query";
import { ExploreFiltersForm } from "@/components/explore/ExploreFilters";
import { ExploreResults } from "@/components/explore/ExploreResults";
import { RefreshIndexButton } from "@/components/explore/RefreshIndexButton";
import { logExploreSearch } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTER_KEYS = [
  "gender",
  "ageRange",
  "country",
  "state",
  "issueStatus",
  "treatmentType",
] as const;

function firstValue(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

const EMPTY_FILTERS: ExploreFilters = {
  gender: undefined,
  ageRange: undefined,
  country: undefined,
  state: undefined,
  issueStatus: undefined,
  treatmentType: undefined,
};

/** PII-safe filter map for audit: only the defined, validated facets. */
function definedFilters(filters: ExploreFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (value) out[key] = value;
  }
  return out;
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  // Binary access gate (D3). Hide existence entirely from users without access.
  if (!canUseExplore(user)) notFound();

  const raw = await searchParams;
  const candidate: Record<string, string> = {};
  for (const key of FILTER_KEYS) candidate[key] = firstValue(raw[key]);
  const parsed = exploreFilterSchema.safeParse(candidate);
  const filters: ExploreFilters = parsed.success ? parsed.data : EMPTY_FILTERS;

  // Per-viewer bypass of the <5-case suppression backstop (D2). Lifts ONLY the
  // row/count suppression; core de-identification is unchanged for everyone.
  const cohortBypass = canBypassCohortMinimum(user);
  const result = await runExploreSearch(filters, {
    applySuppression: !cohortBypass,
  });

  // Audit every executed search with PII-safe metadata only. resultCount is
  // null when suppressed so a small cohort size never reaches the log;
  // cohortBypass records whether the viewer could see sub-threshold cohorts.
  await logExploreSearch({
    filters: definedFilters(filters),
    resultCount: result.status === "ok" ? result.resultCount : null,
    suppressed: result.status === "suppressed",
    cohortBypass,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Explore</h1>
          <p className="text-sm text-slate-500">
            De-identified case explorer. No patient, doctor, or contact details
            are ever shown — results are coarse and cohort-protected.
          </p>
        </div>
        {user.isAdmin ? <RefreshIndexButton /> : null}
      </div>

      <ExploreFiltersForm current={filters} />
      <ExploreResults result={result} />
    </div>
  );
}

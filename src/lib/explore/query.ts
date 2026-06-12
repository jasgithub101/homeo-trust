import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { EXPLORE_MIN_COHORT } from "./constants";
import type { ExploreFilters } from "@/lib/validation/explore";

/**
 * Explore read layer (Phase 8, view refactor). The ONLY place a request reads
 * de-identified case data, and it reads EXCLUSIVELY from the `explore_case_view`
 * Postgres VIEW (Prisma model `ExploreCaseView`) — never the raw Patient/
 * CaseRecord/PatientIssue/PatientSymptom/TreatmentEntry tables, never
 * attachments. De-identification is "correct by view definition": the view has
 * no column for any PII or for the real patient/case id, so none can be selected
 * here. A live view is always fresh — there is no index, rebuild, or staleness.
 *
 * Three structural privacy guarantees live here:
 *  1. EXPLICIT ALLOW-LIST SELECT — we name every de-identified column we return
 *     and never `select` the row wholesale. The synthetic `rowId` (a positional
 *     row_number in the view, used only as Prisma's view identifier and for a
 *     stable secondary sort) is NEVER selected into a client-bound payload.
 *  2. EPHEMERAL CASE LABELS — results carry a display label (Case A/B/…) derived
 *     ONLY from position in this result set. It is recomputed every search, is
 *     NOT stable across sessions, and is NOT derived from any patient/case id —
 *     there is deliberately no persistent handle to a de-identified case.
 *  3. K-ANONYMITY (D2) — if the matching cohort is smaller than
 *     EXPLORE_MIN_COHORT, we suppress BOTH the rows AND the count and return a
 *     "broaden filters" state. count == 0 and 0 < count < N collapse into the
 *     same state so the viewer cannot even distinguish "none" from "a few".
 *     This backstop can be lifted per-viewer via `explore.bypassCohortMinimum`
 *     (passed in as `applySuppression: false`); the bypass affects ONLY this
 *     row/count suppression. Guarantees (1)/(2) and all other de-identification
 *     (including the view's city-cohort coarsening, which uses the SAME N over
 *     the full set) still apply to every viewer — bypass never exposes PII.
 */

const EXPLORE_RESULT_LIMIT = 500;

/** Allow-list of de-identified columns returned to the client. Keep in sync
 * with ExploreRow. The synthetic `rowId` is deliberately absent. */
const exploreViewSelect = {
  ageRange: true,
  gender: true,
  city: true,
  state: true,
  country: true,
  caseMonth: true,
  issueSummaries: true,
  symptomSummaries: true,
  medicineSummaries: true,
  issueStatuses: true,
  treatmentTypes: true,
  potencies: true,
  patientConditionSummary: true,
  improvementTrend: true,
} satisfies Prisma.ExploreCaseViewSelect;

type ExploreViewRow = Prisma.ExploreCaseViewGetPayload<{
  select: typeof exploreViewSelect;
}>;

/**
 * A de-identified Explore row as shown to the client: the view's allow-listed
 * columns plus an EPHEMERAL `anonymousCaseCode` display label assigned in this
 * module from result position only (see guarantee 2 above).
 */
export type ExploreRow = ExploreViewRow & { anonymousCaseCode: string };

export type ExploreResult =
  | { status: "ok"; resultCount: number; rows: ExploreRow[] }
  // Suppressed: matching cohort < EXPLORE_MIN_COHORT (includes zero matches).
  | { status: "suppressed" };

export interface ExploreSearchOptions {
  /**
   * Apply the D2 minimum-cohort suppression. True for normal viewers; false for
   * viewers with `explore.bypassCohortMinimum` (admin or granted), who then see
   * all matches including cohorts < EXPLORE_MIN_COHORT. Defaults to true so a
   * missing flag never accidentally disables the privacy backstop.
   */
  applySuppression?: boolean;
}

/**
 * Ephemeral, position-only display label: 0 -> "Case A", 25 -> "Case Z",
 * 26 -> "Case AA", … . Spreadsheet-style so it stays short for large result
 * sets. Carries no patient/case identity.
 */
function ephemeralCaseLabel(index: number): string {
  let n = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Case ${letters}`;
}

/** Build the view `where` from validated filters. Array facets use `has`. */
function buildWhere(filters: ExploreFilters): Prisma.ExploreCaseViewWhereInput {
  const where: Prisma.ExploreCaseViewWhereInput = {};
  if (filters.gender) where.gender = filters.gender;
  if (filters.ageRange) where.ageRange = filters.ageRange;
  if (filters.country) {
    where.country = { equals: filters.country, mode: "insensitive" };
  }
  if (filters.state) {
    where.state = { equals: filters.state, mode: "insensitive" };
  }
  if (filters.issueStatus) where.issueStatuses = { has: filters.issueStatus };
  if (filters.treatmentType) {
    where.treatmentTypes = { has: filters.treatmentType };
  }
  return where;
}

/**
 * Run an Explore search. Counts first and enforces the k-anonymity threshold
 * BEFORE any row is selected, so suppressed searches never load PII-adjacent
 * rows at all.
 */
export async function runExploreSearch(
  filters: ExploreFilters,
  options: ExploreSearchOptions = {},
): Promise<ExploreResult> {
  const applySuppression = options.applySuppression ?? true;
  const where = buildWhere(filters);

  const resultCount = await db.exploreCaseView.count({ where });
  if (applySuppression && resultCount < EXPLORE_MIN_COHORT) {
    return { status: "suppressed" };
  }

  const viewRows = await db.exploreCaseView.findMany({
    where,
    select: exploreViewSelect,
    // rowId is the view's stable positional sort key; never selected/returned.
    orderBy: [{ caseMonth: "desc" }, { rowId: "asc" }],
    take: EXPLORE_RESULT_LIMIT,
  });

  const rows: ExploreRow[] = viewRows.map((row, i) => ({
    ...row,
    anonymousCaseCode: ephemeralCaseLabel(i),
  }));

  return { status: "ok", resultCount, rows };
}

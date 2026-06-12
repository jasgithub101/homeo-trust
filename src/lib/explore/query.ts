import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { EXPLORE_MIN_COHORT } from "./constants";
import type { ExploreFilters } from "@/lib/validation/explore";

/**
 * Explore read layer (Phase 8). The ONLY place a request reads de-identified
 * case data, and it reads EXCLUSIVELY from ExploreCaseIndex — never the raw
 * Patient/CaseRecord/PatientIssue/PatientSymptom/TreatmentEntry tables, never
 * attachments.
 *
 * Two structural privacy guarantees live here:
 *  1. EXPLICIT ALLOW-LIST SELECT — we name every de-identified column we return
 *     and never `select` the row wholesale. patientId, caseRecordId, the index
 *     id, and timestamps are NEVER selected, so internal/linking ids cannot leak
 *     into a client-bound payload.
 *  2. K-ANONYMITY (D2) — if the matching cohort is smaller than
 *     EXPLORE_MIN_COHORT, we suppress BOTH the rows AND the count and return a
 *     "broaden filters" state. count == 0 and 0 < count < N collapse into the
 *     same state so the viewer cannot even distinguish "none" from "a few".
 *     This backstop can be lifted per-viewer via `explore.bypassCohortMinimum`
 *     (passed in as `applySuppression: false`); the bypass affects ONLY this
 *     row/count suppression. Guarantee (1) and all other de-identification
 *     (including the projection-time city-cohort coarsening already baked into
 *     the stored index) still apply to every viewer — bypass never exposes PII.
 */

const EXPLORE_RESULT_LIMIT = 500;

/** Allow-list of de-identified columns returned to the client. Keep in sync
 * with ExploreRow. Internal ids and timestamps are deliberately absent. */
const exploreRowSelect = {
  anonymousCaseCode: true,
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
} satisfies Prisma.ExploreCaseIndexSelect;

export type ExploreRow = Prisma.ExploreCaseIndexGetPayload<{
  select: typeof exploreRowSelect;
}>;

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

/** Build the index `where` from validated filters. Array facets use `has`. */
function buildWhere(filters: ExploreFilters): Prisma.ExploreCaseIndexWhereInput {
  const where: Prisma.ExploreCaseIndexWhereInput = {};
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

  const resultCount = await db.exploreCaseIndex.count({ where });
  if (applySuppression && resultCount < EXPLORE_MIN_COHORT) {
    return { status: "suppressed" };
  }

  const rows = await db.exploreCaseIndex.findMany({
    where,
    select: exploreRowSelect,
    orderBy: [{ caseMonth: "desc" }, { anonymousCaseCode: "asc" }],
    take: EXPLORE_RESULT_LIMIT,
  });

  return { status: "ok", resultCount, rows };
}

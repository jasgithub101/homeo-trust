"use server";

import { requireUser } from "@/lib/auth";
import { canUseExplore } from "@/lib/permissions/explore-access";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";

/**
 * Audit a de-identified Explore search. Called from the page loader after a
 * search runs. Metadata is PII-SAFE ONLY: the applied filters (enums / coarse
 * bands / coarse location), the resultCount (NULL when suppressed, so a small
 * cohort size never reaches the log), and the suppressed flag. NEVER logs result
 * rows, anonymous case codes, names, or free text.
 */
export async function logExploreSearch(input: {
  filters: Record<string, string>;
  resultCount: number | null;
  suppressed: boolean;
  cohortBypass: boolean;
}): Promise<void> {
  const actor = await requireUser();
  if (!canUseExplore(actor)) return;
  await writeAuditLog({
    action: AUDIT_ACTIONS.EXPLORE_SEARCHED,
    actorUserId: actor.id,
    entityType: "ExploreCaseView",
    metadata: {
      filters: input.filters,
      resultCount: input.resultCount,
      suppressed: input.suppressed,
      // PII-safe: true when the viewer could see sub-threshold cohorts.
      cohortBypass: input.cohortBypass,
    },
  });
}

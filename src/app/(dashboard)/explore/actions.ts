"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canUseExplore } from "@/lib/permissions/explore-access";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { rebuildExploreIndex } from "@/lib/explore/rebuild";

export interface RefreshExploreState {
  error?: string;
  message?: string;
}

/**
 * Admin-only manual refresh of the de-identified Explore index (decision D6 —
 * no on-write hooks yet, so the index is refreshed on demand). Re-runs the same
 * idempotent projection as the rebuild script. Audited with counts only (no
 * PII). Only ADMIN may refresh, since it scans every patient.
 */
export async function refreshExploreIndexAction(
  _prev: RefreshExploreState,
  _formData: FormData,
): Promise<RefreshExploreState> {
  const actor = await requireUser();
  if (!actor.isAdmin) {
    return { error: "Only an administrator can refresh the Explore index." };
  }

  let result;
  try {
    result = await rebuildExploreIndex(db);
  } catch {
    return { error: "Could not refresh the Explore index. Please try again." };
  }

  await writeAuditLog({
    action: AUDIT_ACTIONS.EXPLORE_INDEX_REFRESHED,
    actorUserId: actor.id,
    entityType: "ExploreCaseIndex",
    metadata: {
      scanned: result.scanned,
      upserted: result.upserted,
      deleted: result.deleted,
      citiesKept: result.citiesKept,
    },
  });

  revalidatePath("/explore");
  return {
    message: `Index refreshed: ${result.upserted} case(s) indexed, ${result.deleted} removed.`,
  };
}

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
    entityType: "ExploreCaseIndex",
    metadata: {
      filters: input.filters,
      resultCount: input.resultCount,
      suppressed: input.suppressed,
      // PII-safe: true when the viewer could see sub-threshold cohorts.
      cohortBypass: input.cohortBypass,
    },
  });
}

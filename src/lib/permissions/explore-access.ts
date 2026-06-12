import "server-only";
import { type CurrentUser, userHasPermission } from "@/lib/auth/current-user";

/**
 * Explore access (Phase 8, decision D3). Access is BINARY: admin OR
 * `explore.view`. There is no patient row scope and no depth escalation — a
 * `patient.viewSensitive` holder still sees only the de-identified index here.
 * Admin bypasses ACCESS, never de-identification (everyone reads the same
 * de-identified explore_case_view).
 */
export function canUseExplore(user: CurrentUser): boolean {
  return user.isAdmin || userHasPermission(user, "explore.view");
}

/**
 * May this user see cohorts smaller than the privacy minimum (the <5-case
 * suppression backstop, D2)? admin OR `explore.bypassCohortMinimum`.
 *
 * Scope is deliberately narrow: this ONLY lifts the read-time row/count
 * suppression. It does NOT change core de-identification — Explore still reads
 * only `explore_case_view`, never raw PII/attachments, and city-cohort coarsening
 * (baked into the view definition) still applies to everyone.
 * There is no path where this permission exposes name/phone/email/address/DOB/
 * exact ids/doctor name.
 */
export function canBypassCohortMinimum(user: CurrentUser): boolean {
  return user.isAdmin || userHasPermission(user, "explore.bypassCohortMinimum");
}

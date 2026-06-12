/**
 * Explore privacy constants (Phase 8).
 *
 * Pure module — safe to import from server code, client code, and node scripts.
 */

/**
 * Minimum cohort size (k) for k-anonymity. Used in TWO places, deliberately the
 * same value:
 * - City coarsening: a city is only kept when its cohort is >= N, otherwise it
 *   is coarsened to state-only. This now lives in the `explore_case_view` DDL
 *   (`city_size >= 5`), NOT in app code — a view cannot read this constant.
 * - Query (D2): a search whose matching cohort is < N suppresses ALL rows AND
 *   counts, returning only a "broaden filters" state. SERVER-enforced here.
 *
 * ⚠️ SYNC POINT: the literal `5` is duplicated in the view migration
 * (prisma/migrations/20260612010000_create_explore_case_view/migration.sql,
 * `city_size >= 5`). Postgres views can't import TS constants, so the two MUST
 * be kept equal by hand. If you change this threshold, update the view DDL (via
 * a new migration) too, or city coarsening and query suppression will silently
 * diverge.
 *
 * Known limitation (D2): this does not defend against differencing attacks
 * (comparing cohort A vs A+B to infer the delta). Documented, not mitigated now.
 */
export const EXPLORE_MIN_COHORT = 5;

/**
 * Explore privacy constants (Phase 8).
 *
 * Pure module — safe to import from server code, client code, and node scripts.
 */

/**
 * Minimum cohort size (k) for k-anonymity. Used in TWO places, deliberately the
 * same value:
 * - Projection (D1): a city is only kept in the index when its cohort is >= N,
 *   otherwise it is coarsened to state-only.
 * - Query (D2): a search whose matching cohort is < N suppresses ALL rows AND
 *   counts, returning only a "broaden filters" state. SERVER-enforced.
 *
 * Known limitation (D2): this does not defend against differencing attacks
 * (comparing cohort A vs A+B to infer the delta). Documented, not mitigated now.
 */
export const EXPLORE_MIN_COHORT = 5;

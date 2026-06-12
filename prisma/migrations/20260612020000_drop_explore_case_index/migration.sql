-- Drop the materialized ExploreCaseIndex table (Phase 8 view refactor).
-- Explore now reads the live `explore_case_view` (created in the previous
-- migration), so the index, its projection, and the rebuild/refresh machinery
-- are obsolete. Dropping the table also drops its indexes and its FK to
-- "Patient" automatically — nothing else references it, so no CASCADE needed.
-- The 20260612000000_explore_index_facets migration stays untouched in history
-- (append-only): we add a drop here, we do not rewrite past migrations.
DROP TABLE "ExploreCaseIndex";

import { z } from "zod";
import { GENDER_VALUES } from "./patient";
import { ISSUE_STATUS_VALUES, TREATMENT_ENTRY_TYPES } from "./clinical";

/**
 * Zod schema for Explore filters (Phase 8). Every filter is validated
 * server-side and is an enum / coarse band / coarse-location string only — the
 * same de-identified shape stored in ExploreCaseIndex. No PII, no free-text
 * search, no exact ids. These validated values are also what gets written to
 * the EXPLORE_SEARCHED audit log, so they must stay PII-safe by construction.
 */

/** Coarse age bands, matching `ageRange()` (floor to a decade, 0–150). */
export const EXPLORE_AGE_RANGES: readonly string[] = Array.from(
  { length: 16 },
  (_, i) => `${i * 10}-${i * 10 + 9}`,
);

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .enum(values)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

// Coarse location only (state/country) — never city is required, and exact
// address never exists in the index. Trimmed, length-capped, blank → undefined.
const optionalLocation = z
  .string()
  .trim()
  .max(120)
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined));

export const exploreFilterSchema = z.object({
  gender: optionalEnum(GENDER_VALUES),
  ageRange: z
    .enum(EXPLORE_AGE_RANGES as [string, ...string[]])
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  country: optionalLocation,
  state: optionalLocation,
  issueStatus: optionalEnum(ISSUE_STATUS_VALUES),
  treatmentType: optionalEnum(TREATMENT_ENTRY_TYPES),
});

export type ExploreFilters = z.infer<typeof exploreFilterSchema>;

/**
 * Explore de-identification — the SINGLE source of truth for how a raw patient
 * record becomes a de-identified ExploreCaseIndex row (Phase 8, decision D1/D5).
 *
 * This module is intentionally PURE: no `server-only`, no `db`, no request
 * context. It is imported by the request-time query layer AND by the node
 * rebuild script (tsx), so it must stay free of server-bundle-only imports.
 * All DB I/O lives in the caller; this module only transforms already-loaded,
 * NON-ARCHIVED data into de-identified values.
 *
 * Privacy contract (must hold — see docs/AI_PRIVACY_MODEL.md):
 * - De-identify on the way INTO the index, never on read.
 * - Never copy/derive the blocklist: name, phone, email, exact address,
 *   emergency contact, exact patient/case id, DOB, exact age/timestamps, doctor
 *   identity. Doctor stays structurally absent.
 * - Coarsen: age → ageRange() band; location → state/country always, city only
 *   when its cohort is large enough (handled by the caller via `allowedCities`);
 *   dates → caseMonth at YYYY-MM (never exact timestamps).
 * - Summaries source ONLY structured short fields (issue title, symptom name,
 *   medicine name). NEVER description/notes/instructions/followUpNotes/
 *   caseDescription. IMPORTANT: k-anonymity does NOT mitigate PII a user types
 *   into these short fields — that is the one residual PII-leak path into
 *   Explore. The future fix is a controlled vocabulary / server-side PII scrub
 *   (NOT built now). Phase 9 (AI) consumes this same index, so the leak path is
 *   shared — flagged here on purpose.
 */
import { randomBytes } from "node:crypto";
import type {
  Gender,
  IssueStatus,
  PatientCondition,
  TreatmentEntryType,
} from "@prisma/client";
import { ageRange } from "@/lib/patients/display";

/** Caps to keep array columns bounded and to avoid copying long free text. */
const MAX_SUMMARY_LEN = 120;
const MAX_SUMMARY_ITEMS = 50;

/**
 * Coarse age band for the index, or null. Reuses the patient display helper but
 * normalizes its "—" sentinel to null for storage/filtering.
 */
export function ageRangeOrNull(age: number | null | undefined): string | null {
  const band = ageRange(age);
  return band === "—" ? null : band;
}

/** Month bucket (YYYY-MM) for a date, or null. Never an exact timestamp. */
export function caseMonth(date: Date | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/**
 * Stable key for a (country, state, city) tuple used to size city cohorts.
 * Case-insensitive, whitespace-collapsed. Returns null when there is no city.
 */
export function locationCityKey(
  country: string | null | undefined,
  state: string | null | undefined,
  city: string | null | undefined,
): string | null {
  const c = normalizeToken(city);
  if (!c) return null;
  return [normalizeToken(country) ?? "", normalizeToken(state) ?? "", c]
    .join("|")
    .toLowerCase();
}

/** Trim + collapse internal whitespace; empty/blank → null. */
function normalizeToken(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length === 0 ? null : t;
}

/**
 * Normalize a set of short structured values into bounded, de-duplicated
 * summary strings: trim, collapse whitespace, drop blanks, cap length, dedupe
 * case-insensitively (preserving first-seen casing), cap count.
 */
export function normalizeSummaries(
  values: (string | null | undefined)[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const t = normalizeToken(raw);
    if (!t) continue;
    const capped = t.length > MAX_SUMMARY_LEN ? t.slice(0, MAX_SUMMARY_LEN) : t;
    const key = capped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(capped);
    if (out.length >= MAX_SUMMARY_ITEMS) break;
  }
  return out;
}

/** Distinct enum values in stable input order. */
function distinct<T>(values: (T | null | undefined)[]): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const v of values) {
    if (v == null || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Coarse improvement trend from ordered (oldest→newest) improvement scores.
 * Returns a band label, never raw scores. Null when there is too little signal.
 */
export function improvementTrend(
  scoresOldestFirst: (number | null | undefined)[],
): string | null {
  const scores = scoresOldestFirst.filter(
    (s): s is number => typeof s === "number" && Number.isFinite(s),
  );
  if (scores.length < 2) return null;
  const first = scores[0];
  const last = scores[scores.length - 1];
  const delta = last - first;
  if (delta >= 2) return "IMPROVING";
  if (delta <= -2) return "DECLINING";
  return "STABLE";
}

/**
 * CSPRNG-generated anonymous case code. MUST be random and stored ONCE — never
 * a hash/transform of patientId/caseRecordId (that would be reversible and
 * defeat de-identification). Format: CASE-<16 hex chars>.
 */
export function generateAnonymousCaseCode(): string {
  return `CASE-${randomBytes(8).toString("hex").toUpperCase()}`;
}

/** Already-loaded, NON-ARCHIVED inputs for one patient. The caller filters
 * `deletedAt` and excludes patients without a CaseRecord before calling. */
export interface RawPatientForProjection {
  age: number | null;
  gender: Gender;
  city: string | null;
  state: string | null;
  country: string | null;
  caseRecordCreatedAt: Date | null;
  issues: { title: string; status: IssueStatus }[];
  symptoms: { symptomName: string }[];
  treatments: {
    medicineName: string | null;
    potency: string | null;
    entryType: TreatmentEntryType;
    patientCondition: PatientCondition | null;
    improvementScore: number | null;
    treatmentDate: Date;
  }[];
}

/** De-identified values written to ExploreCaseIndex (no internal ids here). */
export interface DeidentifiedProjection {
  ageRange: string | null;
  gender: Gender;
  city: string | null;
  state: string | null;
  country: string | null;
  caseMonth: string | null;
  issueSummaries: string[];
  symptomSummaries: string[];
  medicineSummaries: string[];
  issueStatuses: IssueStatus[];
  treatmentTypes: TreatmentEntryType[];
  potencies: string[];
  patientConditionSummary: string | null;
  improvementTrend: string | null;
}

export interface ProjectOptions {
  /**
   * Set of `locationCityKey` values whose city cohort is large enough (>= N) to
   * keep the city. Cities absent here are coarsened to state-only. Computed by
   * the caller across the full qualifying set.
   */
  allowedCities: ReadonlySet<string>;
}

/**
 * Project one patient's (non-archived) record into de-identified index values.
 * This is the de-identification chokepoint: every field that lands in the index
 * is produced here and nowhere else.
 */
export function projectPatient(
  raw: RawPatientForProjection,
  opts: ProjectOptions,
): DeidentifiedProjection {
  const state = normalizeToken(raw.state);
  const country = normalizeToken(raw.country);
  const cityKey = locationCityKey(raw.country, raw.state, raw.city);
  const keepCity = cityKey != null && opts.allowedCities.has(cityKey);
  const city = keepCity ? normalizeToken(raw.city) : null;

  // Treatments oldest→newest for trend + "latest condition" derivation.
  const treatmentsAsc = [...raw.treatments].sort(
    (a, b) => a.treatmentDate.getTime() - b.treatmentDate.getTime(),
  );
  const latestWithCondition = [...treatmentsAsc]
    .reverse()
    .find((t) => t.patientCondition != null);

  return {
    ageRange: ageRangeOrNull(raw.age),
    gender: raw.gender,
    city,
    state,
    country,
    caseMonth: caseMonth(raw.caseRecordCreatedAt),
    issueSummaries: normalizeSummaries(raw.issues.map((i) => i.title)),
    symptomSummaries: normalizeSummaries(raw.symptoms.map((s) => s.symptomName)),
    medicineSummaries: normalizeSummaries(
      treatmentsAsc.map((t) => t.medicineName),
    ),
    issueStatuses: distinct(raw.issues.map((i) => i.status)),
    treatmentTypes: distinct(treatmentsAsc.map((t) => t.entryType)),
    potencies: normalizeSummaries(treatmentsAsc.map((t) => t.potency)),
    patientConditionSummary: latestWithCondition?.patientCondition ?? null,
    improvementTrend: improvementTrend(
      treatmentsAsc.map((t) => t.improvementScore),
    ),
  };
}

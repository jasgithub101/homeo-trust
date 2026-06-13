-- Phase 10b (Residual 1, option b): remove clinical FREE-TEXT summaries from the
-- de-identified Explore view.
--
-- Why: issue.title, symptom.symptomName, treatment.medicineName and
-- treatment.potency are unconstrained free-text fields. A doctor can type raw
-- PII into them (a name, phone, address). The N=5 cohort suppression mitigates
-- row COUNTS, not cell CONTENT, so those summaries could surface PII verbatim in
-- Explore (and in any future AI built on this same view). This migration DROPs
-- and re-CREATEs explore_case_view WITHOUT the four free-text-sourced columns
-- (issueSummaries, symptomSummaries, medicineSummaries, potencies) AND removes
-- the CTEs / column reads that produced them, so the view definition no longer
-- references any clinical free-text column at all — de-identification of clinical
-- content is now correct-by-definition.
--
-- UNCHANGED from 20260612010000 (verbatim): rowId, ageRange (decade bands),
-- gender, city coarsening (cohort >= 5), state/country, caseMonth, issueStatuses,
-- treatmentTypes, patientConditionSummary, improvementTrend. Cohort math, age
-- bands, caseMonth and trend logic are identical.
--
-- NOTE: state/country remain free-text DEMOGRAPHIC columns in the view (coarse,
-- not clinical notes). That is tracked separately as Residual 1b (vocabularize
-- or coarsen location). This migration closes the CLINICAL free-text path only.
--
-- (Future) Residual 1 option (a): re-introducing clinical summaries must go
-- through a curated controlled vocabulary (lookup tables; the view reads only
-- curated term names), NEVER a raw free-text column.
--
-- N=5 SYNC POINT (unchanged): the `city_size >= 5` literal MUST equal
-- EXPLORE_MIN_COHORT in src/lib/explore/constants.ts (which drives the
-- query-layer suppression). A view cannot read TS constants; change both
-- together in a new migration.

DROP VIEW "explore_case_view";

CREATE VIEW "explore_case_view" AS
WITH base AS (
  SELECT
    p.id  AS pid,
    p.age AS age,
    p.gender AS gender,
    NULLIF(btrim(regexp_replace(p.city, '\s+', ' ', 'g')), '')    AS city_norm,
    NULLIF(btrim(regexp_replace(p.state, '\s+', ' ', 'g')), '')   AS state_norm,
    NULLIF(btrim(regexp_replace(p.country, '\s+', ' ', 'g')), '') AS country_norm,
    cr."createdAt" AS case_created_at
  FROM "Patient" p
  JOIN "CaseRecord" cr ON cr."patientId" = p.id
),
city_keyed AS (
  SELECT
    base.*,
    CASE
      WHEN city_norm IS NULL THEN NULL
      ELSE lower(coalesce(country_norm, '') || '|' || coalesce(state_norm, '') || '|' || city_norm)
    END AS city_key
  FROM base
),
city_sized AS (
  SELECT
    city_keyed.*,
    CASE
      WHEN city_key IS NULL THEN NULL
      ELSE count(*) OVER (PARTITION BY city_key)
    END AS city_size
  FROM city_keyed
),

-- Non-archived issues — STATUS facet only. issue.title (free text) is NOT read.
iss AS (
  SELECT i."patientId" AS pid, i.status
  FROM "PatientIssue" i
  WHERE i."deletedAt" IS NULL
),
iss_status AS (
  SELECT pid, array_agg(DISTINCT status) AS issue_statuses
  FROM iss GROUP BY pid
),

-- Non-archived treatments — enum/score facets only. medicineName and potency
-- (free text) are NOT read.
tr AS (
  SELECT te."patientId" AS pid, te.id AS tid, te."treatmentDate" AS td,
    te."entryType" AS etype, te."patientCondition" AS cond, te."improvementScore" AS score
  FROM "TreatmentEntry" te
  WHERE te."deletedAt" IS NULL
),
tr_types AS (
  SELECT pid, array_agg(DISTINCT etype) AS treatment_types FROM tr GROUP BY pid
),
tr_scores AS (
  SELECT pid,
    array_agg(score ORDER BY td, tid) FILTER (WHERE score IS NOT NULL) AS scores
  FROM tr GROUP BY pid
),
tr_cond AS (
  SELECT pid,
    (array_agg(cond::text ORDER BY td DESC, tid DESC) FILTER (WHERE cond IS NOT NULL))[1] AS cond_latest
  FROM tr GROUP BY pid
)

SELECT
  row_number() OVER (
    ORDER BY to_char(cs.case_created_at, 'YYYY-MM') DESC NULLS LAST, cs.pid
  ) AS "rowId",
  CASE
    WHEN cs.age IS NULL OR cs.age < 0 THEN NULL
    ELSE ((cs.age / 10) * 10)::text || '-' || ((cs.age / 10) * 10 + 9)::text
  END AS "ageRange",
  cs.gender,
  CASE WHEN cs.city_size >= 5 THEN cs.city_norm ELSE NULL END AS "city",
  cs.state_norm   AS "state",
  cs.country_norm AS "country",
  to_char(cs.case_created_at, 'YYYY-MM') AS "caseMonth",
  coalesce(ist.issue_statuses,   ARRAY[]::"IssueStatus"[])         AS "issueStatuses",
  coalesce(tt.treatment_types,   ARRAY[]::"TreatmentEntryType"[])  AS "treatmentTypes",
  tc.cond_latest AS "patientConditionSummary",
  CASE
    WHEN array_length(ts.scores, 1) >= 2 THEN
      CASE
        WHEN ts.scores[array_length(ts.scores, 1)] - ts.scores[1] >= 2 THEN 'IMPROVING'
        WHEN ts.scores[array_length(ts.scores, 1)] - ts.scores[1] <= -2 THEN 'DECLINING'
        ELSE 'STABLE'
      END
    ELSE NULL
  END AS "improvementTrend"
FROM city_sized cs
LEFT JOIN iss_status ist ON ist.pid = cs.pid
LEFT JOIN tr_types   tt  ON tt.pid  = cs.pid
LEFT JOIN tr_scores  ts  ON ts.pid  = cs.pid
LEFT JOIN tr_cond    tc  ON tc.pid  = cs.pid;

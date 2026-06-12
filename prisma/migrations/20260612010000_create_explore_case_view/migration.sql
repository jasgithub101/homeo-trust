-- De-identified Explore surface as a live Postgres VIEW (Phase 8 refactor).
-- Replaces the materialized ExploreCaseIndex table + projection/rebuild. The
-- view SELECTs ONLY coarsened/structured, non-PII columns and never the real
-- patient/case id, so de-identification is "correct by view definition". It is
-- always fresh (no materialization). It does NOT suppress small cohorts — the
-- N=5 k-anonymity backstop is enforced in the app query layer; the SAME N=5 is
-- applied here only as the city-cohort coarsening threshold (over the FULL set).
--
-- De-identification mapping (must match src/lib/explore/projection.ts):
--   age   -> decade band "lo-(lo+9)" via floor(age/10)*10; NULL if age<0/NULL.
--   city  -> kept ONLY when its (country,state,city) cohort has >= 5 patients
--            across the whole qualifying set (else coarsened to state-only).
--            ⚠️ SYNC POINT: this `5` MUST equal EXPLORE_MIN_COHORT in
--            src/lib/explore/constants.ts (which drives query-layer suppression).
--            A view can't read TS constants; if you change the threshold, change
--            both (this needs a NEW migration replacing the view).
--   date  -> caseMonth 'YYYY-MM' from CaseRecord.createdAt (never a timestamp).
--   summaries -> structured short fields ONLY (issue.title, symptom.symptomName,
--            treatment.medicineName/potency): trimmed, whitespace-collapsed,
--            capped at 120 chars, de-duplicated case-insensitively preserving
--            first-seen casing/order, capped at 50 items. NEVER free text.
--   archived rows (deletedAt IS NOT NULL) are excluded everywhere.
--
-- rowId is a synthetic positional row_number (recomputed each query); it is
-- Prisma's view identifier only, never a real id, never client-exposed.

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

-- Non-archived issues -----------------------------------------------------
iss AS (
  SELECT i."patientId" AS pid, i.title, i.status, i."createdAt" AS icreated, i.id AS iid
  FROM "PatientIssue" i
  WHERE i."deletedAt" IS NULL
),
iss_status AS (
  SELECT pid, array_agg(DISTINCT status) AS issue_statuses
  FROM iss GROUP BY pid
),
iss_norm AS (
  SELECT pid,
    NULLIF(left(btrim(regexp_replace(title, '\s+', ' ', 'g')), 120), '') AS val,
    row_number() OVER (PARTITION BY pid ORDER BY icreated, iid) AS rn
  FROM iss
),
iss_dedup AS (
  SELECT DISTINCT ON (pid, lower(val)) pid, val, rn
  FROM iss_norm WHERE val IS NOT NULL
  ORDER BY pid, lower(val), rn
),
iss_agg AS (
  SELECT pid, array_agg(val ORDER BY frn) AS issue_summaries
  FROM (
    SELECT pid, val, row_number() OVER (PARTITION BY pid ORDER BY rn) AS frn
    FROM iss_dedup
  ) z WHERE frn <= 50 GROUP BY pid
),

-- Non-archived symptoms under non-archived issues -------------------------
sym AS (
  SELECT i."patientId" AS pid, s."symptomName" AS nm,
    i."createdAt" AS icreated, i.id AS iid, s."createdAt" AS screated, s.id AS sid
  FROM "PatientSymptom" s
  JOIN "PatientIssue" i ON i.id = s."patientIssueId"
  WHERE s."deletedAt" IS NULL AND i."deletedAt" IS NULL
),
sym_norm AS (
  SELECT pid,
    NULLIF(left(btrim(regexp_replace(nm, '\s+', ' ', 'g')), 120), '') AS val,
    row_number() OVER (PARTITION BY pid ORDER BY icreated, iid, screated, sid) AS rn
  FROM sym
),
sym_dedup AS (
  SELECT DISTINCT ON (pid, lower(val)) pid, val, rn
  FROM sym_norm WHERE val IS NOT NULL
  ORDER BY pid, lower(val), rn
),
sym_agg AS (
  SELECT pid, array_agg(val ORDER BY frn) AS symptom_summaries
  FROM (
    SELECT pid, val, row_number() OVER (PARTITION BY pid ORDER BY rn) AS frn
    FROM sym_dedup
  ) z WHERE frn <= 50 GROUP BY pid
),

-- Non-archived treatments -------------------------------------------------
tr AS (
  SELECT te."patientId" AS pid, te.id AS tid, te."treatmentDate" AS td,
    te."entryType" AS etype, te."patientCondition" AS cond, te."improvementScore" AS score,
    NULLIF(left(btrim(regexp_replace(te."medicineName", '\s+', ' ', 'g')), 120), '') AS med,
    NULLIF(left(btrim(regexp_replace(te."potency", '\s+', ' ', 'g')), 120), '')      AS pot
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
),
med_norm AS (
  SELECT pid, med, row_number() OVER (PARTITION BY pid ORDER BY td, tid) AS rn
  FROM tr WHERE med IS NOT NULL
),
med_dedup AS (
  SELECT DISTINCT ON (pid, lower(med)) pid, med, rn
  FROM med_norm ORDER BY pid, lower(med), rn
),
med_agg AS (
  SELECT pid, array_agg(med ORDER BY frn) AS medicine_summaries
  FROM (
    SELECT pid, med, row_number() OVER (PARTITION BY pid ORDER BY rn) AS frn
    FROM med_dedup
  ) z WHERE frn <= 50 GROUP BY pid
),
pot_norm AS (
  SELECT pid, pot, row_number() OVER (PARTITION BY pid ORDER BY td, tid) AS rn
  FROM tr WHERE pot IS NOT NULL
),
pot_dedup AS (
  SELECT DISTINCT ON (pid, lower(pot)) pid, pot, rn
  FROM pot_norm ORDER BY pid, lower(pot), rn
),
pot_agg AS (
  SELECT pid, array_agg(pot ORDER BY frn) AS potencies
  FROM (
    SELECT pid, pot, row_number() OVER (PARTITION BY pid ORDER BY rn) AS frn
    FROM pot_dedup
  ) z WHERE frn <= 50 GROUP BY pid
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
  coalesce(ia.issue_summaries,   ARRAY[]::text[]) AS "issueSummaries",
  coalesce(sa.symptom_summaries, ARRAY[]::text[]) AS "symptomSummaries",
  coalesce(ma.medicine_summaries, ARRAY[]::text[]) AS "medicineSummaries",
  coalesce(ist.issue_statuses,   ARRAY[]::"IssueStatus"[])         AS "issueStatuses",
  coalesce(tt.treatment_types,   ARRAY[]::"TreatmentEntryType"[])  AS "treatmentTypes",
  coalesce(pa.potencies,         ARRAY[]::text[]) AS "potencies",
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
LEFT JOIN iss_agg    ia  ON ia.pid  = cs.pid
LEFT JOIN sym_agg    sa  ON sa.pid  = cs.pid
LEFT JOIN tr_types   tt  ON tt.pid  = cs.pid
LEFT JOIN tr_scores  ts  ON ts.pid  = cs.pid
LEFT JOIN tr_cond    tc  ON tc.pid  = cs.pid
LEFT JOIN med_agg    ma  ON ma.pid  = cs.pid
LEFT JOIN pot_agg    pa  ON pa.pid  = cs.pid;

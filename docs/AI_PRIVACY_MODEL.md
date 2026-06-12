# AI & Explore Privacy Model

> Source of truth: `docs/MASTER_SPEC.md`. This document holds the full Explore
> page requirements, Explore privacy rules, the de-identified Explore dataset,
> the AI feature scope, and the critical AI privacy/de-identification rules.
> Entity fields are in `DATA_MODEL.md`; permissions/audit in `SECURITY_MODEL.md`.

## Core Principle

Both Explore and AI must use **de-identified records only**. AI must never
access raw patient PII tables directly. Retrieval reads only the de-identified
case/Explore index.

---

## 1. Explore Page

There must be an Explore page where records are available to doctors in a
privacy-safe way.

Requirements:

- Users with `explore.view` permission can access it.
- Doctors can browse de-identified records from across the whole system.
- Sensitive patient data must be hidden.
- Doctors should be able to filter records.

Example filters:

- City, for example New York
- State
- Country
- Age range
- Gender
- Issue/complaint
- Symptoms
- Medicine
- Potency
- Patient condition: `IMPROVED`, `SAME`, `WORSENED`
- Date range
- Issue status
- Treatment type

---

## 2. Explore Privacy Requirements

Explore must **not** show:

- Patient name
- Phone
- Email
- Exact address
- Emergency contact details
- Exact patient ID
- Exact date of birth (expose `ageRange` instead)
- Doctor name unless explicitly permitted via the `explore.viewDoctorName`
  permission
- Raw reports or photos

Explore **may** show:

- De-identified clinical information
- Masked clinical information
- Age range
- Gender
- Broad location if safe
- Issue summary
- Symptom summary
- Medicine summary
- Patient condition summary
- Improvement trend

Location handling:

- Location filters can use city/state/country, but exact address must stay
  hidden.
- If a location is too specific and could identify a patient, show a broader
  location instead.

Anonymization labels — use generated anonymous labels such as:

- `Case A`
- `Case B`
- `Case C`
- anonymized display codes
- masked information

---

## 3. Recommended Explore Dataset — ExploreCaseIndex

Create a de-identified view/table such as `ExploreCaseIndex` (full field list in
`DATA_MODEL.md`). It contains de-identified fields only: `anonymousCaseCode`,
`ageRange`, `gender`, `city`/`state`/`country` (nullable), `issueSummaries`,
`symptomSummaries`, `medicineSummaries`, `issueStatuses`, `treatmentTypes`,
`potencies`, `caseMonth`, `patientConditionSummary`, `improvementTrend`. The
`patientId` and `caseRecordId` are internal only and must never be shown in the
UI (or selected into any client-bound payload).

Rules:

- Explore UI must read from the de-identified dataset, **not** raw `Patient`
  tables.
- Internal IDs should not be exposed to the frontend unless required and safe.
- Build filters against de-identified fields.

### 3.1 Phase 8 implementation (Explore)

- **De-identify on the way IN, not on read.** A single projection chokepoint,
  `src/lib/explore/projection.ts#projectPatient`, is the source of truth for
  every de-identified value. The index stores only already-de-identified data,
  so a read can never re-derive PII. The rebuild orchestrator
  (`src/lib/explore/rebuild.ts`) is the only writer; Explore (and later AI) only
  read `ExploreCaseIndex`.
- **Coarsening (D1):** age → decade band via `ageRange()`; `caseMonth` at
  `YYYY-MM` (never an exact timestamp/DOB); `city` is kept **only** when its
  cohort is ≥ `EXPLORE_MIN_COHORT` (5), otherwise coarsened to state-only;
  `state`/`country` are always coarse.
- **k-anonymity on read (D2):** `src/lib/explore/query.ts` counts the matching
  cohort first and, when it is `< EXPLORE_MIN_COHORT`, suppresses **both** the
  rows and the count, returning only a "broaden filters" state. Zero matches and
  1–4 matches collapse into the same state so a small cohort can be neither
  displayed nor sized. **Known limitations:** (a) this does not defend against
  differencing attacks (comparing cohort A vs A+B to infer the delta); (b) the
  backstop is per-viewer optional via `explore.bypassCohortMinimum` (see below),
  which is default-granted to Explore roles — so by default viewers DO see small
  cohorts, accepting the re-identification risk that suppression otherwise
  mitigates. Revoke the bypass on a role to enforce the floor for that role.
- **Allow-list select:** `query.ts` selects de-identified columns by an explicit
  allow-list and never returns `patientId`/`caseRecordId`/the index id/timestamps
  — the structural guarantee that internal/linking ids cannot leak.
- **`anonymousCaseCode` is CSPRNG-random**, generated once and preserved across
  rebuilds — never a hash/transform of any id (that would be reversible).
- **Access (D3)** is binary: `admin || explore.view`. There is no row scope and
  no depth escalation here — a `patient.viewSensitive` holder still sees only
  de-identified Explore. Admin bypasses **access**, never de-identification.
- **Cohort-minimum bypass** (`admin || explore.bypassCohortMinimum`): lifts the
  D2 row/count suppression for the holder, who then sees cohorts `< N`. It is
  **default-granted to Explore roles** (one-time `scripts/backfill-explore-bypass.ts`),
  so the privacy floor is opt-IN per role. It lifts ONLY the suppression backstop:
  every other de-identification rule above (allow-list select, no raw tables, no
  PII fields, projection-time city coarsening) still holds for these viewers.
- **Sync (D6):** the index is refreshed by the idempotent
  `scripts/rebuild-explore-index.ts` or the admin "Refresh Explore index" action;
  there are **no on-write hooks yet**, so there is a documented **staleness
  window** between a clinical edit and the next refresh. Archived
  (`deletedAt != null`) issues/symptoms/treatments and patients without a
  `CaseRecord` are excluded at projection time.

### 3.2 RESIDUAL PII-LEAK PATH — free text in structured fields (D5) ⚠️

Summaries are sourced **only** from short structured fields — `PatientIssue.title`,
`PatientSymptom.symptomName`, `TreatmentEntry.medicineName` — and **never** from
`description`/`notes`/`instructions`/`followUpNotes`/`caseDescription`. They are
normalized (trim/collapse/dedupe/length-cap).

**However, k-anonymity does NOT mitigate PII that a user types into these short
fields** (e.g. a patient name entered as an issue title). This is the one
residual PII-leak path into Explore — and, because **Phase 9 (AI) consumes this
same index**, into AI as well. The future fix is a controlled vocabulary or a
server-side PII scrub on projection; it is **NOT built yet**. Until then, operator
training and field hygiene are the only controls on these fields.

---

## 4. AI Feature

When a doctor enters a new case description, the AI should check historical
cases across the whole database and return privacy-safe insights about similar
cases.

The AI should help answer:

- What similar cases were found?
- What symptoms and patterns appeared?
- What medication was given?
- What potency/dosage pattern was used, if available?
- How did patients improve over time?
- How long did improvement take?
- Were there repeated medicine patterns across similar cases?
- What follow-up trends were seen?

---

## 5. Critical AI Privacy Requirements

- The AI may search across the entire database.
- The AI must use **only de-identified data**.
- AI must **not** access raw PII tables directly.

AI must **never** reveal:

- Patient name
- Phone number
- Email
- Exact address
- Emergency contact
- Exact patient ID
- Exact case ID
- Doctor name
- Uploaded raw reports/photos
- Anything that can identify a patient

AI **may** reveal:

- Approximate age or age range
- Gender
- City/state/country if not too identifying
- Symptoms
- Issue summary
- Modalities
- Medicine prescribed
- Potency
- Dosage/frequency pattern
- Patient condition trend
- Improvement trend
- Time taken for improvement

Presentation rules:

- Prefer aggregated summaries.
- If showing examples, label them as `Case A`, `Case B`, `Case C`.
- AI output must include this disclaimer or an equivalent warning:

  > AI output is historical decision support only and does not prescribe or
  > replace doctor judgment.

---

## 6. AI Architecture

- Create a de-identified searchable case dataset.
- Store embeddings **only** for de-identified case text.
- The retrieval layer should search only the de-identified case/Explore index.
- Add a PII/privacy filter **after** AI generation.
- Log every AI query.

### AISearchLog

The `AISearchLog` entity (full fields in `DATA_MODEL.md`) stores:
`requestingUserId`, `deidentifiedQueryText`, `deidentifiedResponse`, optional
`metadata` JSON, and `createdAt`. Only de-identified query text and
de-identified responses are stored.

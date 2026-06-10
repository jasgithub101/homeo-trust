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
`symptomSummaries`, `medicineSummaries`, `patientConditionSummary`,
`improvementTrend`. The `patientId` and `caseRecordId` are internal only and
must never be shown in the UI.

Rules:

- Explore UI must read from the de-identified dataset, **not** raw `Patient`
  tables.
- Internal IDs should not be exposed to the frontend unless required and safe.
- Build filters against de-identified fields.

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

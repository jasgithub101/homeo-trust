# Phase 4 Report — Core Clinical Database Schema

> Audience: me (the developer), for later revision and for explaining the system
> in interviews. Scope: what Phase 4 actually implements in this repo today —
> **schema + migration only, no UI**. Source specs: `docs/DATA_MODEL.md`,
> `docs/SECURITY_MODEL.md`, `docs/PHASES.md`, `docs/AI_PRIVACY_MODEL.md`.
> No secrets or `.env.local` values appear here. Phase 4 had no UI, so no browser
> testing was performed.

---

## 1. Phase overview

### What Phase 4 implemented
- **10 clinical Prisma models** + **7 native Postgres enums**.
- One incremental migration (`20260610010000_clinical_schema`) applied to local
  PostgreSQL, plus a regenerated Prisma client.
- **DB-level integrity**: one `CaseRecord` per patient, a partial unique index
  for one current primary treating doctor, participant uniqueness, and a fully
  indexed de-identified `ExploreCaseIndex` table.
- The modeling rules from the spec baked into the schema (no `doctorId`
  ownership columns; doctor links via `DoctorProfile`; combined
  prescription+follow-up `TreatmentEntry`).

### What was intentionally NOT implemented yet
- **No clinical UI** and **no patient workflow** (create patient, assign/transfer
  doctor, add case/issues/symptoms/treatments) — that is Phase 5/6.
- **No Explore UI** and **no ExploreCaseIndex population/refresh** (Phase 8).
- **No AI** retrieval/embeddings (Phase 9).
- **No file upload / attachment serving / signed URLs** (Phase 7).
- **No clinical seed data** (no fake PII). The permissions/admin seed is
  unchanged.
- **No app-level access gating** for patient PII yet (Phase 5 adds
  `canViewSensitivePatient`-style helpers).

---

## 2. Architecture decisions

### Why Phase 4 was schema-only
The data model is the foundation every later phase builds on (patient workflow,
Explore, AI, attachments). Getting the tables, relationships, enums, and
integrity constraints right first means later phases write *behavior* against a
stable, correct shape — avoiding churn and risky migrations once real data and UI
exist. It also keeps the change small and reviewable.

### Why clinical UI was not added yet
Mixing schema and UI in one step makes both harder to review and easy to
overbuild. Separating them lets the schema be validated in isolation (migration
applies cleanly, constraints behave) before any form or server action depends on
it. It also respects the "do not overbuild future phases" rule.

### Why local PostgreSQL remains the dev database
Cloud-agnostic and zero cost. The app only needs *a* PostgreSQL database; local
PostgreSQL in WSL is the dev DB. No provider-specific features are used, so the
schema runs anywhere Postgres runs.

### Why Prisma models were added before workflows
Authorization (Phases 2–3) defines *who can do what*; the clinical schema defines
*what data exists*. Defining the sensitive records **before** building the
workflows that touch them is the correct order: the permission catalog already
names patient/case/treatment actions, and now the tables they govern exist, so
Phase 5 can wire access control onto a real schema.

---

## 3. Clinical data model

- **Patient** — the person receiving care. Holds identity + contact + emergency
  contact fields (most are sensitive PII). Has exactly one `CaseRecord`, many
  issues/treatments/attachments, a history of doctor relationships, and an
  optional de-identified `ExploreCaseIndex` row. **No `doctorId`** — ownership is
  never a column.
- **CaseRecord** — the single homeopathic case file per patient (chief complaint,
  case description, histories, generals, modalities, diagnosis/repertory notes).
  Unique `patientId` enforces one-per-patient.
- **PatientIssue** — a complaint/condition (title, description, onset, status). A
  patient can have many; each can carry many symptoms and be referenced by
  treatments.
- **PatientSymptom** — a symptom under an issue (name, description, severity 1-10,
  duration, modalities, triggers, location).
- **DoctorPatientRelationship** — the **historical, time-based** assignment of
  doctors to a patient (type, start/end dates, `isCurrentlyTreating`, notes,
  who assigned it). Links to `DoctorProfile`. This is how "which doctor(s) treat
  this patient" is answered — never an ownership column.
- **TreatmentEntry** — a single clinical action combining **prescription and
  follow-up** (medicine/potency/dosage/frequency/duration/instructions, plus
  follow-up notes, symptom changes, `patientCondition`, improvement score, next
  follow-up). Links to patient, case, and optionally an issue. No doctor column.
- **TreatmentDoctorParticipant** — which doctor(s) were treating/consulting on a
  given `TreatmentEntry`. Links to `DoctorProfile`; preserves history when
  doctors change.
- **PatientAttachment** — photos/reports/scans/prescription images. Stores a
  private `storagePath` (not a public URL), `isSensitive` (default true), file
  metadata, and optional links to issue/case/treatment.
- **ExploreCaseIndex** — a **physical de-identified** table that Explore/AI will
  read from (age range, gender, broad location, issue/symptom/medicine summaries,
  condition/improvement trend). Internal `patientId`/`caseRecordId` are for
  refresh/joins only and are never exposed.
- **AISearchLog** — an audit of AI usage storing only **de-identified** query
  text and responses (plus optional metadata, requesting user).

---

## 4. Important modeling rules (enforced in the schema)

- **No `doctorId` ownership column** on `Patient`, `CaseRecord`, `PatientIssue`,
  `PatientSymptom`, or `TreatmentEntry`. Verified: no such column exists. The
  doctor treating a patient can change mid-treatment, so ownership-as-a-column
  would be wrong and would break history.
- **Doctor-patient assignment uses `DoctorPatientRelationship`** — multiple
  doctors over time, with start/end and a current flag, so past assignments
  remain in history.
- **Treatment doctor involvement uses `TreatmentDoctorParticipant`** — one or
  more treating + zero or more consulting doctors per entry, preserved over time.
- **Exactly one `CaseRecord` per `Patient`** — unique `patientId`.
- **`TreatmentEntry` combines prescription and follow-up** — one table with an
  `entryType` enum, so a prescription, a follow-up, both, or a note are the same
  shape and form a single clinical timeline.
- **Doctor links use `DoctorProfile`, not generic `User`** —
  `DoctorPatientRelationship.doctorProfileId` and
  `TreatmentDoctorParticipant.doctorProfileId` reference `DoctorProfile`.
- **Non-doctor users cannot appear as treating/consulting doctors** — because
  those columns reference `DoctorProfile`, which only doctors have. A nurse or
  assistant can hold roles/permissions (a `User`) but is structurally excluded
  from doctor columns. "Who performed an action" (`assignedByUserId`,
  `uploadedByUserId`, `requestingUserId`) references `User` separately.

---

## 5. Enums added

Native Postgres enums (not free strings) so the **database** rejects invalid
values — important for clinical data integrity:

- **Gender** — `MALE`, `FEMALE`, `OTHER`, `UNSPECIFIED` (default `UNSPECIFIED`).
  Clean, consistent filtering; avoids `male`/`M`/`MALE` drift; still allows
  non-specific entry.
- **RelationshipType** — `PRIMARY_TREATING`, `CONSULTING`, `ASSISTING`,
  `TRANSFERRED_FROM`, `TRANSFERRED_TO`. Drives the doctor-assignment history and
  the primary-doctor constraint.
- **IssueStatus** — `ACTIVE`, `RESOLVED`, `CHRONIC`, `RECURRING`.
- **TreatmentEntryType** — `PRESCRIPTION`, `FOLLOW_UP`,
  `PRESCRIPTION_AND_FOLLOW_UP`, `NOTE`. Lets one table serve prescriptions and
  follow-ups.
- **PatientCondition** — `IMPROVED`, `SAME`, `WORSENED` — **exactly** the three
  allowed values, enforced at the DB level.
- **ParticipantType** — `TREATING_DOCTOR`, `CONSULTING_DOCTOR`.
- **AttachmentType** — `ISSUE_PHOTO`, `LAB_REPORT`, `SCAN_REPORT`,
  `PRESCRIPTION_IMAGE`, `OTHER`.

---

## 6. Constraints and indexes

- **`CaseRecord_patientId_key`** (unique) — one `CaseRecord` per patient.
- **`dpr_one_current_primary_per_patient`** (partial unique index) — at most one
  current primary treating doctor per patient (see §7).
- **`TreatmentDoctorParticipant` uniqueness** — unique
  `(treatmentEntryId, doctorProfileId, participantType)` prevents recording the
  same doctor twice in the same role on one treatment entry.
- **ExploreCaseIndex unique/internal fields** — unique `patientId` (one index row
  per patient) and unique `anonymousCaseCode`; `patientId`/`caseRecordId` are
  internal-only (never sent to the client).
- **Filter indexes** (for later Explore queries against de-identified data):
  `ExploreCaseIndex` on `gender`, `ageRange`, `city`, `state`, `country`,
  `patientConditionSummary`.
- **Relationship/lookup indexes**: `PatientIssue(patientId)`, `(status)`;
  `PatientSymptom(patientIssueId)`; `DoctorPatientRelationship(patientId)`,
  `(doctorProfileId)`; `TreatmentEntry(patientId)`, `(caseRecordId)`,
  `(patientIssueId)`, `(treatmentDate)`; `TreatmentDoctorParticipant(doctorProfileId)`;
  `PatientAttachment(patientId/patientIssueId/caseRecordId/treatmentEntryId)`;
  `AISearchLog(requestingUserId)`, `(createdAt)`; `Patient(patientCode)` unique +
  `(createdAt)`.
- **Referential integrity (on delete)**: clinical content **cascades** from its
  parent (`CaseRecord`/`PatientIssue`/`TreatmentEntry`/`PatientAttachment`/
  `ExploreCaseIndex` from `Patient`; `PatientSymptom` from `PatientIssue`;
  `TreatmentDoctorParticipant` from `TreatmentEntry`). **Doctor links use
  `RESTRICT`** (can't delete a `DoctorProfile` with clinical history — preserves
  history; aligns with deactivate-don't-delete). **Action-actor user refs use
  `SET NULL`** (nullable) so records survive user cleanup. Optional links
  (`TreatmentEntry.patientIssueId`, attachment links) use `SET NULL`.

---

## 7. Partial unique index decision

- **Why DB-enforced**: "one current primary treating doctor per patient" is a
  core clinical invariant. Enforcing it only in app code risks races and bugs
  leaving a patient with two active primary doctors. A database constraint makes
  the invalid state **impossible** regardless of code paths.
- **Why raw SQL was needed**: the rule is conditional — it applies only to rows
  where `relationshipType = 'PRIMARY_TREATING' AND isCurrentlyTreating = true`.
  That requires a **partial index** (a unique index with a `WHERE` clause):
  ```sql
  CREATE UNIQUE INDEX "dpr_one_current_primary_per_patient"
    ON "DoctorPatientRelationship" ("patientId")
    WHERE "relationshipType" = 'PRIMARY_TREATING' AND "isCurrentlyTreating" = true;
  ```
  A plain unique index on `(patientId)` would (wrongly) forbid a patient from
  having more than one relationship of any kind.
- **Why Prisma can't express it**: Prisma's `@@unique`/`@@index` do not support a
  `WHERE` condition, so this index cannot live in `schema.prisma`. It was
  appended by hand to the migration SQL, with a comment in both the schema header
  and `docs/DATA_MODEL.md`.
- **Why future migrations must preserve it**: because it isn't in the Prisma
  schema, `prisma migrate diff`/drift detection doesn't know about it. A careless
  future migration could omit or drop it. It must be carried forward (and
  re-added if a table is rebuilt). App-level validation (transfer = end old +
  start new) is added in Phase 5 as defense in depth, but the index is the
  guarantee.

---

## 8. Privacy and de-identification

- **Sensitive Patient PII**: `name`, `phone`, `email`, `address` (and city/state/
  country at fine granularity), `emergencyContact*`, and exact identifiers
  (`patientCode`, ids). `dateOfBirth` is sensitive — Explore exposes an age
  *range*, never the exact DOB.
- **Why `ExploreCaseIndex` is a physical de-identified table** (not a view): it
  **physically separates** de-identified data from raw `Patient` PII, so Explore/
  AI queries hit a table that simply doesn't contain names/contacts; it can carry
  its own filter indexes; and it can be refreshed/denormalized independently. A
  view over raw `Patient` would keep PII one join away and make accidental leakage
  easier.
- **Why Explore/AI must read `ExploreCaseIndex`, not raw `Patient`**: the privacy
  guarantee comes from never querying PII columns for these features. Reading only
  the de-identified table makes "no PII in Explore/AI" structural, not just a
  code convention. Internal `patientId`/`caseRecordId` on that table must never be
  selected to the client.
- **Why attachments store `storagePath` and are private by default**: files may
  contain PII (lab reports, photos). Storing a private bucket key (not a public
  URL) means access goes through authorized, signed, audited retrieval later
  (Phase 7); `isSensitive` defaults to `true`.
- **Why no raw reports/photos in Explore**: `ExploreCaseIndex` has no attachment
  references at all, so raw files can't surface in Explore by construction.

---

## 9. Migration approach

- **No destructive reset**: `prisma migrate reset` / `dropdb` were never used (and
  are blocked by settings). Existing Phase 2/3 tables and data were untouched.
- **`migrate diff` + `migrate deploy`**: the dev DB user (`homeo_user`) lacks the
  `CREATEDB` privilege, so `prisma migrate dev` (which needs a temporary **shadow
  database**) fails with P3014. Instead:
  1. `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema
     prisma/schema.prisma --script` — diffs the **live database** (which already
     had the Phase 2 tables) against the target schema and emits only the
     additive delta. (Note: `--from-migrations` was *not* usable here because it
     also requires a shadow DB.)
  2. The partial unique index was appended to the generated `migration.sql`.
  3. `prisma migrate deploy` applied the committed migration (no shadow DB) and
     recorded it in `_prisma_migrations`.
  4. `prisma generate` regenerated the client.
- **Migration created**: `20260610010000_clinical_schema`.
- **DB objects created**: 7 enums, 10 tables, their unique/lookup/filter indexes,
  the foreign keys (cascade / restrict / set-null as above), and the partial
  unique index. The migration contains **no** `DROP`/destructive statements.

---

## 10. Important files changed

| File | Purpose | What changed in Phase 4 |
|---|---|---|
| `prisma/schema.prisma` | Data model | Added 7 enums + 10 clinical models; added back-relations to `User` (action-actor refs) and `DoctorProfile` (clinical doctor links); documented the partial-index rule in the header |
| `prisma/migrations/20260610010000_clinical_schema/migration.sql` | Migration | **New** — creates enums/tables/indexes/FKs; partial unique index appended by hand |
| `docs/DATA_MODEL.md` | Docs | Noted the `Gender` enum, the implemented partial-index name, and ExploreCaseIndex-as-physical-table |
| `docs/PHASES.md` | Docs | Added a Phase 4 "implemented" note (models, enums, constraints, no clinical seed) |
| `prisma/seed.ts` | Seed | **Unchanged** (no enum-related update required) |
| `src/**` | App code | **Unchanged** (no UI/workflow in Phase 4) |

---

## 11. Manual verification checklist

- [ ] `pnpm prisma migrate status` → both migrations applied, none pending.
- [ ] **All new tables exist**: `Patient`, `CaseRecord`, `PatientIssue`,
      `PatientSymptom`, `DoctorPatientRelationship`, `TreatmentEntry`,
      `TreatmentDoctorParticipant`, `PatientAttachment`, `ExploreCaseIndex`,
      `AISearchLog` (e.g. `\dt` in psql) — and start empty.
- [ ] **All enums exist** (`\dT`): `Gender`, `RelationshipType`, `IssueStatus`,
      `TreatmentEntryType`, `PatientCondition`, `ParticipantType`,
      `AttachmentType`.
- [ ] **Partial unique index exists** with its WHERE clause
      (`\d "DoctorPatientRelationship"` shows
      `dpr_one_current_primary_per_patient`).
- [ ] **`CaseRecord` unique `patientId`** exists (`CaseRecord_patientId_key`).
- [ ] **No `doctorId` column** on `Patient`/`CaseRecord`/`PatientIssue`/
      `PatientSymptom`/`TreatmentEntry`.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass.
- [ ] Optional **constraint probes** (throwaway script; clean up after): two
      `PRIMARY_TREATING` + `isCurrentlyTreating=true` rows for one patient →
      second rejected; a second `CaseRecord` for one patient → rejected; a
      duplicate `(treatmentEntryId, doctorProfileId, participantType)` → rejected;
      an out-of-range `patientCondition` → rejected by the enum.

*(All read-only checks above were performed during implementation and passed;
the optional write probes were not run to avoid creating data.)*

---

## 12. Problems faced and fixes

- **`homeo_user` lacks `CREATEDB` → no-shadow migration flow**: `migrate dev`
  needs a shadow database; the dev role can't create one (P3014). Fixed by
  generating the migration with `migrate diff --from-config-datasource` (diff the
  live DB to the schema) and applying it with `migrate deploy`. Future fix option:
  grant `CREATEDB` locally to use `migrate dev` normally.
- **Partial unique index is a manual migration artifact**: Prisma can't express
  partial/WHERE indexes, so the index lives in raw SQL appended to the migration,
  documented in the schema header and `DATA_MODEL.md`, and must be preserved by
  future migrations (it's invisible to drift detection).
- **`Gender` made a native enum**: chosen over a free string to keep filtering
  clean and avoid inconsistent values (`male`/`M`/`MALE`), with `UNSPECIFIED` for
  non-specific entry.

---

## 13. What I should understand from this phase

- **Model history, not ownership.** When a relationship can change over time
  (which doctor treats a patient), use a relationship table with dates/flags, not
  a foreign-key "owner" column. This keeps history intact and answers "who treats
  this patient now?" via the current row.
- **Push invariants into the database.** Uniqueness ("one case per patient") and
  conditional uniqueness ("one current primary doctor") belong in the schema as
  constraints/partial indexes, so no code path can create an invalid state.
- **Enums for closed value sets.** `patientCondition` must be exactly three
  values — a native enum enforces that at the DB, not just in validation code.
- **Separate identity from action attribution.** Clinical doctorhood references
  `DoctorProfile`; "who clicked the button" references `User`. Different concepts,
  different columns.
- **Design privacy structurally.** A physically separate de-identified table
  (`ExploreCaseIndex`) makes "no PII in Explore/AI" a property of the data layout,
  not a rule you must remember in every query.
- **Know your migration tooling's constraints.** Shadow-DB privileges and
  Prisma's inability to express partial indexes both shaped how the migration was
  produced and applied.

---

## 14. Resume / interview talking points

- Designed a **normalized clinical schema** (10 models, 7 native Postgres enums)
  for a privacy-sensitive medical app, with history-preserving relationship
  tables instead of ownership columns.
- Enforced clinical invariants **at the database level**: one case record per
  patient, and a **Postgres partial unique index** guaranteeing one current
  primary treating doctor per patient (raw SQL, since Prisma can't express
  partial indexes).
- Modeled **doctor involvement via `DoctorProfile`** (not generic users), so
  non-doctor staff with permissions can never be recorded as treating/consulting
  doctors — separating authorization from clinical identity.
- Built **privacy in by construction**: a physically separate, indexed,
  **de-identified** `ExploreCaseIndex` table for Explore/AI, and private-by-default
  attachments storing a storage path rather than public URLs.
- Used native enums for closed value sets (e.g. `patientCondition` =
  IMPROVED/SAME/WORSENED) to enforce integrity in the database.
- Delivered it as a **schema-only phase** with a safe, **non-destructive**
  migration via `migrate diff` + `migrate deploy`, working around a missing
  `CREATEDB` privilege (no shadow database).

---

## 15. Next recommended phase

**Phase 5 — Patient management & doctor-patient relationships.** Phase 4 created
the tables but nothing reads or writes them yet. Phase 5 is the natural next step
because it brings the schema to life **and** is where access control must land:
create patients, assign a treating doctor, transfer a patient (end old
relationship + start new), end a relationship, mark the current primary, and view
assignment history — all enforced by `DoctorPatientRelationship` (backed by the
partial unique index) plus permission checks and `canViewSensitivePatient`-style
helpers. Doing patient management before case/issue/treatment workflows (Phase 6)
is correct: you must be able to create and securely access a patient (and decide
who may see their PII) before recording clinical details about them.

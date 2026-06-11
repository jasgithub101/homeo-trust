# Phase 5 Report — Patient Management & Doctor-Patient Relationships

> Audience: me (the developer), for later revision and for explaining the system
> in interviews. Scope: what Phase 5 actually implements in this repo today —
> patient CRUD + doctor-patient relationship lifecycle + access gating, **no
> clinical workflow** (case/issue/symptom/treatment is Phase 6). Source specs:
> `docs/PRODUCT_SPEC.md`, `docs/SECURITY_MODEL.md`, `docs/DATA_MODEL.md`,
> `docs/PHASES.md`. No secrets or `.env.local` values appear here. The schema was
> built in Phase 4; **Phase 5 is code-only — no new migration.**

---

## 1. Phase overview

### What Phase 5 implemented
- **Patient lifecycle UI + server actions**: create, list (scoped + PII-masked),
  view detail (PII gated), edit.
- **Doctor-patient relationship lifecycle**: assign a doctor, transfer the
  primary treating doctor (end old + start new in one transaction), end a
  relationship (soft close, never delete), and view full assignment history.
- **Access control layer** (`src/lib/permissions/patient-access.ts`): a single
  set of helpers that combine **permissions AND `DoctorPatientRelationship`**,
  enforced server-side in every page and action.
- **De-identification at the query layer**: de-identified viewers never receive
  raw PII columns from the database (Prisma `select` is toggled by the access
  decision, not just hidden in the UI).
- **Audit logging** for patient create/update/view and relationship
  create/end/transfer.
- **Patients nav** gated by `canAccessPatientsSection`.

### What was intentionally NOT implemented yet
- **No clinical workflow** — no `CaseRecord`, `PatientIssue`, `PatientSymptom`,
  `TreatmentEntry`, or `TreatmentDoctorParticipant` UI (Phase 6).
- **No attachments** — no upload / signed URLs / serving (Phase 7).
- **No Explore UI** and no `ExploreCaseIndex` population (Phase 8).
- **No AI** retrieval/embeddings (Phase 9).
- **No `UserPatientAccess` model** — non-doctor staff still cannot be granted
  patient-specific access (see §8 known limitation).
- **No new migration** — the Phase 4 schema already had every table/column used.

---

## 2. Architecture decisions

### Why patient management comes before clinical workflow
You must be able to create a patient, decide **who may see their PII**, and
assign a treating doctor before recording clinical details about them. Phase 5
brings the Phase 4 schema to life and lands the access-control layer that every
later phase (case, treatment, Explore, AI) depends on.

### Why access = permission AND relationship (not either alone)
The security model has two orthogonal questions: *is this user allowed to do this
kind of thing?* (permission) and *is this user connected to this specific
patient?* (relationship). A doctor with `patient.viewSensitive` should still not
read a patient they have no relationship with; a related doctor without the
permission should still not see raw PII. Requiring **both** is the secure
default. Admin is the only super-access bypass.

### Why de-identification is enforced in the Prisma `select`, not the JSX
If the page fetched all columns and the component merely hid the sensitive ones,
the PII would still cross the network into the server component (and risk leaking
via serialization, logs, or a future refactor). Instead the access decision
(`canViewSensitivePatient`) is computed first and passed as the **boolean value
of each sensitive field in the Prisma `select`** (`name: showSensitive`, …). A
de-identified viewer's query literally never reads `name`/`phone`/`email`/etc.
from the database. "No PII for de-identified viewers" is a property of the query,
not a UI convention.

### Why transfer is end-old-then-create-new in one transaction
"Transfer" is not an update of a single row — it must preserve history. The old
primary relationship is closed (`isCurrentlyTreating=false`, `endDate=now`) and a
new primary is created, both inside `db.$transaction([...])`. Ordering the close
before the create keeps the partial unique index
(`dpr_one_current_primary_per_patient`) satisfied at every instant (at most one
current primary), and the transaction makes it all-or-nothing.

### Why relationships are soft-closed, never deleted
Doctor involvement is clinical history. Ending a relationship sets
`isCurrentlyTreating=false` + `endDate`; the row stays so "who treated this
patient, and when?" is always answerable. This mirrors the Phase 4 "model
history, not ownership" rule and the deactivate-don't-delete posture.

### Why patient codes are random, not sequential
`generateUniquePatientCode()` produces `PT-XXXXXXXX` from a no-look-alike
alphabet (no I/O/0/1), retrying on collision. A sequential ID would leak patient
count/enrollment rate and be guessable; the code is also treated as **sensitive**
(never shown in Explore/AI).

---

## 3. Access-control model (the core of Phase 5)

All helpers live in `src/lib/permissions/patient-access.ts` and are
`server-only`. "Related" = the user's `DoctorProfile` has **any**
`DoctorPatientRelationship` row (current **or** past) for that patient.

| Helper | Rule | Used by |
|---|---|---|
| `isRelatedToPatient` | user has a `DoctorProfile` with any DPR row for the patient | the other helpers |
| `canAccessPatientsSection` | admin OR `patient.viewSensitive` OR `patient.viewDeidentified` | nav + list/`/patients` guard |
| `canViewPatient` | admin OR related | patient detail page (else `notFound`) |
| `canViewSensitivePatient` | admin OR (`patient.viewSensitive` AND related) | gates raw PII in detail/edit/actions |
| `canEditPatient` | admin OR (`patient.update` AND related) | edit page + update action |
| `canManagePatientDoctors` | admin OR (`patient.assignDoctor` AND related) | assign/transfer/end actions + detail forms |
| `patientListWhere` | admin → all; doctor → related only; non-doctor non-admin → none | list query scoping |

Key consequences:
- **Non-doctor, non-admin users see no patients** — they have no `DoctorProfile`,
  so `isRelatedToPatient` is always false and `patientListWhere` returns
  `{ id: { in: [] } }`. (This is the known limitation in §8.)
- **Editing PII requires `canEditPatient` AND `canViewSensitivePatient`** — you
  can't blind-write fields you're not allowed to read.
- **`canViewPatient` returns `notFound()`** rather than a 403, so the existence of
  an out-of-scope patient isn't confirmed to an unauthorized user.

---

## 4. Doctor-patient relationship lifecycle

- **Assign** (`assignDoctorAction`): validates input, checks
  `canManagePatientDoctors`, verifies the target is a real `DoctorProfile`, and —
  for `PRIMARY_TREATING` — blocks a second current primary in app code, with the
  partial unique index as a race backstop (the `create` is wrapped in try/catch).
  Selectable types are `PRIMARY_TREATING`, `CONSULTING`, `ASSISTING`
  (`TRANSFERRED_*` is reserved for the transfer flow, not user-selectable).
- **Transfer** (`transferPatientAction`): requires an existing current primary,
  rejects transferring to the same doctor, then closes old + creates new primary
  in one `$transaction`.
- **End** (`endRelationshipAction`): verifies the relationship belongs to the
  patient and is still active, then soft-closes it. Never deletes.
- **Initial doctor on create** (`createPatientAction`): optional. Assigning one
  requires `patient.assignDoctor` (or admin) and a real `DoctorProfile`; it is
  created as the `PRIMARY_TREATING` relationship inline with the patient.
- **History view** (`AssignmentHistory` + detail page): all relationships ordered
  by `startDate desc`, with type, dates, and current-flag. Doctor labels are
  identity-gated (see §5).

Every mutation writes an audit row: `PATIENT_CREATED`, `PATIENT_UPDATED`,
`PATIENT_VIEWED`, `DPR_CREATED`, `DPR_ENDED`, `DPR_TRANSFERRED` (added to
`src/lib/audit/log.ts`). Audit metadata stores ids/flags only — **never PII**.

---

## 5. Privacy and de-identification in Phase 5

- **List** (`patients/page.tsx`): `name` is fetched only when `showSensitive`;
  de-identified viewers see `patientCode`, gender, an **age range** (`ageRange`,
  10-year buckets), and city, plus "Assigned"/"—" instead of the doctor's name.
- **Detail** (`[patientId]/page.tsx`): the Prisma `select` toggles every
  sensitive column (`name`, `dateOfBirth`, `phone`, `email`, `address`,
  emergency-contact fields, and the doctor's `user.name`) on `showSensitive`.
  De-identified viewers see the patient code as the heading and a
  "de-identified view" label; the emergency-contact section is omitted entirely;
  doctor history shows a neutral handle (`Doctor (specialization)` or
  `Doctor #n`) instead of the doctor's name.
- **Age range, not DOB/age**: `ageRange()` returns a coarse bucket for
  de-identified display; exact age and DOB are sensitive.
- **Patient code is sensitive**: random, not sequential, and excluded from
  Explore/AI by policy.
- **Audit metadata carries no PII**: only ids, relationship types, and booleans.

This is the same structural principle as Phase 4's `ExploreCaseIndex`: privacy is
a property of *what the query returns*, not of what the UI chooses to render.

---

## 6. Validation (Zod, server-side)

`src/lib/validation/patient.ts` defines all schemas; every action `safeParse`s
before any DB write and returns `fieldErrors` to the form:
- `createPatientSchema` / `updatePatientSchema` — shared `patientFields` (name
  required; gender enum default `UNSPECIFIED`; optional DOB/age/contact fields;
  email validated; empty strings normalized to `null` via `toPatientScalars`).
- `assignDoctorSchema` — `relationshipType` restricted to
  `ASSIGNABLE_RELATIONSHIP_TYPES`.
- `transferPatientSchema`, `endRelationshipSchema`.

`toPatientScalars` (`src/lib/patients/patient-data.ts`) maps validated input to
Patient columns: trims, nulls empties, parses `dateOfBirth`, lowercases `email`,
coerces `age`.

---

## 7. Files created / changed

| File | Purpose | What changed in Phase 5 |
|---|---|---|
| `src/lib/permissions/patient-access.ts` | Access helpers | **New** — `isRelatedToPatient`, `canAccessPatientsSection`, `canViewPatient`, `canViewSensitivePatient`, `canEditPatient`, `canManagePatientDoctors`, `patientListWhere` |
| `src/lib/validation/patient.ts` | Zod schemas | **New** — create/update/assign/transfer/end |
| `src/lib/patients/patient-code.ts` | Patient code | **New** — random unique `PT-XXXXXXXX` |
| `src/lib/patients/patient-data.ts` | Input → columns | **New** — `toPatientScalars` |
| `src/lib/patients/display.ts` | De-id display | **New** — `ageRange`, `toDateInput` |
| `src/lib/patients/doctors.ts` | Doctor options | **New** — `loadDoctorOptions` (DoctorProfile only) |
| `src/app/(dashboard)/patients/page.tsx` | List | **New** — scoped + PII-masked table |
| `src/app/(dashboard)/patients/new/page.tsx` | Create page | **New** |
| `src/app/(dashboard)/patients/actions.ts` | Create action | **New** — `createPatientAction` |
| `src/app/(dashboard)/patients/[patientId]/page.tsx` | Detail | **New** — PII-gated detail + assignment UI |
| `src/app/(dashboard)/patients/[patientId]/edit/page.tsx` | Edit page | **New** |
| `src/app/(dashboard)/patients/[patientId]/actions.ts` | Mutations | **New** — update/assign/transfer/end |
| `src/components/patients/*` | Forms/UI | **New** — `PatientFields`, `CreatePatientForm`, `EditPatientForm`, `AssignDoctorForm`, `TransferPatientForm`, `EndRelationshipButton`, `AssignmentHistory` |
| `src/lib/auth/current-user.ts` | Session user | Added `doctorProfileId` to `CurrentUser` |
| `src/lib/audit/log.ts` | Audit actions | Added `patient_created/updated/viewed`, `dpr_created/ended/transferred` |
| `src/app/(dashboard)/layout.tsx`, `src/components/layout/{AppShell,Sidebar}.tsx` | Nav | Patients nav gated by `canViewPatients`/`canAccessPatientsSection` |
| `prisma/**`, `src/**` clinical schema | — | **Unchanged** — no migration in Phase 5 |

---

## 8. Known limitation (design gap to revisit)

**Non-doctor staff cannot be granted patient-specific access.** "Related to a
patient" is defined only via `DoctorPatientRelationship`, which requires a
`DoctorProfile`. So a nurse/assistant/reception/records user (a `User` with
roles but no profile) is scoped to **no** patients unless they are admin.

Planned fix (later phase): a dedicated **`UserPatientAccess` / `PatientStaffAccess`**
model (user↔patient grants, with scope/expiry), and extend `patient-access.ts`
(`isRelatedToPatient`, `patientListWhere`) to consider it. Until then, only
admins and assigned doctors can access specific patients.

---

## 9. Commands to run

```
pnpm lint            # ✅ clean
pnpm typecheck       # ✅ clean
pnpm build           # ✅ success (all /patients routes present)
pnpm exec prisma migrate status   # ✅ 2 migrations, DB up to date (no Phase 5 migration)
```

All four were re-run on the final Phase 5 state and passed. `prisma migrate
status` reports the same 2 migrations as Phase 4 (`20260610000000_init_auth`,
`20260610010000_clinical_schema`) — Phase 5 added no migration.

---

## 10. Manual test checklist

Run against local PostgreSQL (`homeo_trust_dev`). Use the seeded admin plus a
doctor user (a `User` with a `DoctorProfile`) and a non-doctor staff user to
exercise the access matrix.

**Patient CRUD**
- [ ] Admin / `patient.create` user: **Create patient** (no initial doctor) →
      patient appears in the list with a `PT-` code.
- [ ] Create patient **with** an initial primary doctor → a `PRIMARY_TREATING`
      DPR row exists and shows in history; two audit rows (`patient_created`,
      `dpr_created`).
- [ ] **Edit** a patient → fields persist; `patient_updated` audit row written.

**Access / PII gating**
- [ ] **Admin** sees all patients, full PII, name/age/doctor name.
- [ ] **Related doctor with `patient.viewSensitive`** sees that patient's PII.
- [ ] **De-identified viewer** (`patient.viewDeidentified` only, or related
      without `viewSensitive`) sees code + gender + **age range** + city, no
      name/phone/email/DOB, no emergency contact, doctor shown as a neutral
      handle, "de-identified view" label.
- [ ] **Doctor NOT related** to a patient: that patient is absent from their list
      and opening its URL returns **404** (not 403).
- [ ] **Non-doctor non-admin**: Patients list is **empty**; nav still gated by
      `canAccessPatientsSection`.
- [ ] **Edit blocked** for a user who can't view sensitive PII (action returns the
      permission error even if the form is reached).

**Relationship lifecycle**
- [ ] **Assign** a second `PRIMARY_TREATING` while one is current → blocked with
      the "already has a current primary… use Transfer" message.
- [ ] **Assign** `CONSULTING`/`ASSISTING` → allowed alongside a primary.
- [ ] **Transfer** to a new doctor → old primary closed (`endDate` set,
      `isCurrentlyTreating=false`), new primary current; one row current at all
      times; `dpr_transferred` audit row.
- [ ] **Transfer to the same doctor** → rejected with field error.
- [ ] **Transfer with no current primary** → rejected ("use Assign instead").
- [ ] **End** a current relationship → soft-closed, still visible in history;
      ending an already-ended one → "already ended" error; `dpr_ended` audit row.

*(Automated checks in §9 were performed and passed. The browser-driven manual
checks above are for the developer to run against a live DB with seeded users;
they were not executed in the implementation session.)*

---

## 11. Problems faced and fixes

- **Editing PII you can't see**: an early cut allowed `canEditPatient` alone to
  permit writes. Fixed by requiring **both** `canEditPatient` AND
  `canViewSensitivePatient` in `updatePatientAction` — you can't blind-write
  hidden fields.
- **De-id leakage through the component**: fetching all columns and hiding them
  in JSX still pulled PII server-side. Fixed by driving the Prisma `select` from
  the access boolean so the column is never read for de-identified viewers.
- **Race on "one current primary"**: the app-level check has a TOCTOU window.
  Fixed by wrapping the `create` in try/catch and relying on the Phase 4 partial
  unique index as the hard backstop; transfer uses a transaction with
  close-before-create ordering so the index is never violated.
- **404 vs 403 for out-of-scope patients**: returning 403 confirms existence.
  `canViewPatient` failure calls `notFound()` instead.

---

## 12. What I should understand from this phase

- **Two-factor authorization for data access.** "Can do this kind of thing"
  (permission) and "is connected to this record" (relationship) are different
  questions; sensitive access needs both, with admin as the only bypass.
- **Enforce privacy at the data boundary.** Toggling the Prisma `select` by the
  access decision makes de-identification structural — the PII never enters the
  process for a de-identified viewer.
- **Model transitions as history.** Transfer = close one row + open another in a
  transaction, not an in-place update; the partial unique index keeps the
  invariant true at every instant.
- **Don't confirm what the user can't see.** `notFound()` over `403` avoids
  leaking the existence of out-of-scope patients.
- **Defense in depth.** App checks for UX + clear errors; DB constraints for the
  guarantee.

---

## 13. Resume / interview talking points

- Built **patient management with two-factor authorization** (permission **AND**
  `DoctorPatientRelationship`) for a privacy-sensitive medical app, enforced
  server-side in every page and server action.
- Made **de-identification structural**: the Prisma `select` is driven by the
  access decision, so a de-identified viewer's query never reads PII columns —
  no reliance on the UI to hide data.
- Implemented a **history-preserving doctor-patient lifecycle** (assign /
  transfer / end), with transfer as a close-old-then-create-new **transaction**
  that keeps a Postgres **partial unique index** ("one current primary doctor")
  satisfied at every instant.
- Returned **404 instead of 403** for out-of-scope patients to avoid confirming
  their existence, and required both edit + view-sensitive rights to write PII.
- Added **audit logging** for all patient and relationship mutations with
  **no PII** in audit metadata.

---

## 14. Next recommended phase

**Phase 6 — Case, Issue, Symptom, and Treatment workflow.** Phase 5 created and
secured the patient; Phase 6 records the clinical content on top of it: the
single `CaseRecord` per patient, multiple `PatientIssue`s with `PatientSymptom`s,
`TreatmentEntry` (combined prescription + follow-up) with treating/consulting
doctors via `TreatmentDoctorParticipant`, the `patientCondition`
(IMPROVED/SAME/WORSENED) trend, and a patient timeline. It reuses the Phase 5
access helpers (`canViewPatient`/`canEditPatient`/`canManagePatientDoctors`) so
clinical edits inherit the same permission-plus-relationship gating. Do **not**
start it until this Phase 5 commit is in.

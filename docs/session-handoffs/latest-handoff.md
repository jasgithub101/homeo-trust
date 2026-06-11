# Session Handoff — Homeo Trust

> Compact state snapshot for the next Claude Code session. Read this first, then
> `CLAUDE.md` and the phase reports in `docs/phase-reports/`.
> Last updated during Phase 7 (attachments) implementation. Phases 5.1 + 6 are
> committed and tested (commit `a6af2b4`).

## 1. Project status by phase
- **Phase 1 — Project setup**: ✅ committed.
- **Phase 2 — Auth & first admin**: ✅ committed.
- **Phase 3 — Dynamic roles & permissions**: ✅ committed.
- **Phase 4 — Core clinical schema**: ✅ committed.
- **Phase 5 — Patient management & doctor-patient relationships**: ✅ committed.
- **Phase 6 — Case/Issue/Symptom/Treatment workflow + timeline**: ✅ committed
  and tested (commit `a6af2b4`). Includes one additive migration
  (`20260611000000_clinical_soft_delete`), applied to the local DB.
- **Phase 5.1 — Patient scope permissions (breadth × depth)**: ✅ committed and
  tested (commit `a6af2b4`). Added `patient.viewAssigned` / `patient.viewAll`;
  made breadth and depth orthogonal. No schema migration (permissions are data);
  a **one-time** role backfill ran on the dev DB. See
  `docs/phase-reports/phase-5.1-patient-scope-permissions.md`.
- **Phase 7 — Attachments**: 🚧 in progress (this session).
- Phases 8–10 (Explore, AI, hardening): not started.

## 2. What Phase 6 implemented
- **CaseRecord**: view/create/edit, one per patient (DB unique + single upsert
  action). No delete.
- **PatientIssue / PatientSymptom**: create/edit/**archive** (soft-delete);
  symptoms nested under an issue.
- **TreatmentEntry**: create/edit/**archive**; all 4 entryTypes, optional issue
  link, prescription + follow-up fields, `patientCondition`,
  `improvementScore`, `nextFollowUpDate`.
- **TreatmentDoctorParticipant**: treating (≥1) + consulting doctors by
  **DoctorProfile.id**, written/replaced in a `$transaction`.
- **Patient timeline**: merged newest-first (creation, assignments, case, issues,
  symptoms, treatments, follow-ups) with a "show archived" toggle.
- **Clinical nav** tabs on the patient pages; **audit** for case/issue/symptom/
  treatment create/update/archive + `CASE_VIEWED`.

## 3. Soft-delete / archive design (Phase 6 decision)
- Clinical-history system → issues/symptoms/treatments are **archived, never
  physically deleted**: nullable `deletedAt`/`deletedByUserId`/`deletionReason`
  (+ `@@index([deletedAt])`) on `PatientIssue`/`PatientSymptom`/`TreatmentEntry`.
- Normal lists filter `deletedAt: null`; UI says **"Archive"** (keys/audit keep
  `*.delete` semantics). Archiving an issue does **not** cascade to its symptoms
  or alter linked treatments. **No restore** in Phase 6. `CaseRecord` is NOT
  soft-deletable (one per patient).
- `deletedByUserId` is a plain nullable id (no FK), matching `assignedByUserId`/
  `uploadedByUserId`. Audit metadata = ids/enums + `deletionReason` only (no PII,
  no clinical free text).

## 4. Database / migration status
- Local PostgreSQL `homeo_trust_dev` @ `localhost:5432`.
- `prisma migrate status`: **3 migrations, "Database schema is up to date."**
  (`20260610000000_init_auth`, `20260610010000_clinical_schema`,
  `20260611000000_clinical_soft_delete`).
- Migration flow: dev user lacks `CREATEDB`, so generate SQL with
  `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema
  prisma/schema.prisma --script` (read-only) and apply with `prisma migrate
  deploy` (no shadow DB). **Preserve the raw-SQL partial index
  `dpr_one_current_primary_per_patient`** in any future DPR migration.

## 5. Important architecture rules (unchanged from Phase 5)
- PostgreSQL + Prisma 7 (pg adapter, lazy client). Only `ADMIN` is a fixed role;
  all else is configurable roles+permissions. `User` = any staff; `DoctorProfile`
  is optional (clinical doctors only).
- **No `doctorId` ownership** on Patient/Case/Issue/Symptom/Treatment. Doctor
  involvement lives only in `DoctorPatientRelationship` (assignment history) and
  `TreatmentDoctorParticipant` (per-treatment), both linking to `DoctorProfile`.
- **Access = permission AND patient scope** (admin bypass). **Phase 5.1**: scope
  is now `isPatientInScope` — admin/`patient.viewAll` → any patient (no
  DoctorProfile needed); `patient.viewAssigned` → related only; else none.
  **Breadth** (`viewAssigned`/`viewAll`) and **depth** (`viewSensitive`/
  `viewDeidentified`) are orthogonal; a depth perm never grants row scope. Phase 6
  clinical helpers (`canViewCase`, `canCreateIssue`, `canAddTreatmentEntry`, …)
  layer their permission on `isPatientInScope` via `permittedAndRelated`.
  `patientListWhere` is breadth-based. Out-of-scope/archived → `notFound()`; every
  action re-checks ownership before writing. New roles must be granted a breadth
  permission explicitly (the backfill in `scripts/backfill-patient-view-assigned.ts`
  is one-time, NOT in seed.ts).
- **Doctor identity is PII-gated**: treatment views + timeline select `user.name`
  only when `canViewSensitivePatient`; else neutral handle (`participantLabels`,
  `buildTimeline`). Explore/AI still use de-identified `ExploreCaseIndex` (later).

## 6. Key Phase 6 files
- `src/lib/validation/clinical.ts`; `src/lib/clinical/{form-state,data,options,
  doctor-label,timeline}.ts`.
- `src/components/clinical/{fields,ClinicalNav,CaseRecordForm,IssueForm,
  IssueStatusBadge,SymptomForm,ArchiveButton,TreatmentEntryForm,TimelineView}.tsx`.
- Routes under `src/app/(dashboard)/patients/[patientId]/`: `case/**`,
  `issues/**` (+ `actions.ts`), `treatments/**` (+ `actions.ts`), `timeline/`,
  `case/actions.ts`. Patient detail page got the clinical nav.
- Edited: `patient-access.ts`, `audit/log.ts`, `prisma/schema.prisma`,
  migration `20260611000000_clinical_soft_delete`.

## 6a. Phase 7 — Attachments (implemented this session)
- **Storage port** (`src/lib/storage/{types,signing,local,s3,index}.ts`):
  backend-agnostic `StoragePort`; `LocalDiskStorage` (default, writes to
  gitignored non-public `var/attachments/`); `S3Storage` design stub; HMAC
  signed-URL tokens; no-op `scanOnUpload` virus-scan seam. Keys are opaque,
  server-generated: `patients/{patientId}/{attachmentId}/{blobId}`.
- **Permissions**: new BREADTH key `attachment.view` (list + non-sensitive
  download); existing `attachment.viewSensitive` is the DEPTH gate for sensitive
  bytes. Access = permission AND `isPatientInScope` (admin bypass). Helpers:
  `canUploadAttachment/canViewAttachment/canViewSensitiveAttachment/canDeleteAttachment`,
  `patientScopeLabel`. One-time backfill `scripts/backfill-attachment-view.ts`
  (NOT in seed.ts) granted `attachment.view` to the existing "Doctor" role.
- **Soft-delete**: migration `20260611010000_attachment_soft_delete` added
  `deletedAt`/`deletedByUserId`/`deletionReason` (+ index) to `PatientAttachment`.
  Archive hides the row, **retains the blob** (GC deferred). No restore.
- **Server action + route**: upload (`actions.ts`, Zod + scope + parent
  belongs-to-patient + not-archived → `storage.put` → row → audit; rollback blob
  on DB failure) and archive. Download route
  `attachments/[attachmentId]/download/route.ts` re-authorizes every GET,
  asserts `patientId` match (IDOR guard), 403s sensitive bytes without depth,
  streams (local) or 302s to a signed URL (s3). Audit = ids/enums/size/scope only.
- **UI**: `AttachmentsSection` + `AttachmentUploadForm` on case/issue/treatment
  detail pages; patient-level `/attachments` index + new ClinicalNav tab; reuses
  `ArchiveButton`. See `docs/phase-reports/phase-7-attachments.md`.

## 7. Current immediate task
- **Phase 7 manual testing + commit.** Code complete; lint/typecheck/build and
  `prisma migrate status` all pass (4 migrations, DB up to date). Run the manual
  checklist in the Phase 7 report, then commit Phase 7 (app code + migration +
  report/handoff/spec updates only — keep graphify/tooling artifacts and
  `.env.local` out of the commit). Housekeeping already committed as `6a5a042`.

## 8. Commands to verify
```
pnpm lint        # ✅ clean (re-run before commit)
pnpm typecheck   # ✅ clean
pnpm build       # ✅ success (all clinical routes present)
pnpm exec prisma migrate status   # ✅ 3 migrations, DB up to date
```
All four were run on the final Phase 6 state and passed.

## 9. What NOT to do next
- ❌ Do not implement Explore UI / AI / vector search (Phases 8–9).
- ❌ Do not add restore/un-archive yet (deferred).
- ❌ Do not hard-delete clinical rows — archive only.
- ❌ Do not run destructive DB resets (`prisma migrate reset`, `dropdb`).
- ❌ Do not add new hardcoded roles or weaken server-side permission checks.
- ❌ Do not bundle graphify/tooling artifacts or `.env.local` into the commit.

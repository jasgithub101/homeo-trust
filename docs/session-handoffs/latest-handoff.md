# Session Handoff — Homeo Trust

> Compact state snapshot for the next Claude Code session. Read this first, then
> `CLAUDE.md` and the phase reports in `docs/phase-reports/`.
> Last updated during Phase 8 (Explore) implementation. Phase 7 (attachments) is
> committed (commit `e7e7271`); Phase 8 is implemented and verified but **not yet
> committed** (awaiting approval).

> **⚠️ Explore mechanism refactored (post-Phase-8).** Explore no longer uses the
> materialized `ExploreCaseIndex` table or its projection/rebuild/refresh. It now
> reads a live de-identified Postgres **VIEW**, `explore_case_view` (Prisma model
> `ExploreCaseView`). Removed: `src/lib/explore/projection.ts`, `rebuild.ts`,
> `scripts/rebuild-explore-index.ts`, the Refresh action/button. Kept & re-pointed
> at the view: `query.ts` (allow-list select + N=5 suppression + bypass),
> `validation/explore.ts`, `explore-access.ts`, the `EXPLORE_SEARCHED` audit, the
> Explore UI. `anonymousCaseCode` is now an **ephemeral per-result label** (no
> stored code). Guarantee is now **"correct by view definition + query-only-the-
> view"** (slightly weaker than physical absence). The references below to
> `ExploreCaseIndex` / `projectPatient` / rebuild reflect the OLD design; treat
> `SECURITY_MODEL.md` + `AI_PRIVACY_MODEL.md` as current.

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
- **Phase 7 — Attachments**: ✅ committed (commit `e7e7271`).
- **Phase 8 — Explore (de-identified case explorer)**: ✅ implemented, verified,
  and committed (includes the `explore.bypassCohortMinimum` per-role cohort-floor
  bypass). One additive migration (`20260612000000_explore_index_facets`) applied
  to the dev DB. See `docs/phase-reports/phase-8-explore.md`.
- **Phase 9 — AI similarity assistant**: ⏸ **DEFERRED** (parked, not dropped —
  `ExploreCaseIndex` + `AISearchLog` remain so it can be revived; build the D5
  PII scrub first).
- **App display-name rename** → "Pujya Sai Master Homeo Vaidyalayam" / short "Sai
  Master Homeo" (`src/lib/branding.ts`): ✅ committed (`74bdd53`). Display strings
  only; internal "Homeo Trust" name unchanged.
- **Password features + email decouple** (not a numbered phase; no migration):
  ✅ implemented. Self change-password entry point + current-password
  re-verify + oracle rate-limit; admin reset (`user.update`, no self-reset,
  ADMIN-target needs admin, kills all target sessions, one-time temp-password
  display); static no-enumeration `/forgot-password`; create-user decoupled from
  email (temp password shown on screen, SMTP-gated best-effort send). Security
  reasoning recorded in `SECURITY_MODEL.md` §3.1. **Browser click-through of the
  security flows still pending** (can't drive request-scoped actions headlessly).
- **Phase 10 — Security, testing, polish**: next active phase, not started.
  Pending lightweight trims: remove the now-best-effort mailer dependency
  (`src/lib/mail/*`, only referenced by `users/new/actions.ts`); the queued dev
  display-rename is separate.

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
- `prisma migrate status`: **5 migrations, "Database schema is up to date."**
  (`20260610000000_init_auth`, `20260610010000_clinical_schema`,
  `20260611000000_clinical_soft_delete`, `20260611010000_attachment_soft_delete`,
  `20260612000000_explore_index_facets`).
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

## 6b. Phase 8 — Explore (implemented this session)
- **De-identification chokepoint** `src/lib/explore/projection.ts#projectPatient`
  (pure; imported by both the request layer and the node rebuild script) is the
  single source of truth. Coarsening (D1): age band, `caseMonth` YYYY-MM, city
  kept only when its cohort ≥ 5 (else state-only). `anonymousCaseCode` is CSPRNG
  (`node:crypto`), create-only (preserved across rebuilds), never derived from ids.
- **Writer**: `src/lib/explore/rebuild.ts` (only writer; takes the Prisma client
  as a param so the CLI and the admin refresh action share it). Upserts by
  `patientId`, deletes stale rows, excludes patients without a `CaseRecord` and
  archived issues/symptoms/treatments. `EXPLORE_MIN_COHORT = 5` in
  `src/lib/explore/constants.ts` (used for both city retention and query suppression).
- **Reader**: `src/lib/explore/query.ts` (only request-time reader). Explicit
  allow-list `select` (never `patientId`/`caseRecordId`/index id/timestamps) +
  server-enforced k-anonymity: cohort `< 5` → `{ status: "suppressed" }` (no rows,
  no count; 0 and 1–4 collapse to the same state).
- **Access** (D3): binary `admin || explore.view` (`src/lib/permissions/explore-access.ts`).
  No row scope, no depth escalation. Gates page (`notFound()`) + nav (`canUseExplore`).
  `explore.filter` folded in (D7). Audit `explore_searched` (filters/`resultCount`
  null-when-suppressed/`suppressed`/`cohortBypass`) + `explore_index_refreshed` (counts only).
- **Cohort-floor bypass** (D8): new permission `explore.bypassCohortMinimum`
  (`canBypassCohortMinimum` = `admin || granted`) lifts ONLY the read-time <5
  row/count suppression (`runExploreSearch(filters, { applySuppression })`).
  **Default-granted to Explore roles** via one-time `scripts/backfill-explore-bypass.ts`
  (NOT in seed.ts) → privacy floor is opt-IN per role. Never changes core
  de-identification (no raw tables, no PII fields, city still coarsened at projection).
- **D4 migration** `20260612000000_explore_index_facets`: additive columns
  `issueStatuses`/`treatmentTypes`/`potencies`/`caseMonth` + `caseMonth` index.
  No DPR touch. Applied with `migrate deploy`.
- **Sync** (D6): `scripts/rebuild-explore-index.ts` + admin "Refresh Explore
  index" action. No on-write hooks → documented staleness window.
- **Filters shipped**: gender/age/state/country/issue-status/treatment-type.
  Medicine/symptom/potency/exact-date deferred (facets exist in the index).
- **Residual risk (D5)**: summaries source only `title`/`symptomName`/`medicineName`,
  but k-anonymity does NOT scrub PII typed into them. Future fix: controlled
  vocab / PII scrub (not built). **Phase 9 AI consumes this same index.**
- One-time `scripts/backfill-explore-view.ts` (NOT in seed.ts) grants
  `explore.view` to existing Explore-holding non-admin roles.

## 7. Current immediate task
- **Phase 8 is committed.** Code complete and verified: lint (0 errors, 2 benign
  warnings) / typecheck / build pass; `prisma migrate status` = 5 migrations, DB
  up to date; seed (44 permissions) + both backfills + rebuild ran on dev data;
  de-identification, cohort suppression, and the bypass permission verified. Login
  confirmed working. The dev DB also carries a manual-test fixture from
  `scripts/seed-explore-testdata.ts` (4 test users/roles incl. one Explore role
  with the bypass and one without; 11 cohort-sized patients) — that script is dev
  test data, NOT committed.
- **Next active phase: Phase 10** (Security, Testing, and Polish). Phase 9 (AI) is
  deferred. Do NOT start the next phase without approval.

## 8. Commands to verify
```
pnpm lint        # ✅ clean (re-run before commit)
pnpm typecheck   # ✅ clean
pnpm build       # ✅ success (all clinical routes present)
pnpm exec prisma migrate status   # ✅ 3 migrations, DB up to date
```
All four were run on the final Phase 6 state and passed.

## 9a. Branch state + Windows self-host packaging (current)

**Branch promote (done):** `7a0f437` (Phase 10b — Explore free-text PII leak
closure + privilege-tier escalation guards) was fast-forward promoted
`dev → staging → production`. `origin/staging` and `origin/production` are both
at **`7a0f437`** (the verified security fix). `origin/main` untouched at
`9081ed2`.

**Packaging WIP (committed, dev only):** commit **`97cb5ba`** on `dev` adds the
platform-independent Windows self-host source — `scripts/package-windows.mjs`
(`--variant full|lite`), `packaging/windows/**` (setup/start/update/repair
`.bat`, `lib/ht.mjs` with `HT_DB_MODE` local-vs-remote, `README.txt` quick-start,
`SETUP_GUIDE.txt` customer guide for both DB modes), `prisma/schema.prisma`
`binaryTargets ["native","windows"]`, `.env.example` notes, `.gitignore`
(dist/vendor/*.zip/.env), and `esbuild` as a **devDependency** (build-host
bundler only). `dev` (`97cb5ba`) intentionally **leads** staging/production by
this one WIP commit.

> ⚠️ **NOT release-ready.** No zip was built and **no `.bat` or Neon flow has
> been executed or verified on Windows** — authored + sanity-checked on Linux/WSL
> only. Before any release, a **Windows x64 host** must: stage portable Node
> 20.18.1 (`vendor/node`, both variants) + EDB PostgreSQL 16 win-x64
> (`vendor/postgres`, full only); run `node scripts/package-windows.mjs --variant
> full` and `--variant lite`; then do the two-mode end-to-end verification
> (full → bundled-local DB incl. attachment upload/download + `update.bat`
> data/.env survival; lite → real NeonDB project incl. connection routing —
> `migrate deploy` on `DIRECT_URL`, app on pooled `DATABASE_URL`). Static
> connection-routing review already PASSES (`src/lib/db.ts` uses `DATABASE_URL`;
> shipped schema datasource uses `DIRECT_URL`; `DIRECT_URL` optional at runtime).

**Five adopted UX ease-improvements — to implement + verify on the Windows host
(NOT done yet):**
1. **One-run guided Neon setup** — when `setup.bat` (remote mode) finds no usable
   `DATABASE_URL`, create `.env` from the template, **auto-open it in Notepad and
   wait** (e.g. `start /wait notepad .env`), then continue once saved —
   collapsing today's two-run remote flow into one guided run.
2. **Validate the Neon strings before `migrate deploy`** — check the pooled host
   contains `-pooler`, the direct host does **not**, and both end with
   `?sslmode=require`; print a plain-language fix if not.
3. **Optional Desktop shortcut to `start.bat`** — offer on first setup so daily
   use is one obvious icon.
4. **`FIRST-LOGIN.txt`** — write the admin username + one-time temp password +
   `http://127.0.0.1:8787` to a file with a **"delete after first login"**
   warning, and **auto-remove it once the forced password change completes**.
   (Note the on-disk-password tradeoff: the temp password briefly sits in a
   plaintext file; mitigated by the auto-delete on first successful change.)
5. **`backup.bat`** — guided "close app, copy `data\` + `.env` to a chosen
   folder" one-click backup, matching SETUP_GUIDE.txt §6.

## 9. What NOT to do next
- ❌ Do not implement AI / vector search / embeddings / case-similarity (Phase 9),
  the D5 PII scrubber / controlled vocabulary, on-write Explore sync hooks, or
  GIN array indexes yet — all deferred.
- ❌ Do not read raw Patient/clinical tables from Explore, or select
  `patientId`/`caseRecordId` into any client payload — Explore reads only
  `ExploreCaseIndex` via the allow-list select.
- ❌ Do not add restore/un-archive yet (deferred).
- ❌ Do not hard-delete clinical rows — archive only.
- ❌ Do not run destructive DB resets (`prisma migrate reset`, `dropdb`).
- ❌ Do not add new hardcoded roles or weaken server-side permission checks.
- ❌ Do not bundle graphify/tooling artifacts or `.env.local` into the commit.

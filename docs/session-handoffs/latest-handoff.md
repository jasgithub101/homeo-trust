# Session Handoff — Homeo Trust

> Compact state snapshot for the next Claude Code session. Read this first, then
> `CLAUDE.md` and the phase reports in `docs/phase-reports/`.
> Last updated end of Phase 5 implementation (pre-commit).

## 1. Project status by phase
- **Phase 1 — Project setup**: ✅ committed.
- **Phase 2 — Auth & first admin**: ✅ committed.
- **Phase 3 — Dynamic roles & permissions**: ✅ committed.
- **Phase 4 — Core clinical schema**: ✅ committed.
- **Phase 5 — Patient management & doctor-patient relationships**: 🚧 **implemented,
  UNCOMMITTED**. Pending: Phase 5 report + manual testing + verification, then commit.
- Phases 6–10 (clinical workflow, attachments, Explore, AI, hardening): not started.

## 2. What is implemented (Phases 1–5)
- **P1**: Next.js 16 + TS + Tailwind 4, Prisma 7 (pg driver adapter), lazy env
  validation, app shell/layout.
- **P2**: Custom DB-backed opaque sessions (HMAC-stored tokens, idle+absolute
  expiry), argon2id passwords, forced first-login password change (no current
  password on forced flow), login/logout, login rate-limiting, audit logging,
  `proxy.ts` cookie gate + server-side guards.
- **P3**: Configurable roles/permissions admin UI — view/create/update/delete
  roles, category-grouped permission matrix, assign roles to users; **Create User**
  (any staff type) with optional roles and an **optional DoctorProfile** section;
  ADMIN/system-role protection, last-admin guard, anti-escalation, audits.
- **P4**: 10 clinical models + 7 enums (migration `20260610010000_clinical_schema`):
  Patient, CaseRecord, PatientIssue, PatientSymptom, DoctorPatientRelationship,
  TreatmentEntry, TreatmentDoctorParticipant, PatientAttachment, ExploreCaseIndex,
  AISearchLog. Constraints: one CaseRecord/patient; partial unique index
  `dpr_one_current_primary_per_patient`; no `doctorId` ownership columns.
- **P5**: Patient list (scoped + PII-masked), create patient (optional initial
  PRIMARY_TREATING doctor), patient detail (PII gated), edit patient, assign /
  transfer / end doctor-patient relationships with full history; `patient-access`
  permission helpers; audit logs for patient + relationship actions; Patients nav
  gated by access.

## 3. Committed vs uncommitted
- **Committed** (HEAD `9081ed2 feat: implement phase 4 clinical schema`): Phases 1–4.
- **Uncommitted (Phase 5 app code + docs)**:
  - New: `src/app/(dashboard)/patients/**`, `src/components/patients/**`,
    `src/lib/patients/**`, `src/lib/permissions/patient-access.ts`,
    `src/lib/validation/patient.ts`.
  - Modified: `src/lib/auth/current-user.ts` (adds `doctorProfileId`),
    `src/lib/audit/log.ts` (patient/dpr actions), `src/app/(dashboard)/layout.tsx`,
    `src/components/layout/{AppShell,Sidebar}.tsx` (Patients nav + `canViewPatients`).
  - Untracked doc: `docs/phase-reports/phase-4-clinical-schema.md` (Phase 4 report).
- **Also in the working tree (NOT Phase 5 — tooling; keep out of the Phase 5 commit)**:
  graphify artifacts (`graphify-out/`, `.claude/skills/graphify/`, `.graphifyignore`),
  `.claude/CLAUDE.md`/`settings.json`, and `CLAUDE.md`/`.gitignore` edits. Scope the
  Phase 5 commit to app code + Phase 5 docs.

## 4. Database / migration status
- Local PostgreSQL `homeo_trust_dev` @ `localhost:5432`.
- `prisma migrate status`: **2 migrations, "Database schema is up to date."**
  (`20260610000000_init_auth`, `20260610010000_clinical_schema`).
- **No Phase 5 migration** — Phase 5 is code-only; the schema already existed.
- Migration flow note: dev DB user lacks `CREATEDB`, so migrations use
  `prisma migrate diff --from-config-datasource` + `prisma migrate deploy` (no
  shadow DB). The partial index `dpr_one_current_primary_per_patient` is raw SQL
  in the clinical migration — **preserve it in any future DPR migration**.

## 5. Important architecture rules
- **Database**: PostgreSQL, **local for dev** (cloud-agnostic; no Supabase
  dependency). **ORM**: Prisma 7 with the `pg` driver adapter; client is lazy.
- **Roles**: only **`ADMIN`** is a fixed system role. All other access is
  **configurable roles + permissions** (DB rows). No hardcoded DOCTOR/NURSE/etc.
- **`User`** is the generic login/account for any staff type.
- **`DoctorProfile`** is **optional**, created only for actual clinical doctors.
- **`DoctorPatientRelationship`** holds the historical, time-based doctor↔patient
  assignment; **`TreatmentDoctorParticipant`** holds treating/consulting doctors
  per treatment. Both link to **`DoctorProfile`**, never generic `User`.
- **No `doctorId` ownership column** on Patient/CaseRecord/PatientIssue/
  PatientSymptom/TreatmentEntry — doctor involvement lives only in the two
  relationship tables.
- **Patient PII must be gated**: access = permissions **plus** relationship.
  Sensitive PII requires `patient.viewSensitive` AND (admin OR current/past
  `DoctorPatientRelationship`). Non-admins see only patients they're related to.
  Explore/AI must use the de-identified `ExploreCaseIndex`, never raw `Patient`.
- Always enforce authorization **server-side** (helpers), never UI hiding alone.

## 6. Known limitation (design gap to revisit)
- **Non-doctor staff cannot be granted patient-specific access.** "Related to a
  patient" is defined via `DoctorPatientRelationship`, which requires a
  `DoctorProfile`. So a nurse/assistant/reception/records user (a `User` with
  roles but no profile) is scoped to **no** patients unless they are admin.
- Fix later with a dedicated **`UserPatientAccess` / `PatientStaffAccess`** model
  (user↔patient grants, with scope/expiry), and extend `patient-access.ts`
  (`isRelatedToPatient`, `patientListWhere`) to consider it. Until then, only
  admins and assigned doctors can access specific patients.

## 7. Current immediate task
- **Phase 5 documentation + manual testing before commit.** Specifically:
  1. Run verification (section 8) and confirm green.
  2. Manually test the Phase 5 flows (create/list/detail/edit, assign/transfer/
     end, PII gating, scope) against local PostgreSQL.
  3. Write `docs/phase-reports/phase-5-patient-management.md` (same style as the
     Phase 2–4 reports).
  4. Commit Phase 5 (app code + Phase 5 docs only).

## 8. Commands to verify
```
pnpm lint
pnpm typecheck
pnpm build
pnpm exec prisma migrate status
```
(All should pass; migrate status should report the DB up to date with 2 migrations.)
Note: lint/typecheck/build have **not** been re-run on the final Phase 5 state in
this handoff — run them before committing.

## 9. Files changed recently (Phase 5)
- `src/lib/auth/current-user.ts` — `CurrentUser.doctorProfileId`.
- `src/lib/audit/log.ts` — `patient_created/updated/viewed`, `dpr_created/ended/transferred`.
- `src/lib/validation/patient.ts` — create/update/assign/transfer/end schemas.
- `src/lib/permissions/patient-access.ts` — `canViewSensitivePatient`,
  `canEditPatient`, `canManagePatientDoctors`, `canViewPatient`,
  `canAccessPatientsSection`, `isRelatedToPatient`, `patientListWhere`.
- `src/lib/patients/` — `patient-code.ts`, `patient-data.ts`, `display.ts`,
  `doctors.ts` (doctor-option helper).
- `src/app/(dashboard)/patients/` — `page.tsx` (list), `new/page.tsx`,
  `actions.ts` (createPatient), `[patientId]/page.tsx` (detail),
  `[patientId]/edit/page.tsx`, `[patientId]/actions.ts` (update/assign/transfer/end).
- `src/components/patients/` — `PatientFields`, `CreatePatientForm`,
  `EditPatientForm`, `AssignDoctorForm`, `TransferPatientForm`,
  `EndRelationshipButton`, `AssignmentHistory`.
- `src/app/(dashboard)/layout.tsx`, `src/components/layout/{AppShell,Sidebar}.tsx`
  — Patients nav gated by `canViewPatients`.

## 10. What NOT to do next
- ❌ Do **not** start Phase 6 until the Phase 5 report + manual testing + commit
  are complete.
- ❌ Do **not** implement attachments, Explore UI, or AI yet (Phases 7–9).
- ❌ Do **not** implement CaseRecord/Issue/Symptom/Treatment workflow yet (Phase 6).
- ❌ Do **not** run any destructive database reset (`prisma migrate reset`,
  `dropdb`) — they are also blocked by settings.
- ❌ Do **not** commit `.env.local` (gitignored) or any secrets.
- ❌ Do **not** bundle graphify/tooling artifacts into the Phase 5 commit.

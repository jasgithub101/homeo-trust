# Development Phases

> Source of truth: `docs/MASTER_SPEC.md`. This document holds the full phased
> build plan, coding rules, and the per-phase execution protocol. Functional
> scope is in `PRODUCT_SPEC.md`; entities in `DATA_MODEL.md`; access control in
> `SECURITY_MODEL.md`; Explore/AI privacy in `AI_PRIVACY_MODEL.md`.

## Coding Rules (apply to every phase)

- Never skip server-side authorization.
- Do not rely only on frontend hiding.
- Keep code clean, modular, and easy to extend.
- Use typed schemas and validation.
- Use reusable components.
- Avoid huge files.
- Explain important decisions before implementing.
- Do not make destructive database changes without confirmation.
- Prefer secure defaults.
- Do not overbuild future phases early.
- Keep each phase focused.

---

## Phase 1: Project Setup

Goals:

- Inspect current repository.
- Set up or verify Next.js + TypeScript.
- Set up Tailwind CSS.
- Set up basic app layout.
- Set up environment variable structure.
- Set up database connection foundation.
- Add basic folder structure.
- Do not implement the full app yet.

Out of scope:

- Auth
- Permissions
- Clinical schema
- Patient forms
- AI
- Explore
- Attachments

---

## Phase 2: Authentication and First Admin

Goals:

- Login/logout
- Secure session handling
- First admin seed
- Admin role seed
- Initial permissions seed
- First-login password change flow
- Admin can create doctor user
- Admin can send invite/temporary credentials by email

Database requirement: Phase 2 needs only a running **PostgreSQL** database
(local PostgreSQL for development, or any PostgreSQL host). No Supabase or other
specific provider is required. Migrations and seeding use `DIRECT_URL`; the app
runtime uses `DATABASE_URL` (see `.env.example`).

---

## Phase 3: Dynamic Permissions and Roles

Goals:

- Role table
- Permission table
- RolePermission table
- UserRole table
- Permission helpers
- Admin UI to manage roles
- Admin UI to assign permissions to roles
- Admin UI to assign roles to users
- Server-side permission checks

---

## Phase 4: Core Clinical Database Schema

Goals:

- DoctorProfile
- Patient
- CaseRecord with one case per patient
- PatientIssue
- PatientSymptom
- DoctorPatientRelationship
- TreatmentEntry
- TreatmentDoctorParticipant
- PatientAttachment
- AuditLog
- AISearchLog
- ExploreCaseIndex or de-identified case view
- Migrations and seed data

---

## Phase 5: Patient Management and Doctor-Patient Relationships

Goals:

- Create patient
- Assign doctor to patient
- Transfer patient to another doctor
- End treatment relationship
- Mark current treating doctor
- View patient assignment history
- Enforce access using `DoctorPatientRelationship` and permissions

---

## Phase 6: Case, Issue, Symptom, and Treatment Workflow

Goals:

- Create/edit one `CaseRecord` per patient
- Add multiple `PatientIssues`
- Add multiple `PatientSymptoms` under issues
- Add `TreatmentEntry` with medicine/follow-up fields
- Add treating and consulting doctors through `TreatmentDoctorParticipant`
- Track `patientCondition`: `IMPROVED`, `SAME`, `WORSENED`
- Patient timeline view

---

## Phase 7: Attachments

Goals:

- Upload issue photos
- Upload reports
- Link attachments to patient/issue/case/treatment
- Private storage
- Signed URL access
- Attachment permissions
- Attachment audit logs

---

## Phase 8: Explore Page

Goals:

- Build de-identified `ExploreCaseIndex`
- Doctors can browse de-identified records
- Add filters:
  - City
  - State
  - Country
  - Age range
  - Gender
  - Issue
  - Symptom
  - Medicine
  - Potency
  - Patient condition
  - Date range
- Never expose PII
- Never expose raw attachments
- Audit Explore searches

---

## Phase 9: AI Similarity Assistant

Goals:

- Use de-identified case dataset only
- Add embeddings/vector search if appropriate
- Build AI retrieval endpoint
- Build doctor UI for entering case description
- Return privacy-safe historical insights
- Add PII filtering
- Add AI search logs
- Ensure AI never accesses raw patient PII

---

## Phase 10: Security, Testing, and Polish

Goals:

- Permission tests
- Patient access tests
- Doctor transfer tests
- Explore privacy tests
- AI privacy tests
- Attachment access tests
- Error handling
- Loading states
- Empty states
- Production-readiness review

---

## Phase Execution Protocol

When **starting** a phase:

1. Read `CLAUDE.md`.
2. Read the phase-specific docs needed for that phase.
3. Do not load unnecessary docs unless needed.
4. Inspect the existing repository.
5. Propose a phase-specific implementation plan.
6. List files to create/edit.
7. Identify security/privacy risks.
8. Wait for approval before large structural changes.

When **finishing** a phase:

1. Summarize what changed.
2. List files created/edited.
3. List commands to run.
4. List manual tests.
5. Mention known limitations.
6. Recommend the next phase.

Do not start the next phase without approval.

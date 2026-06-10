# Product Spec

> Source of truth: `docs/MASTER_SPEC.md`. This document expands the product/
> functional scope. Data models live in `DATA_MODEL.md`, access control in
> `SECURITY_MODEL.md`, Explore/AI privacy in `AI_PRIVACY_MODEL.md`, and the
> phased build plan in `PHASES.md`.

## 1. Project Overview

Build a production-grade web application for a Homeopathy Trust.

The app is for doctors to record and manage:

- Patient details
- Patient issues/complaints
- Symptoms
- Case records
- Medications
- Follow-ups
- Issue photos
- Medical reports
- Emergency contacts
- Treatment history
- Improvement over time

The system must be:

- Secure
- Privacy-focused
- Permission-based
- Audit-friendly
- Built iteratively phase by phase
- Designed for sensitive medical/patient data

Important development rule: **do not build the full app at once. Work one phase
at a time.**

## 2. Preferred Tech Stack

- Frontend: Next.js with TypeScript
- Styling: Tailwind CSS
- Backend: Next.js Server Actions and/or API routes
- Database: **PostgreSQL**. Local PostgreSQL is the development database; any
  PostgreSQL host may be used in production. The app is cloud-agnostic and does
  not depend on a specific provider.
- ORM/query layer: **Prisma** (chosen). Prisma was selected because this app
  has a relationship-heavy schema, benefits from typed migrations, and gains
  from schema-first clarity.
- Validation: Zod or equivalent
- Authentication: secure email/password login
- File storage: private storage for reports/photos (e.g. S3-compatible object
  storage). Supabase Storage is one optional hosted choice, not a requirement.
- AI: privacy-safe LLM-based case similarity/search assistant
- Optional vector search: pgvector (PostgreSQL extension) or another suitable
  approach. Supabase Vector is one optional hosted choice, not a requirement.
- Package manager: pnpm

### Database & environment (development)

- The development database is **local PostgreSQL** (e.g. running in WSL). No
  hosted provider is required to develop or run any phase.
- `DATABASE_URL` is the connection the app uses at runtime; `DIRECT_URL` is the
  direct (non-pooled) connection used by Prisma migrations and seeding. In
  development both point at the same local database. In production with a
  connection pooler they may differ.
- Example local development values:

  ```
  DATABASE_URL="postgresql://homeo_user:homeo_dev_password@localhost:5432/homeo_trust_dev"
  DIRECT_URL="postgresql://homeo_user:homeo_dev_password@localhost:5432/homeo_trust_dev"
  ```

See `.env.example` for the full list of environment variables.

## 3. Core System Concept

The system supports **multiple kinds of users/staff** — clinical doctors,
nurses, assistants, reception/front-desk, case reviewers, records staff, etc. A
**User** is anyone who can log in. What a user can do is controlled entirely by
**configurable roles and permissions**, not by their job title.

- **User** — anyone who can log in.
- **Role** — a configurable access package assigned to users.
- **Permission** — a specific allowed action.
- **DoctorProfile** — an **optional** profile created only for users who are
  actually clinical doctors. Non-doctor users do not have one.

"Doctor", "nurse", "assistant", etc. are **not** hardcoded authorization roles
and there are no fixed role enums. A nurse or assistant gains access through
assigned roles/permissions, but is **not** a treating/consulting doctor unless a
`DoctorProfile` exists. Clinical doctor links (`DoctorPatientRelationship`,
`TreatmentDoctorParticipant`) reference `DoctorProfile` only.

There is only one initial fixed system role: **`ADMIN`**. Admin has super access.
One admin can create another admin.

Beyond the initial Admin role, the system must support configurable roles and
permissions.

Do **not** use fixed roles like:

- `DOCTOR`
- `REGIONAL_HEAD`

Any future supervisory, regional, senior-doctor, or hierarchy-based access must
be created using configurable roles, permissions, and relationship/assignment
models — **not** hardcoded role enums. (See `SECURITY_MODEL.md`.)

## 4. User Onboarding

- Every doctor has a login.
- Admin creates a username and temporary password for a new doctor.
- Login details are sent to the doctor by email.
- On first login, the doctor must be forced to set a new password.

Preferred approach:

- Use a secure one-time invite link if possible.

Alternative approach:

- Use a temporary password.
- Store `mustChangePassword = true`.
- Force password change immediately after first login.

Additional rules:

- Admin can deactivate users.
- Admin can create another admin.
- The system must protect against accidentally deleting or deactivating the
  **last admin**.

## 5. Admin Dashboard

The admin dashboard should support:

- Manage users/doctors
- Create doctor login
- Send login email/invite
- Force password reset
- Manage roles
- Manage permissions
- Assign roles to users
- Manage doctor-patient relationships
- Transfer patients between doctors
- View all patients
- View all case records
- View all treatment entries
- View audit logs
- View AI logs

## 6. Doctor Dashboard

The doctor dashboard should support:

- My assigned/current patients
- Past patients if allowed
- Add patient if permission allows
- Patient case record
- Patient issues
- Patient symptoms
- Treatment entries
- Attach photos/reports
- AI case assistant
- Explore page

## 7. Patient Workflow

1. Admin or authorized doctor creates patients.
2. `DoctorPatientRelationship` is created to assign treating doctors.
3. The patient has exactly one `CaseRecord`.
4. Doctor adds multiple `PatientIssues`.
5. Doctor adds multiple `PatientSymptoms` under each issue.
6. Doctor adds `TreatmentEntry` for prescription/follow-up/note.
7. `TreatmentEntry` is linked to treating/consulting doctors via
   `TreatmentDoctorParticipant`.
8. Doctor records `patientCondition` as `IMPROVED`, `SAME`, or `WORSENED` when
   applicable.
9. Patient timeline shows:
   - Patient creation
   - Doctor assignment history
   - Case record
   - Issues
   - Symptoms
   - Treatments
   - Follow-ups
   - Attachments
   - Improvement trends

## 8. Forms and Validation

- Use typed validation, preferably Zod.
- Validate all inputs server-side.
- Use clean form UI.
- Provide good error messages.
- Provide loading states.
- Provide empty states.
- Avoid huge forms where possible.
- Split large workflows into sections.

## 9. Development Approach

Do not build everything at once. Work iteratively. Before making changes:

1. Inspect the existing repository structure.
2. Propose the implementation plan.
3. Explain important decisions.
4. Ask for approval when the change is large or structural.

After each phase, summarize: what changed, files created/edited, what should be
tested manually, and the next recommended phase. The full phase plan and coding
rules are in `PHASES.md`.

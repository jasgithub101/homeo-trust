# Homeo Trust Web Application — Master Specification

## 1. Project Overview

Build a production-grade web application for a Homeopathy Trust.

The app is for doctors to record and manage:

* Patient details
* Patient issues/complaints
* Symptoms
* Case records
* Medications
* Follow-ups
* Issue photos
* Medical reports
* Emergency contacts
* Treatment history
* Improvement over time

The system must be:

* Secure
* Privacy-focused
* Permission-based
* Audit-friendly
* Built iteratively phase by phase
* Designed for sensitive medical/patient data

Important development rule:

Do not build the full app at once. Work one phase at a time.

---

## 2. Preferred Tech Stack

* Frontend: Next.js with TypeScript
* Styling: Tailwind CSS
* Backend: Next.js Server Actions and/or API routes
* Database: **PostgreSQL**. Local PostgreSQL is the development database; any
  PostgreSQL host may be used in production. The app is cloud-agnostic and does
  not depend on a specific provider.
* ORM/query layer: **Prisma** (chosen). Prisma was selected because this app
  has a relationship-heavy schema, benefits from typed migrations, and gains
  from schema-first clarity.
* Validation: Zod or equivalent
* Authentication: secure email/password login
* File storage: private storage for reports/photos (e.g. S3-compatible object
  storage). Supabase Storage is one optional hosted choice, not a requirement.
* AI: privacy-safe LLM-based case similarity/search assistant
* Optional vector search: pgvector (PostgreSQL extension) or another suitable
  approach. Supabase Vector is one optional hosted choice, not a requirement.
* Package manager: pnpm

---

## 3. Core System Concept

Everyone using the clinical side of the system is a doctor.

There is only one initial fixed system role:

* `ADMIN`

Admin has super access. One admin can create another admin.

Beyond the initial Admin role, the system must support configurable roles and permissions.

Do not use fixed roles like:

* `DOCTOR`
* `REGIONAL_HEAD`

Any future supervisory, regional, senior-doctor, or hierarchy-based access should be created using configurable roles, permissions, and relationship/assignment models, not hardcoded role enums.

---

## 4. Permission-Based Access Model

The system should use a policy/permission-based access model.

Admin can:

* Create roles
* Create permissions
* Assign permissions to roles
* Assign roles to users
* Assign one or more roles to a user
* Create another admin
* Deactivate users
* Manage doctor-patient relationships
* Manage system permissions
* View audit logs

Permissions decide what a user can do.

Do not hardcode regional-head logic.

Do not create a `REGIONAL_HEAD` role.

A future senior doctor or supervisory doctor should be represented through configured permissions and relationships, not through fixed system roles.

---

## 5. User Onboarding

Every doctor has a login.

Admin creates a username and temporary password for a new doctor.

Login details are sent to the doctor by email.

On first login, the doctor must be forced to set a new password.

Preferred approach:

* Use a secure one-time invite link if possible

Alternative approach:

* Use a temporary password
* Store `mustChangePassword = true`
* Force password change immediately after first login

Admin can deactivate users.

Admin can create another admin.

The system must protect against accidentally deleting or deactivating the last admin.

---

## 6. Main Access-Control Data Models

### User

Fields:

* `id`
* `name`
* `email`
* `username`
* `passwordHash` or `authProviderReference`
* `phone`
* `active` boolean
* `mustChangePassword` boolean
* `createdByUserId` nullable
* `createdAt`
* `updatedAt`

Notes:

* Users may be doctors, admins, or both depending on assigned roles/permissions.
* Clinical users should have a related `DoctorProfile`.

---

### DoctorProfile

Fields:

* `id`
* `userId`
* `qualification`
* `registrationNumber` optional
* `specialization` optional
* `notes` optional
* `createdAt`
* `updatedAt`

Notes:

* Every clinical doctor should have a `DoctorProfile`.
* Do not create special regional-head profiles.

---

### Role

Fields:

* `id`
* `name`
* `description`
* `isSystemRole` boolean
* `createdAt`
* `updatedAt`

---

### Permission

Fields:

* `id`
* `key`
* `label`
* `description`
* `category`
* `createdAt`
* `updatedAt`

---

### RolePermission

Fields:

* `id`
* `roleId`
* `permissionId`
* `createdAt`

---

### UserRole

Fields:

* `id`
* `userId`
* `roleId`
* `assignedByUserId`
* `createdAt`

---

## 7. Initial System Role

### ADMIN

The initial `ADMIN` system role:

* Has all permissions
* Can create users
* Can create doctors
* Can create roles
* Can create permissions
* Can assign roles
* Can assign permissions
* Can create patients
* Can create cases
* Can create treatments
* Can upload/manage attachments
* Can view audit logs
* Can view AI logs
* Can manage Explore records
* Can create another admin
* Must be protected from accidental deletion or lockout

---

## 8. Example Permissions

Initial permission keys may include:

### User and Role Management

* `user.create`
* `user.update`
* `user.deactivate`
* `user.assignRole`
* `role.create`
* `role.update`
* `role.delete`
* `permission.assign`

### Patient

Patient access uses two orthogonal axes (see `SECURITY_MODEL.md`): **breadth**
(`patient.viewAssigned` = related patients only; `patient.viewAll` = all
patients, works without a `DoctorProfile`) and **depth**
(`patient.viewSensitive` = full PII; `patient.viewDeidentified` = masked). A
depth permission never grants row scope; a breadth permission never reveals PII.
Admin bypasses both.

* `patient.create`
* `patient.viewAssigned`
* `patient.viewAll`
* `patient.viewSensitive`
* `patient.viewDeidentified`
* `patient.update`
* `patient.delete`
* `patient.assignDoctor`

### Case

* `case.create`
* `case.view`
* `case.update`
* `case.delete`

### Issue

* `issue.create`
* `issue.view`
* `issue.update`
* `issue.delete`

### Symptom

* `symptom.create`
* `symptom.view`
* `symptom.update`
* `symptom.delete`

### Treatment

* `treatment.create`
* `treatment.view`
* `treatment.update`
* `treatment.delete`

### Attachments

Breadth × depth (see `SECURITY_MODEL.md`): `attachment.view` lists metadata and
downloads non-sensitive files; `attachment.viewSensitive` additionally unlocks
the bytes of files marked sensitive. Both require the patient to be in scope;
admin bypasses. Attachments are private by default and only reachable via the
authenticated download route (never a public URL, never via Explore/AI).

* `attachment.upload`
* `attachment.view`
* `attachment.viewSensitive`
* `attachment.delete` — archive (soft-delete); blob retained.

### Explore

* `explore.view`
* `explore.filter`
* `explore.viewDoctorName` — future explicit permission allowing doctor names to
  be shown in Explore. Doctor names stay hidden unless a user holds this.

### AI

* `ai.use`
* `ai.viewLogs`

### Audit

* `audit.view`
* `audit.export`

---

## 9. Important Data-Modeling Rule

Do not store `doctorId` directly as an ownership attribute in:

* `Patient`
* `CaseRecord`
* `PatientIssue`
* `PatientSymptom`
* `TreatmentEntry`

Reason:

The doctor treating a patient can change midway through treatment. Patient-doctor relationships must be historical and time-based.

Use a relationship table between doctors and patients.

---

## 10. Doctor-Patient Relationship

### DoctorPatientRelationship

Fields:

* `id`
* `patientId`
* `doctorProfileId`
* `relationshipType` enum/string

  * Examples:

    * `PRIMARY_TREATING`
    * `CONSULTING`
    * `ASSISTING`
    * `TRANSFERRED_FROM`
    * `TRANSFERRED_TO`
* `startDate`
* `endDate` nullable
* `isCurrentlyTreating` boolean
* `notes` optional
* `assignedByUserId`
* `createdAt`
* `updatedAt`

Rules:

* A patient can have multiple doctors over time.
* A patient can have one current primary treating doctor at a time unless explicitly allowed later. Enforce this with a database constraint where possible (e.g. a partial unique index on the current primary relationship), plus app-level validation.
* Past doctors should remain in history.
* Treatment history must not break when a doctor changes.
* Access to full sensitive patient data should be based on permissions plus `DoctorPatientRelationship` rules.
* Admin can manage doctor-patient relationships.
* Authorized users can transfer patients from one doctor to another by ending the old relationship and creating a new one.

---

## 11. Patient Model

### Patient

Fields:

* `id`
* `patientCode` or generated display identifier
* `name`
* `dateOfBirth` nullable — store when available.
* `age` — store only when `dateOfBirth` is unavailable or approximate.
* `gender`
* `phone` optional
* `email` optional
* `address` optional
* `city` optional
* `state` optional
* `country` optional
* `occupation`
* `emergencyContactName` optional
* `emergencyContactRelation` optional
* `emergencyContactPhone` optional
* `emergencyContactAddress` optional
* `createdAt`
* `updatedAt`

Privacy note:

The following are sensitive personally identifiable information:

* Patient name
* Phone number
* Email
* Exact address
* Emergency contact details
* Exact identifiers

These must not appear in Explore or AI outputs.

Age handling: Explore must expose `ageRange`, never the exact `dateOfBirth`.

---

## 12. Case Record

Each patient has only one case record.

### CaseRecord

Fields:

* `id`
* `patientId` unique
* `chiefComplaint`
* `caseDescription`
* `medicalHistory` optional
* `familyHistory` optional
* `physicalGenerals` optional
* `mentalGenerals` optional
* `modalities` optional
* `diagnosisNotes` optional
* `repertoryNotes` optional
* `createdAt`
* `updatedAt`

Rules:

* Do not put `doctorId` in `CaseRecord`.
* `CaseRecord` belongs to `Patient`.
* Access is determined through patient permissions and `DoctorPatientRelationship`.

---

## 13. Patient Issues

A patient can have multiple issues or complaints.

Each issue can have multiple symptoms.

Medication/treatment entries can correspond to specific issues and symptoms.

### PatientIssue

Fields:

* `id`
* `patientId`
* `title`
* `description`
* `onsetDate` optional
* `status` enum/string

  * Examples:

    * `ACTIVE`
    * `RESOLVED`
    * `CHRONIC`
    * `RECURRING`
* `createdAt`
* `updatedAt`

---

## 14. Patient Symptoms

### PatientSymptom

Fields:

* `id`
* `patientIssueId`
* `symptomName`
* `description` optional
* `severity` optional, for example `1-10`
* `duration` optional
* `modalities` optional
* `triggers` optional
* `location` optional
* `createdAt`
* `updatedAt`

---

## 15. Treatment Table

Prescription and follow-up should be combined into one table.

### TreatmentEntry

Fields:

* `id`
* `patientId`
* `caseRecordId`
* `patientIssueId` nullable
* `treatmentDate`
* `entryType` enum/string

  * Examples:

    * `PRESCRIPTION`
    * `FOLLOW_UP`
    * `PRESCRIPTION_AND_FOLLOW_UP`
    * `NOTE`
* `medicineName` nullable
* `potency` nullable
* `dosage` nullable
* `frequency` nullable
* `duration` nullable
* `instructions` nullable
* `followUpNotes` nullable
* `symptomChanges` nullable
* `patientCondition` optional enum

  * Allowed values:

    * `IMPROVED`
    * `SAME`
    * `WORSENED`
* `improvementScore` optional, for example `1-10`
* `nextFollowUpDate` optional
* `createdAt`
* `updatedAt`

Rules:

* Do not use `TreatmentEntry` for patient ownership.
* `TreatmentEntry` records clinical actions and progress.
* A `TreatmentEntry` may be linked to a `PatientIssue`.
* A `TreatmentEntry` may involve treating and consulting doctors.
* `patientCondition` is optional and must allow only:

  * `IMPROVED`
  * `SAME`
  * `WORSENED`

---

## 16. Treatment Doctor Participants

Use a relationship table to link treatment entries to treating and consulting doctors.

### TreatmentDoctorParticipant

Fields:

* `id`
* `treatmentEntryId`
* `doctorProfileId`
* `participantType` enum/string

  * Examples:

    * `TREATING_DOCTOR`
    * `CONSULTING_DOCTOR`
* `createdAt`

Rules:

* A `TreatmentEntry` can have one or more treating doctors.
* A `TreatmentEntry` can have zero or more consulting doctors.
* This preserves history when doctors change.
* Do not store one direct `doctorId` on `TreatmentEntry`.

---

## 17. Patient Photos and Reports

Patients can have:

* Issue photos
* Medical reports
* Scan reports
* Prescription images
* Other attachments

### PatientAttachment

Fields:

* `id`
* `patientId`
* `patientIssueId` nullable
* `caseRecordId` nullable
* `treatmentEntryId` nullable
* `uploadedByUserId`
* `fileType` enum/string

  * Examples:

    * `ISSUE_PHOTO`
    * `LAB_REPORT`
    * `SCAN_REPORT`
    * `PRESCRIPTION_IMAGE`
    * `OTHER`
* `fileName`
* `storagePath` (preferred) or `fileUrl` — prefer `storagePath` over a public
  `fileUrl` because files are private and served through signed URLs.
* `mimeType`
* `sizeBytes`
* `description` optional
* `isSensitive` boolean default `true`
* `createdAt`
* `updatedAt`

Attachment privacy:

* Attachments may contain PII.
* Do not expose raw attachments on Explore pages.
* Only users with correct permissions can view sensitive attachments.
* Store reports/photos in private storage buckets.
* Use signed URLs for authorized access.
* Audit log attachment views/downloads.

---

## 18. Combined Clinical Behavior

The clinical structure should behave like this:

* A patient has one `CaseRecord`.
* A patient has many `PatientIssues`.
* Each `PatientIssue` can have many `PatientSymptoms`.
* A `TreatmentEntry` can be associated with a specific `PatientIssue`.
* Medicines can correspond to the issue/symptoms being treated.
* Follow-up observations and patient condition are stored in `TreatmentEntry`.
* Treating and consulting doctors are linked through `TreatmentDoctorParticipant`.
* Doctor-patient assignment is tracked through `DoctorPatientRelationship`.

---

## 19. Explore Page

There must be an Explore page where records are available to doctors in a privacy-safe way.

### Explore Requirements

Users with `explore.view` permission can access it.

Doctors can browse de-identified records from across the whole system.

Sensitive patient data must be hidden.

Doctors should be able to filter records.

Example filters:

* City, for example New York
* State
* Country
* Age range
* Gender
* Issue/complaint
* Symptoms
* Medicine
* Potency
* Patient condition:

  * `IMPROVED`
  * `SAME`
  * `WORSENED`
* Date range
* Issue status
* Treatment type

---

## 20. Explore Privacy Requirements

Explore must not show:

* Patient name
* Phone
* Email
* Exact address
* Emergency contact details
* Exact patient ID
* Doctor name unless explicitly permitted via the `explore.viewDoctorName`
  permission
* Raw reports or photos

Explore may show:

* De-identified clinical information
* Masked clinical information
* Age range
* Gender
* Broad location if safe
* Issue summary
* Symptom summary
* Medicine summary
* Patient condition summary
* Improvement trend

Location filters can use city/state/country, but exact address must stay hidden.

If a location is too specific and could identify a patient, show a broader location instead.

Use generated anonymous labels such as:

* `Case A`
* `Case B`
* `Case C`
* anonymized display codes
* masked information

---

## 21. Recommended Explore Dataset

Create a de-identified view/table such as `ExploreCaseIndex`.

### ExploreCaseIndex

Fields:

* `id`
* `patientId` internal only, not shown in UI
* `caseRecordId` internal only, not shown in UI
* `anonymousCaseCode`
* `ageRange`
* `gender`
* `city` nullable
* `state` nullable
* `country` nullable
* `issueSummaries`
* `symptomSummaries`
* `medicineSummaries`
* `patientConditionSummary`
* `improvementTrend`
* `createdAt`
* `updatedAt`

Rules:

* Explore UI must read from the de-identified dataset, not raw `Patient` tables.
* Internal IDs should not be exposed to the frontend unless required and safe.
* Build filters against de-identified fields.

---

## 22. AI Feature

When a doctor enters a new case description, the AI should check historical cases across the whole database and return privacy-safe insights about similar cases.

The AI should help answer:

* What similar cases were found?
* What symptoms and patterns appeared?
* What medication was given?
* What potency/dosage pattern was used, if available?
* How did patients improve over time?
* How long did improvement take?
* Were there repeated medicine patterns across similar cases?
* What follow-up trends were seen?

---

## 23. Critical AI Privacy Requirements

The AI may search across the entire database.

The AI must use only de-identified data.

AI must not access raw PII tables directly.

AI must never reveal:

* Patient name
* Phone number
* Email
* Exact address
* Emergency contact
* Exact patient ID
* Exact case ID
* Doctor name
* Uploaded raw reports/photos
* Anything that can identify a patient

AI may reveal:

* Approximate age or age range
* Gender
* City/state/country if not too identifying
* Symptoms
* Issue summary
* Modalities
* Medicine prescribed
* Potency
* Dosage/frequency pattern
* Patient condition trend
* Improvement trend
* Time taken for improvement

Prefer aggregated summaries.

If showing examples, label them as:

* `Case A`
* `Case B`
* `Case C`

AI output must include this disclaimer or an equivalent warning:

> AI output is historical decision support only and does not prescribe or replace doctor judgment.

---

## 24. AI Architecture

Create a de-identified searchable case dataset.

Store embeddings only for de-identified case text.

The retrieval layer should search only the de-identified case/explore index.

Add a PII/privacy filter after AI generation.

Log every AI query.

### AISearchLog

Fields:

* `id`
* `requestingUserId`
* `deidentifiedQueryText`
* `deidentifiedResponse`
* `metadata` JSON optional
* `createdAt`

---

## 25. Audit Logging

Add audit logging for sensitive actions.

### AuditLog

Fields:

* `id`
* `actorUserId`
* `action`
* `entityType`
* `entityId`
* `metadata` JSON
* `createdAt`

Audit these actions:

* Login
* Failed login
* Password changed
* User created
* User deactivated
* Role assigned
* Permission changed
* Patient viewed
* Patient created
* Patient updated
* Case viewed
* Case updated
* Issue created
* Issue updated
* Issue deleted
* Symptom created
* Symptom updated
* Symptom deleted
* Treatment entry created
* Treatment entry updated
* Treatment entry deleted
* Attachment uploaded
* Attachment viewed
* Attachment downloaded
* Attachment deleted
* Doctor-patient relationship created
* Doctor-patient relationship ended
* Doctor-patient relationship transferred
* Explore searched
* AI search used

---

## 26. Authorization Helpers

Implement reusable server-side authorization helpers.

### requireUser()

Ensures user is logged in.

### requirePermission(permissionKey)

Ensures current user has permission.

### hasPermission(userId, permissionKey)

Returns boolean.

### requireAdminAccess()

Checks whether user has admin/super permissions.

### canViewSensitivePatient(user, patientId)

Returns true if user has `patient.viewSensitive` and is allowed by relationship rules, or user has admin-level access.

### canViewDeidentifiedRecords(user)

Returns true if user has `explore.view`.

### canEditPatient(user, patientId)

Returns true if user has `patient.update` and relationship/admin access.

### canCreateCase(user, patientId)

Returns true if user has `case.create` and relationship/admin access.

### canDeleteCase(user, patientId)

Returns true only if user has `case.delete` or admin-level permission.

### canAddTreatmentEntry(user, patientId)

Returns true if user has `treatment.create` and relationship/admin access.

### canViewAttachment(user, attachmentId)

Returns true only if user has `attachment.viewSensitive` and relationship/admin access.

Important authorization rules:

* Every sensitive server action must call permission helpers.
* Never rely only on hiding UI buttons.
* Frontend permissions are only for UX.
* Backend permissions are mandatory.
* Every database query returning sensitive data must pass through authorization checks.

---

## 27. Admin Dashboard

Admin dashboard should support:

* Manage users/doctors
* Create doctor login
* Send login email/invite
* Force password reset
* Manage roles
* Manage permissions
* Assign roles to users
* Manage doctor-patient relationships
* Transfer patients between doctors
* View all patients
* View all case records
* View all treatment entries
* View audit logs
* View AI logs

---

## 28. Doctor Dashboard

Doctor dashboard should support:

* My assigned/current patients
* Past patients if allowed
* Add patient if permission allows
* Patient case record
* Patient issues
* Patient symptoms
* Treatment entries
* Attach photos/reports
* AI case assistant
* Explore page

---

## 29. Patient Workflow

1. Admin or authorized doctor creates patients.
2. `DoctorPatientRelationship` is created to assign treating doctors.
3. The patient has exactly one `CaseRecord`.
4. Doctor adds multiple `PatientIssues`.
5. Doctor adds multiple `PatientSymptoms` under each issue.
6. Doctor adds `TreatmentEntry` for prescription/follow-up/note.
7. `TreatmentEntry` is linked to treating/consulting doctors via `TreatmentDoctorParticipant`.
8. Doctor records `patientCondition` as `IMPROVED`, `SAME`, or `WORSENED` when applicable.
9. Patient timeline shows:

   * Patient creation
   * Doctor assignment history
   * Case record
   * Issues
   * Symptoms
   * Treatments
   * Follow-ups
   * Attachments
   * Improvement trends

---

## 30. Security Requirements

Security is mandatory, not optional.

Requirements:

* Passwords/auth must be secure.
* First-login password reset is mandatory for temporary credentials.
* Server-side authorization is mandatory.
* Sensitive routes must be protected.
* Sensitive server actions must verify permissions.
* Avoid exposing PII in logs.
* Do not return unnecessary patient fields from APIs.
* Explore page must use de-identified records.
* AI retrieval must use de-identified data only.
* Attachments must be private by default.
* Use signed URLs for private files.
* Add audit logs for sensitive actions.
* Avoid destructive operations unless clearly confirmed.
* Use secure defaults.
* Protect against admin lockout.

---

## 31. Forms and Validation

Form and validation requirements:

* Use typed validation, preferably Zod.
* Validate all inputs server-side.
* Use clean form UI.
* Provide good error messages.
* Provide loading states.
* Provide empty states.
* Avoid huge forms where possible.
* Split large workflows into sections.

---

## 32. Development Approach

Do not build everything at once.

Work iteratively.

Before making changes:

1. Inspect the existing repository structure.
2. Propose the implementation plan.
3. Explain important decisions.
4. Ask for approval when the change is large or structural.

After each phase, summarize:

* What changed
* Files created/edited
* What should be tested manually
* Next recommended phase

Coding rules:

* Never skip server-side authorization.
* Do not rely only on frontend hiding.
* Keep code clean, modular, and easy to extend.
* Use typed schemas and validation.
* Use reusable components.
* Avoid huge files.
* Explain important decisions before implementing.
* Do not make destructive database changes without confirmation.
* Prefer secure defaults.
* Do not overbuild future phases early.
* Keep each phase focused.

---

## 33. Development Phases

### Phase 1: Project Setup

Goals:

* Inspect current repository.
* Set up or verify Next.js + TypeScript.
* Set up Tailwind CSS.
* Set up basic app layout.
* Set up environment variable structure.
* Set up database connection foundation.
* Add basic folder structure.
* Do not implement the full app yet.

Out of scope:

* Auth
* Permissions
* Clinical schema
* Patient forms
* AI
* Explore
* Attachments

---

### Phase 2: Authentication and First Admin

Goals:

* Login/logout
* Secure session handling
* First admin seed
* Admin role seed
* Initial permissions seed
* First-login password change flow
* Admin can create doctor user
* Admin can send invite/temporary credentials by email

---

### Phase 3: Dynamic Permissions and Roles

Goals:

* Role table
* Permission table
* RolePermission table
* UserRole table
* Permission helpers
* Admin UI to manage roles
* Admin UI to assign permissions to roles
* Admin UI to assign roles to users
* Server-side permission checks

---

### Phase 4: Core Clinical Database Schema

Goals:

* DoctorProfile
* Patient
* CaseRecord with one case per patient
* PatientIssue
* PatientSymptom
* DoctorPatientRelationship
* TreatmentEntry
* TreatmentDoctorParticipant
* PatientAttachment
* AuditLog
* AISearchLog
* ExploreCaseIndex or de-identified case view
* Migrations and seed data

---

### Phase 5: Patient Management and Doctor-Patient Relationships

Goals:

* Create patient
* Assign doctor to patient
* Transfer patient to another doctor
* End treatment relationship
* Mark current treating doctor
* View patient assignment history
* Enforce access using `DoctorPatientRelationship` and permissions

---

### Phase 6: Case, Issue, Symptom, and Treatment Workflow

Goals:

* Create/edit one `CaseRecord` per patient
* Add multiple `PatientIssues`
* Add multiple `PatientSymptoms` under issues
* Add `TreatmentEntry` with medicine/follow-up fields
* Add treating and consulting doctors through `TreatmentDoctorParticipant`
* Track `patientCondition`:

  * `IMPROVED`
  * `SAME`
  * `WORSENED`
* Patient timeline view

---

### Phase 7: Attachments

Goals:

* Upload issue photos
* Upload reports
* Link attachments to patient/issue/case/treatment
* Private storage
* Signed URL access
* Attachment permissions
* Attachment audit logs

---

### Phase 8: Explore Page

Goals:

* Build de-identified `ExploreCaseIndex`
* Doctors can browse de-identified records
* Add filters:

  * City
  * State
  * Country
  * Age range
  * Gender
  * Issue
  * Symptom
  * Medicine
  * Potency
  * Patient condition
  * Date range
* Never expose PII
* Never expose raw attachments
* Audit Explore searches

---

### Phase 9: AI Similarity Assistant

Goals:

* Use de-identified case dataset only
* Add embeddings/vector search if appropriate
* Build AI retrieval endpoint
* Build doctor UI for entering case description
* Return privacy-safe historical insights
* Add PII filtering
* Add AI search logs
* Ensure AI never accesses raw patient PII

---

### Phase 10: Security, Testing, and Polish

Goals:

* Permission tests
* Patient access tests
* Doctor transfer tests
* Explore privacy tests
* AI privacy tests
* Attachment access tests
* Error handling
* Loading states
* Empty states
* Production-readiness review

---

## 34. Phase Execution Instruction

When starting a phase:

1. Read `CLAUDE.md`.
2. Read the phase-specific docs needed for that phase.
3. Do not load unnecessary docs unless needed.
4. Inspect the existing repository.
5. Propose a phase-specific implementation plan.
6. List files to create/edit.
7. Identify security/privacy risks.
8. Wait for approval before large structural changes.

When finishing a phase:

1. Summarize what changed.
2. List files created/edited.
3. List commands to run.
4. List manual tests.
5. Mention known limitations.
6. Recommend the next phase.

Do not start the next phase without approval.

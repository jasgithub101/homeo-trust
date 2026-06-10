# Data Model

> Source of truth: `docs/MASTER_SPEC.md`. This document holds the full data
> model: every entity, every field, and the relationship/ownership rules.
> Access-control enforcement is in `SECURITY_MODEL.md`; Explore/AI de-identified
> data rules are in `AI_PRIVACY_MODEL.md`.
>
> Database: **PostgreSQL** via Prisma. Local PostgreSQL is the development
> database; any PostgreSQL host works in production. The schema is
> provider-agnostic and uses no Supabase-specific features.

## 0. Core Data-Modeling Rules (must hold across the whole schema)

- Do **not** store `doctorId` directly as an ownership attribute on:
  `Patient`, `CaseRecord`, `PatientIssue`, `PatientSymptom`, `TreatmentEntry`.
  - Reason: the doctor treating a patient can change midway through treatment.
    Patient-doctor relationships must be historical and time-based.
- Use `DoctorPatientRelationship` to track patient-doctor assignment history.
- Use `TreatmentDoctorParticipant` to track treating and consulting doctors for
  treatment entries.
- Each patient has **exactly one** `CaseRecord`.
- Prescription and follow-up are combined into a single `TreatmentEntry` table.
- There are no fixed `DOCTOR` or `REGIONAL_HEAD` roles. Only the initial `ADMIN`
  system role is fixed; all other access is configured via roles/permissions.
- Patient condition allowed values: `IMPROVED`, `SAME`, `WORSENED`.

---

## 1. Access-Control Models

### User

- `id`
- `name`
- `email`
- `username`
- `passwordHash` or `authProviderReference`
- `phone`
- `active` boolean
- `mustChangePassword` boolean
- `createdByUserId` nullable
- `createdAt`
- `updatedAt`

Notes:

- Users may be doctors, admins, or both depending on assigned roles/permissions.
- Clinical users should have a related `DoctorProfile`.

### DoctorProfile

- `id`
- `userId`
- `qualification`
- `registrationNumber` optional
- `specialization` optional
- `notes` optional
- `createdAt`
- `updatedAt`

Notes:

- Every clinical doctor should have a `DoctorProfile`.
- Do not create special regional-head profiles.

### Role

- `id`
- `name`
- `description`
- `isSystemRole` boolean
- `createdAt`
- `updatedAt`

### Permission

- `id`
- `key`
- `label`
- `description`
- `category`
- `createdAt`
- `updatedAt`

### RolePermission

- `id`
- `roleId`
- `permissionId`
- `createdAt`

### UserRole

- `id`
- `userId`
- `roleId`
- `assignedByUserId`
- `createdAt`

### Session

Added in Phase 2 to back custom, server-side, database-backed opaque sessions
(not in the original MASTER_SPEC; documented here per the security model).

- `id`
- `userId`
- `tokenHash` — HMAC-SHA256 of the opaque session token, keyed with
  `AUTH_SECRET`. **The raw token is never stored**; it lives only in the user's
  httpOnly cookie.
- `ip` optional
- `userAgent` optional
- `createdAt`
- `lastUsedAt`
- `idleExpiresAt` — sliding idle expiry; refreshed on use, capped at
  `absoluteExpiresAt`.
- `absoluteExpiresAt` — hard cap from session creation.

Rules:

- Validation rejects sessions that are past idle or absolute expiry, and
  sessions belonging to inactive users.
- Sessions are deleted on logout, on password change (all sessions rotated), and
  when a user is deactivated.
- Cookie is httpOnly + SameSite=Lax, and Secure in production.

---

## 2. Doctor-Patient Relationship

### DoctorPatientRelationship

- `id`
- `patientId`
- `doctorProfileId`
- `relationshipType` enum/string. Examples:
  - `PRIMARY_TREATING`
  - `CONSULTING`
  - `ASSISTING`
  - `TRANSFERRED_FROM`
  - `TRANSFERRED_TO`
- `startDate`
- `endDate` nullable
- `isCurrentlyTreating` boolean
- `notes` optional
- `assignedByUserId`
- `createdAt`
- `updatedAt`

Rules:

- A patient can have multiple doctors over time.
- A patient can have one current primary treating doctor at a time unless
  explicitly allowed later. Enforce this with a database constraint where
  possible (e.g. a partial unique index on the current primary relationship),
  plus app-level validation.
- Past doctors should remain in history.
- Treatment history must not break when a doctor changes.
- Access to full sensitive patient data is based on permissions **plus**
  `DoctorPatientRelationship` rules.
- Admin can manage doctor-patient relationships.
- Authorized users can transfer patients from one doctor to another by ending
  the old relationship and creating a new one.

---

## 3. Patient

### Patient

- `id`
- `patientCode` or generated display identifier
- `name`
- `dateOfBirth` nullable — store when available.
- `age` — store only when `dateOfBirth` is unavailable or approximate.
- `gender`
- `phone` optional
- `email` optional
- `address` optional
- `city` optional
- `state` optional
- `country` optional
- `occupation`
- `emergencyContactName` optional
- `emergencyContactRelation` optional
- `emergencyContactPhone` optional
- `emergencyContactAddress` optional
- `createdAt`
- `updatedAt`

Privacy note — the following are sensitive PII and must not appear in Explore or
AI outputs:

- Patient name
- Phone number
- Email
- Exact address
- Emergency contact details
- Exact identifiers

Age handling: Explore must expose `ageRange`, never the exact `dateOfBirth`.

---

## 4. Case Record

Each patient has **only one** case record.

### CaseRecord

- `id`
- `patientId` unique
- `chiefComplaint`
- `caseDescription`
- `medicalHistory` optional
- `familyHistory` optional
- `physicalGenerals` optional
- `mentalGenerals` optional
- `modalities` optional
- `diagnosisNotes` optional
- `repertoryNotes` optional
- `createdAt`
- `updatedAt`

Rules:

- Do **not** put `doctorId` in `CaseRecord`.
- `CaseRecord` belongs to `Patient`.
- Access is determined through patient permissions and
  `DoctorPatientRelationship`.

---

## 5. Patient Issues

A patient can have multiple issues/complaints. Each issue can have multiple
symptoms. Medication/treatment entries can correspond to specific issues and
symptoms.

### PatientIssue

- `id`
- `patientId`
- `title`
- `description`
- `onsetDate` optional
- `status` enum/string. Examples:
  - `ACTIVE`
  - `RESOLVED`
  - `CHRONIC`
  - `RECURRING`
- `createdAt`
- `updatedAt`

---

## 6. Patient Symptoms

### PatientSymptom

- `id`
- `patientIssueId`
- `symptomName`
- `description` optional
- `severity` optional, e.g. `1-10`
- `duration` optional
- `modalities` optional
- `triggers` optional
- `location` optional
- `createdAt`
- `updatedAt`

---

## 7. Treatment Entry (Prescription + Follow-up combined)

### TreatmentEntry

- `id`
- `patientId`
- `caseRecordId`
- `patientIssueId` nullable
- `treatmentDate`
- `entryType` enum/string. Examples:
  - `PRESCRIPTION`
  - `FOLLOW_UP`
  - `PRESCRIPTION_AND_FOLLOW_UP`
  - `NOTE`
- `medicineName` nullable
- `potency` nullable
- `dosage` nullable
- `frequency` nullable
- `duration` nullable
- `instructions` nullable
- `followUpNotes` nullable
- `symptomChanges` nullable
- `patientCondition` optional enum — allowed values only:
  - `IMPROVED`
  - `SAME`
  - `WORSENED`
- `improvementScore` optional, e.g. `1-10`
- `nextFollowUpDate` optional
- `createdAt`
- `updatedAt`

Rules:

- Do **not** use `TreatmentEntry` for patient ownership.
- `TreatmentEntry` records clinical actions and progress.
- A `TreatmentEntry` may be linked to a `PatientIssue`.
- A `TreatmentEntry` may involve treating and consulting doctors.
- `patientCondition` is optional and must allow only `IMPROVED`, `SAME`,
  `WORSENED`.

---

## 8. Treatment Doctor Participants

Use a relationship table to link treatment entries to treating and consulting
doctors.

### TreatmentDoctorParticipant

- `id`
- `treatmentEntryId`
- `doctorProfileId`
- `participantType` enum/string. Examples:
  - `TREATING_DOCTOR`
  - `CONSULTING_DOCTOR`
- `createdAt`

Rules:

- A `TreatmentEntry` can have one or more treating doctors.
- A `TreatmentEntry` can have zero or more consulting doctors.
- This preserves history when doctors change.
- Do **not** store one direct `doctorId` on `TreatmentEntry`.

---

## 9. Patient Attachments (Photos and Reports)

Patients can have issue photos, medical reports, scan reports, prescription
images, and other attachments.

### PatientAttachment

- `id`
- `patientId`
- `patientIssueId` nullable
- `caseRecordId` nullable
- `treatmentEntryId` nullable
- `uploadedByUserId`
- `fileType` enum/string. Examples:
  - `ISSUE_PHOTO`
  - `LAB_REPORT`
  - `SCAN_REPORT`
  - `PRESCRIPTION_IMAGE`
  - `OTHER`
- `fileName`
- `storagePath` (preferred) or `fileUrl` — prefer `storagePath` over a public
  `fileUrl` because files are private and served through signed URLs.
- `mimeType`
- `sizeBytes`
- `description` optional
- `isSensitive` boolean default `true`
- `createdAt`
- `updatedAt`

Attachment privacy (enforcement details in `SECURITY_MODEL.md` /
`AI_PRIVACY_MODEL.md`):

- Attachments may contain PII.
- Do not expose raw attachments on Explore pages.
- Only users with correct permissions can view sensitive attachments.
- Store reports/photos in private storage buckets.
- Use signed URLs for authorized access.
- Audit log attachment views/downloads.

---

## 10. Explore Case Index (de-identified)

Create a de-identified view/table such as `ExploreCaseIndex`. Explore/AI read
from this dataset, never from raw `Patient` tables. Full privacy rules are in
`AI_PRIVACY_MODEL.md`.

### ExploreCaseIndex

- `id`
- `patientId` — internal only, not shown in UI
- `caseRecordId` — internal only, not shown in UI
- `anonymousCaseCode`
- `ageRange`
- `gender`
- `city` nullable
- `state` nullable
- `country` nullable
- `issueSummaries`
- `symptomSummaries`
- `medicineSummaries`
- `patientConditionSummary`
- `improvementTrend`
- `createdAt`
- `updatedAt`

Rules:

- Explore UI must read from the de-identified dataset, not raw `Patient` tables.
- Internal IDs should not be exposed to the frontend unless required and safe.
- Build filters against de-identified fields.

---

## 11. AI Search Log

### AISearchLog

- `id`
- `requestingUserId`
- `deidentifiedQueryText`
- `deidentifiedResponse`
- `metadata` JSON optional
- `createdAt`

Only de-identified query text and de-identified responses are stored. See
`AI_PRIVACY_MODEL.md`.

---

## 12. Audit Log

### AuditLog

- `id`
- `actorUserId`
- `action`
- `entityType`
- `entityId`
- `metadata` JSON
- `createdAt`

The full list of actions that must be audited is in `SECURITY_MODEL.md`.

---

## 13. Combined Clinical Behavior (relationships summary)

- A patient has one `CaseRecord`.
- A patient has many `PatientIssues`.
- Each `PatientIssue` can have many `PatientSymptoms`.
- A `TreatmentEntry` can be associated with a specific `PatientIssue`.
- Medicines can correspond to the issue/symptoms being treated.
- Follow-up observations and patient condition are stored in `TreatmentEntry`.
- Treating and consulting doctors are linked through `TreatmentDoctorParticipant`.
- Doctor-patient assignment is tracked through `DoctorPatientRelationship`.

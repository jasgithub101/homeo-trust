# Security Model

> Source of truth: `docs/MASTER_SPEC.md`. This document holds the full
> permission-based access model, the example permission catalog, authorization
> helpers, audit logging requirements, and security requirements. Entity field
> definitions are in `DATA_MODEL.md`; Explore/AI privacy in `AI_PRIVACY_MODEL.md`.

## 1. Permission-Based Access Model

The system uses a policy/permission-based access model.

- Everyone on the clinical side is a **doctor**.
- The only fixed system role is **`ADMIN`**.
- There are **no** fixed `DOCTOR` or `REGIONAL_HEAD` roles, and no hardcoded
  regional-head logic. A future senior/supervisory doctor must be represented
  through configured permissions and relationships, not fixed system roles.

Admin can:

- Create roles
- Create permissions
- Assign permissions to roles
- Assign roles to users
- Assign one or more roles to a user
- Create another admin
- Deactivate users
- Manage doctor-patient relationships
- Manage system permissions
- View audit logs

Permissions decide what a user can do.

## 2. Initial System Role — ADMIN

The initial `ADMIN` system role:

- Has all permissions
- Can create users
- Can create doctors
- Can create roles
- Can create permissions
- Can assign roles
- Can assign permissions
- Can create patients
- Can create cases
- Can create treatments
- Can upload/manage attachments
- Can view audit logs
- Can view AI logs
- Can manage Explore records
- Can create another admin
- Must be protected from accidental deletion or lockout

## 3. User Onboarding Security

- Admin creates a username and temporary password for a new doctor; details are
  sent by email.
- On first login, the doctor must be forced to set a new password.
- Preferred: secure one-time invite link.
- Alternative: temporary password + `mustChangePassword = true`, forcing an
  immediate password change after first login.
- Admin can deactivate users and create another admin.
- The system must protect against accidentally deleting or deactivating the
  **last admin** (admin-lockout protection).

## 4. Example Permissions

Initial permission keys may include the following (grouped by category):

### User and Role Management

- `user.create`
- `user.update`
- `user.deactivate`
- `user.assignRole`
- `role.create`
- `role.update`
- `role.delete`
- `permission.assign`

### Patient

- `patient.create`
- `patient.viewSensitive`
- `patient.viewDeidentified`
- `patient.update`
- `patient.delete`
- `patient.assignDoctor`

### Case

- `case.create`
- `case.view`
- `case.update`
- `case.delete`

### Issue

- `issue.create`
- `issue.view`
- `issue.update`
- `issue.delete`

### Symptom

- `symptom.create`
- `symptom.view`
- `symptom.update`
- `symptom.delete`

### Treatment

- `treatment.create`
- `treatment.view`
- `treatment.update`
- `treatment.delete`

### Attachments

- `attachment.upload`
- `attachment.viewSensitive`
- `attachment.delete`

### Explore

- `explore.view`
- `explore.filter`
- `explore.viewDoctorName` — future explicit permission allowing doctor names to
  be shown in Explore. Doctor names stay hidden unless a user holds this.

### AI

- `ai.use`
- `ai.viewLogs`

### Audit

- `audit.view`
- `audit.export`

## 5. Authorization Helpers

Implement reusable server-side authorization helpers:

- **`requireUser()`** — ensures user is logged in.
- **`requirePermission(permissionKey)`** — ensures current user has the
  permission.
- **`hasPermission(userId, permissionKey)`** — returns boolean.
- **`requireAdminAccess()`** — checks whether user has admin/super permissions.
- **`canViewSensitivePatient(user, patientId)`** — true if user has
  `patient.viewSensitive` and is allowed by relationship rules, or has
  admin-level access.
- **`canViewDeidentifiedRecords(user)`** — true if user has `explore.view`.
- **`canEditPatient(user, patientId)`** — true if user has `patient.update` and
  relationship/admin access.
- **`canCreateCase(user, patientId)`** — true if user has `case.create` and
  relationship/admin access.
- **`canDeleteCase(user, patientId)`** — true only if user has `case.delete` or
  admin-level permission.
- **`canAddTreatmentEntry(user, patientId)`** — true if user has
  `treatment.create` and relationship/admin access.
- **`canViewAttachment(user, attachmentId)`** — true only if user has
  `attachment.viewSensitive` and relationship/admin access.

Important authorization rules:

- Every sensitive server action must call permission helpers.
- Never rely only on hiding UI buttons.
- Frontend permissions are only for UX.
- Backend permissions are mandatory.
- Every database query returning sensitive data must pass through authorization
  checks.

## 6. Audit Logging

Add audit logging for sensitive actions. The `AuditLog` entity is defined in
`DATA_MODEL.md`. The following actions must be audited:

- Login
- Failed login
- Password changed
- User created
- User deactivated
- Role assigned
- Permission changed
- Patient viewed
- Patient created
- Patient updated
- Case viewed
- Case updated
- Issue created
- Issue updated
- Issue deleted
- Symptom created
- Symptom updated
- Symptom deleted
- Treatment entry created
- Treatment entry updated
- Treatment entry deleted
- Attachment uploaded
- Attachment viewed
- Attachment downloaded
- Attachment deleted
- Doctor-patient relationship created
- Doctor-patient relationship ended
- Doctor-patient relationship transferred
- Explore searched
- AI search used

Concrete audit action identifiers implemented so far (in `AUDIT_ACTIONS`,
`src/lib/audit/log.ts`): `login`, `failed_login`, `logout`, `password_changed`,
`user_created` (Phase 2); `role_created`, `role_updated`, `role_deleted`,
`role_delete_blocked`, `role_permissions_changed`, `user_roles_changed`
(Phase 3). Remaining clinical/Explore/AI/attachment actions are added in later
phases.

## 7. Security Requirements

Security is mandatory, not optional.

- Passwords/auth must be secure.
- First-login password reset is mandatory for temporary credentials.
- Server-side authorization is mandatory.
- Sensitive routes must be protected.
- Sensitive server actions must verify permissions.
- Avoid exposing PII in logs.
- Do not return unnecessary patient fields from APIs.
- The Explore page must use de-identified records.
- AI retrieval must use de-identified data only.
- Attachments must be private by default.
- Use signed URLs for private files.
- Add audit logs for sensitive actions.
- Avoid destructive operations unless clearly confirmed.
- Use secure defaults.
- Protect against admin lockout.

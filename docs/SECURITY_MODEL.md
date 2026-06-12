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

- Admin creates a username and a temporary password for a new user.
- On first login, the user is forced to set a new password
  (`mustChangePassword = true`).
- Admin can deactivate users and create another admin.
- The system must protect against accidentally deleting or deactivating the
  **last admin** (admin-lockout protection).

### 3.1 Password flows (self-change, admin reset, recovery)

Three flows share the temp-password + `mustChangePassword` machinery; there is
**no self-service email recovery** (recovery is admin-driven). Email is fully
**decoupled** — every flow works with the mailer disabled/absent.

- **Self change-password** (`changePasswordAction`, normal branch): the logged-in
  user's **current password is re-verified server-side** (argon2, constant-time)
  before the change — the session alone is never sufficient. That verification is
  **rate-limited** (the login limiter, keyed `pwchange:{userId}`, cleared on
  success) so the form can't be used as a password-guessing oracle. On success
  all of the user's sessions are invalidated and a fresh one is issued (other
  devices are logged out; the caller stays signed in).
- **Admin reset** (`resetUserPasswordAction`): generates a temp password, sets
  `mustChangePassword = true`, **invalidates ALL of the target's sessions**, and
  shows the temp password to the admin **once on screen** to hand over in person
  (never emailed, never persisted in plaintext, never logged). Gating:
  - permission **`user.update`** (no new key);
  - **self-reset is refused** (use self change-password);
  - resetting a user who holds **ADMIN additionally requires the actor to be an
    admin**, because a reset hands the actor a credential that authenticates AS
    the target — it must not be a privilege-escalation path.
  - **Residual (documented):** the ADMIN guard closes the worst case, but a
    non-admin `user.update` holder could still reset a *more-privileged
    non-admin* and impersonate them. This is **moot today because the
    user-detail page is admin-only**, so only admins reach the action. **If that
    page is ever opened to non-admin `user.update` holders, this reopens** and a
    stronger guard is required (e.g. refuse to reset any user whose privileges
    exceed the actor's, or a dedicated reset capability).
- **Forgot-password (logged out)**: a **static** page that says to contact an
  administrator. It takes no identifier and never confirms whether an account
  exists, so it **cannot be used for user enumeration**.

Audit for these flows is ids/enums only — `PASSWORD_CHANGED` (actor id),
`PASSWORD_RESET_BY_ADMIN` (actor + target id + `targetIsAdmin`). **Never** the
temp password or any hash. The create-user flow only attempts email when SMTP is
configured, so the temp password is never routed to the dev console fallback.

The brute-force/oracle limiter is in-memory and single-instance, which is the
**appropriate lightweight choice for the intended single-instance (self-hosted)
deployment**; revisit only if the app is ever run multi-instance.

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

Patient access has **two orthogonal axes** plus admin bypass:

- **Breadth** (which patients a user may reach):
  - `patient.viewAssigned` — only patients related to the user's `DoctorProfile`
    via `DoctorPatientRelationship` (current or past).
  - `patient.viewAll` — all patients in the system. **Not** relationship-based,
    so it works for users **without** a `DoctorProfile` (e.g. research/reviewer
    staff).
- **Depth** (which fields):
  - `patient.viewSensitive` — full PII.
  - `patient.viewDeidentified` — de-identified only.

The axes are independent: a **depth** permission never grants row scope, and a
**breadth** permission never reveals PII. A `viewAll` holder with no depth
permission sees every patient **de-identified**. Admin bypasses both axes.

Permission keys:

- `patient.create`
- `patient.viewAssigned`
- `patient.viewAll`
- `patient.viewSensitive`
- `patient.viewDeidentified`
- `patient.update`
- `patient.delete`
- `patient.assignDoctor`

Example role compositions: Doctor = `viewAssigned` + `viewSensitive`; Research =
`viewAll` + `viewDeidentified`; Clinical reviewer = `viewAll` + `viewSensitive`.

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

Attachments reuse the breadth × depth split. **Breadth** (`attachment.view`)
lists attachment metadata and downloads files **not** marked sensitive.
**Depth** (`attachment.viewSensitive`) additionally unlocks the bytes of files
marked `isSensitive` (the default). Both still require the owning patient to be
in scope (`isPatientInScope`); admin bypasses both. Attachments are private by
default, never under `public/`, and are reachable **only** through the
authenticated, per-request-authorized download route — never a stable public
URL, and never via Explore/AI.

- `attachment.upload`
- `attachment.view` — list metadata + download non-sensitive files (breadth).
- `attachment.viewSensitive` — download files marked sensitive (depth).
- `attachment.delete` — archive (soft-delete); the stored blob is retained.

### Explore

- `explore.view` — **the single Explore gate (Phase 8).** Access is binary:
  `admin || explore.view`. It gates both the page (`notFound()` otherwise) and
  the sidebar nav. There is no patient row scope and no depth escalation — a
  `patient.viewSensitive` holder still sees only the de-identified index, and
  admin bypasses **access**, never de-identification.
- `explore.filter` — folded into `explore.view` for Phase 8 (decision D7); the
  key stays seeded for future granularity but is not separately enforced.
- `explore.bypassCohortMinimum` — lifts the read-time **<5-case suppression
  backstop** (D2) for the holder (`admin || explore.bypassCohortMinimum`), so
  they see results for cohorts smaller than the privacy minimum. Per the approved
  "no restriction by default" decision it is **default-granted to Explore roles**
  (via the one-time `scripts/backfill-explore-bypass.ts`), making the privacy
  floor **opt-IN per role** — revoke it on a role to enforce suppression for that
  role. Scope is narrow: it lifts ONLY the row/count suppression. It does **not**
  change core de-identification — Explore still reads only `ExploreCaseIndex`,
  never raw PII/attachments, and never emits name/phone/email/address/DOB/exact
  ids/doctor name; city-cohort coarsening (a projection-time property) still
  applies to everyone. The tradeoff it accepts is **re-identification risk from
  very small cohorts**, which also matters once Phase 9 AI consumes this index.
- `explore.viewDoctorName` — future explicit permission allowing doctor names to
  be shown in Explore. Doctor names stay hidden unless a user holds this; in
  Phase 8 the doctor is **structurally absent** from the index (no doctor id is
  ever projected), so this remains future work.

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
- **`isPatientInScope(user, patientId)`** — the **breadth** gate: true if
  admin OR `patient.viewAll` (any patient), or `patient.viewAssigned` AND the
  user's `DoctorProfile` is related to the patient. All depth/action helpers
  layer their permission on top of this.
- **`canViewAllPatients(user)`** — true if admin OR `patient.viewAll`.
- **`canViewSensitivePatient(user, patientId)`** — the **depth** gate: true if
  admin OR (`patient.viewSensitive` AND `isPatientInScope`). `viewSensitive`
  alone never grants row scope.
- **`canViewDeidentifiedRecords(user)`** — true if user has `explore.view`.
- **`canEditPatient(user, patientId)`** — true if user has `patient.update` and
  `isPatientInScope` (or admin).
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
(Phase 3); `patient_created`, `patient_updated`, `patient_viewed`,
`dpr_created`, `dpr_ended`, `dpr_transferred` (Phase 5); `case_created`,
`case_updated`, `case_viewed`, `issue_created`, `issue_updated`, `issue_deleted`,
`symptom_created`, `symptom_updated`, `symptom_deleted`, `treatment_created`,
`treatment_updated`, `treatment_deleted` (Phase 6 — the `*_deleted` clinical
actions are **soft-delete/archive**; rows are preserved and metadata carries
ids/enums + an optional short `deletionReason` only, never PII or clinical free
text); `attachment_uploaded`, `attachment_viewed`, `attachment_deleted`
(Phase 7); `explore_searched`, `explore_index_refreshed` (Phase 8 — Explore
metadata is PII-SAFE ONLY: applied filters as enums/coarse bands/coarse location,
`resultCount` (NULL when suppressed, so a small cohort size never reaches the
log), a `suppressed` flag, and a `cohortBypass` flag recording whether the viewer
could see sub-threshold cohorts; never result ids, anonymous case codes, names, or
free text). Remaining AI actions are added in later phases.

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

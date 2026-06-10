# Phase 3 Report — Dynamic Roles & Permissions

> Audience: me (the developer), for later revision and for explaining the system
> in interviews. Scope: what Phase 3 actually implements in this repo today.
> Source specs: `docs/PHASES.md`, `docs/SECURITY_MODEL.md`, `docs/DATA_MODEL.md`,
> `docs/PRODUCT_SPEC.md`. No secrets or `.env.local` values appear here.

---

## 1. Phase overview

### What Phase 3 implemented
- **Admin UI to manage roles**: list, create, update, and delete roles.
- **Permission assignment**: a category-grouped permission matrix per role
  (replace-set save).
- **User-role assignment**: assign/remove one or more roles on a user detail
  page (replace-set), and optionally during user creation.
- **Create User** (reworked from "Create Doctor"): creates any staff type with
  login credentials, optional roles, and an **optional** DoctorProfile.
- **Server-side authorization** on every admin action via permission helpers.
- **Protections**: ADMIN/system-role protection, last-admin lockout guard, and
  blocked deletion of roles that still have users.
- **Audit logging** for all role/permission/user-role changes.
- **Zod validation** + loading/error/empty states throughout.
- **No database migration** — the tables and permission catalog already existed
  from Phase 2.

### What was intentionally NOT implemented yet
- Clinical schema (Patient, CaseRecord, issues, symptoms, treatments,
  relationships, attachments), Explore, AI — all later phases.
- User **deactivation** UI (the last-admin guard helper is built reusable for it,
  but no deactivation action exists yet).
- Editing a user's core fields (name/email/username) or resetting passwords from
  the admin UI.
- A `role.view`/`permission.view` permission — Phase 3 gates *viewing* admin
  pages on `requireAdminAccess()` since the only actor today is ADMIN.
- Forced logout/session invalidation on permission change (changes apply on the
  user's next request instead).

---

## 2. Architecture decisions

### Why roles are configurable instead of hardcoded
Access needs evolve (a "Case Reviewer" today, a "Records Auditor" tomorrow).
Modeling roles as **rows** (`Role` + `RolePermission`) lets an admin define new
access packages in the UI without code changes or migrations. Hardcoded role
enums would require a deploy for every policy change and couple authorization to
source code.

### Why `User` is the generic login/account model
Anyone who logs in is a `User` — doctors, nurses, assistants, reception/
front-desk, case reviewers, records staff. Keeping identity generic means one
auth/session/audit path serves every staff type, and capabilities come purely
from assigned roles. Job titles never branch the login model.

### Why `DoctorProfile` is optional and only for actual doctors
"Being a doctor" is a **clinical fact**, not an access level. Only clinical
doctors need qualification/registration/specialization and the ability to be
recorded as a treating/consulting doctor. So `DoctorProfile` is a separate,
optional one-to-one table created **only** when an admin marks a user as a
doctor. Non-doctor users have none.

### Why "doctor" is not an authorization role
If "doctor" were a role, it would conflate *what you can do* (permissions) with
*who you are clinically* (profile). They change independently: a doctor might be
read-only this month; a non-doctor records clerk might need broad data access.
Decoupling them (roles for access, `DoctorProfile` for clinical identity) keeps
both flexible and avoids fixed role enums.

### Why nurses/assistants/reception/case-reviewers are users with configurable roles
They all log in (so they're `User`s) and need different capabilities (so they get
different role/permission sets). None of them require a `DoctorProfile`. This is
exactly the configurable-RBAC model: title is descriptive; the role grant is
what actually governs access.

### Why ADMIN is the only fixed system role
The system must bootstrap from an empty database and must never be left with
nobody able to administer it. A single fixed `ADMIN` system role (seeded, holding
all permissions, protected from deletion/edit) guarantees a recoverable root of
authority. Everything else is data.

### Why Create User can assign existing roles but never auto-creates fixed staff roles
Convenience (assign access at creation) without policy leakage: the role picker
only lists **existing DB roles**, and selecting none is valid. The flow never
invents a "DOCTOR"/"NURSE" role or auto-assigns one — that would reintroduce the
hardcoded roles we are explicitly avoiding.

### Why role deletion is blocked when users are assigned
Deleting a role that users hold would **silently strip their access**, which is
dangerous and hard to audit. Blocking deletion until the role is unassigned
forces an explicit, reviewable action and prevents accidental lockouts.

---

## 3. Database / schema usage

- **Tables used (all from Phase 2, unchanged)**: `User`, `DoctorProfile`,
  `Role`, `Permission`, `RolePermission`, `UserRole`.
  - `Role` (name unique, `isSystemRole`), `Permission` (key unique, `category`),
    `RolePermission` (unique `roleId+permissionId`, cascade), `UserRole` (unique
    `userId+roleId`, `assignedByUserId`, cascade).
- **Why no migration was needed**: Phase 2 already created every table and seeded
  the full 40-key permission catalog precisely so Phase 3 could build management
  UI on top without schema changes. Phase 3 only **reads/writes rows**.
- **How seeded permissions are reused**: the catalog lives once in
  `src/lib/permissions/keys.ts` (`PERMISSIONS`) and was seeded into `Permission`.
  The permission matrix renders from `groupPermissionsByCategory()`, and
  `setRolePermissions` validates submitted keys against the catalog
  (`isPermissionKey`) before writing `RolePermission` rows.
- **How ADMIN gets all permissions**: the seed linked every permission to the
  ADMIN role, **and** at runtime `userHasPermission` returns true for admins
  regardless of the explicit set (`isAdmin || permissions.has(key)`), so admins
  always have super access even if the matrix were somehow incomplete.
- **Why `DoctorProfile` is separate from `Role`**: `Role` governs *capabilities*
  (many-to-many with permissions, assignable to any user); `DoctorProfile` is a
  *clinical identity* (one-to-one with a user, referenced only by clinical
  doctor links). They have different shapes, lifecycles, and consumers, so they
  are distinct tables.

---

## 4. User creation flow

`/admin/users/new` → `CreateUserForm` → `createUserAction`
(`src/app/(dashboard)/admin/users/new/`), gated by `requireAdminAccess()`.

- **Basic login fields**: name, email, username (validated; uniqueness
  pre-checked for friendly errors), optional phone. A strong **temporary
  password** is generated and the user is created with `mustChangePassword =
  true` (Phase 2 forced-change flow).
- **Optional role assignment**: a checkbox list of **existing** roles; selected
  ids are validated to exist, then written as `UserRole` rows with
  `assignedByUserId = admin`.
- **Zero-role creation**: fully supported — a user can be created with no roles
  and granted access later.
- **Optional DoctorProfile section**: a "This user is a doctor (add a clinical
  doctor profile)" checkbox (`isDoctor`). When enabled, qualification/
  registration/specialization fields appear and a `DoctorProfile` is created;
  when disabled, **no** profile is created.
- **Conditional requirement**: `createUserSchema` requires `qualification`
  **only when** `isDoctor` is true (Zod refinement); the action only nests the
  `DoctorProfile` create when `isDoctor` is true.
- **Non-doctor users**: nurses, assistants, reception, records staff, etc. are
  created with the doctor toggle off — they are full `User`s with roles but no
  `DoctorProfile`, so they can never be recorded as treating/consulting doctors.
- Credentials are emailed (dev: printed to the server console, marked
  development-only). Audits: `user_created` (metadata `{ username, isDoctor }`)
  and, if roles were assigned, `user_roles_changed`.

---

## 5. Role management flow

`src/app/(dashboard)/admin/roles/*`, all gated `requireAdminAccess()` for views
and per-permission for mutations.

- **Role list** (`/admin/roles`): name, description, permission count, user
  count, a "System" badge for ADMIN; "Create role" button; empty state.
- **Create role** (`/admin/roles/new` → `createRoleAction`,
  `requirePermission("role.create")`): name + optional description; rejects the
  reserved name "ADMIN" (any case) and duplicate names (case-insensitive); never
  sets `isSystemRole`. Redirects to the new role's detail page.
- **Update role** (`updateRoleAction`, `requirePermission("role.update")`):
  edits name/description; **blocked for system roles**; duplicate-name guarded.
- **Delete role** (`deleteRoleAction`, `requirePermission("role.delete")`):
  **blocked for system roles**; **blocked while users are assigned** (with a
  clear "assigned to N user(s)" message and a `role_delete_blocked` audit);
  otherwise deletes and audits `role_deleted`.
- **System role protection**: the ADMIN detail page renders inputs disabled with
  a "System role — protected" note; the server independently blocks edit/delete/
  permission-change regardless of the UI.

---

## 6. Permission assignment flow

- **Permission matrix** (`PermissionMatrix`, saved by `setRolePermissionsAction`,
  `requirePermission("permission.assign")`): checkboxes grouped by **category**
  with per-category "Select all / Clear all".
- **Categories** come from the catalog's `category` field via
  `groupPermissionsByCategory()` (e.g. "User & Role Management", "Patient",
  "Case", "Treatment", "Explore", "AI", "Audit").
- **Replacing role permissions**: the action validates keys against the catalog,
  resolves them to `Permission` ids, and **replace-sets** in one transaction
  (`deleteMany` then `createMany`). Audits `role_permissions_changed` with the
  key list and count.
- **Why ADMIN permissions are protected**: `setRolePermissions` rejects changes
  to any system role, and the matrix is rendered locked/all-checked for ADMIN.
  ADMIN must always retain every permission (and has implicit super access), so
  it is never editable.

---

## 7. User-role assignment flow

`src/app/(dashboard)/admin/users/[userId]/` → `RoleAssignmentForm` →
`setUserRolesAction` (`requirePermission("user.assignRole")`).

- **User detail page**: shows account + (if present) doctor-profile summary, then
  a checkbox list of all roles with the user's current roles pre-checked.
- **Assigning/removing roles**: replace-set semantics — the action computes the
  diff (`toAdd`/`toRemove`) and applies it in a transaction, recording
  `assignedByUserId` for additions. Audits `user_roles_changed` with the diff.
- **Assigning roles during Create User**: same validation + audit path, just
  performed inline with user creation.
- **How permission changes apply**: there is **no cached permission set in the
  session**. `getCurrentUser` recomputes the user's permission `Set` + `isAdmin`
  from the database **on every request**, so adding/removing a role takes effect
  on that user's **next request** — no re-login required, and no stale grants.

---

## 8. Security decisions

- **Server-side permission checks**: every mutation calls a guard before any DB
  write — `requirePermission("role.create" | "role.update" | "role.delete" |
  "permission.assign" | "user.assignRole")`; admin pages call
  `requireAdminAccess()`. UI affordances are never the gate.
- **Privilege-escalation protection**: assigning **or** removing the ADMIN role
  additionally requires `actor.isAdmin` (not merely `user.assignRole`), so a
  future non-admin role-assigner can never mint or strip admins.
- **ADMIN/system-role protection**: ADMIN cannot be renamed, edited, deleted, or
  have its permissions changed; the name "ADMIN" is reserved; user-created roles
  are always `isSystemRole = false`.
- **Last-admin lockout protection**: `checkNotRemovingLastAdmin` blocks any
  change that would remove the ADMIN role from the **only** active admin
  (`countActiveAdmins() <= 1`). Reused later for deactivation.
- **ID + Zod validation**: all `roleId`/`userId`/`permissionKeys` are validated
  with Zod and re-checked server-side (roles must exist; permission keys must be
  in the catalog), preventing IDOR and mass-assignment.
- **Why UI disabling alone is not enough**: hiding/disabling a control only
  changes the rendered page; an attacker can still POST to a server action. The
  server therefore re-enforces every rule (existence, permission, system-role,
  last-admin) regardless of what the client sends.
- **Why deletion does not silently unassign users**: silent unassignment would
  revoke access invisibly. Deletion is blocked (and the blocked attempt audited)
  until an admin explicitly unassigns the role.

---

## 9. Audit logging

Actions added to `AUDIT_ACTIONS` (`src/lib/audit/log.ts`), written on success
(and best-effort on a blocked delete):

- `role_created` — metadata `{ name }`.
- `role_updated` — metadata `{ name }`.
- `role_deleted` — metadata `{ name }`.
- `role_delete_blocked` — metadata `{ reason, assignedUserCount }` (deletion
  refused because users are assigned).
- `role_permissions_changed` — metadata `{ permissionKeys, count }`.
- `user_roles_changed` — metadata `{ added, removed }` (role-id diffs); also
  written when roles are assigned during Create User.
- `user_created` — metadata now includes **`isDoctor`** (whether a DoctorProfile
  was created), alongside `username`.

**Why these matter for a clinical/privacy system**: authorization changes decide
who can reach patient PII. An append-only trail of *who granted/revoked what, and
when* is essential for accountability, incident investigation, and compliance.
Recording **blocked** destructive attempts (`role_delete_blocked`) is itself a
useful signal. Audit writes are non-throwing, so logging never breaks the action.

---

## 10. Important files changed

| File | Purpose | What changed in Phase 3 |
|---|---|---|
| `src/lib/permissions/keys.ts` | Permission catalog | Added `groupPermissionsByCategory()`, `isPermissionKey()`, `PERMISSION_KEY_SET` |
| `src/lib/permissions/check.ts` | AuthZ helpers | (Reused) `requirePermission`, `requireAdminAccess` |
| `src/lib/permissions/admin-guard.ts` | Lockout/role guards | **New** — `getAdminRole`, `countActiveAdmins`, `checkNotRemovingLastAdmin` |
| `src/lib/audit/log.ts` | Audit | Added 6 Phase 3 action constants |
| `src/lib/validation/role.ts` | Validation | **New** — create/update/delete role, set role permissions, set user roles |
| `src/lib/validation/auth.ts` | Validation | `createDoctorSchema` → `createUserSchema`; added `isDoctor` + conditional `qualification` |
| `src/app/(dashboard)/admin/roles/actions.ts` | Server actions | **New** — create/update/delete role, set role permissions |
| `src/app/(dashboard)/admin/roles/page.tsx` | Roles list | **New** |
| `src/app/(dashboard)/admin/roles/new/page.tsx` | Create role | **New** |
| `src/app/(dashboard)/admin/roles/[roleId]/page.tsx` | Role detail | **New** — edit, matrix, users-with-role, delete |
| `src/app/(dashboard)/admin/users/[userId]/actions.ts` | Server action | **New** — `setUserRoles` (admin-role + last-admin guards) |
| `src/app/(dashboard)/admin/users/[userId]/page.tsx` | User detail | **New** — summary + role assignment |
| `src/app/(dashboard)/admin/users/new/actions.ts` | Server action | `createDoctorAction` → `createUserAction`; optional DoctorProfile + roles |
| `src/app/(dashboard)/admin/users/new/CreateUserForm.tsx` | Create User form | **New** (replaced `CreateDoctorForm.tsx`); doctor toggle + roles |
| `src/app/(dashboard)/admin/users/new/page.tsx` | Create User page | Title/wording → "Create user"; loads roles |
| `src/app/(dashboard)/admin/users/page.tsx` | Users list | Rows link to user detail; button → "Create user" |
| `src/components/admin/RoleForm.tsx` | Component | **New** — create/edit role (locked for system) |
| `src/components/admin/PermissionMatrix.tsx` | Component | **New** — category-grouped checkboxes |
| `src/components/admin/RoleAssignmentForm.tsx` | Component | **New** — user role checkboxes |
| `src/components/admin/DeleteRoleButton.tsx` | Component | **New** — confirm + delete |
| `src/components/layout/Sidebar.tsx` | Nav | Added "Roles" under Administration |
| `docs/SECURITY_MODEL.md`, `docs/PHASES.md`, `docs/PRODUCT_SPEC.md`, `docs/DATA_MODEL.md` | Docs | Multi-user-type model; optional DoctorProfile; Phase 3 + audit notes |

---

## 11. Manual testing checklist

- [ ] As admin, `/admin/roles` lists ADMIN as a protected **System** role; empty
      state before others exist.
- [ ] **Create** a role ("Case Reviewer") → appears; `role_created` audit row.
- [ ] **Update** its name/description → persists; `role_updated` audit row.
- [ ] **Assign permissions** via the matrix (multiple categories) → persists;
      `role_permissions_changed` audit row.
- [ ] **ADMIN role protection**: detail inputs disabled; a crafted edit/permission
      change is rejected server-side.
- [ ] **Duplicate/ADMIN name rejection**: cannot create a role named "ADMIN"
      (any case) or a duplicate of an existing name.
- [ ] **Assign a role to a user** on the user detail page → reflected on
      `/admin/users` and detail; `user_roles_changed` audit row.
- [ ] **Create User with zero roles** → succeeds.
- [ ] **Create User with selected roles** → user has those `UserRole` rows.
- [ ] **Create User as non-doctor** (toggle off) → no `DoctorProfile` created;
      `user_created` metadata `isDoctor: false`.
- [ ] **Create User as doctor** (toggle on) → Qualification required; with it
      filled, a `DoctorProfile` is created; `isDoctor: true` in metadata.
- [ ] **Delete an assigned role** → blocked with "assigned to N users";
      `role_delete_blocked` audit row.
- [ ] **Delete an unassigned role** → succeeds; `role_deleted` audit row;
      ADMIN/system role can never be deleted.
- [ ] **Last-admin guard**: removing ADMIN from the only admin is blocked; with
      two admins, removal from one succeeds.
- [ ] **Non-admin access rejection**: a user without `role.*`/`user.assignRole`
      hitting any `/admin/roles*` page or mutation is rejected server-side.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build` pass.

---

## 12. Problems faced and fixes

- **"Create Doctor" was too narrow → reworked to "Create User"**: the system
  supports many staff types (doctors, nurses, assistants, reception, case
  reviewers, records staff). The flow, action (`createUserAction`), form
  (`CreateUserForm`), schema (`createUserSchema`), and wording were renamed to be
  user-generic. The route `/admin/users/new` was already generic, so no route
  change was needed.
- **DoctorProfile became optional in the create flow**: a "This user is a doctor"
  toggle now controls whether a `DoctorProfile` is created; `qualification` is
  required **only** when the toggle is on (Zod refinement + conditional create).
- **Roles stay configurable, never tied to staff labels**: no "DOCTOR"/"NURSE"/
  "ASSISTANT" role is created or auto-assigned; the role picker shows only
  existing DB roles, and zero roles is valid. Only `ADMIN` is fixed.

---

## 13. What I should understand from this phase

- **RBAC as data, not code.** Roles and permissions are rows; the UI edits them;
  no deploy/migration is needed to change policy. This is the core of a flexible
  authorization system.
- **Separate identity from authorization.** `User` = who logs in; `Role` = what
  they can do; `DoctorProfile` = a clinical fact about some users. Keeping these
  orthogonal avoids the trap of role enums tied to job titles.
- **Replace-set vs. diff.** Saving a role's permissions is a replace-set
  (delete+create in a transaction); saving a user's roles computes a diff so it
  can preserve "who assigned what" and audit precisely.
- **Permissions are recomputed per request.** Because nothing caches them in the
  session, grants/revocations are effective immediately on the next request —
  simpler and safer than embedding claims in a token.
- **Guard at the data, not the button.** Every protection (existence, permission,
  system-role, last-admin, privilege-escalation) is enforced server-side; the UI
  only mirrors it.
- **Protect the root of authority.** A fixed ADMIN role plus last-admin and
  system-role guards make the system impossible to brick from the admin UI.

---

## 14. Resume / interview talking points

- Built a **configurable RBAC system** (roles, permissions, role↔permission and
  user↔role joins) with an admin UI to create/update/delete roles, assign
  permissions via a category-grouped matrix, and assign roles to users — **no
  hardcoded role enums**, only a fixed `ADMIN` system role.
- Modeled **identity vs. authorization** cleanly: a generic `User` for any staff
  type (doctor, nurse, assistant, reception, …), access via roles/permissions,
  and an **optional** `DoctorProfile` representing clinical-doctor identity only.
- Enforced **server-side authorization on every action** with per-permission
  checks; UI state is never the security boundary.
- Implemented **safety guards**: last-admin lockout protection, ADMIN/system-role
  immutability, reserved role names, blocked deletion of in-use roles, and an
  **anti-privilege-escalation** rule requiring admin access to change ADMIN
  membership.
- Made permission changes **take effect on the next request** by recomputing the
  effective permission set per request (no stale token claims).
- Added **audit logging** for all role/permission/user-role changes (including
  *blocked* destructive attempts) for a clinical/privacy-sensitive system.
- Delivered it as a **focused phase with no schema migration**, reusing the
  Phase 2 tables and seeded permission catalog.

---

## 15. Next recommended phase

**Phase 4 — Core clinical database schema.** Phases 2–3 built *who can log in*
and *what they're allowed to do*; there is still no patient data to act on. The
permission catalog already defines patient/case/issue/symptom/treatment/
attachment keys, but the tables they govern don't exist yet. Phase 4 adds the
clinical models (Patient, CaseRecord, PatientIssue, PatientSymptom,
DoctorPatientRelationship, TreatmentEntry, TreatmentDoctorParticipant,
PatientAttachment, AISearchLog, ExploreCaseIndex) with migrations and seed data —
crucially honoring the rules these phases set up: no `doctorId` ownership columns
(use `DoctorPatientRelationship`/`TreatmentDoctorParticipant`, which reference
`DoctorProfile`), one `CaseRecord` per patient, and combined prescription +
follow-up in `TreatmentEntry`. Defining access *before* the sensitive records
exist is the correct order.

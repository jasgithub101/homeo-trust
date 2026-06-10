# Phase 2 Report — Authentication Foundation & First Admin

> Audience: me (the developer), for later revision and for explaining the system
> in interviews. Scope: what Phase 2 actually implements in this repo today.
> Source specs: `docs/PHASES.md`, `docs/SECURITY_MODEL.md`, `docs/DATA_MODEL.md`.
> No secrets or `.env.local` values appear in this report.

---

## 1. Phase overview

### What Phase 2 implemented

- **Custom authentication** with email/username + password login.
- **Database-backed opaque sessions** (no JWT, no third-party auth library).
- **Password hashing** with argon2id (`@node-rs/argon2`).
- **First-admin bootstrap** via an idempotent seed: the full permission catalog,
  the fixed `ADMIN` system role, and one admin user.
- **Forced first-login password change** (`mustChangePassword`).
- **Minimal admin surface**: an admin-only "create doctor" flow (temporary
  password + forced change) and a read-only users list.
- **Server-side authorization helpers** (`requireUser`, `requirePermission`,
  `requireAdminAccess`, `hasPermission`).
- **Audit logging** for login, failed login, logout, password change, user
  created.
- **Best-effort login rate limiting** (in-memory).
- **Edge "proxy"** (Next.js 16's renamed middleware) as a lightweight cookie
  presence gate; all real checks are server-side.
- **Prisma schema + first migration** for 8 access-control/auth tables, applied
  to **local PostgreSQL**.

### What was intentionally NOT implemented yet

- Clinical schema (Patient, CaseRecord, PatientIssue, PatientSymptom,
  TreatmentEntry, TreatmentDoctorParticipant, DoctorPatientRelationship,
  PatientAttachment, ExploreCaseIndex, AISearchLog).
- Explore page, AI assistant, attachments/file storage.
- Full role-management UI (create roles, assign permissions to roles, assign
  roles to users) — that is Phase 3.
- One-time invite links (we chose temp password + `mustChangePassword`).
- Real SMTP email delivery (dev logs the onboarding message to the server
  console; SMTP is wired but optional and untested here).
- User deactivation UI and the "last admin" protection guard.
- Durable/shared rate limiting (current limiter is in-memory, single instance).

---

## 2. Architecture decisions

### Why custom database-backed opaque sessions (not JWT / Auth.js)

- **Revocation.** This is a privacy-sensitive clinical app. We must be able to
  kill a session instantly (deactivate a user, force logout, rotate on password
  change). A stateless JWT cannot be revoked before it expires; a DB session row
  can be deleted, and the next request fails validation immediately.
- **Auditability.** Login, failed login, logout, and password changes must be
  recorded. Owning the flow makes these first-class instead of bolted on.
- **Forced password change.** The `mustChangePassword` gate is trivial with our
  own session + a server-side check; it is awkward with Auth.js credentials.
- **Lower dependency risk.** Next.js 16 is very new; avoiding a heavy auth
  dependency reduced compatibility risk and kept the security model explicit.

### Why session tokens are stored as hashes

- The raw token lives **only** in the user's httpOnly cookie. The database stores
  `tokenHash = HMAC-SHA256(token, AUTH_SECRET)`.
- If the database is ever leaked, an attacker gets only hashes and **cannot
  reconstruct a live token** (no `AUTH_SECRET`, and HMAC is one-way). This is the
  same principle as not storing plaintext passwords, applied to session tokens.

### Why `AUTH_SECRET` is needed

- It is the HMAC key used to derive `tokenHash` from the raw token. Without the
  secret, a leaked DB cannot be turned into valid cookies, and tokens can't be
  forged. It must be ≥32 chars (enforced by env validation).

### Why `mustChangePassword` exists

- Admins onboard doctors with a **temporary** password. That temp value is known
  to whoever created it and is sent over email, so it must not remain valid for
  normal use. `mustChangePassword = true` forces the user to set a private
  password on first login before they can reach the dashboard.

### Why first-admin seeding is needed

- The permission model is data-driven (roles/permissions are rows, not code
  enums). On a fresh database there is no way to log in or grant anything. The
  seed bootstraps the system: it creates every permission, the `ADMIN` system
  role with all permissions, and the first admin user — who can then run
  everything else. The seed is idempotent (safe to re-run).

### Why local PostgreSQL for development

- Cloud-agnostic and zero cost. The app only needs *a* PostgreSQL database; for
  development we use local PostgreSQL in WSL. Supabase (or any host) remains an
  optional production choice, not a requirement. No provider-specific features
  are used.

---

## 3. Database / schema changes

Eight tables were added in `prisma/schema.prisma` and created by
`prisma/migrations/20260610000000_init_auth/migration.sql`. All primary keys are
`cuid()` text ids.

### User
Account + login identity. Key fields: `email` (unique), `username` (unique),
`passwordHash`, `active`, `mustChangePassword`, `createdByUserId` (nullable
self-reference to the admin who created the account). Indexed on `email` and
`username`.

### DoctorProfile
Clinical profile for a user (`qualification` required; `registrationNumber`,
`specialization`, `notes` optional). One-to-one with `User` via a unique
`userId`. **Deleting a user cascades** to their profile.

### Role
A named role. `isSystemRole` marks built-in roles (only `ADMIN` for now).
`name` is unique. Roles are data, not code — supporting Phase 3's dynamic roles.

### Permission
A single capability, e.g. `patient.viewSensitive`. Fields: `key` (unique),
`label`, `description`, `category`. The full catalog (40 keys) is defined once in
`src/lib/permissions/keys.ts` and seeded into this table.

### RolePermission
Join table linking roles to permissions (many-to-many). Unique on
`(roleId, permissionId)`; both FKs cascade on delete.

### UserRole
Join table linking users to roles (a user can have multiple roles). Unique on
`(userId, roleId)`. `assignedByUserId` records who granted the role (nullable,
set null on delete). `userId`/`roleId` cascade on delete.

### Session
Server-side session. Stores `tokenHash` (unique — the HMAC of the opaque token,
never the raw token), `userId`, optional `ip`/`userAgent`, and three timestamps:
`createdAt`, `lastUsedAt`, `idleExpiresAt` (sliding), `absoluteExpiresAt` (hard
cap). Deleting a user cascades to their sessions.

### AuditLog
Append-only trail. Fields: `actorUserId` (nullable — failed logins may have no
known actor), `action`, `entityType`, `entityId`, `metadata` (JSONB),
`createdAt`. `actorUserId` FK is **ON DELETE SET NULL**, so audit history
survives user deletion. Indexed on `actorUserId`, `action`, `createdAt`.

### Important relationships
- `User 1—1 DoctorProfile`
- `User *—* Role` through `UserRole`
- `Role *—* Permission` through `RolePermission`
- `User 1—* Session`
- `User 1—* AuditLog` (as actor; nullable)
- `User → User` self relations: `createdByUserId` (who created the user) and
  `UserRole.assignedByUserId` (who assigned a role).

### The ADMIN role and seeded permissions
- The seed inserts all 40 permissions, upserts the `ADMIN` role with
  `isSystemRole = true`, and links **every** permission to it.
- At runtime, "admin" is also treated as **super access**: `userHasPermission`
  returns true for an admin regardless of the explicit permission set, so an
  admin is never accidentally locked out of a capability.
- Verified after seeding: `users:1, roles:1, perms:40, rolePerms:40,
  userRoles:1, sessions:0`; the admin is `active:true, mustChangePassword:true`
  with 1 role.

---

## 4. Authentication flow

### Login (`src/app/(auth)/login/actions.ts`)
1. Validate `{ identifier, password }` with Zod.
2. Rate-limit by `ip:identifier`. If exceeded → audit `failed_login`
   (`reason: rate_limited`) and return a generic "too many attempts" message.
3. Look up the user by **email OR username** (`findFirst`).
4. **Unknown user** → run `dummyVerify(password)` (burns comparable CPU time),
   audit `failed_login` (`reason: unknown_user`), return the generic error.
5. **Known user** → `verifyPassword`. If the password is wrong **or** the user
   is inactive → audit `failed_login` (`reason: bad_password | inactive`),
   return the generic error.
6. **Success** → reset the rate-limit bucket, `createSession`, audit `login`.
7. Redirect: if `mustChangePassword` → `/change-password`; else to a validated
   internal `next` path or `/dashboard`.

### Password change (`src/app/(auth)/change-password/actions.ts`)

There are **two** change-password flows behind one page/action. The action
calls `requireUser()` and then decides which flow applies **from the database
`mustChangePassword` flag on the authenticated user — never from a client
field**. A shared `applyNewPassword()` helper performs the common steps.

**Forced first-login flow (`mustChangePassword = true`)**
1. `requireUser()`.
2. Validate `{ newPassword, confirmPassword }` with `forcedPasswordChangeSchema`.
   **The current password is NOT requested again**, because the user already
   authenticated with the temporary password during login.
3. `applyNewPassword`: hash + store the new password; set
   `mustChangePassword = false`; audit `password_changed`; rotate sessions
   (invalidate all, then issue a fresh one so the user stays signed in on this
   device).
4. Redirect to `/dashboard`.

**Normal flow (`mustChangePassword = false`)** — unchanged, not weakened:
1. `requireUser()`.
2. Validate `{ currentPassword, newPassword, confirmPassword }` with
   `changePasswordSchema` (also enforces new ≠ current).
3. Verify the current password against the stored hash; on mismatch return a
   field error.
4. `applyNewPassword` (same as above) → redirect to `/dashboard`.

Both flows enforce the same password policy (≥12 chars with lower + upper +
digit) and the confirm-match check.

The UI matches the flow: the page passes `forced={user.mustChangePassword}` to
the form, which renders the "Current password" field **only when not forced**.
Because the flow is chosen server-side, a non-forced user can never skip the
current-password requirement by manipulating the form.

The `(dashboard)` layout enforces the gate: any authenticated user with
`mustChangePassword = true` is redirected to `/change-password` before any
dashboard content renders. The change-password page itself calls `requireUser()`
(an authenticated session is required), and `src/proxy.ts` cookie-gates the
route, so unauthenticated users cannot reach it.

### Logout (`src/app/(auth)/actions.ts`)
`getCurrentUser` → `destroyCurrentSession` (delete the DB row + clear the
cookie) → audit `logout` → redirect to `/login`.

### Session creation & validation (`src/lib/auth/session.ts`)
- **Create**: generate 32 random bytes (`base64url`) as the token; store
  `HMAC-SHA256(token, AUTH_SECRET)`; set `idleExpiresAt = now + 30m`,
  `absoluteExpiresAt = now + 7d`; set the `ht_session` cookie with the raw token.
- **Validate**: read the cookie, hash it, look up by `tokenHash`. Reject (and
  delete the row) if past idle or absolute expiry, or if the user is inactive.
  Otherwise slide `idleExpiresAt` forward (capped at the absolute expiry) and
  return the userId.

### Inactive users
`validateSession` rejects and deletes any session whose user is `active = false`,
so deactivating a user (once that UI exists) immediately invalidates their
sessions. `getCurrentUser` double-checks `active` as defense in depth.

### Wrong credentials
Every failure path returns the **same** generic message
("Invalid email/username or password.") so the response never reveals whether
the account exists or which field was wrong. A `failed_login` audit row is
written with the reason in metadata (server-side only).

---

## 5. Security decisions

- **Password hashing**: argon2id via `@node-rs/argon2` (argon2id is the
  library's default algorithm). Parameters follow OWASP guidance:
  `memoryCost 19456 KiB (~19 MiB)`, `timeCost 2`, `parallelism 1`. Passwords are
  never logged or returned.
- **Session token generation**: 32 cryptographically random bytes
  (`crypto.randomBytes`) encoded as `base64url`. High entropy, unguessable.
- **Session token hashing**: only `HMAC-SHA256(token, AUTH_SECRET)` is stored.
  Raw tokens never touch the database.
- **Cookie security**: `ht_session` is `httpOnly` (JS can't read it),
  `SameSite=Lax` (CSRF mitigation), `Secure` in production (`NODE_ENV` driven, so
  localhost still works over http), `Path=/`, with `maxAge` tied to the absolute
  window. Server-side validation remains authoritative regardless of the cookie.
- **Generic login errors**: identical message for unknown user, wrong password,
  and inactive account — prevents user enumeration.
- **Timing**: `dummyVerify` runs an argon2 verify against a throwaway hash when
  the user doesn't exist, so "unknown user" takes time comparable to "wrong
  password".
- **Failed-login audit logging**: every failure writes a `failed_login` row with
  a reason. This is for **forensics/detection**, not throttling.
- **Rate limiting**: an in-memory limiter (`10` attempts per `ip:identifier` per
  `15` minutes) is the actual brute-force control. It is clearly documented as
  single-instance/non-durable with a Phase 10 TODO to move it to a shared store.
- **Server-side authorization**: `requireUser`, `requirePermission`,
  `requireAdminAccess`, `hasPermission` run on the server in layouts, pages, and
  actions. Admin pages call `requireAdminAccess()` before doing anything.
- **Forced vs. normal password change is decided server-side**: the action picks
  the flow from the database `mustChangePassword` flag, not from any client
  input. The forced first-login flow intentionally omits the current-password
  check (the user already authenticated with the temporary password), while the
  normal flow still requires and verifies the current password. A non-forced
  user therefore cannot bypass the current-password requirement by tampering
  with the form, so the normal flow's security is not weakened. Both flows
  enforce the password policy + confirm-match, clear `mustChangePassword`, audit
  `password_changed`, and rotate the session.
- **Why frontend-only protection is not enough**: hiding a button or a nav link
  only changes what the UI shows; an attacker can still POST to a server action
  or hit a route directly. Authorization must be enforced where the data is
  read/written — on the server. The edge proxy is a UX redirect only and never
  the security boundary.

---

## 6. Permissions foundation

- Permissions are **data**: 40 rows in `Permission`, defined once in
  `src/lib/permissions/keys.ts` (typed `PermissionKey` union) and seeded.
- A user's effective permissions are computed in `getCurrentUser` by walking
  `UserRole → Role → RolePermission → Permission` into a `Set<string>`, plus an
  `isAdmin` flag (membership of the `ADMIN` system role).
- `userHasPermission(user, key)` = `isAdmin || permissions.has(key)`. ADMIN
  therefore has all permissions implicitly **and** explicitly (the seed links
  them), which guarantees super access.
- **What Phase 3 adds on top**: admin UIs to create roles, attach permissions to
  roles, and assign roles to users (writing `Role`, `RolePermission`,
  `UserRole`), plus the per-resource helpers that depend on the clinical schema
  (e.g. `canViewSensitivePatient`). The data model and runtime checks built in
  Phase 2 are designed so Phase 3 needs no migration to start assigning access.

---

## 7. Audit logging

### Events logged in Phase 2
`login`, `failed_login`, `logout`, `password_changed`, `user_created`
(constants in `src/lib/audit/log.ts`). Writes are non-throwing — an audit
failure logs to the server console and never breaks the user-facing action.
Metadata never contains passwords or raw tokens.

### Why audit logs matter here
This is a clinical/privacy system. Audit trails support accountability (who did
what, when), incident investigation (e.g. spotting brute-force or suspicious
logins), and compliance expectations for systems holding medical PII.

### What should be expanded later
Per `docs/SECURITY_MODEL.md §6`, later phases must audit patient/case/issue/
symptom/treatment views and edits, attachment view/download, doctor–patient
relationship changes, Explore searches, and AI usage. The `AuditLog` table and
helper already support arbitrary `action`/`entityType`/`entityId`/`metadata`, so
expansion is additive.

---

## 8. Local PostgreSQL and migration notes

- **Dev database**: local PostgreSQL in WSL (`localhost:5432`, database
  `homeo_trust_dev`). No cloud account needed.
- **`DATABASE_URL`**: connection the app uses at runtime (via the Prisma `pg`
  driver adapter). In production this is typically a pooled connection.
- **`DIRECT_URL`**: direct (non-pooled) connection used by Prisma migrations and
  the seed. In development it points at the **same** local database;
  `prisma.config.ts` uses `DIRECT_URL ?? DATABASE_URL`.
- **Shadow-DB issue (P3014)**: `prisma migrate dev` needs to create a temporary
  "shadow" database to detect drift, which requires the `CREATEDB` privilege.
  The dev DB user `homeo_user` does **not** have `CREATEDB`, so `migrate dev`
  failed with P3014.
- **Workaround used** (no elevated privilege required):
  1. Generate the migration SQL offline:
     `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
     --output prisma/migrations/<ts>_init_auth/migration.sql`
  2. Add `prisma/migrations/migration_lock.toml` (`provider = "postgresql"`).
  3. Apply with `prisma migrate deploy` (applies committed migrations, records
     them in `_prisma_migrations`, and does **not** use a shadow database).
- **Tip for the future**: granting `CREATEDB` locally
  (`ALTER USER homeo_user CREATEDB;`) lets you use `prisma migrate dev` normally
  (auto-generates + names migrations). Otherwise keep using the
  `migrate diff` → `migrate deploy` flow.

---

## 9. Important files changed

| File | Purpose | What changed in Phase 2 |
|---|---|---|
| `prisma/schema.prisma` | Data model | Added 8 models: User, DoctorProfile, Role, Permission, RolePermission, UserRole, Session, AuditLog |
| `prisma/migrations/20260610000000_init_auth/migration.sql` | First migration | Creates all 8 tables, indexes, and FKs |
| `prisma/migrations/migration_lock.toml` | Migrate metadata | Pins provider = postgresql |
| `prisma/seed.ts` | Bootstrap | Seeds 40 permissions, ADMIN role, first admin (`FIRST_ADMIN_*` env, `mustChangePassword`); idempotent; connects via `DIRECT_URL` |
| `prisma.config.ts` | Prisma config | Loads `.env.local`; migrations use `DIRECT_URL ?? DATABASE_URL`; registers `tsx prisma/seed.ts` |
| `src/lib/db.ts` | Prisma client | Lazy singleton via Proxy + `@prisma/adapter-pg` (Prisma 7 driver-adapter requirement) |
| `src/lib/env.ts` | Env validation | Lazy Zod validation; required `DATABASE_URL`/`AUTH_SECRET`; optional `DIRECT_URL`/SMTP |
| `src/lib/auth/password.ts` | Hashing | argon2id hash/verify; `dummyVerify` for timing |
| `src/lib/auth/session.ts` | Sessions | Create/validate/destroy; HMAC token storage; idle + absolute expiry; inactive-user rejection |
| `src/lib/auth/current-user.ts` | Identity | `getCurrentUser` (permissions + isAdmin), `requireUser`, `userHasPermission` |
| `src/lib/auth/rate-limit.ts` | Throttling | In-memory login rate limiter (documented single-instance) |
| `src/lib/auth/temp-password.ts` | Onboarding | Strong temp password generator meeting policy |
| `src/lib/auth/request-info.ts` | Metadata | Best-effort client IP / user-agent for audit/limit |
| `src/lib/auth/index.ts` | Barrel | Re-exports auth helpers |
| `src/lib/permissions/keys.ts` | Catalog | 40 permission definitions + `PermissionKey` type + `ADMIN_ROLE_NAME` |
| `src/lib/permissions/check.ts` | AuthZ | `hasPermission`, `requirePermission`, `requireAdminAccess` |
| `src/lib/audit/log.ts` | Audit | `writeAuditLog` + `AUDIT_ACTIONS`; non-throwing |
| `src/lib/validation/auth.ts` | Validation | Zod schemas: login, change password, create doctor; password policy |
| `src/lib/mail/mailer.ts` | Email | SMTP transport or dev console fallback (marked dev-only) |
| `src/proxy.ts` | Edge gate | Cookie-presence redirect for `/dashboard`, `/admin`, `/change-password` (Next 16 "proxy", replaces `middleware.ts`) |
| `src/app/(auth)/login/{page,LoginForm,actions}.tsx/.ts` | Login | Login screen + server action |
| `src/app/(auth)/change-password/{page,ChangePasswordForm,actions}` | Forced change | Change-password screen + action |
| `src/app/(auth)/actions.ts` | Logout | `logoutAction` |
| `src/app/(dashboard)/layout.tsx` | Guard | `requireUser()` + `mustChangePassword` redirect; renders shell with user |
| `src/app/(dashboard)/dashboard/page.tsx` | Landing | Authenticated home |
| `src/app/(dashboard)/admin/users/page.tsx` | Admin | Read-only users list (admin-only) |
| `src/app/(dashboard)/admin/users/new/{page,CreateDoctorForm,actions}` | Admin | Create-doctor flow (temp password + forced change) |
| `src/app/page.tsx` | Root | Redirect by auth state |
| `src/components/layout/{AppShell,Sidebar,Header}.tsx` | Shell | Accept user; conditional admin nav; sign-out button |
| `.env.example` | Config template | Local Postgres `DATABASE_URL`/`DIRECT_URL`, `FIRST_ADMIN_*`, optional SMTP |
| `docs/DATA_MODEL.md` | Docs | Documented the `Session` model + PostgreSQL note |
| `docs/SECURITY_MODEL.md`, `docs/PHASES.md`, `docs/PRODUCT_SPEC.md`, `docs/MASTER_SPEC.md` | Docs | Cloud-agnostic DB wording; Phase 2 DB requirement |

---

## 10. Manual testing checklist

- [ ] Visiting `/` or `/dashboard` while signed out **redirects to `/login`**.
- [ ] **Admin login** with the seeded username/email + `FIRST_ADMIN_TEMP_PASSWORD`
      succeeds.
- [ ] After that login, the app **forces `/change-password`** (cannot reach the
      dashboard first).
- [ ] On the forced change-password page, the form shows **only New password +
      Confirm new password** — **no "Current password" field**.
- [ ] Setting a valid new password (≥12, upper/lower/digit; confirm must match)
      lands on `/dashboard`; **logging in again with the new password** works,
      and the **old temporary password no longer works**.
- [ ] After the forced change, the user's `mustChangePassword` is **`false`** in
      the DB and an **`AuditLog` row** with `action = password_changed` exists.
- [ ] (Regression) For a user with `mustChangePassword = false`, the
      change-password page **still asks for the current password** and rejects a
      wrong one.
- [ ] Wrong password and unknown username both show the **same generic error**.
- [ ] After a failed login, an **`AuditLog` row** with `action = failed_login`
      exists; a successful login writes `login`.
- [ ] As admin, **Users → Create doctor** creates the account; temp credentials
      appear in the **server console** marked `[DEV EMAIL]` (no SMTP configured).
- [ ] The **new doctor's first login forces a password change**.
- [ ] **Logout** clears the session (cookie gone, `/dashboard` redirects to
      `/login`); an `AuditLog` `logout` row exists.
- [ ] A **non-admin** hitting `/admin/users` is rejected server-side.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass (verified green in
      this phase).

---

## 11. Problems faced and fixes

- **Cloud cost / provider lock-in** → Replaced the "Supabase-preferred" wording
  with **local PostgreSQL** for development; Supabase remains an optional
  hosted choice only. App uses no provider-specific features.
- **`prisma db pull` returned P4001 (empty database)** → Expected before any
  migration; introspection has nothing to read. Resolved simply by creating the
  schema via the migration.
- **`prisma migrate dev` failed with P3014 (shadow DB)** → `homeo_user` lacks
  `CREATEDB`, so Prisma couldn't create its shadow database. Worked around with
  `migrate diff` (offline SQL generation) + `migrate deploy` (no shadow DB). See
  §8. Optional future fix: grant `CREATEDB` locally.
- **Prisma 7 driver-adapter requirement** → Prisma 7's "client" engine requires
  a driver adapter; `new PrismaClient()` with no adapter throws. Fixed by using
  `@prisma/adapter-pg` and instantiating the client **lazily** (Proxy) so
  `next build` doesn't need `DATABASE_URL`.
- **Next.js 16 renames** → `middleware.ts` is deprecated in favor of `proxy.ts`,
  and `next lint` was removed (we run `eslint .`). Both adjusted.
- **Env validation runtime errors (how to debug safely)** → `env()` throws
  `"Invalid environment variables — check .env.local"` and logs **only the
  failing field names** (`fieldErrors` keys), never values. To debug: confirm
  `.env.local` defines the missing keys; you can list which expected keys are
  present/missing by name without printing values (load `.env.local` with dotenv
  and print `Object.keys(...)` filtered to the names you expect). Never echo the
  values.
- **Forced first-login asked for the current password (UX/security fix)** → The
  forced change-password page originally re-requested the current password,
  which is redundant after the user already authenticated with the temporary
  password. Fixed by adding a separate `forcedPasswordChangeSchema` (new +
  confirm only) and branching the action on the **server-side
  `mustChangePassword` flag**. The forced form hides the current-password field;
  the normal flow (flag = false) is unchanged and still requires it. See §4/§5.

---

## 12. What I should understand from this phase

- **Sessions vs. tokens.** A session is server state you can revoke; a JWT is a
  self-contained claim you generally cannot revoke early. For sensitive systems,
  revocability usually wins.
- **Defense in depth for secrets.** Don't store anything reversible: passwords
  are hashed (argon2id), and even session tokens are stored as HMACs, so a DB
  leak alone can't impersonate a user.
- **The cookie is a bearer credential.** `httpOnly` + `SameSite` + `Secure` plus
  server-side validation are what make it safe; the cookie's contents are never
  trusted on their own.
- **Authorization belongs on the server.** UI hiding is UX; the real gate is
  `requireUser`/`requirePermission`/`requireAdminAccess` next to the data.
- **Don't leak through error messages or timing.** Generic errors + a dummy hash
  on the unknown-user path prevent enumeration.
- **Permissions as data.** Modeling roles/permissions as rows (not enums) is what
  makes the "no fixed DOCTOR/REGIONAL_HEAD roles" rule possible and lets Phase 3
  add access without migrations.
- **Migrations are environment-aware.** The shadow-DB privilege issue shows why
  knowing your DB user's grants (and the `diff`/`deploy` escape hatch) matters.

---

## 13. Resume / interview talking points

- Built a **custom, database-backed session auth system** in Next.js 16 +
  TypeScript instead of using a JWT/third-party library, to get **instant
  revocation, audit hooks, and a forced password-change flow** for a clinical
  app.
- **Hardened sessions**: 256-bit random opaque tokens stored only as
  **HMAC-SHA256 hashes** (keyed by a server secret), httpOnly/SameSite/Secure
  cookies, and both **idle (sliding) and absolute** expiry.
- **argon2id password hashing** with OWASP-tuned parameters; **generic login
  errors + dummy-hash timing equalization** to prevent user enumeration.
- Implemented a **forced first-login password reset** with a clean UX: it skips
  the redundant current-password prompt (the user already authenticated with the
  temporary password) while the normal change-password flow still verifies it —
  with the choice made **server-side from a database flag**, not client input,
  so the standard flow's security is never weakened.
- Designed a **data-driven RBAC foundation** (Role/Permission/RolePermission/
  UserRole) with server-side authorization helpers; ADMIN modeled as the only
  fixed system role with implicit super access.
- Implemented **audit logging** (login, failed login, logout, password change,
  user creation) for a privacy/compliance-sensitive medical system.
- Added **best-effort login rate limiting** with an explicit path to a durable
  shared store.
- Operated **Prisma 7 with the pg driver adapter** on local PostgreSQL; solved a
  **shadow-database privilege issue (P3014)** using an offline
  `migrate diff` + `migrate deploy` workflow.
- Practiced **iterative, phase-gated delivery** with docs kept in lockstep
  (security model, data model, phase reports).

---

## 14. Next recommended phase

**Phase 3 — Dynamic permissions & roles.** Phase 2 deliberately ships only the
fixed `ADMIN` role and an admin-created doctor with **no permissions**. The
system is therefore secure but not yet useful for non-admins. Phase 3 should
build the admin UI to **create roles, attach permissions to roles, and assign
roles to users**, plus the **last-admin protection** guard and user
deactivation. This unlocks real, configurable access for doctors **before** any
clinical data exists (Phase 4), which is the correct order: define *who can do
what* prior to creating the sensitive records they will act on.

# Phase 5.1 Report — Patient Scope Permissions (breadth × depth)

> A focused refinement of the Phase 5 authorization model (not Phase 6/7).
> Introduces explicit **breadth** permissions so a non-admin can be granted
> "view all patients" without being an admin, and makes breadth and depth fully
> orthogonal. Source specs: `docs/SECURITY_MODEL.md`, `docs/MASTER_SPEC.md`.

---

## 1. Problem (from the Phase 5 review)

- Admin saw all patients; every non-admin was hard-scoped to related patients
  via `DoctorPatientRelationship`. There was **no permission** to grant a
  non-admin "view all".
- `patient.viewSensitive` controlled field **depth** but also doubled as section
  access, while breadth was implicit and admin-only.
- `patient.viewDeidentified` was largely inert for non-doctor users, because row
  scope was always relationship-based (no `DoctorProfile` → no rows).

## 2. Model introduced

Two orthogonal axes, admin bypasses both:

- **Breadth (which rows)** — `isPatientInScope`:
  - admin OR `patient.viewAll` → any patient (works **without** a `DoctorProfile`).
  - `patient.viewAssigned` → only patients related via `DoctorPatientRelationship`.
  - else → none.
- **Depth (which fields)** — `canViewSensitivePatient`:
  - admin OR (`patient.viewSensitive` AND in scope) → full PII; else de-identified.

A depth permission **never** grants row scope; a breadth permission **never**
reveals PII. A `viewAll` holder with no depth permission sees every patient
**de-identified** (safe default).

Example roles: Doctor = `viewAssigned`+`viewSensitive`; Research =
`viewAll`+`viewDeidentified`; Clinical reviewer = `viewAll`+`viewSensitive`.

## 3. Changes

### Permission catalog (`src/lib/permissions/keys.ts`)
Added `patient.viewAssigned` and `patient.viewAll` (category Patient). The
`PermissionKey` union extends automatically; the seed's `PERMISSIONS` loop and
ADMIN linkage pick them up with no seed code change (42 permissions now).

### Authorization helpers (`src/lib/permissions/patient-access.ts`)
- New `isPatientInScope` (the single breadth gate) and `canViewAllPatients`.
- `canViewPatient` → pure breadth (`isPatientInScope`).
- `canViewSensitivePatient` → depth AND breadth.
- `canEditPatient`, `canManagePatientDoctors`, and the Phase 6 clinical
  `permittedAndRelated` (all `case.*`/`issue.*`/`treatment.*`) → action
  permission AND `isPatientInScope`.
- `canAccessPatientsSection` → breadth-based (`viewAll` OR `viewAssigned` OR admin).
- `patientListWhere` → admin/`viewAll` → all; `viewAssigned` + `DoctorProfile` →
  related; else none.
- `isRelatedToPatient` retained (used by the `viewAssigned` branch).

### UI
- `src/app/(dashboard)/patients/page.tsx`: a viewing-scope label ("Viewing all
  patients" / "Viewing assigned patients") next to the count; `showSensitive`
  stays depth-based (correct — rows are already breadth-scoped).
- Role permission matrix shows the two new keys automatically (category-grouped).
- Nav/`canViewPatients` unchanged in code (goes through the helper).

### Audit
- `PATIENT_VIEWED` metadata now includes `scope: "admin" | "all" | "assigned"`
  (the breadth used to reach the patient) for attributability of cross-patient
  access. Still ids/flags only — no PII.

### Migration / data
- **No Prisma schema migration** (permissions are data rows). `prisma migrate
  status` stays at 3 migrations.
- **One-time backfill** `scripts/backfill-patient-view-assigned.ts` (run with
  `pnpm exec tsx scripts/backfill-patient-view-assigned.ts`): grants
  `patient.viewAssigned` to existing non-ADMIN roles that hold a depth
  permission but no breadth permission. **Deliberately not in `seed.ts`** —
  future roles must receive breadth explicitly. On this DB it granted
  `viewAssigned` to the "Doctor" role.

## 4. Explicit decisions

- **Existing Doctor users**: migrated at the **role** level — the "Doctor" role
  received `patient.viewAssigned` via the one-time backfill, so all its users
  keep exactly the prior related-only behavior + their existing depth. No
  per-user migration.
- **Existing roles**: ADMIN untouched (bypass + auto-linked). Other existing
  roles with a depth perm and no breadth perm got `viewAssigned` (one-time).
  New roles get breadth explicitly via the admin UI.
- **Does `patient.viewSensitive` imply row scope? — No.** Breadth and depth are
  strictly orthogonal; `viewSensitive` is kept out of both
  `canAccessPatientsSection` and `isPatientInScope`. A user with `viewSensitive`
  and no breadth sees zero patients (which is why the backfill grants
  `viewAssigned`).

## 5. Backward compatibility

- Additive permission rows; no schema migration; no destructive op.
- Behavior preserved via the one-time role backfill. Without it, a depth-only
  role would see zero patients — so the backfill must run with this upgrade
  (done on the dev DB).
- ADMIN unchanged.

## 6. Verification

```
pnpm db:seed     # 42 permissions (incl. the 2 new), ADMIN linked
pnpm exec tsx scripts/backfill-patient-view-assigned.ts   # granted to "Doctor"
pnpm lint        # ✅   pnpm typecheck  # ✅   pnpm build  # ✅
pnpm exec prisma migrate status   # ✅ 3 migrations, up to date
```

## 7. Manual test checklist

- [ ] Doctor (`viewAssigned`+`viewSensitive`): sees only related patients with
      full PII; list label says "Viewing assigned patients".
- [ ] Research (`viewAll`+`viewDeidentified`), **no DoctorProfile**: sees **all**
      patients de-identified; label "Viewing all patients"; no PII; opening any
      patient works (breadth = all).
- [ ] Clinical reviewer (`viewAll`+`viewSensitive`): all patients, full PII.
- [ ] `viewSensitive` only, no breadth: Patients section empty / no access
      (depth never implies scope).
- [ ] `viewAll` only, no depth: all patients, **de-identified**.
- [ ] `PATIENT_VIEWED` audit rows carry `scope` = admin/all/assigned correctly.
- [ ] Clinical pages (case/issues/treatments) reachable for a `viewAll` reviewer
      holding the relevant `*.view` permission, for unrelated patients.

## 8. Known limitation (unchanged / partially addressed)

- The Phase 5 §8 gap — **per-patient access for non-doctor staff** — is only
  *partially* addressed: non-doctor research/reviewer users can now see **all**
  patients via `viewAll`, but there is still no way to grant a non-doctor access
  to a **specific** patient. That still needs a future `UserPatientAccess` model
  feeding `isPatientInScope`/`patientListWhere`.

## 9. Next

Resume **Phase 7 — Attachments** (was paused for this refinement). Commit Phase 6
+ Phase 5.1 first.

# Phase 6 Report — Case, Issue, Symptom & Treatment Workflow

> Audience: me (the developer), for later revision and interviews. Scope: what
> Phase 6 actually implements — the clinical workflow on top of the Phase 5
> patient: one CaseRecord per patient, PatientIssues, PatientSymptoms,
> TreatmentEntries (combined prescription + follow-up) with treating/consulting
> doctors via TreatmentDoctorParticipant, soft-delete/archive for clinical
> history, and a merged patient timeline. Source specs: `docs/MASTER_SPEC.md`,
> `docs/DATA_MODEL.md`, `docs/SECURITY_MODEL.md`, `docs/PHASES.md`. No secrets or
> PII appear here.

---

## 1. Phase overview

### Implemented
- **CaseRecord** — view / create / edit, exactly one per patient (DB unique
  `patientId` + a single upsert action). No delete (one-per-patient).
- **PatientIssue** — create / edit / **archive** (soft-delete), with status
  (`ACTIVE`/`RESOLVED`/`CHRONIC`/`RECURRING`).
- **PatientSymptom** — create / edit / **archive** under a specific issue.
- **TreatmentEntry** — create / edit / **archive**, all four `entryType`s
  (`PRESCRIPTION`, `FOLLOW_UP`, `PRESCRIPTION_AND_FOLLOW_UP`, `NOTE`), optional
  link to a PatientIssue, all clinical fields, `patientCondition`
  (`IMPROVED`/`SAME`/`WORSENED`), `improvementScore`, `nextFollowUpDate`.
- **TreatmentDoctorParticipant** — treating (≥1 required) and consulting
  (optional) doctors selected by **DoctorProfile.id**, written/replaced
  transactionally with the treatment entry.
- **Patient timeline** — merged, newest-first view of patient creation, doctor
  assignment history, case record, issues, symptoms, treatments, and follow-ups,
  with an optional "show archived" toggle.
- **Clinical nav** tabs (Overview / Case / Issues / Treatments / Timeline) on the
  patient pages.
- **Soft-delete migration** (`20260611000000_clinical_soft_delete`) — additive
  nullable `deletedAt`/`deletedByUserId`/`deletionReason` + `deletedAt` index on
  PatientIssue, PatientSymptom, TreatmentEntry.
- **Audit logging** for case/issue/symptom/treatment create/update/archive, plus
  `CASE_VIEWED` on the case page.

### Intentionally NOT implemented
- No attachments / uploads / signed URLs (Phase 7).
- No Explore UI and no `ExploreCaseIndex` population (Phase 8).
- No AI / embeddings / vector search (Phase 9).
- No restore/un-archive (deferred — see §7).
- No new permission keys (the full `case.*`/`issue.*`/`symptom.*`/`treatment.*`
  catalog already existed from Phase 2).
- No fake PII seed data; no destructive reset; no hardcoded roles.

---

## 2. Database change (the only schema change in Phase 6)

Migration `20260611000000_clinical_soft_delete` — **purely additive,
non-destructive**:

```sql
ALTER TABLE "PatientIssue"   ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByUserId" TEXT, ADD COLUMN "deletionReason" TEXT;
ALTER TABLE "PatientSymptom" ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByUserId" TEXT, ADD COLUMN "deletionReason" TEXT;
ALTER TABLE "TreatmentEntry" ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByUserId" TEXT, ADD COLUMN "deletionReason" TEXT;
CREATE INDEX "PatientIssue_deletedAt_idx"   ON "PatientIssue"("deletedAt");
CREATE INDEX "PatientSymptom_deletedAt_idx" ON "PatientSymptom"("deletedAt");
CREATE INDEX "TreatmentEntry_deletedAt_idx" ON "TreatmentEntry"("deletedAt");
```

- No drops, no type changes, no data rewrite. `CaseRecord` is untouched (no
  archive — one per patient).
- The Phase 4 partial unique index `dpr_one_current_primary_per_patient` and the
  two prior migrations remain intact (verified after apply).
- Generated offline via `prisma migrate diff --from-config-datasource …
  --to-schema … --script` (read-only introspection; no shadow DB, since the dev
  user lacks `CREATEDB`), reviewed, then applied with `prisma migrate deploy`.
  `_deletedByUserId_` is a plain nullable id (no FK relation), matching the
  existing `assignedByUserId`/`uploadedByUserId` convention.

---

## 3. Architecture decisions

### Why soft-delete (archive), not hard delete
This is a clinical-history system. Issues/symptoms/treatments are archived
(`deletedAt` set, `deletedByUserId`, optional short `deletionReason`) and hidden
from normal lists, never physically removed — the same "model history, not
deletion" posture as Phase 5's soft-closed relationships. The UI says
**"Archive"**, not "Delete", while the permission keys/audit constants keep the
`*.delete` semantics. Archiving an issue keeps its child symptoms and any linked
treatments independent (no cascade); since the parent issue is hidden from
navigation, its symptoms are naturally out of normal view.

### Why one upsert action for CaseRecord
"Exactly one per patient" is enforced by the DB unique `patientId`, the singular
route (`/patients/[patientId]/case`), and a single `upsertCaseRecordAction` that
updates when a case exists (needs `case.update`) and creates otherwise (needs
`case.create`). There is no separate create route that could race a second
insert.

### Why TreatmentEntry + participants are written transactionally
A treatment entry and its treating/consulting doctor rows are one logical unit.
Create wraps the entry insert + `createMany` participants in a `$transaction`;
edit does entry-update + `deleteMany` + `createMany` (a clean replace of the
participant set) in one transaction, respecting the unique
`(treatmentEntryId, doctorProfileId, participantType)`.

### Why treating/consulting selectors use DoctorProfile.id
Clinical doctor involvement must never reference a generic `User`. The selectors
are populated by `loadDoctorOptions()` (DoctorProfile rows only), the action
re-validates every submitted id against `DoctorProfile`, and the FK is
`onDelete: Restrict`. A non-doctor user has no profile and therefore can never be
recorded as a treating/consulting doctor. A doctor listed as treating is removed
from the consulting list so the two roles don't double up.

### Why TreatmentEntry requires a CaseRecord
`TreatmentEntry.caseRecordId` is required, so the new-treatment page prompts to
create the patient's case first when none exists, and the action refuses to
create a treatment without a case.

---

## 4. Access control (reuses Phase 5's two-factor model)

New helpers in `src/lib/permissions/patient-access.ts` all follow the existing
rule **admin OR (permission AND related)** via a shared `permittedAndRelated`:

| Area | View | Create | Update | Archive |
|---|---|---|---|---|
| Case | `canViewCase` | `canCreateCase` | `canEditCase` | — |
| Issue | `canViewIssues` | `canCreateIssue` | `canEditIssue` | `canArchiveIssue` |
| Symptom | `canViewSymptoms` | `canCreateSymptom` | `canEditSymptom` | `canArchiveSymptom` |
| Treatment | `canViewTreatments` | `canAddTreatmentEntry` | `canEditTreatment` | `canArchiveTreatment` |

- Every page loader and every server action calls a helper; UI links are gated
  for UX only.
- Out-of-scope / archived rows resolve to **`notFound()`** (not 403), consistent
  with Phase 5 — existence isn't confirmed.
- Every action re-verifies ownership (the row belongs to the patient/issue in the
  URL) before any write, preventing cross-patient/cross-issue ID tampering.

---

## 5. Privacy & de-identification

- Clinical content (complaints, symptoms, medicines) is shown to anyone with the
  relevant `*.view` permission + relationship — it is not classed as PII.
- **Doctor identity stays gated**: treatment views and the timeline drive the
  doctor's `user.name` selection off `canViewSensitivePatient`; de-identified
  viewers see a neutral handle (`Doctor (specialization)` or `Doctor`) — the
  Prisma `select` never reads the name for them (`participantLabels` /
  `buildTimeline`). Same structural rule as Phase 5.
- **Audit metadata carries ids/enums + optional `deletionReason` only** — never
  clinical free text or PII. `deletionReason` is a short operator label,
  validated/capped at 200 chars.
- View auditing is spec-minimum: only `CASE_VIEWED`; issue/symptom/treatment list
  views are not audited (avoids noise).

---

## 6. Validation (Zod, server-side)

`src/lib/validation/clinical.ts` — every action `safeParse`s before any write:
`caseRecordSchema`, `createIssueSchema`/`updateIssueSchema`,
`createSymptomSchema`/`updateSymptomSchema`,
`createTreatmentSchema`/`updateTreatmentSchema`, and `archiveSchema`
(`{ patientId, id, reason? }`). Enum tuples (`ISSUE_STATUS_VALUES`,
`TREATMENT_ENTRY_TYPES`, `PATIENT_CONDITION_VALUES`) drive the form selects.
Doctor id lists are de-duplicated; treating requires ≥1. `src/lib/clinical/data.ts`
maps validated input to scalar columns (trim, null-empties, date/int coercion,
empty enum → null) — entryType-driven fields are still validated server-side even
when the form hides them.

---

## 7. Files created / changed

**New — lib:**
`src/lib/validation/clinical.ts`, `src/lib/clinical/{form-state,data,options,doctor-label,timeline}.ts`.

**New — components (`src/components/clinical/`):**
`fields.tsx` (shared inputs/SubmitButton/FormMessages), `ClinicalNav.tsx`,
`CaseRecordForm.tsx`, `IssueForm.tsx`, `IssueStatusBadge.tsx`, `SymptomForm.tsx`,
`ArchiveButton.tsx`, `TreatmentEntryForm.tsx`, `TimelineView.tsx`.

**New — routes (under `src/app/(dashboard)/patients/[patientId]/`):**
`case/{page,edit/page}.tsx` + `case/actions.ts`;
`issues/{page,new/page}.tsx`, `issues/actions.ts`,
`issues/[issueId]/{page,edit/page}.tsx`,
`issues/[issueId]/symptoms/{new/page,[symptomId]/edit/page}.tsx`;
`treatments/{page,new/page}.tsx`, `treatments/actions.ts`,
`treatments/[treatmentId]/{page,edit/page}.tsx`;
`timeline/page.tsx`.

**Edited:**
`prisma/schema.prisma` (+3 archive columns/indexes on Issue/Symptom/Treatment),
`prisma/migrations/20260611000000_clinical_soft_delete/migration.sql` (new),
`src/lib/permissions/patient-access.ts` (clinical helpers),
`src/lib/audit/log.ts` (case/issue/symptom/treatment actions),
`src/app/(dashboard)/patients/[patientId]/page.tsx` (clinical nav).

---

## 8. Commands to run

```
pnpm lint            # ✅ clean
pnpm typecheck       # ✅ clean
pnpm build           # ✅ success (all clinical routes present)
pnpm exec prisma migrate status   # ✅ 3 migrations, DB up to date
```

All four pass. `migrate status` reports 3 migrations (`init_auth`,
`clinical_schema`, `clinical_soft_delete`).

---

## 9. Manual test checklist (against local PostgreSQL)

**Case**
- [ ] Create case (no case yet) → saved; second visit shows view + Edit; a second
      case cannot be created (route is singular, upsert updates).
- [ ] `CASE_VIEWED` audit row on viewing the case.

**Issue / Symptom**
- [ ] Create/edit issue; status badge reflects status.
- [ ] Add/edit symptom under an issue; severity 1–10 validated server-side.
- [ ] **Archive** an issue → disappears from the issue list, still in DB; child
      symptoms and linked treatments untouched; `issue_deleted` audit row.
- [ ] **Archive** a symptom → hidden from the issue's symptom list; `symptom_deleted`.
- [ ] Cross-patient / cross-issue id tampering on edit/archive → error / 404.

**Treatment**
- [ ] New treatment with no case record → prompted to create the case first.
- [ ] Create each `entryType`; prescription/follow-up field groups show per type;
      required treating doctor (≥1) enforced server-side.
- [ ] Treating + consulting selectors list only DoctorProfiles; participants
      persist; edit replaces the set; non-doctor never selectable.
- [ ] `patientCondition` + `improvementScore` + `nextFollowUpDate` persist.
- [ ] **Archive** a treatment → removed from list, preserved in DB; `treatment_deleted`.

**Access / privacy**
- [ ] De-identified viewer sees clinical data but doctor shown as a neutral
      handle (no name) on treatment views and timeline.
- [ ] Unrelated doctor / no permission → 404 on clinical sub-routes; actions
      reject even if a form is reached.

**Timeline**
- [ ] Shows creation, assignments, case, issues, symptoms, treatments, follow-ups
      newest-first; "Show archived" reveals archived items marked **Archived**.

*(Automated checks in §8 were run and passed. The browser checks above are for a
live DB with seeded users; not executed in the implementation session.)*

---

## 10. Known limitations / follow-ups

- **No restore/un-archive** — archive is terminal in Phase 6; add a separate
  audited admin/clinical restore later.
- **Non-doctor staff** still can't be granted patient-specific access (the Phase 5
  `UserPatientAccess` gap is unchanged).
- **Timeline archived symptoms under archived issues**: the timeline filters each
  source by its own `deletedAt`; a non-archived symptom under an archived issue
  can still appear when archived issues are hidden. Minor; revisit if needed.
- Doctor multi-select is a native `<select multiple>` — functional but basic;
  a nicer chip picker can come later.

---

## 11. Next recommended phase

**Phase 7 — Attachments.** Upload issue photos / reports, link to
patient/issue/case/treatment, private storage + signed URLs, attachment
permissions (`attachment.*`) and audit logs. It builds on the Phase 6 clinical
entities (the `PatientAttachment` FKs to issue/case/treatment already exist from
Phase 4). Do not start until this Phase 6 commit is in.

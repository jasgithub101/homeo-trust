# Phase 8 Report — Explore (de-identified case explorer)

> **⚠️ SUPERSEDED MECHANISM (post-Phase-8 refactor).** This report describes the
> original implementation, which de-identified into a **materialized
> `ExploreCaseIndex` table** via a projection chokepoint
> (`src/lib/explore/projection.ts`) and a rebuild/refresh writer
> (`rebuild.ts`, `scripts/rebuild-explore-index.ts`, admin "Refresh index"). That
> machinery has been **removed**. Explore now reads a live de-identified Postgres
> **VIEW**, `explore_case_view` (Prisma model `ExploreCaseView`), created in
> `prisma/migrations/20260612010000_create_explore_case_view`; the table was
> dropped in `20260612020000_drop_explore_case_index`.
>
> What changed conceptually: de-identification is now **"correct by view
> definition + query-only-the-view"** instead of **"PII physically absent from a
> separate store"** — slightly weaker (a query against base tables could
> re-introduce PII), so the **view definition** and the **allow-list select in
> `query.ts` ("query only the view")** are the security-critical points. The
> `anonymousCaseCode` is no longer a stored CSPRNG value; results get an
> **ephemeral `Case A/B/…` label** assigned per result set in `query.ts`. The
> view is always fresh, so the **staleness window, on-write-sync TODO, the
> rebuild script, and the Refresh button no longer exist**. The N=5 city
> coarsening now lives as a literal in the view DDL (a documented sync point with
> `EXPLORE_MIN_COHORT`); query-layer N=5 suppression is unchanged. Everything
> below about *de-identification policy* (what is coarsened, the blocklist, the
> residual free-text leak path, Phase 9 AI must read the view) still holds — only
> the storage mechanism changed. See `SECURITY_MODEL.md` / `AI_PRIVACY_MODEL.md`
> for the current normative description.

## Goals

Give authorized staff a system-wide, **de-identified** case explorer: browse and
filter clinical cases across the whole database without ever exposing patient or
doctor PII, raw attachments, or internal/linking ids. This is also the clean seam
Phase 9 (AI) would consume — the same de-identified `ExploreCaseIndex`.

### Out of scope (deliberately NOT built)

AI / case-similarity / embeddings / vector search / LLM (Phase 9); OCR / text
extraction; any attachment access; search indexing beyond the structured
`ExploreCaseIndex`; on-write sync hooks; the D5 PII scrubber / controlled
vocabulary; production infra. The de-identified index is left as a clean seam for
AI, but none of it is built here.

## Approved decisions (as implemented)

- **D1 — coarsening.** Age → decade band via `ageRange()`; location = state/country
  always, city only when its cohort ≥ N (else coarsened to state); dates →
  `caseMonth` at `YYYY-MM`. No exact age/DOB/timestamps ever copied.
- **D2 — minimum cohort N = 5, SERVER-enforced.** A search whose matching cohort
  is `< N` suppresses individual rows **and** the count, returning only a
  "broaden filters" state. Zero and 1–4 matches collapse into the same state.
  Differencing attacks (A vs A+B) are a documented, unmitigated limitation.
- **D3 — no patient row scope.** Access is binary: `admin || explore.view`. No
  breadth, no depth escalation (a `patient.viewSensitive` holder still sees only
  de-identified Explore). Admin bypasses **access**, never de-identification.
- **D4 — 4 new columns + indexes** on `ExploreCaseIndex` (`issueStatuses`,
  `treatmentTypes`, `potencies`, `caseMonth`). Migration generated via
  `migrate diff` against the at-head live DB, shown for approval, applied with
  `migrate deploy`. No shadow DB, no reset, `DoctorPatientRelationship` untouched.
- **D5 — summaries source ONLY structured short fields** (`PatientIssue.title`,
  `PatientSymptom.symptomName`, `TreatmentEntry.medicineName`); never
  description/notes/instructions/followUpNotes/caseDescription. Normalized
  (trim/collapse/dedupe/length-cap). **k-anonymity does NOT scrub PII typed into
  these fields** — see Known limitations.
- **D6 — sync.** Idempotent rebuild + a single projection helper (the
  de-identification source of truth). On-write hooks deferred; admin "Refresh
  Explore index" action + documented staleness window. Rebuild upserts by
  `patientId`, deletes index rows whose patient no longer qualifies, excludes
  patients without a `CaseRecord`, and excludes archived (`deletedAt != null`)
  issues/symptoms/treatments at projection time.
- **D7 — `explore.filter` folded into `explore.view`** for Phase 8; the key stays
  seeded.
- **D8 (post-D2 addition) — per-role cohort-floor bypass as a PERMISSION.** The
  D2 suppression is opt-OUT-able via `explore.bypassCohortMinimum`
  (`admin || granted`), **default-granted to Explore roles** (one-time
  `scripts/backfill-explore-bypass.ts`), so the privacy floor is **opt-IN per
  role**: an admin revokes the permission on a role to enforce suppression for
  that role. It is a permission (not a global setting) so the floor can be tuned
  per role through the existing role-permission matrix, and so it is audited per
  search. Scope is narrow — it lifts ONLY the read-time row/count suppression and
  changes nothing else about de-identification.

## Architecture — the de-identification chokepoint

`ExploreCaseIndex` is de-identified **on the way IN**, never on read.

- `src/lib/explore/projection.ts` — **the single source of truth.** Pure (no
  `server-only`, no `db`) so both the request layer and the node rebuild script
  can import it. Produces every de-identified value: `ageRangeOrNull`,
  `caseMonth`, city retention via `locationCityKey` + `allowedCities`,
  `normalizeSummaries`, `improvementTrend`, and `generateAnonymousCaseCode`
  (CSPRNG, `node:crypto` — never derived from any id).
- `src/lib/explore/rebuild.ts` — the **only writer.** Loads qualifying patients
  (must have a `CaseRecord`) selecting only projection inputs (never PII columns),
  sizes city cohorts, projects, upserts by `patientId` (anonymousCaseCode is
  create-only → preserved across rebuilds), and deletes stale rows. Takes the
  Prisma client as a param so the script and the admin action share one code path.
- `src/lib/explore/query.ts` — the **only reader** at request time. Two structural
  guarantees: (1) an **explicit allow-list `select`** that never returns
  `patientId`/`caseRecordId`/index id/timestamps; (2) **k-anonymity** — count
  first, and if `< EXPLORE_MIN_COHORT` return `{ status: "suppressed" }` (no rows
  loaded, no count revealed).
- `src/lib/explore/constants.ts` — `EXPLORE_MIN_COHORT = 5`, used for **both** the
  city-retention threshold (projection) and the query suppression threshold.

## Files

**Created**
- `src/lib/explore/{constants,projection,rebuild,query}.ts`
- `src/lib/validation/explore.ts` (filter schema — enums/coarse bands/coarse
  location only; no free-text search)
- `src/lib/permissions/explore-access.ts` (`canUseExplore`, `canBypassCohortMinimum`)
- `scripts/rebuild-explore-index.ts` (idempotent rebuild CLI)
- `scripts/backfill-explore-view.ts` (one-time; NOT in `seed.ts`)
- `scripts/backfill-explore-bypass.ts` (one-time; NOT in `seed.ts`; default-grants
  `explore.bypassCohortMinimum` to `explore.view` roles)
- `prisma/migrations/20260612000000_explore_index_facets/migration.sql`
- `src/app/(dashboard)/explore/page.tsx` + `actions.ts`
  (`refreshExploreIndexAction`, `logExploreSearch`)
- `src/components/explore/{ExploreFilters,ExploreResults,RefreshIndexButton}.tsx`
- `docs/phase-reports/phase-8-explore.md` (this file)

**Edited**
- `prisma/schema.prisma` — D4 columns + `caseMonth` index on `ExploreCaseIndex`
- `src/lib/permissions/keys.ts` — `explore.bypassCohortMinimum` key (D8)
- `src/lib/audit/log.ts` — `EXPLORE_SEARCHED`, `EXPLORE_INDEX_REFRESHED`
- `src/components/layout/{AppShell,Sidebar}.tsx` + `(dashboard)/layout.tsx` —
  gated "Explore" nav (`canUseExplore`)
- `docs/{MASTER_SPEC,SECURITY_MODEL,AI_PRIVACY_MODEL,PHASES}.md`,
  `docs/session-handoffs/latest-handoff.md`

## Privacy & audit considerations

- **Reads only `ExploreCaseIndex`** — never the raw Patient/CaseRecord/Issue/
  Symptom/Treatment tables at request time, never attachments/storagePath.
- **Internal ids cannot leak**: allow-list select is the structural guarantee;
  `anonymousCaseCode` (CSPRNG) is the only case identifier the client ever sees.
- **Doctor is structurally absent** from the index (no doctor id is projected);
  `explore.viewDoctorName` remains future.
- **Blocklist never copied/emitted**: name, phone, email, exact address,
  emergency contact, exact patient/case id, DOB, exact age/timestamps, doctor
  name, raw attachments.
- **Audit** `explore_searched` logs PII-safe metadata only: applied filters
  (enums/bands/coarse location), `resultCount` (**null when suppressed**, so a
  small cohort size never reaches the log), and `suppressed`. `explore_index_refreshed`
  logs counts only. Never result ids, anonymous codes, names, or free text.
- **Access gating**: page calls `notFound()` for users without `explore.view`
  (no existence leak); the sidebar item is hidden the same way.

## Migration

`20260611010000_attachment_soft_delete` → `20260612000000_explore_index_facets`.
Purely additive: 4 nullable columns (`issueStatuses IssueStatus[]`,
`treatmentTypes TreatmentEntryType[]`, `potencies TEXT[]`, `caseMonth TEXT`) +
one B-tree index on `caseMonth`. Generated via
`prisma migrate diff --from-config-datasource prisma.config.ts --to-schema
prisma/schema.prisma --script` against the at-head live DB, reviewed/approved,
applied with `prisma migrate deploy` (no shadow DB, no reset). Did not touch
`DoctorPatientRelationship` / the `dpr_one_current_primary_per_patient` partial
index. The new permission link is **data**: `explore.view` is already seeded;
`scripts/backfill-explore-view.ts` grants it to existing Explore-holding non-admin
roles (one-time, NOT in `seed.ts`).

## Commands run (results)

- `pnpm typecheck` — ✅ clean
- `pnpm lint` — ✅ 0 errors (2 warnings: unused `_prev`/`_formData` required by
  the `useActionState` signature of the refresh action)
- `pnpm build` — ✅ success; `/explore` route present
- `pnpm exec prisma migrate status` — ✅ 5 migrations, DB up to date
- `pnpm db:seed` — ✅ 44 permissions (was 43; `explore.bypassCohortMinimum` added
  and linked to ADMIN)
- `pnpm exec tsx scripts/backfill-explore-view.ts` — ✅ (no role needed backfill)
- `pnpm exec tsx scripts/backfill-explore-bypass.ts` — ✅ granted bypass to the
  `explore.view`-holding roles (e.g. `Doctor`)
- `pnpm exec tsx scripts/rebuild-explore-index.ts` — ✅ scanned 1, upserted 1,
  kept 0 city cohorts (cohort < 5 → city coarsened; index row verified
  de-identified: age band, null city, CSPRNG code, `caseMonth` `2026-06`, no PII)

## Manual-testing checklist

> ⚠️ Requires being able to log in (see "Open item" below).

- [ ] User **with** `explore.view` (non-admin, no `patient.*`): sidebar shows
      Explore; page loads; results are de-identified (no name/phone/doctor).
- [ ] User **without** `explore.view` and non-admin: no sidebar item; visiting
      `/explore` directly → 404.
- [ ] `patient.viewSensitive` holder **without** `explore.view`: still 404 on
      `/explore` (depth does not grant Explore; D3).
- [ ] Low-cohort suppression: as a viewer WITHOUT `explore.bypassCohortMinimum`
      (e.g. `explorer_nobypass`), filter to a cohort of < 5 → "...results are
      hidden when fewer than 5 cases match..." state, **no rows and no count**.
      Confirm 0-match and 1–4-match filters render the same state.
- [ ] Cohort bypass: as a viewer WITH the bypass (e.g. `explorer_test`, or admin),
      run the SAME < 5 query → rows render (still de-identified, no PII) and no
      privacy message. Confirm `explore_searched` audit carries `cohortBypass: true`
      for this viewer and `false`/suppressed for the no-bypass viewer.
- [ ] Cohort ≥ 5: rows render; count shown; values are coarse (age band,
      `YYYY-MM`, state/country, city only on large cohorts).
- [ ] Filters (gender, age range, state, country, issue status, treatment type)
      narrow results; "Reset" clears.
- [ ] Admin "Refresh index": after a clinical edit, results are stale until
      refresh/rebuild; clicking refresh updates them; success message shows.
- [ ] Audit: `explore_searched` rows contain only filters/`resultCount`/
      `suppressed` (null count when suppressed); `explore_index_refreshed` only
      counts. No ids/names/free text.

## Known limitations

- **D5 — free-text PII in structured fields (residual leak).** Summaries come
  from `title`/`symptomName`/`medicineName` only, but **k-anonymity does not
  scrub PII a user types into them**. This is the one residual PII path into
  Explore — and into Phase 9 AI, which consumes the same index. Future fix:
  controlled vocabulary / server-side PII scrub on projection (not built).
- **D2 — differencing attacks.** Suppression hides small cohorts but does not
  defend against inferring a small delta by comparing cohort A vs A+B. Documented,
  not mitigated now.
- **D2 bypass — re-identification tradeoff (added post-D2).** `explore.bypassCohortMinimum`
  (`admin || granted`) lifts the <5-case row/count suppression for a viewer and is
  **default-granted to Explore roles** (`scripts/backfill-explore-bypass.ts`), so
  the privacy floor is opt-IN per role. This accepts re-identification risk from
  very small cohorts by default; revoke the permission on a role to enforce the
  floor. Scope is narrow — it lifts only the suppression backstop and never
  changes core de-identification (no raw tables, no PII fields, city still
  coarsened at projection). Matters for Phase 9 AI, which consumes this index.
  Audit `explore_searched` now carries a `cohortBypass` flag.
- **D6 — staleness window.** No on-write sync hooks; the index is only as fresh
  as the last rebuild / admin refresh.
- **Performance (non-blocking).** Array facets (`issueStatuses`/`treatmentTypes`/
  `potencies`) are filtered with `has`, which a B-tree index does not serve;
  **GIN indexes on the filterable array columns** are a future performance item
  if Explore ever runs on real volume. Matches the existing
  `issueSummaries`/`symptomSummaries` handling (no GIN); fine at dev scale.
- **Filters shipped** are gender/age/state/country/issue-status/treatment-type;
  the spec's medicine/symptom/potency/exact-date filters are deferred (the
  de-identified facets exist in the index to add them later).

## Open item — login / blank page (verify before manual testing)

The Explore manual-test checklist cannot be exercised without logging in. A
prior login / blank-page (200) issue was raised in an earlier session; **this
session has no record of a root cause or fix for it** (the session was
`/clear`-ed before Phase 8). **Action for the executor:** confirm login works
(and capture the root cause) before running the checklist above. If it recurs,
treat it as a blocker for Phase 8 sign-off.

## Resume / interview talking points (this phase)

- **How do you prevent re-identification in a de-identified dataset?** Two layers:
  coarsening at projection (age bands, `YYYY-MM`, city only on cohorts ≥ 5, no exact
  ids/dates) and a k-anonymity floor at read (cohorts < 5 suppress rows *and* count,
  with 0 and 1–4 collapsed so you can't even size a small cohort).
- **Why de-identify at write time rather than read time?** A single projection
  chokepoint means the stored index *is* the de-identified data — a buggy or new
  read path physically cannot re-derive PII because it was never written. Read-time
  de-identification puts the PII one missed filter away from leaking.
- **How is internal-id leakage structurally prevented?** The read layer selects an
  explicit allow-list of de-identified columns and never `select`s the row
  wholesale, so `patientId`/`caseRecordId`/index id/timestamps can't reach a
  client payload even by accident. The only case identifier returned is a random
  `anonymousCaseCode`.
- **Why is `anonymousCaseCode` a CSPRNG value generated once, not a hash of the id?**
  A hash/transform of `patientId` is reversible/linkable (dictionary or join attack);
  a stored random value carries no information about the source row.
- **How does the cohort-bypass permission avoid exposing PII?** It lifts *only* the
  row/count suppression backstop. Every other control — read-only `ExploreCaseIndex`,
  the allow-list select, projection-time city coarsening, the PII blocklist — still
  applies, so the worst case is seeing a *de-identified* small-cohort row, never PII.
- **Why a permission instead of a global setting/toggle?** It composes with the
  existing dynamic role-permission model (no new config surface), is tunable per
  role, and is auditable per search via the `cohortBypass` flag — a global flag
  would be coarser and invisible in the audit trail.
- **What is the residual leak you did NOT close, and why be explicit?** Summaries
  come only from structured short fields, but a user can still type PII into an
  issue title / symptom name / medicine name, and k-anonymity does not scrub that.
  Documented honestly because the future fix (controlled vocabulary / server-side
  PII scrub) is real work and Phase 9 AI would inherit the same path.
- **Why no patient row-scope on Explore when the rest of the app uses breadth×depth?**
  Explore is a *de-identified aggregate* view; row-scoping it would leak "this
  doctor's patients" structure and defeat the cross-system browse goal. Access is
  binary; sensitivity is handled entirely by de-identification, not by scope.
- **How do you keep the index in sync without on-write hooks?** An idempotent
  rebuild (upsert by `patientId`, delete rows whose patient no longer qualifies)
  plus an admin "Refresh" action; the tradeoff is a documented staleness window,
  chosen over coupling every clinical write to index maintenance for this phase.
- **How is the audit log kept PII-safe?** It stores filters as enums/bands/coarse
  location, `resultCount` (null when suppressed so a small size never lands in the
  log), `suppressed`, and `cohortBypass` — never result ids, codes, names, or free
  text.

## Recommended next phase

**Phase 10 (Security, Testing, and Polish).** Phase 9 (AI similarity assistant)
is **deferred** — parked, not dropped: it would consume this same de-identified
`ExploreCaseIndex`, and `AISearchLog` + `ExploreCaseIndex` remain so it can be
revived. Before reviving Phase 9, implement the D5 controlled-vocabulary /
server-side PII scrub so the AI does not inherit the free-text leak path.

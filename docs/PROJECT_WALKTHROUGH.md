# Homeo Trust — Project Walkthrough

> **Audience:** the project's author, preparing to explain the whole system
> end-to-end in technical interviews. This is the single narrative "home" — it
> ties the parts together and emphasizes **why** and **tradeoffs**, not just
> **what**.
>
> **It does not restate the reference docs — it points at them.** For depth:
> `docs/PRODUCT_SPEC.md` (scope), `docs/SECURITY_MODEL.md` (authorization, audit),
> `docs/AI_PRIVACY_MODEL.md` (Explore/AI de-identification), `docs/DATA_MODEL.md`
> (entities), `docs/PHASES.md` (build plan), `docs/phase-reports/*` (per-phase
> detail), `docs/session-handoffs/latest-handoff.md` (current branch/WIP state).
>
> **Status honesty (dev HEAD):** Phases 1–8 implemented + committed; Phase 10b
> (privacy + privilege-tier hardening) committed (`7a0f437`); Phase 9 (AI) is
> **parked by design**; the rest of Phase 10 (automated tests, polish) is **not
> done**; the Windows self-host packaging **source** is committed (`97cb5ba`) but
> **not built or verified on Windows/Neon**. Don't present parked/pending work as
> shipped.

---

## 1. Project overview — the problem

A privacy-sensitive **patient-management system for a single homeopathy clinic**,
self-hosted (single-tenant). It records patients, issues/complaints, symptoms,
case records, medicines, follow-ups, outcomes over time, and attachments
(reports/photos).

The interesting problem is **not CRUD** — it's that the data is medical PII and
there's a *research surface* (Explore, and a parked AI assistant) that must expose
clinical patterns **without** exposing patients. So the real engineering is:
a dynamic permission model, server-side authorization on every write, an audit
trail, de-identification for the research view, and secure-by-default handling of
files and secrets. Built in disciplined phases (`docs/PHASES.md`) with a
plan → approve → implement → report loop.

> 30-second pitch lives in `docs/interview-prep.md §0` (that doc is **superseded**
> for privacy details — see the banner there — but the pitch framing still holds).

---

## 2. Stack & why

| Layer | Choice | Why (the tradeoff) |
|---|---|---|
| Framework | **Next.js (App Router)** — Server Components + Server Actions | Co-locate mutations with UI, type-safe end-to-end, no separate API tier to keep in sync. Authorization still lives server-side regardless of transport. |
| Language | **TypeScript** | Types as a design tool across schema → query → UI. |
| DB | **PostgreSQL** | Relationship-heavy schema, real constraints (partial unique indexes, enums), and a **SQL VIEW** as a de-identification boundary — see §6. (Why not SQLite: §13.) |
| ORM | **Prisma 7** with the **pg driver adapter** | Typed queries + an explicit, reviewable migration trail. Prisma 7's client engine needs a driver adapter; the client is created **lazily via a Proxy** (`src/lib/db.ts`) so `next build` doesn't need `DATABASE_URL`. |
| Validation | **Zod** | One validation source of truth, parse-don't-validate at the boundary, shared shapes. |
| Styling | **Tailwind CSS** | Utility-first, no separate stylesheet drift. |
| Pkg mgr | **pnpm** | Strict, fast, content-addressed store. |
| Hashing | **argon2id** (`@node-rs/argon2`) | Memory-hard password hashing (m=19456, t=2, p=1). Native binary — see the packaging trap in §10. |

Runtime DB routing matters for production: the **app uses pooled `DATABASE_URL`**
(`src/lib/db.ts`), while **migrations/seed use direct `DIRECT_URL`**
(`src/lib/env.ts` marks `DIRECT_URL` optional at runtime). This keeps the app off
the direct endpoint so it doesn't exhaust a pooler/connection-limited DB (e.g.
Neon free tier).

---

## 3. Architecture — request flow & the single gate

```
Browser ──> Server Component (read)            ──┐
        └─> Server Action / Route handler (write)─┤
                                                  ▼
                       requireUser() / requirePermission()      (authn + coarse authz)
                                                  ▼
                       isPatientInScope() / can*() helpers      (breadth × depth gate)
                                                  ▼
                       Prisma (allow-list select) ──> PostgreSQL
                                                  ▼
                       writeAuditLog() (ids/enums only)
```

The load-bearing idea: **every sensitive read re-authorizes per request and every
write re-checks scope *before* it mutates** — the frontend hiding a button is never
the control. The "single gate" is the set of authorization helpers in
`src/lib/permissions/` (esp. `patient-access.ts`); all clinical reads/writes layer
their action permission on top of `isPatientInScope`. Out-of-scope or archived rows
return `notFound()` (not 403) so existence isn't even confirmed to someone who
shouldn't see the row.

> Full helper list + rules: `SECURITY_MODEL.md §5, §7`.

---

## 4. Data model & key decisions

Detail in `docs/DATA_MODEL.md`; the **decisions** worth narrating:

- **One `CaseRecord` per patient** (DB unique on `patientId`). *Problem:* should a
  patient have many "cases"? *Choice:* no — in this clinic a patient **is** a
  longitudinal case; issues/symptoms/treatments hang off the single case over
  time. *Why:* keeps the timeline coherent instead of fragmenting one person across
  parallel case rows.
- **Combined `TreatmentEntry`** (prescription + follow-up in one entry-type enum,
  with a `patientCondition` outcome). *Problem:* model prescriptions and follow-ups
  separately? *Choice:* one entity. *Why:* in homeopathy a follow-up **is** a
  re-prescription event — you assess and adjust in the same encounter — so one
  ordered stream beats two logs you have to interleave.
- **No `doctorId` ownership column** on Patient/Case/Issue/Symptom/Treatment.
  *Problem:* the obvious move is an owner FK. *Why it's wrong here:* patients get
  **transferred** between doctors and a treatment can involve **multiple** doctors —
  a single owner column overwrites history and can't express multi-doctor cases.
  *Choice:* doctor involvement lives in two relationship tables —
  **`DoctorPatientRelationship`** (assignment history; "assigned" for
  `viewAssigned` is derived from current rows here) and
  **`TreatmentDoctorParticipant`** (per-treatment treating/consulting). *Payoff:*
  accurate history, clean transfers, and **authorization never depends on row
  ownership** — it comes from roles + relationships.
- **`User` vs `DoctorProfile`:** a `User` is any staff member; `DoctorProfile` is
  **optional**, only for clinical doctors, and is a clinical identity — **not** a
  source of permissions. That's why a non-doctor admin can hold `viewAll` with no
  `DoctorProfile`.

---

## 5. Security model — orthogonal authorization

The headline design. Authorization is purely **User → Role → Permission**; roles
are **dynamic data**, the only fixed role is `ADMIN`. Access has **two orthogonal
axes**:

- **Breadth** = *which* patients (row scope): `patient.viewAssigned` (related only)
  vs `patient.viewAll` (everyone).
- **Depth** = *how much* of each (field sensitivity): `patient.viewSensitive` (full
  PII) vs de-identified.

*Why orthogonal instead of tiered "access levels":* real roles don't fall on one
axis. Reception = **wide but shallow** (all patients, non-sensitive fields); a
treating doctor = **narrow but deep** (own patients, full PII). A single scale
can't say both. The invariants: **depth never grants breadth, breadth never reveals
PII**, and depth is gated *behind* breadth (`viewSensitive` only yields PII for
patients already in your row scope). **Admin bypasses both.**

Supporting guards (don't restate — link `SECURITY_MODEL.md §3.1, §4`):
- **Dynamic roles** + **last-admin lockout guard** + reserved/protected `ADMIN`.
- **Privilege-tier guard (Phase 10b)** in `src/lib/permissions/privilege-tier.ts`:
  role assignment and admin password reset can't be used to escalate — see §10.
- Server-side re-checks on every action; audit metadata is **ids/enums only**.

---

## 6. Privacy / de-identification — Explore

This is the most distinctive subsystem. Full spec: `AI_PRIVACY_MODEL.md §3`;
mechanism note: `SECURITY_MODEL.md "Explore"`.

- **Explore reads a live de-identified Postgres VIEW — `explore_case_view`**
  (Prisma model `ExploreCaseView`), via an allow-list `select` in
  `src/lib/explore/query.ts`. The view SELECTs only coarsened/structured columns
  (age band, `caseMonth` as `YYYY-MM`, coarse location) and **has no column for PII
  or for a real patient/case id** — so a read literally cannot surface PII.
- **Why a view replaced the materialized table** *(the refactor story — §10):* the
  original design (`ExploreCaseIndex`, Phase 8) de-identified **on write** via a
  `projectPatient` projection + a rebuild script + a manual "Refresh" action. That
  guaranteed "PII is physically absent from a separate store" but bought a
  **staleness window** and rebuild machinery. The view (`9332e6b`) is **always
  fresh** (no projection/rebuild/refresh) at the cost of a *slightly weaker*
  guarantee — "correct **by view definition** + query-only-the-view" — which makes
  two things load-bearing: the **view DDL** and the **allow-list select** (the "only
  ever query the view" discipline). A conscious tradeoff: freshness + less code vs
  physical-absence. Migrations: `20260612010000_create_explore_case_view` then
  `20260612020000_drop_explore_case_index`.
- **k-anonymity floor (N=5).** Rare quasi-identifier combinations ("70s woman, this
  city, this rare condition") re-identify even without names. So when a filtered
  cohort is `< EXPLORE_MIN_COHORT (5)`, the query layer suppresses **both rows and
  count** ("broaden your filters") — server-enforced, not UI. ⚠️ **The `5` lives in
  two places** — a literal in the view DDL (a view can't import a TS constant) and
  `EXPLORE_MIN_COHORT` in `src/lib/explore/constants.ts` — a documented **sync
  point** (`AI_PRIVACY_MODEL.md §3.1`). Separately, inside the view the **`city`
  column is set to `NULL`** for a row whose `(country,state,city)` cohort is `< 5`
  (`CASE WHEN city_size >= 5 THEN city ELSE NULL`); `state` and `country` are
  always-present coarse columns, so such a row degrades to **state-level** rather
  than exposing a near-unique city.
- **The bypass permission** `explore.bypassCohortMinimum` lifts **only** the
  read-time row/count suppression for trusted roles (default-granted to Explore
  roles → privacy floor is opt-IN per role). It **never** touches core
  de-identification (no raw tables, no PII columns, city coarsening still applies)
  and every bypassed search is audited. A deliberate, logged trade for an internal
  trusted-staff tool.
- **The free-text PII leak — closed in Phase 10b** (`AI_PRIVACY_MODEL.md §3.2`).
  *Discovery:* the view's clinical summaries were sourced from **user-typed** short
  fields (`issue.title`, `symptomName`, `medicineName`, `potency`). k-anonymity
  defends against re-identification by *combination* — it does **not** scrub PII
  someone literally types into a title (e.g. a patient's name). *Fix:* those four
  free-text columns were **removed from the view**
  (`20260612030000_explore_view_drop_freetext_summaries`) — the view now carries
  **no clinical free text** (correct-by-definition, not "doctors must remember not
  to type PII"). *Precisely:* "no *clinical* free text" — `state`/`country` remain
  coarse demographic free-text (**Residual 1b**, deferred). Re-adding clinical
  summaries must go through a **curated vocabulary** (**Residual 1a**), never a raw
  column — this is the gate before any AI consumes the view.

---

## 7. Other clinical/data patterns

- **Archive, never hard-delete** (soft delete) for issues/symptoms/treatments:
  nullable `deletedAt`/`deletedByUserId`/`deletionReason`, lists filter
  `deletedAt: null`, UI says "Archive". *Why:* clinical history is
  medico-legally important; destroying it is the wrong default. Archiving an issue
  **doesn't cascade** to its symptoms/treatments; `CaseRecord` isn't archivable (one
  per patient); **no restore yet** (scoped out). Detail:
  `phase-reports/phase-6-clinical-workflow.md`.
- **Audit logging with PII-safe metadata** — `src/lib/audit/log.ts`. Every
  sensitive action is logged with **ids/enums/coarse values only** — never PII,
  never filenames, never secrets, never clinical free text. Full action list:
  `SECURITY_MODEL.md §6`.
- **Private attachments + signed URLs** — provider-agnostic storage port
  (`src/lib/storage/*`): local disk (default, **outside `public/`**) with an
  S3-compatible stub for later. Opaque server-generated keys (no PII, no original
  filename, traversal-guarded); reachable **only** via an authenticated download
  route that re-authorizes every GET, asserts `attachment.patientId === route
  patientId` (IDOR guard), and ships `nosniff` + forced-download as the compensating
  control for deferred magic-byte validation. Detail:
  `phase-reports/phase-7-attachments.md`; security: `SECURITY_MODEL.md "Attachments"`.

---

## 8. Auth & account flows

Full spec: `SECURITY_MODEL.md §3, §3.1`. The narrative:

- **First-admin bootstrap** via seed (`prisma/seed.ts`), `mustChangePassword=true`.
- **Sessions:** opaque DB-backed tokens, HMAC-SHA256-hashed at rest
  (`src/lib/auth/session.ts`); rotated on password change (all sessions invalidated,
  fresh one issued for the caller).
- **Self change-password:** re-verifies the **current password server-side**
  (argon2, constant-time) — the session alone isn't sufficient — and that check is
  **rate-limited** (keyed `pwchange:{userId}`) so the form can't be a guessing
  oracle.
- **Admin reset:** generates a temp password, forces change, **kills all target
  sessions**, shows the temp password **once on screen** (never emailed/persisted/
  logged); gated on `user.update` + no self-reset + ADMIN-target needs admin + the
  **privilege-tier subset guard** (§10).
- **Email fully removed** (`f186818` "remove mailer"): recovery is admin-driven; the
  logged-out `/forgot-password` is a **static "contact your administrator"** page —
  takes no identifier, so **no user enumeration**. Every flow works with no mailer.
- *Note:* the brute-force/oracle limiter is **in-memory, single-instance** — the
  appropriate lightweight choice for a single-instance self-host; revisit only if
  run multi-instance.

---

## 9. Distribution / self-host

- **`output: "standalone"`** Next build → a self-contained server bundle (the app
  + traced `node_modules`), the basis for shipping without a full repo install.
- **Windows self-host packaging** (`scripts/package-windows.mjs`, `packaging/windows/**`)
  — `--variant full|lite`:
  - **full** bundles portable Node **and** PostgreSQL → fully **offline, all data on
    the PC** (most private). Larger; needs more disk/RAM.
  - **lite** bundles portable Node only → app points at a **remote DB (e.g. Neon)** →
    **lighter for low-spec ~4 GB laptops**, but needs internet and **PII leaves the
    machine**. (Attachments still accumulate on local disk regardless — cloud
    attachment storage is future work.)
  - Mode is chosen on the customer machine via `HT_DB_MODE` in `lib/ht.mjs`; the same
    `migrate deploy` (DIRECT_URL) + first-admin seed runs in both.
- **The privacy tradeoff is the pivot:** local = private/offline/heavier; remote =
  lighter/cloud/PII-leaves. Customer guide: `packaging/windows/SETUP_GUIDE.txt`.

> ⚠️ **Honest status:** this is committed **source** (`97cb5ba`). **No zip has been
> built and no `.bat`/Neon flow has been executed or verified on Windows** — it was
> authored + sanity-checked on Linux/WSL only. The win32-x64 build + two-mode
> end-to-end verification must run on a Windows host before any release
> (`latest-handoff.md §9a`). Present it as *designed/queued*, not *shipped*.

---

## 10. Engineering challenges & how solved (STAR — the interview gold)

Each is **Situation → Task → Action → Result**, phrased to tell out loud.

1. **Materialized table → live view refactor** *(§6).* **S:** Phase 8 de-identified
   on write into `ExploreCaseIndex` with a rebuild + manual refresh; data went
   stale between rebuilds. **T:** keep the de-id guarantee but kill the staleness.
   **A:** replaced the table with `explore_case_view` and an allow-list select;
   dropped the projection/rebuild/refresh. **R:** always-fresh Explore, less code —
   consciously trading "PII physically absent" for "correct by view definition +
   query-only-the-view." *Lesson:* name the guarantee you're weakening and make the
   replacement control load-bearing and explicit.

2. **The empty Prisma `select` runtime crash.** **S:** a `viewAll`-but-not-
   `viewSensitive` user opened the patient list → `PrismaClientValidationError`.
   **T:** find why green CI shipped a broken query. **A:** the de-identified branch
   built a doctor `select` whose only field, `name`, was gated on sensitive access →
   collapsed to `{ name: false }`, an **empty** select Prisma rejects **at query
   time** (so typecheck/lint/build all passed). Fixed by adding `id: true` to keep
   the select non-empty while `name` stayed gated (opaque id, never rendered) — the
   *wrong* fix (flip `name` on) would leak doctor identity. Swept all six sites of
   the pattern. **R:** privacy-preserving fix. *Lesson:* green CI doesn't prove a
   runtime-validated query path works — you must exercise it.

3. **Server-Actions 1 MB upload cap (413).** **S:** uploads over ~1 MB 413'd though
   the validator allowed 15 MB (`MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024`,
   `src/lib/validation/attachment.ts`). **T:** reconcile transport vs business
   limits. **A:** Next.js Server Actions default to a **1 MB** request-body limit →
   files 413'd before validation ran; set `serverActions.bodySizeLimit: "16mb"` in
   `next.config.ts` (headroom just above the 15 MB validator), and logged presigned
   direct-to-storage upload as the real production answer (bytes never transit the
   action). **R:** unblocked, with the better design captured. *Lesson:* make the
   framework's transport limit and your business-rule limit agree.

4. **Deterministic view identity — the `row_number()` ORDER BY trap.** **S:** the
   view needs a synthetic `rowId` (Prisma requires a view identifier) but must
   expose **no real id**. **T:** generate a stable identifier without leaking a real
   id and without a nondeterministic result order. **A:** in the view DDL the id is
   `row_number() OVER (ORDER BY to_char(case_created_at,'YYYY-MM') DESC NULLS LAST,
   pid)` — `NULLS LAST` plus the `pid` tiebreaker make the ordering **total and
   deterministic** (without them `row_number()` ordering is ambiguous and rows can
   shuffle between runs), and every dedup CTE (`DISTINCT ON … ORDER BY`) likewise
   depends on an explicit, stable order. **R:** a stable synthetic `rowId` that is
   never a real id and never client-bound. *Lesson:* a hand-written SQL view is
   **untyped surface** — Prisma can't catch a missing `NULLS LAST` or tiebreaker, so
   ordering determinism is something you design in deliberately, not assume.

5. **Discovering & closing the free-text PII leak (Phase 10b)** *(§6).* **S:** the
   view's clinical summaries came from user-typed short fields. **T:** realize
   k-anonymity doesn't scrub *typed* PII and close it structurally. **A:** removed
   the four free-text columns from the view (`...drop_freetext_summaries`); deferred
   re-introduction to a curated vocabulary. **R:** the view carries **no clinical
   free text** — correct-by-definition, not dependent on user behavior. *Lesson:*
   distinguish re-identification-by-combination (k-anonymity's job) from PII-in-a-
   cell (needs structural removal or curation).

6. **Privilege-tier escalation on `resetUserPasswordAction` + `setUserRolesAction`
   (Phase 10b).** **S:** a non-admin `user.update`/`user.assignRole` holder could
   reset a **more-privileged** user's password (a credential that authenticates AS
   them) or assign permissions they don't hold — an escalation path. **T:** make
   these actions non-escalating. **A:** added `src/lib/permissions/privilege-tier.ts`
   (`actorOutranks`, `actorHoldsAll`): reset refused unless the target's effective
   perms are a **subset** of the actor's; role assignment requires the actor to
   already hold every resulting permission **and** outrank-or-equal the target's
   current perms. Guards live **in the action**, not the page, so they hold even if
   the page is later opened up. Admins bypass; lateral-tier allowed by design.
   **R:** closed both vectors. *Lesson:* any action that can mint/move privilege must
   authorize against the **privilege delta**, independent of the UI that calls it.

7. **The native-binary platform trap (Windows packaging)** *(§9).* **S:** the package
   bundles win32-x64 native binaries — `@node-rs/argon2`, the Prisma Windows
   schema-engine, portable Node/Postgres. **T:** avoid shipping a broken zip. **A:**
   recognized that building/`pnpm install`/`prisma generate` on Linux/WSL bakes
   **Linux** binaries into a "win-x64" zip that fails only on the customer machine;
   added `binaryTargets = ["native","windows"]` and a HARD-REQUIREMENT that the zip
   be assembled on a Windows host — and **refused to fake Windows verification** from
   WSL. **R:** correct constraints captured; build explicitly deferred to a Windows
   host. *Lesson:* native deps make "where you build" a correctness property, not a
   convenience.

---

## 11. Engineering process

- **No-shadow-DB migration workflow.** The dev DB user lacks `CREATEDB`, so Prisma's
  `migrate dev` (shadow DB) is unavailable. Flow: `prisma migrate diff
  --from-config-datasource … --to-schema … --script` (read-only) → **review the SQL
  by hand** → `prisma migrate deploy`. No destructive resets, ever. More manual, but
  every schema change is read before it touches the DB — which matters with a
  hand-rolled partial unique index (`dpr_one_current_primary_per_patient`) and raw
  SQL views. 8 migrations to date.
- **`dev → staging → production` promote flow.** Fast-forward-only promotion of an
  explicit verified commit (`git push origin <sha>:staging`, then `:production`),
  no checkout, no merge commits — so production only ever carries verified work.
  Example: the Phase 10b security fix `7a0f437` was promoted to both before the WIP
  packaging was allowed to lead `dev` (`latest-handoff.md §9a`).
- **Plan-before-code discipline** (`PHASES.md` execution protocol): inspect → propose
  plan + file list + risks → **wait for approval** on structural changes → implement
  → report (files, commands, manual tests, limitations). The reference docs are the
  durable output of that loop.

---

## 12. Known limitations / what's next (shows maturity)

- *Phase 10 was split during execution: the **10b** hardening (privacy + privilege-
  tier guards) shipped first (`7a0f437`); the remaining Phase 10 work below is not
  done.*
- **No automated test suite yet** — **Phase 10 (automated tests)**. So far: lint +
  typecheck + build + manual testing. First targets would be the access gate and
  the de-identification view (highest-risk surfaces).
- **Residual 1a** — re-introduce Explore clinical summaries via a **controlled
  vocabulary** (the gate before AI). **Residual 1b** — `state`/`country` are still
  coarse free-text demographics; vocabularize/region-code them.
- **Phase 10 (polish)** — error/loading/empty-state polish + production-readiness
  review.
- **Phase 9 (AI) parked by design** — the de-identified view + `AISearchLog` remain
  so it can be revived, but **only after** the controlled-vocab PII scrub.
- **Windows build pending** — packaging source committed, not built/verified (§9).
- Smaller scoped-out items: no archive **restore**, no blob **GC**, magic-byte
  sniffing deferred (mitigated by `nosniff`), S3 driver is a stub.

> Knowing the gaps **precisely** reads as senior. "It's done" reads as junior.

---

## 13. Interview talking points (crisp answers to load)

- **"Walk me through your authz design."** → User→Role→Permission, dynamic roles
  (only ADMIN fixed), **two orthogonal axes**: breadth (which patients) × depth (how
  much), depth gated behind breadth, admin bypasses both, single server-side gate.
  (§5)
- **"How does the research view avoid exposing patients?"** → A live de-identified
  **SQL view** with **no PII/id columns** + allow-list select + **k-anonymity N=5**
  suppression; bypass relaxes only the count floor, never core de-id. (§6)
- **"Why Postgres, not SQLite?"** → Relationship-heavy schema with real constraints
  (partial unique indexes, enums), and — decisively — a **SQL VIEW as the
  de-identification boundary**, with the option of `pgvector` for the parked AI
  (per `PRODUCT_SPEC.md`, not committed to). SQLite gives none of that cleanly, and
  the self-host story still works (bundled Postgres in the full Windows variant).
  (§2, §6, §9)
- **"Why no `doctorId` ownership column?"** → Patients transfer and treatments are
  multi-doctor; an owner FK overwrites history and can't model that. Linkage lives in
  `DoctorPatientRelationship` + `TreatmentDoctorParticipant`, and **authz doesn't
  depend on ownership**. (§4)
- **"A security bug you found and fixed?"** → Two strong ones: the **privilege-tier
  escalation** on password-reset/role-assign (authorize against the privilege delta,
  in the action not the page), and the **free-text PII leak** in Explore (k-anonymity
  ≠ scrubbing typed PII; removed the columns structurally). (§10.6, §10.5)
- **"A non-security bug?"** → The **empty-`select` runtime crash** that passed all of
  CI because Prisma validates at query time — fixed privacy-preservingly with
  `id:true`. (§10.2)
- **"Biggest lesson?"** → In a privacy system the hard part is the **defaults**:
  private-by-default storage, de-identify by view definition, archive-not-delete,
  deny-by-default scope. Get defaults right and security stops being something you
  remember to add.
- **"If you rebuilt it?"** → Tests from phase one; presigned uploads from the start.
```

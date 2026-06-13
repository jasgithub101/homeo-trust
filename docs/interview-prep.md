# Homeo Trust — Interview Prep Guide

> ⚠️ **SUPERSEDED — read `docs/PROJECT_WALKTHROUGH.md` instead.** That doc is the
> single end-to-end home and is current as of dev HEAD. This Q&A predates the
> Explore refactor and Phase 10b: §2 here still describes the **old materialized
> `ExploreCaseIndex` table** and **"de-identify on write"** projection, which were
> replaced by the live `explore_case_view` (and the free-text columns were later
> removed). The Q&A *phrasing/voice* (the 30-second pitch, the orthogonal-authz and
> data-modeling answers) is still useful, but trust `PROJECT_WALKTHROUGH.md`,
> `AI_PRIVACY_MODEL.md`, and `SECURITY_MODEL.md` for anything Explore/privacy.

A privacy-sensitive clinical management system for a homeopathy practice. Built in
phases: auth → dynamic roles/permissions → clinical schema → patient management →
authorization refinement → clinical workflow → attachments → de-identified Explore.
Stack: Next.js (App Router, Server Actions), TypeScript, PostgreSQL, Prisma, Zod, Tailwind.

---

## 0. The 30-second pitch (have this ready first)

> "It's a patient-management system for a homeopathy clinic where the hard problem isn't
> CRUD — it's access control and privacy. Staff have different roles, patient data is PII,
> and there's a research surface that has to expose clinical patterns without exposing
> patients. So the interesting work was a two-dimensional permission model, server-side
> authorization on every write, an audit trail, and a de-identification pipeline for the
> research view. I built it in disciplined phases with a plan-approve-implement-report loop."

Why this framing wins: it signals you understand the *domain risk*, not just the framework.

---

## 1. Authorization — the headline design

**Q: Walk me through your authorization model.**
> Authorization is purely **User → Role → Permission**. Roles are dynamic data, not
> hardcoded — the only fixed role is ADMIN. The novel part is that access has **two
> orthogonal dimensions**:
> - **Breadth** = *which patients* you can see (row scope): `patient.viewAssigned` (only
>   patients you're related to) vs `patient.viewAll` (everyone).
> - **Depth** = *how much* of a patient you can see (field sensitivity):
>   `patient.viewSensitive` → full PII; otherwise a de-identified view.
>
> They're independent. A permission that grants depth never grants breadth, and vice
> versa. Admin bypasses both. There's a single access gate (`patient-access.ts`) that all
> reads and writes go through.

**Q: Why make them orthogonal instead of just "access levels"?**
> Because the real-world roles don't line up on one axis. A receptionist might need to see
> *all* patients (broad) but only non-sensitive fields (shallow). A treating doctor needs
> *deep* access but only to *their* patients (narrow). A single tiered scale can't express
> "wide but shallow" and "narrow but deep" at the same time — orthogonal dimensions can.

**Gotcha follow-up — "What stops viewSensitive from leaking everyone's data?"**
> Depth is explicitly gated *behind* breadth: you only get sensitive fields for patients
> already in your row scope. `canViewSensitivePatient` checks sensitive permission **AND**
> in-scope. So holding `viewSensitive` with only `viewAssigned` gives you full PII for your
> assigned patients and *nothing* for the rest — not even de-identified, unless you also
> have `viewAll`.

**Q: Why no `doctorId` ownership column on Patient / CaseRecord / etc.?**
> Ownership-by-column assumes one stable owner, which is wrong for a clinic: patients get
> transferred between doctors, and a single treatment can involve multiple doctors. So
> instead of a `doctorId` foreign key, doctor involvement lives in two relationship tables:
> - **`DoctorPatientRelationship`** — assignment history (primary treating, transfers, end
>   dates), so the *history survives a transfer* instead of being overwritten.
> - **`TreatmentDoctorParticipant`** — per-treatment treating/consulting doctors.
>
> What it buys me: accurate history, multi-doctor cases, and clean transfers — and crucially
> **authorization doesn't depend on it**. Permissions come from roles, not from being the
> "owner" of a row.

**Gotcha — "So how does `viewAssigned` know which patients are mine?"**
> Through the current `DoctorPatientRelationship` rows, not an ownership column. "Assigned"
> is derived from the relationship table, which is also the source of truth for transfers.

**Gotcha — "User vs DoctorProfile?"**
> A `User` is any staff member (nurse, reception, admin…). `DoctorProfile` is *optional* and
> exists only for clinical doctors — it's a clinical identity, **not** a source of
> permissions. This is why a non-doctor admin can have `viewAll` without a DoctorProfile.

---

## 2. Privacy engineering

**Q: How does the research/Explore view avoid exposing patients?**
> Explore reads from a separate **de-identified projection table (`ExploreCaseIndex`)** —
> never the raw PII tables, never attachments. The key decision is **de-identify on write,
> not on read**: a projection step coarsens and strips data on the way *into* the index, so
> the raw PII literally never lands there. A read can't leak what was never stored.
> Coarsening: exact age → age bands, exact address → region, exact dates → month, exact
> patient/case IDs → a random non-reversible surrogate code.

**Q: Even de-identified, how do you stop re-identification?**
> The subtle risk is that rare combinations of quasi-identifiers ("70s woman, this city,
> this rare condition") can pinpoint one person even with names removed. So there's a
> **k-anonymity floor**: if a filtered query matches fewer than N=5 cases, results and counts
> are suppressed server-side — "broaden your filters." It's enforced in the query layer, not
> the UI, so you can't bypass it from the client.

**Q: You added a permission to bypass that floor — doesn't that defeat the purpose?**
> It only relaxes the *secondary* defense, never the core one. The bypass
> (`explore.bypassCohortMinimum`) lets trusted roles see small cohorts, but **core
> de-identification still applies to everyone** — no name, phone, email, address, exact IDs,
> or doctor name is ever emitted, bypass or not. I made it a per-role permission rather than
> a global switch so it composes with the existing role model, and every bypassed search is
> audited. It's a deliberate, logged trade for an internal trusted-staff tool.

**Q: How is doctor identity handled in the de-identified views?**
> Doctor identity is **PII-gated** the same way patient PII is: `user.name` is only selected
> when the viewer has sensitive access; otherwise the UI shows a neutral handle ("Assigned",
> "Doctor (specialization)", "Doctor #n"). In Explore, doctor is structurally absent from the
> index entirely — there's no doctor field — so that correlation channel is closed.

**Q: What's the honest weakness in your privacy model?** *(say this proactively — it lands well)*
> The de-identified summaries are sourced from short structured fields — issue title, symptom
> name, medicine name — never free-text notes. But those short fields are still
> *user-typed*, so a clinician could accidentally type a patient's name into a title.
> **k-anonymity does not mitigate that** — it defends against re-identification by
> *combination*, not against PII literally embedded in a text field. The real fix is a
> controlled vocabulary or a server-side PII scrub on the way into the index, which I
> documented as the required precondition before any AI feature consumes that data.

This last answer is gold in an interview — it shows you understand the *limits* of your own
control, which most candidates don't.

---

## 3. Security posture

**Q: How do you enforce authorization — client or server?**
> Always server-side. Every Server Action re-checks scope/ownership **before** it writes, and
> every sensitive read re-authorizes per request. The frontend hiding a button is never the
> control. Out-of-scope or archived rows return `notFound()` rather than a 403, so I don't
> even confirm the row exists to someone who shouldn't see it.

**Q: How do you prevent IDOR / cross-patient tampering?**
> Two layers. The action re-derives the user's scope and rejects out-of-scope IDs — so
> swapping in another patient's ID gets a 404, not data. And for nested resources
> (attachments, treatments), it asserts the child actually belongs to the patient in the
> route (`attachment.patientId === route patientId`) before acting. So you can't smuggle one
> patient's attachment ID into another patient's URL.

**Q: Delete behavior?**
> **Archive, never hard-delete** for clinical rows (issues, symptoms, treatments): nullable
> `deletedAt` / `deletedByUserId` / `deletionReason`, and lists filter `deletedAt: null`.
> Clinical history is medico-legally important, so destroying it is the wrong default.
> Archiving an issue doesn't cascade to its symptoms/treatments — each is archived
> intentionally. `CaseRecord` isn't archivable at all (one per patient). No restore yet — a
> deliberate scope cut.

**Q: Attachments — they can hold PII. How are they secured?**
> Files are **private by default**, stored outside the web root (never in `public/`), behind
> a provider-agnostic storage port (local disk in dev, S3-compatible designed for prod).
> Access is only through an authenticated route that re-authorizes on every request, with
> **opaque server-generated storage keys** (no PII, no original filename, traversal-guarded).
> Downloads carry short-lived signed URLs, `Cache-Control: private, no-store`,
> **`X-Content-Type-Options: nosniff`**, and `Content-Disposition: attachment` for non-images
> so a spoofed file can't be sniffed into executable HTML. Every view/upload/delete is
> audited, and audit metadata is IDs/enums only — never the filename (it could carry PII).

**Gotcha — "Why nosniff specifically?"**
> Because I deferred magic-byte validation — MIME is checked against the declared type, not
> the actual bytes. `nosniff` plus forced-download is the compensating control: even if
> someone uploads HTML labeled as a PDF, the browser won't render it as HTML on my origin.
> I paired the two deliberately and documented it.

---

## 4. Data modeling decisions

**Q: Why exactly one CaseRecord per patient?**
> In this clinic's model a patient *is* a case — the case record is the longitudinal clinical
> container, and issues/symptoms/treatments hang off it over time. Enforced with a unique
> constraint on `patientId`. It keeps the timeline coherent instead of fragmenting one
> patient across multiple "cases."

**Q: Why combine prescription and follow-up into `TreatmentEntry`?**
> In homeopathy a follow-up *is* effectively a re-prescription event — you assess condition
> and adjust the remedy in the same encounter. Modeling them as one entry type (with an
> entry-type enum and a `patientCondition` outcome) matches the clinical reality and makes the
> timeline a single ordered stream rather than two parallel logs you have to interleave.

**Q: How do you track outcomes over time?**
> Each `TreatmentEntry` records a `PatientCondition` (improved / same / worsened); the Explore
> projection rolls those into a coarse improvement trend. Outcomes are per-encounter so you
> can see trajectory, not just a current state.

---

## 5. Hard trade-offs & war stories

**Q: Your migration workflow is unusual — explain.**
> The dev database user lacks `CREATEDB`, so Prisma's shadow-DB workflow (`migrate dev`) isn't
> available. So I use `migrate diff` to generate SQL, **review the SQL by hand**, then apply
> with `migrate deploy`. No destructive resets, ever. It's more manual but it means I read
> every schema change before it touches the DB — which for a system with a hand-rolled
> partial unique index (one current primary doctor per patient) is actually safer.

**Q: Dynamic roles vs hardcoded — why?**
> Hardcoding DOCTOR / NURSE / RECEPTION bakes the org chart into the code; every new role is a
> deploy. Instead, roles and their permissions are data, configured in an admin UI, with a
> permission matrix. The only hardcoded role is ADMIN (protected, with a last-admin guard so
> you can't lock everyone out). New roles must be granted breadth explicitly — no implicit
> access.

**Q: Tell me about a bug you debugged.** *(you have two strong ones)*

> **Bug 1 — the empty Prisma select.** A user with `viewAll` but *not* `viewSensitive` opened
> the patient list and got a runtime `PrismaClientValidationError`. Root cause: the
> de-identified branch built a nested doctor `select` where the only field, `name`, was gated
> on sensitive access — so for a non-sensitive viewer it collapsed to `{ name: false }`, an
> *empty* select, which Prisma rejects. The trap: it passed typecheck, lint, *and* build,
> because the rule is enforced at query time, not in TypeScript. The fix had to be
> privacy-preserving — I added `id: true` to keep the select non-empty while `name` stayed
> gated, so a de-identified viewer gets an opaque internal ID (never rendered), never PII. The
> wrong fix would've been flipping `name` on, which leaks doctor identity. Then I swept all
> six places that used the same conditional-select pattern.
>
> *Lesson I'd state:* green CI doesn't prove a runtime-validated query works — that bug class
> only shows up when you actually exercise the path.

> **Bug 2 — the 1 MB upload cap.** Attachment uploads over 1 MB failed with a 413 even though
> my validator allowed 15 MB. Root cause: Next.js Server Actions default to a 1 MB request
> body limit, so the transport cap and the validation cap disagreed — files 413'd before
> validation ran. Quick fix was raising `serverActions.bodySizeLimit` to match. But the *right*
> answer for production is presigned direct-to-storage upload so file bytes never transit the
> server action at all — which I logged as the follow-up.
>
> *Lesson:* validate your assumptions about the framework's defaults, and make the transport
> limit and the business-rule limit agree.

---

## 6. Weaknesses & what's next (volunteer these)

> - **No automated tests yet** — that's the next phase (security/access/privacy tests). So
>   far it's been lint/typecheck/build plus manual testing. I'd prioritize tests around the
>   access gate and the de-identification projection first, because those are the
>   highest-risk surfaces.
> - **AI similarity feature is parked.** I designed the de-identified index partly to feed it,
>   but I deferred it — and I'd *gate* it on closing the free-text PII risk first. The
>   discipline of not shipping AI on a dataset that could leak is the point.
> - **No restore for archived rows, no blob garbage collection, magic-byte sniffing deferred,
>   storage not yet wired to real S3.** All consciously scoped out, all documented.

Knowing your gaps *precisely* reads as senior. "It's done" reads as junior.

---

## 7. Rapid-fire (one-liners to have loaded)

- *Why server actions over a REST API?* Co-located mutations with the App Router, less
  boilerplate, type-safe end to end — and authorization still lives server-side regardless.
- *Why Zod?* Single source of validation truth, shared shape between client and server,
  parse-don't-validate at the boundary.
- *Why Prisma?* Type-safe queries and an explicit, reviewable migration trail — which my
  no-shadow-DB workflow leans on.
- *Biggest thing you learned?* That in a privacy system the hard part is the *defaults* —
  private-by-default storage, de-identify-on-write, archive-not-delete, deny-by-default
  scope. Get the defaults right and security stops being something you remember to add.
- *If you rebuilt it?* Tests from phase one, and presigned uploads from the start.

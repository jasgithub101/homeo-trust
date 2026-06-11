# Phase 7 Report — Patient Attachments

## Goals

Let authorized staff attach photos and reports (lab/scan/prescription images,
PDFs) to a patient's **case, issues, and treatments**, store them privately, and
serve them only through an authenticated, per-request-authorized download path.
No raw attachment is ever reachable by Explore/AI or via a public URL.

## Design decisions (the four approved upfront)

1. **New `attachment.view` permission (breadth).** Attachments now follow the
   same breadth × depth split as patients/clinical data. `attachment.view` =
   list metadata + download **non-sensitive** files. The pre-existing
   `attachment.viewSensitive` is the **depth** gate for the bytes of files
   marked `isSensitive` (the default). `attachment.upload` and
   `attachment.delete` are unchanged. Both view gates additionally require the
   patient to be in scope (`isPatientInScope`); admin bypasses both.

2. **Soft-delete attachments (mirrors Phase 6).** Added
   `deletedAt` / `deletedByUserId` / `deletionReason` (+ `@@index([deletedAt])`)
   to `PatientAttachment`. `attachment.delete` **archives** (UI label "Archive");
   all lists filter `deletedAt: null`. No restore (consistent with Phase 6).

3. **Blob policy on archive: retain the blob, hide the row.** Archiving never
   destroys the stored file — only the row is hidden. Blob garbage-collection is
   deferred future work.

4. **Housekeeping committed separately first.** `.gitignore` extended to cover
   all of `graphify-out/` and `.claude/skills/graphify/**` (plus the local
   `var/` blob store); the previously-tracked graphify artifacts were
   `git rm --cached`-ed; and the stale handoff wording (Phases 5.1/6
   "UNCOMMITTED / pending testing") was corrected. Committed as `6a5a042`.

## Storage-port architecture

A backend-agnostic **storage port** isolates the app from any concrete store:

- `src/lib/storage/types.ts` — `StoragePort` interface (`put`, `getStream`,
  `delete`, `getSignedUrl`, `exists`) + signed-URL TTL clamp (60–300s).
- `src/lib/storage/local.ts` — `LocalDiskStorage` (development default). Writes
  under a gitignored, **non-public** dir (`var/attachments/`, never `public/`).
  Defends against path traversal (rejects `..`/NUL, asserts the resolved path
  stays inside the base dir). `getStream` returns a Web stream for the route to
  pipe. `getSignedUrl` mints an **HMAC-token URL** back to the authenticated
  download route — the token proves server-minting + freshness but is **not** an
  access grant on its own.
- `src/lib/storage/s3.ts` — `S3Storage` **design stub** implementing the same
  port (AWS SDK v3 / S3-compatible, env-driven). Documented but intentionally
  not wired to a bucket; every method throws until a later infra phase.
- `src/lib/storage/index.ts` — `getStorage()` factory selecting the driver from
  `STORAGE_DRIVER` (default `local`), cached per process. Also exposes a no-op
  `scanOnUpload(key)` virus-scan **seam**.
- `src/lib/storage/signing.ts` — HMAC(`AUTH_SECRET`) sign/verify of `key:expiry`,
  constant-time compare.

**Storage keys** are server-generated and opaque:
`patients/{patientId}/{attachmentId}/{blobId}` — no PII, no raw filename, never
client-supplied.

## Files

**Created**
- `src/lib/storage/{types,signing,local,s3,index}.ts`
- `src/lib/validation/attachment.ts` (MIME allow-list, 15 MB cap, type enum,
  optional description; `validateUploadedFile` + a noted magic-byte seam)
- `scripts/backfill-attachment-view.ts` (one-time; NOT in `seed.ts`)
- `prisma/migrations/20260611010000_attachment_soft_delete/migration.sql`
- `src/app/(dashboard)/patients/[patientId]/attachments/actions.ts`
  (`uploadAttachmentAction`, `archiveAttachmentAction`)
- `src/app/(dashboard)/patients/[patientId]/attachments/page.tsx` (index)
- `src/app/(dashboard)/patients/[patientId]/attachments/[attachmentId]/download/route.ts`
- `src/components/attachments/{AttachmentUploadForm,AttachmentsSection}.tsx`
- `docs/phase-reports/phase-7-attachments.md` (this file)

**Edited**
- `prisma/schema.prisma` — soft-delete columns + index on `PatientAttachment`
- `src/lib/permissions/keys.ts` — added `attachment.view`
- `src/lib/permissions/patient-access.ts` — `canUploadAttachment`,
  `canViewAttachment`, `canViewSensitiveAttachment`, `canDeleteAttachment`,
  `patientScopeLabel`
- `src/lib/audit/log.ts` — `ATTACHMENT_UPLOADED/VIEWED/DELETED`
- `src/lib/env.ts` + `.env.example` — storage env vars
- `src/components/clinical/ClinicalNav.tsx` — "Attachments" tab
- issue/case/treatment detail pages — `AttachmentsSection` wired in
- `docs/MASTER_SPEC.md`, `docs/SECURITY_MODEL.md`, `.gitignore`,
  `docs/session-handoffs/latest-handoff.md`

## Security & audit considerations

- **Server-side authorization on every action AND every download request.** The
  download route re-runs `requireUser` + breadth/depth checks on each GET; it
  never trusts the UI hiding a link.
- **Cross-patient IDOR guard.** Both the download route and the archive action
  assert `attachment.patientId === route patientId`; mismatch/missing/archived →
  `notFound()` (no existence leak).
- **Depth gate for sensitive bytes.** Sensitive files require
  `attachment.viewSensitive`; lacking it returns 403 (the viewer can see the
  patient, just not those bytes). The list replaces the download link with a
  locked label — convenience only, not the control.
- **Private blobs.** Never under `public/`; keys are opaque and server-generated;
  download responses set `Cache-Control: private, no-store`. Signed URLs (S3
  path) are short-lived (≤300s); the local HMAC token alone never grants access.
- **Anti-MIME-sniffing (compensates for the deferred magic-byte check).** Because
  Phase 7 trusts only the client-declared MIME at upload, the download route
  pairs two controls so a crafted file (e.g. HTML mislabeled `application/pdf`)
  cannot execute as stored XSS on our origin: (1) `X-Content-Type-Options:
  nosniff` on every download response, and (2) `Content-Disposition: attachment`
  for non-image types (PDFs download instead of rendering inline); only images
  are served `inline`. When magic-byte sniffing lands, this pairing stays as
  defense in depth. The S3 driver must set the same `ContentType` /
  `ContentDisposition` at `PutObject` time (noted in the stub).
- **Path traversal** is rejected before any disk access.
- **Upload rollback.** If the DB insert fails after `storage.put`, the blob is
  best-effort deleted so no orphan is left.
- **Archived parents block new uploads** (issue/treatment); CaseRecord is not
  archivable. Archiving a parent does not delete its attachments or their blobs.
- **PII-safe audit.** `ATTACHMENT_UPLOADED/VIEWED/DELETED` log only
  `{ attachmentId, patientId, parentType, parentId, fileType, sizeBytes,
  isSensitive, scope, deletionReason? }`. **Never** `fileName` (may carry PII),
  file bytes, or free text.

## Migration

`20260611000000_clinical_soft_delete` → `20260611010000_attachment_soft_delete`.
Generated via `prisma migrate diff --from-config-datasource ... --to-schema ...`,
reviewed/approved, applied with `prisma migrate deploy` (no shadow DB, no
resets). Purely additive (3 nullable columns + 1 index); did not touch
`DoctorPatientRelationship` or the `dpr_one_current_primary_per_patient` partial
index. The new `attachment.view` permission is **data**: seeded idempotently via
`pnpm db:seed`, and granted to existing attachment-holding non-admin roles via
the one-time `scripts/backfill-attachment-view.ts`.

## Manual-testing checklist

- [ ] Upload an image and a PDF to an issue, a case, and a treatment; confirm
      each appears under the correct parent and on the patient Attachments tab.
- [ ] Reject oversized (>15 MB) and disallowed MIME files server-side.
- [ ] Download as a user with `attachment.view` only: non-sensitive downloads;
      sensitive shows "no access" and the route returns 403.
- [ ] Download as a user with `attachment.viewSensitive`: sensitive bytes stream.
- [ ] Cross-patient: request `/patients/{otherPatient}/attachments/{id}/download`
      for an attachment of a different patient → 404.
- [ ] Out-of-scope patient (no breadth) → tab/route `notFound()`.
- [ ] Archive an attachment → disappears from lists; blob still on disk; audit
      row written; re-archive blocked.
- [ ] Upload to an archived issue/treatment → blocked.
- [ ] Confirm audit rows contain no `fileName`/free text.

## Problems encountered

- The Prisma 7 `migrate diff` flag `--to-schema-datamodel` was removed; used
  `--to-schema prisma/schema.prisma` instead. SQL was identical to the approved
  diff.

## Resume / interview talking points

- Breadth × depth generalized cleanly from patients to attachments — one new
  breadth key, reusing the existing depth key; access = permission AND scope.
- The storage port keeps the app store-agnostic; swapping to S3 is a config +
  stub-fill, not a refactor. Signed URLs are defense-in-depth, never the gate.
- Soft-delete + blob retention mirrors the clinical archive model; auditability
  beats destructive deletes for a medical record system.

## Future improvements

- Real virus scanning (replace the `scanOnUpload` no-op).
- Magic-byte sniffing on upload (don't trust client MIME).
- Blob lifecycle / GC for archived attachments.
- Wire `S3Storage` to a real private bucket (encryption at rest, presigned URLs).
- **Presigned direct-to-storage upload.** Uploads currently flow through a
  Server Action, so `next.config.ts` raises `serverActions.bodySizeLimit` to
  `16mb` to match the 15 MB Zod cap (the default is 1 MB, which 413'd large
  files before validation). This raises the body limit for *all* server actions
  (each still authorizes + Zod-validates). The production path is presigned
  direct-to-storage upload (companion to the S3 driver stub): bytes go straight
  to the bucket and never transit the server action, making the global
  server-action limit irrelevant. Keep the transport and Zod caps in sync until
  then.

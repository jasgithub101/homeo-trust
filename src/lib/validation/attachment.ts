import { z } from "zod";

/**
 * Zod validation for Phase 7 patient attachments. All limits are enforced
 * SERVER-SIDE in the upload action before any byte is written. The browser's
 * reported MIME type is untrusted — see the magic-byte seam note below.
 *
 * No PII and no clinical free text is ever logged. `description` is an optional
 * short operator label and is never written to the audit log.
 */

// Mirrors the Prisma `AttachmentType` enum — also drives the form <select>.
export const ATTACHMENT_TYPE_VALUES = [
  "ISSUE_PHOTO",
  "LAB_REPORT",
  "SCAN_REPORT",
  "PRESCRIPTION_IMAGE",
  "OTHER",
] as const;

// Which clinical entity an attachment is filed under. `patientId` is always
// present; the parent narrows it to a specific issue / case / treatment.
export const ATTACHMENT_PARENT_TYPES = ["issue", "case", "treatment"] as const;
export type AttachmentParentType = (typeof ATTACHMENT_PARENT_TYPES)[number];

// MIME allow-list: common medical photo/report formats only. Anything else is
// rejected. (HEIC included for iOS photos; PDFs for lab/scan reports.)
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

const isSensitiveField = z
  .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
  .optional();

/** Metadata fields submitted alongside the file (validated before the bytes). */
export const attachmentUploadSchema = z.object({
  patientId: z.string().min(1),
  parentType: z.enum(ATTACHMENT_PARENT_TYPES),
  parentId: z.string().min(1),
  fileType: z.enum(ATTACHMENT_TYPE_VALUES, {
    message: "Select a file type",
  }),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  // Private by default — attachments are sensitive unless explicitly cleared.
  isSensitive: isSensitiveField,
});
export type AttachmentUploadInput = z.infer<typeof attachmentUploadSchema>;

/** Archive (soft-delete) input for an attachment. `reason` is an operator label. */
export const attachmentArchiveSchema = z.object({
  patientId: z.string().min(1),
  id: z.string().min(1),
  reason: z.string().trim().max(200).optional().or(z.literal("")),
});
export type AttachmentArchiveInput = z.infer<typeof attachmentArchiveSchema>;

export interface UploadedFileInfo {
  mimeType: string;
  sizeBytes: number;
}

/**
 * Validate the uploaded file's transport-level facts (size + declared MIME).
 * Returns an error message, or null when acceptable.
 *
 * SECURITY SEAM (not implemented in Phase 7): the MIME type here is the value
 * the client *claims*. A hardening pass should sniff the leading magic bytes of
 * the buffer and confirm they match an allowed type before persisting — do not
 * trust `file.type` alone for anything security-sensitive.
 */
export function validateUploadedFile(file: UploadedFileInfo): string | null {
  if (file.sizeBytes <= 0) return "The file is empty.";
  if (file.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return `File is too large (max ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB).`;
  }
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimeType)) {
    return "Unsupported file type. Allowed: JPEG, PNG, WebP, HEIC, PDF.";
  }
  return null;
}

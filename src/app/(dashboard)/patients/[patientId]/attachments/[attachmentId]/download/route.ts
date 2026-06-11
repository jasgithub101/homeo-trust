import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  canViewAttachment,
  canViewSensitiveAttachment,
  patientScopeLabel,
} from "@/lib/permissions/patient-access";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { getStorage } from "@/lib/storage";
import { verifyKeySignature } from "@/lib/storage/signing";

/**
 * Authenticated attachment download. Re-authorizes on EVERY request — never
 * relies on the UI hiding anything, and never serves bytes from a stable public
 * URL.
 *
 * Guard order (defense in depth):
 *  1. Session (requireUser → redirects to /login if absent).
 *  2. The attachment exists, is NOT archived, and `patientId` matches the route
 *     (cross-patient IDOR guard) — otherwise 404 (don't reveal existence).
 *  3. BREADTH: `attachment.view` AND patient in scope — otherwise 404.
 *  4. DEPTH: sensitive files additionally require `attachment.viewSensitive` —
 *     otherwise 403 (the viewer can see the patient, just not these bytes).
 *  5. If an HMAC signed-URL token is present it must be valid + unexpired
 *     (extra check; the session is always the primary gate).
 *
 * Then either stream the bytes (local driver) or 302 to a freshly-minted,
 * short-lived signed URL (object-store driver). Every access is audited with
 * PII-safe metadata only.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ patientId: string; attachmentId: string }> },
) {
  const { patientId, attachmentId } = await params;
  const user = await requireUser();

  const attachment = await db.patientAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      patientId: true,
      deletedAt: true,
      isSensitive: true,
      mimeType: true,
      fileName: true,
      fileType: true,
      sizeBytes: true,
      storagePath: true,
      patientIssueId: true,
      caseRecordId: true,
      treatmentEntryId: true,
    },
  });

  // Missing, archived, or belongs to a different patient → 404 (no leak).
  if (!attachment || attachment.patientId !== patientId || attachment.deletedAt) {
    notFound();
  }

  // BREADTH gate.
  if (!(await canViewAttachment(user, patientId))) notFound();

  // DEPTH gate — sensitive bytes only.
  if (attachment.isSensitive && !(await canViewSensitiveAttachment(user, patientId))) {
    return new Response("Forbidden", { status: 403 });
  }

  // Optional signed-URL token (defense in depth). If present, it must verify.
  const url = new URL(request.url);
  const sig = url.searchParams.get("sig");
  const exp = url.searchParams.get("exp");
  if (sig && exp) {
    if (!verifyKeySignature(attachment.storagePath, Number(exp), sig)) {
      return new Response("Link expired or invalid", { status: 403 });
    }
  }

  const parentType = attachment.patientIssueId
    ? "issue"
    : attachment.caseRecordId
      ? "case"
      : attachment.treatmentEntryId
        ? "treatment"
        : null;

  await writeAuditLog({
    action: AUDIT_ACTIONS.ATTACHMENT_VIEWED,
    actorUserId: user.id,
    entityType: "PatientAttachment",
    entityId: attachment.id,
    // PII-safe: never the fileName or bytes.
    metadata: {
      attachmentId: attachment.id,
      patientId,
      parentType,
      fileType: attachment.fileType,
      sizeBytes: attachment.sizeBytes,
      isSensitive: attachment.isSensitive,
      scope: patientScopeLabel(user),
    },
  });

  const storage = getStorage();

  // Object stores hand out a short-lived presigned URL; local disk streams.
  if (env().STORAGE_DRIVER === "s3") {
    const signed = await storage.getSignedUrl(attachment.storagePath, 120);
    return Response.redirect(signed, 302);
  }

  const stream = await storage.getStream(attachment.storagePath);

  // Defense in depth against the deferred magic-byte check: we trust only the
  // client-declared MIME at upload, so a crafted file (e.g. HTML mislabeled as
  // application/pdf) could otherwise be MIME-sniffed and rendered as HTML on our
  // origin → stored XSS. Two compensating controls:
  //   1. `X-Content-Type-Options: nosniff` — browsers must honor Content-Type
  //      exactly and never sniff to text/html.
  //   2. Only allow inline rendering for images; everything else (PDFs) is
  //      forced to download with `attachment`, so it is never rendered in-page.
  // RFC 5987 filename* keeps any non-ASCII / PII-bearing name safe in the header.
  const inlineOk = attachment.mimeType.startsWith("image/");
  const dispositionType = inlineOk ? "inline" : "attachment";
  const disposition = `${dispositionType}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`;
  return new Response(stream, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.sizeBytes),
      "Content-Disposition": disposition,
      "X-Content-Type-Options": "nosniff",
      // Private: never cache sensitive bytes in shared/browser caches.
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

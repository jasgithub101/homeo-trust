import "server-only";
import { db } from "@/lib/db";
import type { IssueOption } from "@/components/clinical/TreatmentEntryForm";

/**
 * Non-archived issues for a patient, for the treatment "related issue" select.
 * Archived issues (deletedAt set) are excluded so a new treatment can't be
 * linked to an archived issue.
 */
export async function loadIssueOptions(patientId: string): Promise<IssueOption[]> {
  const issues = await db.patientIssue.findMany({
    where: { patientId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });
  return issues;
}

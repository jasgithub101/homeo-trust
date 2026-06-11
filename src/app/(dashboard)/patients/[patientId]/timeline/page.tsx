import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  canViewPatient,
  canViewSensitivePatient,
} from "@/lib/permissions/patient-access";
import { buildTimeline } from "@/lib/clinical/timeline";
import { ClinicalNav } from "@/components/clinical/ClinicalNav";
import { TimelineView } from "@/components/clinical/TimelineView";

export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ archived?: string }>;
}) {
  const { patientId } = await params;
  const { archived } = await searchParams;
  const user = await requireUser();

  if (!(await canViewPatient(user, patientId))) notFound();
  const showSensitive = await canViewSensitivePatient(user, patientId);
  const showArchived = archived === "1";

  const events = await buildTimeline(patientId, { showSensitive, showArchived });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/patients/${patientId}`} className="text-sm text-brand-700 hover:underline">
          ← Patient
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">Timeline</h1>
      </div>

      <ClinicalNav patientId={patientId} active="timeline" />

      <div className="flex justify-end">
        <Link
          href={`/patients/${patientId}/timeline${showArchived ? "" : "?archived=1"}`}
          className="text-sm text-brand-700 hover:underline"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>

      <TimelineView events={events} />
    </div>
  );
}

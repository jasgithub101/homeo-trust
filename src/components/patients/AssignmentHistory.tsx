import { EndRelationshipButton } from "./EndRelationshipButton";

export interface HistoryRow {
  id: string;
  doctorLabel: string;
  relationshipType: string;
  startDate: Date;
  endDate: Date | null;
  isCurrentlyTreating: boolean;
}

function prettyType(t: string): string {
  return t
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString() : "—";
}

/**
 * Read-only doctor-patient assignment history (current + past). The "End" action
 * is shown only on active rows and only when the viewer may manage doctors.
 */
export function AssignmentHistory({
  patientId,
  rows,
  canManage,
}: {
  patientId: string;
  rows: HistoryRow[];
  canManage: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No doctor assignments yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Doctor</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Start</th>
            <th className="px-4 py-2 font-medium">End</th>
            <th className="px-4 py-2 font-medium">Status</th>
            {canManage ? <th className="px-4 py-2 font-medium"></th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2 text-slate-900">{r.doctorLabel}</td>
              <td className="px-4 py-2 text-slate-600">{prettyType(r.relationshipType)}</td>
              <td className="px-4 py-2 text-slate-600">{fmt(r.startDate)}</td>
              <td className="px-4 py-2 text-slate-600">{fmt(r.endDate)}</td>
              <td className="px-4 py-2">
                {r.isCurrentlyTreating ? (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    Current
                  </span>
                ) : (
                  <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                    Ended
                  </span>
                )}
              </td>
              {canManage ? (
                <td className="px-4 py-2 text-right">
                  {r.isCurrentlyTreating ? (
                    <EndRelationshipButton patientId={patientId} relationshipId={r.id} />
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

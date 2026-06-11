import Link from "next/link";
import type { TimelineEvent, TimelineKind } from "@/lib/clinical/timeline";

const DOT: Record<TimelineKind, string> = {
  patient: "bg-slate-400",
  assignment: "bg-blue-400",
  case: "bg-brand-500",
  issue: "bg-amber-400",
  symptom: "bg-orange-300",
  treatment: "bg-green-500",
  followup: "bg-purple-400",
};

export function TimelineView({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Nothing on the timeline yet.
      </p>
    );
  }

  return (
    <ol className="space-y-4 border-l border-slate-200 pl-5">
      {events.map((ev, idx) => {
        const body = (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-900">{ev.title}</span>
              {ev.archived ? (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 line-through">
                  Archived
                </span>
              ) : null}
            </div>
            {ev.detail ? <p className="text-sm text-slate-600">{ev.detail}</p> : null}
            <p className="text-xs text-slate-400">{ev.date.toLocaleString()}</p>
          </>
        );
        return (
          <li key={idx} className="relative">
            <span
              className={`absolute -left-[1.625rem] top-1.5 h-2.5 w-2.5 rounded-full ${DOT[ev.kind]}`}
            />
            {ev.href ? (
              <Link href={ev.href} className="block rounded-md p-1 hover:bg-slate-50">
                {body}
              </Link>
            ) : (
              <div className="p-1">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

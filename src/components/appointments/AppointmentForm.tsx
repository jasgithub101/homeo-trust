"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createAppointmentAction,
  updateAppointmentAction,
} from "@/app/(dashboard)/patients/[patientId]/appointments/actions";
import type { ClinicalActionState } from "@/lib/clinical/form-state";
import { APPOINTMENT_TYPE_OPTIONS } from "@/lib/appointments/options";

const initialState: ClinicalActionState = {};

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export interface AppointmentFormDefaults {
  scheduledAt?: string; // "YYYY-MM-DDTHH:mm" for datetime-local
  durationMinutes?: string;
  allDay?: boolean;
  type?: string;
  notes?: string;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function AppointmentForm({
  patientId,
  mode,
  appointmentId,
  defaults = {},
}: {
  patientId: string;
  mode: "create" | "edit";
  appointmentId?: string;
  defaults?: AppointmentFormDefaults;
}) {
  const action =
    mode === "edit" ? updateAppointmentAction : createAppointmentAction;
  const [state, formAction] = useActionState(action, initialState);
  const e = (k: string) => state.fieldErrors?.[k]?.[0];

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <input type="hidden" name="patientId" value={patientId} />
      {mode === "edit" && appointmentId ? (
        <input type="hidden" name="appointmentId" value={appointmentId} />
      ) : null}

      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">
          Date &amp; time
        </label>
        <input
          type="datetime-local"
          name="scheduledAt"
          defaultValue={defaults.scheduledAt ?? ""}
          className={inputCls}
          required
        />
        {e("scheduledAt") ? (
          <p className="text-xs text-red-600">{e("scheduledAt")}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">Type</label>
          <select
            name="type"
            defaultValue={defaults.type ?? "FOLLOW_UP"}
            className={inputCls}
          >
            {APPOINTMENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {e("type") ? <p className="text-xs text-red-600">{e("type")}</p> : null}
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">
            Duration (minutes, optional)
          </label>
          <input
            type="number"
            name="durationMinutes"
            min={0}
            max={1440}
            defaultValue={defaults.durationMinutes ?? ""}
            className={inputCls}
          />
          {e("durationMinutes") ? (
            <p className="text-xs text-red-600">{e("durationMinutes")}</p>
          ) : null}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="allDay"
          defaultChecked={defaults.allDay ?? false}
          className="rounded border-slate-300"
        />
        All-day
      </label>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">
          Notes (optional)
        </label>
        <textarea
          name="notes"
          rows={3}
          maxLength={500}
          defaultValue={defaults.notes ?? ""}
          className={inputCls}
        />
        {e("notes") ? <p className="text-xs text-red-600">{e("notes")}</p> : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-green-700">{state.success}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <SubmitButton label={mode === "edit" ? "Save changes" : "Schedule"} />
        <Link
          href={`/patients/${patientId}/appointments`}
          className="text-sm text-slate-600 hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

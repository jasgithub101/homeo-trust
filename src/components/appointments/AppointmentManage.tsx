"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  changeAppointmentStatusAction,
  archiveAppointmentAction,
} from "@/app/(dashboard)/patients/[patientId]/appointments/actions";
import type { ClinicalActionState } from "@/lib/clinical/form-state";
import { APPOINTMENT_STATUS_OPTIONS } from "@/lib/appointments/options";

const initial: ClinicalActionState = {};

const inputCls =
  "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  const cls =
    variant === "danger"
      ? "rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      : "rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60";
  return (
    <button type="submit" disabled={pending} className={cls}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function AppointmentManage({
  patientId,
  appointmentId,
  currentStatus,
}: {
  patientId: string;
  appointmentId: string;
  currentStatus: string;
}) {
  const [statusState, statusAction] = useActionState(
    changeAppointmentStatusAction,
    initial,
  );
  const [archiveState, archiveAction] = useActionState(
    archiveAppointmentAction,
    initial,
  );

  return (
    <div className="space-y-4">
      <form action={statusAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600">Status</label>
          <select name="status" defaultValue={currentStatus} className={inputCls}>
            {APPOINTMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Submit label="Update status" />
      </form>
      {statusState.error ? (
        <p className="text-sm text-red-600">{statusState.error}</p>
      ) : null}
      {statusState.success ? (
        <p className="text-sm text-green-700">{statusState.success}</p>
      ) : null}

      <form action={archiveAction} className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-4">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600">
            Archive (created in error)
          </label>
          <input
            name="reason"
            placeholder="Reason (optional)"
            maxLength={200}
            className={inputCls}
          />
        </div>
        <Submit label="Archive" variant="danger" />
      </form>
      {archiveState.error ? (
        <p className="text-sm text-red-600">{archiveState.error}</p>
      ) : null}
    </div>
  );
}

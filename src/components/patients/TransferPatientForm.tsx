"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { transferPatientAction, type PatientActionState } from "@/app/(dashboard)/patients/[patientId]/actions";
import type { DoctorOption } from "./CreatePatientForm";

const initialState: PatientActionState = {};

const selectCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Transferring…" : "Transfer patient"}
    </button>
  );
}

/**
 * Transfer the current primary treating doctor to a new one. The server ends the
 * old PRIMARY_TREATING relationship and creates a new one (history preserved).
 */
export function TransferPatientForm({
  patientId,
  doctors,
}: {
  patientId: string;
  doctors: DoctorOption[];
}) {
  const [state, formAction] = useActionState(transferPatientAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />
      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">
          New primary treating doctor
        </label>
        <select name="newDoctorProfileId" defaultValue="" className={selectCls} required>
          <option value="" disabled>Select a doctor…</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
        {state.fieldErrors?.newDoctorProfileId?.length ? (
          <p className="text-xs text-red-600">{state.fieldErrors.newDoctorProfileId[0]}</p>
        ) : null}
      </div>
      <input name="notes" placeholder="Notes (optional)" className={selectCls} />
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-green-700">{state.success}</p>
      ) : null}
      <SubmitButton />
    </form>
  );
}

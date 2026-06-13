"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { assignDoctorAction, type PatientActionState } from "@/app/(dashboard)/patients/[patientId]/actions";
import type { DoctorOption } from "./CreatePatientForm";

const initialState: PatientActionState = {};

const REL_TYPES = [
  { value: "PRIMARY_TREATING", label: "Primary treating" },
  { value: "CONSULTING", label: "Consulting" },
  { value: "ASSISTING", label: "Assisting" },
] as const;

const selectCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function AssignDoctorForm({
  patientId,
  doctors,
  lockType,
}: {
  patientId: string;
  doctors: DoctorOption[];
  /**
   * When "CONSULTING", the role is fixed to consulting (no role picker). Used by
   * the patient's current primary treating doctor, who may add consultants
   * without patient.assignDoctor. The server is the real gate regardless.
   */
  lockType?: "CONSULTING";
}) {
  const [state, formAction] = useActionState(assignDoctorAction, initialState);
  const lockedConsulting = lockType === "CONSULTING";

  if (doctors.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No doctor profiles exist yet. Create a user with a doctor profile first.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />
      {lockedConsulting ? (
        <input type="hidden" name="relationshipType" value="CONSULTING" />
      ) : null}
      <div className={lockedConsulting ? "space-y-1" : "grid gap-3 sm:grid-cols-2"}>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">Doctor</label>
          <select name="doctorProfileId" defaultValue="" className={selectCls} required>
            <option value="" disabled>Select a doctor…</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
          {state.fieldErrors?.doctorProfileId?.length ? (
            <p className="text-xs text-red-600">{state.fieldErrors.doctorProfileId[0]}</p>
          ) : null}
        </div>
        {!lockedConsulting ? (
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Role</label>
            <select name="relationshipType" defaultValue="PRIMARY_TREATING" className={selectCls}>
              {REL_TYPES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <input
        name="notes"
        placeholder="Notes (optional)"
        className={selectCls}
      />
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-green-700">{state.success}</p>
      ) : null}
      <SubmitButton label={lockedConsulting ? "Add consulting doctor" : "Assign doctor"} />
    </form>
  );
}

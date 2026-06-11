"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createPatientAction, type CreatePatientState } from "@/app/(dashboard)/patients/actions";
import { PatientFields } from "./PatientFields";

const initialState: CreatePatientState = {};

export interface DoctorOption {
  id: string;
  label: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create patient"}
    </button>
  );
}

export function CreatePatientForm({
  doctors,
  isAdmin,
  selfDoctorProfileId,
}: {
  doctors: DoctorOption[];
  isAdmin: boolean;
  selfDoctorProfileId: string | null;
}) {
  const [state, formAction] = useActionState(createPatientAction, initialState);

  if (state.success) {
    const { patientId, patientCode, canView, assignedSelf } = state.success;
    return (
      <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-6">
        <p className="text-sm text-green-800">
          Patient <code>{patientCode}</code> was created
          {assignedSelf ? " and assigned to you as primary treating doctor" : ""}.
        </p>
        {!canView ? (
          <p className="text-sm text-amber-700">
            You are not assigned to this patient, so you cannot view or manage it.
            An administrator can assign you (or another doctor) to it.
          </p>
        ) : null}
        <div className="flex gap-3">
          {canView ? (
            <Link
              href={`/patients/${patientId}`}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Open patient
            </Link>
          ) : null}
          <Link
            href="/patients"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to patients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <PatientFields fieldErrors={state.fieldErrors} />

      {doctors.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-900">
            Primary treating doctor (optional)
          </legend>
          <select
            name="initialDoctorProfileId"
            defaultValue={selfDoctorProfileId ?? ""}
            className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">— None —</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          {state.fieldErrors?.initialDoctorProfileId?.length ? (
            <p className="text-xs text-red-600">
              {state.fieldErrors.initialDoctorProfileId[0]}
            </p>
          ) : null}
          {!isAdmin ? (
            <p className="text-xs text-amber-700">
              Note: if you are not assigned as this patient&apos;s treating doctor,
              you will not be able to view or manage them after creation.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">{state.error}</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

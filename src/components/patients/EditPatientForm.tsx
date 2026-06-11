"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updatePatientAction, type PatientActionState } from "@/app/(dashboard)/patients/[patientId]/actions";
import { PatientFields, type PatientDefaults } from "./PatientFields";

const initialState: PatientActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export function EditPatientForm({
  patientId,
  defaults,
}: {
  patientId: string;
  defaults: PatientDefaults;
}) {
  const [state, formAction] = useActionState(updatePatientAction, initialState);

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <input type="hidden" name="patientId" value={patientId} />
      <PatientFields defaults={defaults} fieldErrors={state.fieldErrors} />

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

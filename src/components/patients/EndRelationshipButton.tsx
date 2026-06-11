"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { endRelationshipAction, type PatientActionState } from "@/app/(dashboard)/patients/[patientId]/actions";

const initialState: PatientActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      {pending ? "Ending…" : "End"}
    </button>
  );
}

/** Soft-closes a current relationship (sets endDate / isCurrentlyTreating=false). */
export function EndRelationshipButton({
  patientId,
  relationshipId,
}: {
  patientId: string;
  relationshipId: string;
}) {
  const [state, formAction] = useActionState(endRelationshipAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("End this doctor-patient relationship? It stays in history.")) {
          e.preventDefault();
        }
      }}
      className="inline-flex flex-col gap-1"
    >
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <SubmitButton />
      {state.error ? (
        <span role="alert" className="text-xs text-red-600">{state.error}</span>
      ) : null}
    </form>
  );
}

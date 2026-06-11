"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ClinicalActionState } from "@/lib/clinical/form-state";

const initialState: ClinicalActionState = {};

type ArchiveAction = (
  prev: ClinicalActionState,
  formData: FormData,
) => Promise<ClinicalActionState>;

function ConfirmButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
    >
      {pending ? "Archiving…" : label}
    </button>
  );
}

/**
 * Archive (soft-delete) control. The row is preserved in the database — this
 * sets deletedAt and hides it from normal lists. UI says "Archive", not
 * "Delete", because nothing is physically removed. An optional short reason is
 * captured (operator label only — never clinical free text).
 */
export function ArchiveButton({
  action,
  patientId,
  id,
  entityLabel,
}: {
  action: ArchiveAction;
  patientId: string;
  id: string;
  entityLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initialState);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Archive {entityLabel}
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-red-800">
        Archive this {entityLabel}? It is hidden from normal lists but preserved
        in clinical history (not deleted).
      </p>
      <input
        name="reason"
        placeholder="Reason (optional, e.g. duplicate)"
        maxLength={200}
        className="w-full rounded-md border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
      />
      {state.error ? <p className="text-xs text-red-700">{state.error}</p> : null}
      <div className="flex gap-2">
        <ConfirmButton label={`Archive ${entityLabel}`} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { RoleFormState } from "@/app/(dashboard)/admin/roles/actions";

const initialState: RoleFormState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

/**
 * Create/edit a role's name + description. `action` is the bound server action
 * (create or update). For edit, pass `role` (adds a hidden roleId). When
 * `disabled` (system role), inputs are read-only and there is no submit.
 */
export function RoleForm({
  action,
  role,
  submitLabel = "Save",
  disabled = false,
}: {
  action: (prev: RoleFormState, formData: FormData) => Promise<RoleFormState>;
  role?: { id: string; name: string; description: string | null };
  submitLabel?: string;
  disabled?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      {role ? <input type="hidden" name="roleId" value={role.id} /> : null}

      <div className="space-y-1">
        <label htmlFor="name" className="block text-sm font-medium text-slate-700">
          Role name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          disabled={disabled}
          defaultValue={role?.name ?? ""}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-100 disabled:text-slate-500"
        />
        {state.fieldErrors?.name?.length ? (
          <p className="text-xs text-red-600">{state.fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="description" className="block text-sm font-medium text-slate-700">
          Description (optional)
        </label>
        <input
          id="description"
          name="description"
          type="text"
          disabled={disabled}
          defaultValue={role?.description ?? ""}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-100 disabled:text-slate-500"
        />
        {state.fieldErrors?.description?.length ? (
          <p className="text-xs text-red-600">{state.fieldErrors.description[0]}</p>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-green-700">{state.success}</p>
      ) : null}

      {!disabled ? <SubmitButton label={submitLabel} /> : null}
    </form>
  );
}

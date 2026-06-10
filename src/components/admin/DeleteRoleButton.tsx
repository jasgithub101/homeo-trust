"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteRoleAction,
  type RoleFormState,
} from "@/app/(dashboard)/admin/roles/actions";

const initialState: RoleFormState = {};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete role"}
    </button>
  );
}

/**
 * Deletes a role after a confirmation prompt. Disabled for system roles. The
 * server still blocks deletion of system roles and roles with assigned users.
 */
export function DeleteRoleButton({
  roleId,
  disabled = false,
  disabledReason,
}: {
  roleId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction] = useActionState(deleteRoleAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Delete this role? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="roleId" value={roleId} />
      <SubmitButton disabled={disabled} />
      {disabled && disabledReason ? (
        <p className="text-xs text-slate-500">{disabledReason}</p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">{state.error}</p>
      ) : null}
    </form>
  );
}

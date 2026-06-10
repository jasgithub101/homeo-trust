"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  setUserRolesAction,
  type UserRolesState,
} from "@/app/(dashboard)/admin/users/[userId]/actions";

const initialState: UserRolesState = {};

interface RoleOption {
  id: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save roles"}
    </button>
  );
}

/**
 * Checkbox list of all roles; the user's current roles are pre-checked.
 * Submits the selected role ids (name="roleIds") to setUserRolesAction
 * (replace-set semantics). The server enforces ADMIN-role and last-admin rules.
 */
export function RoleAssignmentForm({
  userId,
  roles,
  assignedRoleIds,
}: {
  userId: string;
  roles: RoleOption[];
  assignedRoleIds: string[];
}) {
  const [state, formAction] = useActionState(setUserRolesAction, initialState);
  const assigned = new Set(assignedRoleIds);

  if (roles.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No roles exist yet. Create a role first to assign access.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />

      <div className="space-y-2">
        {roles.map((r) => (
          <label
            key={r.id}
            className="flex items-start gap-2 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              name="roleIds"
              value={r.id}
              defaultChecked={assigned.has(r.id)}
              className="mt-0.5"
            />
            <span>
              {r.name}
              {r.isSystemRole ? (
                <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                  System
                </span>
              ) : null}
              {r.description ? (
                <span className="block text-xs text-slate-400">
                  {r.description}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>

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

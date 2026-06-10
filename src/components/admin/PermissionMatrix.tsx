"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  setRolePermissionsAction,
  type RoleFormState,
} from "@/app/(dashboard)/admin/roles/actions";

const initialState: RoleFormState = {};

interface PermDef {
  key: string;
  label: string;
  description: string;
}

interface Group {
  category: string;
  permissions: PermDef[];
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save permissions"}
    </button>
  );
}

/**
 * Checkbox grid of permissions grouped by category, with per-category
 * select-all. Submits the checked keys (name="permissionKeys") to
 * setRolePermissionsAction. When `disabled` (system role), it renders a locked,
 * read-only view with no submit.
 */
export function PermissionMatrix({
  roleId,
  groups,
  selectedKeys,
  disabled = false,
}: {
  roleId: string;
  groups: Group[];
  selectedKeys: string[];
  disabled?: boolean;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(selectedKeys));
  const [state, formAction] = useActionState(
    setRolePermissionsAction,
    initialState,
  );

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setCategory(perms: PermDef[], on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (on) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="roleId" value={roleId} />

      <div className="space-y-5">
        {groups.map((g) => {
          const allOn = g.permissions.every((p) => checked.has(p.key));
          return (
            <fieldset
              key={g.category}
              className="rounded-lg border border-slate-200 p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <legend className="text-sm font-semibold text-slate-900">
                  {g.category}
                </legend>
                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => setCategory(g.permissions, !allOn)}
                    className="text-xs text-brand-700 hover:underline"
                  >
                    {allOn ? "Clear all" : "Select all"}
                  </button>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.permissions.map((p) => (
                  <label
                    key={p.key}
                    className="flex items-start gap-2 text-sm text-slate-700"
                    title={p.description}
                  >
                    <input
                      type="checkbox"
                      name="permissionKeys"
                      value={p.key}
                      checked={checked.has(p.key)}
                      disabled={disabled}
                      onChange={() => toggle(p.key)}
                      className="mt-0.5"
                    />
                    <span>
                      {p.label}
                      <code className="ml-1 text-xs text-slate-400">{p.key}</code>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-green-700">{state.success}</p>
      ) : null}

      {!disabled ? <SubmitButton /> : null}
    </form>
  );
}

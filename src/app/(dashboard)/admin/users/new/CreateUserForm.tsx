"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { OneTimeSecret } from "@/components/ui/OneTimeSecret";
import { createUserAction, type CreateUserState } from "./actions";

const initialState: CreateUserState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create user"}
    </button>
  );
}

function Field({
  id,
  label,
  type = "text",
  required = false,
  errors,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  errors?: string[];
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {errors?.length ? <p className="text-xs text-red-600">{errors[0]}</p> : null}
    </div>
  );
}

export function CreateUserForm({
  roles = [],
}: {
  roles?: { id: string; name: string; isSystemRole: boolean }[];
}) {
  const [state, formAction] = useActionState(createUserAction, initialState);
  const [isDoctor, setIsDoctor] = useState(false);

  if (state.success) {
    return (
      <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-6">
        <p className="text-sm text-green-800">
          User <strong>{state.success.name}</strong> (username{" "}
          <code>{state.success.username}</code>) was created
          {state.success.isDoctor ? " with a doctor profile" : ""}. They must set
          a new password on first login.
        </p>
        <OneTimeSecret
          label={`Temporary password for ${state.success.username}`}
          value={state.success.tempPassword}
        />
        <p className="text-xs text-green-700">
          Hand the temporary password to the user directly — it is shown once and
          cannot be retrieved later.
        </p>
        <div className="flex gap-3">
          <Link
            href="/admin/users"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to users
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Account</legend>
        <Field id="name" label="Full name" required errors={state.fieldErrors?.name} />
        <Field id="email" label="Email" type="email" required errors={state.fieldErrors?.email} />
        <Field
          id="username"
          label="Username"
          required
          errors={state.fieldErrors?.username}
          hint="Letters, numbers, dot, dash or underscore."
        />
        <Field id="phone" label="Phone (optional)" errors={state.fieldErrors?.phone} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">
          Doctor profile (optional)
        </legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="isDoctor"
            checked={isDoctor}
            onChange={(e) => setIsDoctor(e.target.checked)}
          />
          This user is a doctor (add a clinical doctor profile)
        </label>

        {isDoctor ? (
          <div className="space-y-4 rounded-md border border-slate-200 p-4">
            <Field
              id="qualification"
              label="Qualification"
              required
              errors={state.fieldErrors?.qualification}
            />
            <Field
              id="registrationNumber"
              label="Registration number (optional)"
              errors={state.fieldErrors?.registrationNumber}
            />
            <Field
              id="specialization"
              label="Specialization (optional)"
              errors={state.fieldErrors?.specialization}
            />
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Only enable this for clinical doctors. Nurses, assistants, reception
            and other staff do not need a doctor profile — grant them access via
            roles instead.
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">
          Roles (optional)
        </legend>
        {roles.length === 0 ? (
          <p className="text-xs text-slate-500">
            No roles exist yet. You can assign roles later from the user page.
          </p>
        ) : (
          <div className="space-y-2">
            {roles.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input type="checkbox" name="roleIds" value={r.id} />
                <span>
                  {r.name}
                  {r.isSystemRole ? (
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                      System
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

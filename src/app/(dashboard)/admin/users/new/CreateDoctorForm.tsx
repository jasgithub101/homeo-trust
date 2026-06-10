"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createDoctorAction, type CreateDoctorState } from "./actions";

const initialState: CreateDoctorState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create doctor"}
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

export function CreateDoctorForm() {
  const [state, formAction] = useActionState(createDoctorAction, initialState);

  if (state.success) {
    return (
      <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-6">
        <p className="text-sm text-green-800">
          Doctor <strong>{state.success.name}</strong> (username{" "}
          <code>{state.success.username}</code>) was created. Temporary login
          credentials have been sent to {state.success.email}. They must set a
          new password on first login.
        </p>
        <p className="text-xs text-green-700">
          In development with no SMTP configured, the credentials are printed to
          the server console (marked development-only).
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

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Doctor profile</legend>
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

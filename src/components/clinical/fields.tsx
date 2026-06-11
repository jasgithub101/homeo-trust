"use client";

import { useFormStatus } from "react-dom";

/**
 * Reusable uncontrolled form inputs shared by the Phase 6 clinical forms
 * (case / issue / symptom / treatment). Field errors render inline.
 */

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export function TextField({
  name,
  label,
  type = "text",
  required = false,
  defaultValue,
  placeholder,
  errors,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  errors?: string[];
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={inputCls}
      />
      {errors?.length ? <p className="text-xs text-red-600">{errors[0]}</p> : null}
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  required = false,
  rows = 4,
  defaultValue,
  errors,
}: {
  name: string;
  label: string;
  required?: boolean;
  rows?: number;
  defaultValue?: string;
  errors?: string[];
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        required={required}
        defaultValue={defaultValue ?? ""}
        className={inputCls}
      />
      {errors?.length ? <p className="text-xs text-red-600">{errors[0]}</p> : null}
    </div>
  );
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  errors,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  errors?: string[];
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? options[0]?.value}
        className={inputCls}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {errors?.length ? <p className="text-xs text-red-600">{errors[0]}</p> : null}
    </div>
  );
}

export function SubmitButton({ label }: { label: string }) {
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

export function FormMessages({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  return (
    <>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
    </>
  );
}

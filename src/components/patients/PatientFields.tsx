"use client";

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export interface PatientDefaults {
  name?: string;
  gender?: string;
  dateOfBirth?: string; // yyyy-mm-dd
  age?: string | number;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  occupation?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  emergencyContactPhone?: string;
  emergencyContactAddress?: string;
}

function Field({
  id,
  label,
  type = "text",
  required = false,
  defaultValue,
  errors,
}: {
  id: keyof PatientDefaults;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  errors?: string[];
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
        defaultValue={defaultValue ?? ""}
        className={inputCls}
      />
      {errors?.length ? <p className="text-xs text-red-600">{errors[0]}</p> : null}
    </div>
  );
}

const GENDERS = ["UNSPECIFIED", "MALE", "FEMALE", "OTHER"] as const;

/**
 * Shared patient field inputs (uncontrolled). Used by both create and edit
 * forms. PII fields — only rendered to users authorized to see/edit them.
 */
export function PatientFields({
  defaults = {},
  fieldErrors,
}: {
  defaults?: PatientDefaults;
  fieldErrors?: Record<string, string[]>;
}) {
  const e = (k: string) => fieldErrors?.[k];
  return (
    <>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Identity</legend>
        <Field id="name" label="Full name" required defaultValue={defaults.name} errors={e("name")} />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="gender" className="block text-sm font-medium text-slate-700">
              Gender
            </label>
            <select id="gender" name="gender" defaultValue={defaults.gender ?? "UNSPECIFIED"} className={inputCls}>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g.charAt(0) + g.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <Field id="age" label="Age" type="number" defaultValue={defaults.age} errors={e("age")} />
        </div>
        <Field id="dateOfBirth" label="Date of birth" type="date" defaultValue={defaults.dateOfBirth} errors={e("dateOfBirth")} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Contact</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field id="phone" label="Phone" defaultValue={defaults.phone} errors={e("phone")} />
          <Field id="email" label="Email" type="email" defaultValue={defaults.email} errors={e("email")} />
        </div>
        <Field id="address" label="Address" defaultValue={defaults.address} errors={e("address")} />
        <div className="grid grid-cols-3 gap-4">
          <Field id="city" label="City" defaultValue={defaults.city} errors={e("city")} />
          <Field id="state" label="State" defaultValue={defaults.state} errors={e("state")} />
          <Field id="country" label="Country" defaultValue={defaults.country} errors={e("country")} />
        </div>
        <Field id="occupation" label="Occupation" defaultValue={defaults.occupation} errors={e("occupation")} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">
          Emergency contact
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <Field id="emergencyContactName" label="Name" defaultValue={defaults.emergencyContactName} errors={e("emergencyContactName")} />
          <Field id="emergencyContactRelation" label="Relation" defaultValue={defaults.emergencyContactRelation} errors={e("emergencyContactRelation")} />
        </div>
        <Field id="emergencyContactPhone" label="Phone" defaultValue={defaults.emergencyContactPhone} errors={e("emergencyContactPhone")} />
        <Field id="emergencyContactAddress" label="Address" defaultValue={defaults.emergencyContactAddress} errors={e("emergencyContactAddress")} />
      </fieldset>
    </>
  );
}

import { prettyEnum } from "@/lib/format/enum";
import { GENDER_VALUES } from "@/lib/validation/patient";
import { ISSUE_STATUS_VALUES, TREATMENT_ENTRY_TYPES } from "@/lib/validation/clinical";
import { EXPLORE_AGE_RANGES, type ExploreFilters } from "@/lib/validation/explore";

/**
 * De-identified Explore filter form. A plain GET form (no client JS): filters
 * become shareable query params and the page re-runs the search server-side.
 * Every control maps to a coarse, de-identified facet of explore_case_view —
 * there is intentionally no free-text search box.
 */
export function ExploreFiltersForm({ current }: { current: ExploreFilters }) {
  return (
    <form
      method="get"
      className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <SelectField label="Gender" name="gender" value={current.gender}>
        {GENDER_VALUES.map((g) => (
          <option key={g} value={g}>
            {prettyEnum(g)}
          </option>
        ))}
      </SelectField>

      <SelectField label="Age range" name="ageRange" value={current.ageRange}>
        {EXPLORE_AGE_RANGES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Issue status"
        name="issueStatus"
        value={current.issueStatus}
      >
        {ISSUE_STATUS_VALUES.map((s) => (
          <option key={s} value={s}>
            {prettyEnum(s)}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Treatment type"
        name="treatmentType"
        value={current.treatmentType}
      >
        {TREATMENT_ENTRY_TYPES.map((t) => (
          <option key={t} value={t}>
            {prettyEnum(t)}
          </option>
        ))}
      </SelectField>

      <TextField label="State / region" name="state" value={current.state} />
      <TextField label="Country" name="country" value={current.country} />

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Apply filters
        </button>
        <a
          href="/explore"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Reset
        </a>
      </div>
    </form>
  );
}

function SelectField({
  label,
  name,
  value,
  children,
}: {
  label: string;
  name: string;
  value: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
      >
        <option value="">Any</option>
        {children}
      </select>
    </label>
  );
}

function TextField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string | undefined;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={value ?? ""}
        maxLength={120}
        placeholder="Any"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
      />
    </label>
  );
}

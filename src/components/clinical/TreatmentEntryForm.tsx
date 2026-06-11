"use client";

import { useActionState, useState } from "react";
import {
  createTreatmentAction,
  updateTreatmentAction,
} from "@/app/(dashboard)/patients/[patientId]/treatments/actions";
import type { ClinicalActionState } from "@/lib/clinical/form-state";
import {
  TREATMENT_ENTRY_TYPES,
  PATIENT_CONDITION_VALUES,
} from "@/lib/validation/clinical";
import type { DoctorOption } from "@/components/patients/CreatePatientForm";
import { prettyEnum } from "@/lib/format/enum";
import {
  FormMessages,
  SubmitButton,
  TextAreaField,
  TextField,
} from "./fields";

const initialState: ClinicalActionState = {};

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export interface IssueOption {
  id: string;
  title: string;
}

export interface TreatmentDefaults {
  entryType?: string;
  treatmentDate?: string; // yyyy-mm-dd
  patientIssueId?: string;
  medicineName?: string;
  potency?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  followUpNotes?: string;
  symptomChanges?: string;
  patientCondition?: string;
  improvementScore?: string | number;
  nextFollowUpDate?: string;
  treatingDoctorProfileIds?: string[];
  consultingDoctorProfileIds?: string[];
}

function DoctorMultiSelect({
  name,
  label,
  doctors,
  defaultValue,
  errors,
}: {
  name: string;
  label: string;
  doctors: DoctorOption[];
  defaultValue?: string[];
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
        multiple
        size={Math.min(Math.max(doctors.length, 3), 6)}
        defaultValue={defaultValue ?? []}
        className={inputCls}
      >
        {doctors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-400">Hold Ctrl/Cmd to select multiple.</p>
      {errors?.length ? <p className="text-xs text-red-600">{errors[0]}</p> : null}
    </div>
  );
}

export function TreatmentEntryForm({
  patientId,
  treatmentId,
  doctors,
  issues,
  defaults = {},
}: {
  patientId: string;
  treatmentId?: string;
  doctors: DoctorOption[];
  issues: IssueOption[];
  defaults?: TreatmentDefaults;
}) {
  const isEdit = !!treatmentId;
  const [state, formAction] = useActionState(
    isEdit ? updateTreatmentAction : createTreatmentAction,
    initialState,
  );
  const e = (k: string) => state.fieldErrors?.[k];

  const [entryType, setEntryType] = useState(defaults.entryType ?? "PRESCRIPTION");
  const showPrescription =
    entryType === "PRESCRIPTION" || entryType === "PRESCRIPTION_AND_FOLLOW_UP";
  const showFollowUp =
    entryType === "FOLLOW_UP" || entryType === "PRESCRIPTION_AND_FOLLOW_UP";
  const isNote = entryType === "NOTE";

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <input type="hidden" name="patientId" value={patientId} />
      {isEdit ? <input type="hidden" name="treatmentId" value={treatmentId} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="entryType" className="block text-sm font-medium text-slate-700">
            Entry type
          </label>
          <select
            id="entryType"
            name="entryType"
            value={entryType}
            onChange={(ev) => setEntryType(ev.target.value)}
            className={inputCls}
          >
            {TREATMENT_ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {prettyEnum(t)}
              </option>
            ))}
          </select>
          {e("entryType")?.length ? <p className="text-xs text-red-600">{e("entryType")![0]}</p> : null}
        </div>
        <TextField name="treatmentDate" label="Treatment date" type="date" required defaultValue={defaults.treatmentDate} errors={e("treatmentDate")} />
      </div>

      <div className="space-y-1">
        <label htmlFor="patientIssueId" className="block text-sm font-medium text-slate-700">
          Related issue (optional)
        </label>
        <select id="patientIssueId" name="patientIssueId" defaultValue={defaults.patientIssueId ?? ""} className={inputCls}>
          <option value="">— None —</option>
          {issues.map((i) => (
            <option key={i.id} value={i.id}>{i.title}</option>
          ))}
        </select>
        {e("patientIssueId")?.length ? <p className="text-xs text-red-600">{e("patientIssueId")![0]}</p> : null}
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Doctors</legend>
        <DoctorMultiSelect
          name="treatingDoctorProfileIds"
          label="Treating doctor(s) *"
          doctors={doctors}
          defaultValue={defaults.treatingDoctorProfileIds}
          errors={e("treatingDoctorProfileIds")}
        />
        <DoctorMultiSelect
          name="consultingDoctorProfileIds"
          label="Consulting doctor(s)"
          doctors={doctors}
          defaultValue={defaults.consultingDoctorProfileIds}
          errors={e("consultingDoctorProfileIds")}
        />
      </fieldset>

      {showPrescription ? (
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-900">Prescription</legend>
          <TextField name="medicineName" label="Medicine" defaultValue={defaults.medicineName} errors={e("medicineName")} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField name="potency" label="Potency" defaultValue={defaults.potency} errors={e("potency")} />
            <TextField name="dosage" label="Dosage" defaultValue={defaults.dosage} errors={e("dosage")} />
            <TextField name="frequency" label="Frequency" defaultValue={defaults.frequency} errors={e("frequency")} />
          </div>
          <TextField name="duration" label="Duration" defaultValue={defaults.duration} errors={e("duration")} />
          <TextAreaField name="instructions" label="Instructions" rows={3} defaultValue={defaults.instructions} errors={e("instructions")} />
        </fieldset>
      ) : null}

      {showFollowUp ? (
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-900">Follow-up</legend>
          <TextAreaField name="followUpNotes" label="Follow-up notes" rows={3} defaultValue={defaults.followUpNotes} errors={e("followUpNotes")} />
          <TextAreaField name="symptomChanges" label="Symptom changes" rows={3} defaultValue={defaults.symptomChanges} errors={e("symptomChanges")} />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="patientCondition" className="block text-sm font-medium text-slate-700">
                Patient condition
              </label>
              <select id="patientCondition" name="patientCondition" defaultValue={defaults.patientCondition ?? ""} className={inputCls}>
                <option value="">—</option>
                {PATIENT_CONDITION_VALUES.map((c) => (
                  <option key={c} value={c}>{prettyEnum(c)}</option>
                ))}
              </select>
            </div>
            <TextField name="improvementScore" label="Improvement (1–10)" type="number" defaultValue={defaults.improvementScore} errors={e("improvementScore")} />
            <TextField name="nextFollowUpDate" label="Next follow-up" type="date" defaultValue={defaults.nextFollowUpDate} errors={e("nextFollowUpDate")} />
          </div>
        </fieldset>
      ) : null}

      {isNote ? (
        <TextAreaField name="instructions" label="Note" rows={4} defaultValue={defaults.instructions} errors={e("instructions")} />
      ) : null}

      <FormMessages error={state.error} success={state.success} />
      <SubmitButton label={isEdit ? "Save treatment" : "Add treatment"} />
    </form>
  );
}

"use client";

import { useActionState } from "react";
import {
  createSymptomAction,
  updateSymptomAction,
} from "@/app/(dashboard)/patients/[patientId]/issues/actions";
import type { ClinicalActionState } from "@/lib/clinical/form-state";
import {
  FormMessages,
  SubmitButton,
  TextAreaField,
  TextField,
} from "./fields";

const initialState: ClinicalActionState = {};

export interface SymptomDefaults {
  symptomName?: string;
  description?: string;
  severity?: string | number;
  duration?: string;
  modalities?: string;
  triggers?: string;
  location?: string;
}

export function SymptomForm({
  patientId,
  issueId,
  symptomId,
  defaults = {},
}: {
  patientId: string;
  issueId: string;
  symptomId?: string;
  defaults?: SymptomDefaults;
}) {
  const isEdit = !!symptomId;
  const [state, formAction] = useActionState(
    isEdit ? updateSymptomAction : createSymptomAction,
    initialState,
  );
  const e = (k: string) => state.fieldErrors?.[k];

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="issueId" value={issueId} />
      {isEdit ? <input type="hidden" name="symptomId" value={symptomId} /> : null}

      <TextField name="symptomName" label="Symptom name" required defaultValue={defaults.symptomName} errors={e("symptomName")} />
      <TextAreaField name="description" label="Description" rows={3} defaultValue={defaults.description} errors={e("description")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="severity" label="Severity (1–10)" type="number" defaultValue={defaults.severity} errors={e("severity")} />
        <TextField name="duration" label="Duration" defaultValue={defaults.duration} errors={e("duration")} />
      </div>
      <TextField name="modalities" label="Modalities" defaultValue={defaults.modalities} errors={e("modalities")} />
      <TextField name="triggers" label="Triggers" defaultValue={defaults.triggers} errors={e("triggers")} />
      <TextField name="location" label="Location" defaultValue={defaults.location} errors={e("location")} />

      <FormMessages error={state.error} success={state.success} />
      <SubmitButton label={isEdit ? "Save symptom" : "Add symptom"} />
    </form>
  );
}

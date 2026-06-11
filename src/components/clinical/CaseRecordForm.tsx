"use client";

import { useActionState } from "react";
import { upsertCaseRecordAction } from "@/app/(dashboard)/patients/[patientId]/case/actions";
import type { ClinicalActionState } from "@/lib/clinical/form-state";
import {
  FormMessages,
  SubmitButton,
  TextAreaField,
  TextField,
} from "./fields";

const initialState: ClinicalActionState = {};

export interface CaseRecordDefaults {
  chiefComplaint?: string;
  caseDescription?: string;
  medicalHistory?: string;
  familyHistory?: string;
  physicalGenerals?: string;
  mentalGenerals?: string;
  modalities?: string;
  diagnosisNotes?: string;
  repertoryNotes?: string;
}

export function CaseRecordForm({
  patientId,
  defaults = {},
  exists,
}: {
  patientId: string;
  defaults?: CaseRecordDefaults;
  exists: boolean;
}) {
  const [state, formAction] = useActionState(upsertCaseRecordAction, initialState);
  const e = (k: string) => state.fieldErrors?.[k];

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <input type="hidden" name="patientId" value={patientId} />

      <TextAreaField
        name="chiefComplaint"
        label="Chief complaint"
        required
        rows={2}
        defaultValue={defaults.chiefComplaint}
        errors={e("chiefComplaint")}
      />
      <TextAreaField
        name="caseDescription"
        label="Case description"
        required
        rows={5}
        defaultValue={defaults.caseDescription}
        errors={e("caseDescription")}
      />
      <TextAreaField name="medicalHistory" label="Medical history" defaultValue={defaults.medicalHistory} errors={e("medicalHistory")} />
      <TextAreaField name="familyHistory" label="Family history" defaultValue={defaults.familyHistory} errors={e("familyHistory")} />
      <TextAreaField name="physicalGenerals" label="Physical generals" defaultValue={defaults.physicalGenerals} errors={e("physicalGenerals")} />
      <TextAreaField name="mentalGenerals" label="Mental generals" defaultValue={defaults.mentalGenerals} errors={e("mentalGenerals")} />
      <TextField name="modalities" label="Modalities" defaultValue={defaults.modalities} errors={e("modalities")} />
      <TextAreaField name="diagnosisNotes" label="Diagnosis notes" defaultValue={defaults.diagnosisNotes} errors={e("diagnosisNotes")} />
      <TextAreaField name="repertoryNotes" label="Repertory notes" defaultValue={defaults.repertoryNotes} errors={e("repertoryNotes")} />

      <FormMessages error={state.error} success={state.success} />
      <SubmitButton label={exists ? "Save case" : "Create case"} />
    </form>
  );
}

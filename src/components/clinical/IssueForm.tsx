"use client";

import { useActionState } from "react";
import {
  createIssueAction,
  updateIssueAction,
} from "@/app/(dashboard)/patients/[patientId]/issues/actions";
import type { ClinicalActionState } from "@/lib/clinical/form-state";
import { ISSUE_STATUS_VALUES } from "@/lib/validation/clinical";
import { prettyEnum } from "@/lib/format/enum";
import {
  FormMessages,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "./fields";

const initialState: ClinicalActionState = {};

const STATUS_OPTIONS = ISSUE_STATUS_VALUES.map((v) => ({
  value: v,
  label: prettyEnum(v),
}));

export interface IssueDefaults {
  title?: string;
  description?: string;
  status?: string;
  onsetDate?: string; // yyyy-mm-dd
}

export function IssueForm({
  patientId,
  issueId,
  defaults = {},
}: {
  patientId: string;
  issueId?: string;
  defaults?: IssueDefaults;
}) {
  const isEdit = !!issueId;
  const [state, formAction] = useActionState(
    isEdit ? updateIssueAction : createIssueAction,
    initialState,
  );
  const e = (k: string) => state.fieldErrors?.[k];

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <input type="hidden" name="patientId" value={patientId} />
      {isEdit ? <input type="hidden" name="issueId" value={issueId} /> : null}

      <TextField name="title" label="Title" required defaultValue={defaults.title} errors={e("title")} />
      <TextAreaField name="description" label="Description" required defaultValue={defaults.description} errors={e("description")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="status" label="Status" options={STATUS_OPTIONS} defaultValue={defaults.status ?? "ACTIVE"} errors={e("status")} />
        <TextField name="onsetDate" label="Onset date" type="date" defaultValue={defaults.onsetDate} errors={e("onsetDate")} />
      </div>

      <FormMessages error={state.error} success={state.success} />
      <SubmitButton label={isEdit ? "Save issue" : "Create issue"} />
    </form>
  );
}

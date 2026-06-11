"use client";

import { useActionState, useRef } from "react";
import { uploadAttachmentAction } from "@/app/(dashboard)/patients/[patientId]/attachments/actions";
import type { ClinicalActionState } from "@/lib/clinical/form-state";
import {
  ATTACHMENT_TYPE_VALUES,
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  type AttachmentParentType,
} from "@/lib/validation/attachment";
import { prettyEnum } from "@/lib/format/enum";
import { FormMessages, SelectField, SubmitButton, TextField } from "@/components/clinical/fields";

const initialState: ClinicalActionState = {};

const TYPE_OPTIONS = ATTACHMENT_TYPE_VALUES.map((v) => ({
  value: v,
  label: prettyEnum(v),
}));

const SENSITIVITY_OPTIONS = [
  { value: "true", label: "Sensitive (restricted)" },
  { value: "false", label: "Not sensitive" },
];

const ACCEPT = ALLOWED_MIME_TYPES.join(",");
const MAX_MB = MAX_ATTACHMENT_BYTES / (1024 * 1024);

/**
 * Upload form for a single attachment, filed under a specific parent entity
 * (issue / case / treatment). Mirrors the Phase 6 clinical forms
 * (useActionState + useFormStatus). All limits are RE-ENFORCED server-side; the
 * `accept`/size hints here are only a convenience.
 */
export function AttachmentUploadForm({
  patientId,
  parentType,
  parentId,
}: {
  patientId: string;
  parentType: AttachmentParentType;
  parentId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    async (prev: ClinicalActionState, formData: FormData) => {
      const result = await uploadAttachmentAction(prev, formData);
      if (result.success) formRef.current?.reset();
      return result;
    },
    initialState,
  );
  const e = (k: string) => state.fieldErrors?.[k];

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="parentType" value={parentType} />
      <input type="hidden" name="parentId" value={parentId} />

      <div className="space-y-1">
        <label htmlFor="file" className="block text-sm font-medium text-slate-700">
          File <span className="text-red-500">*</span>
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept={ACCEPT}
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
        />
        <p className="text-xs text-slate-500">
          JPEG, PNG, WebP, HEIC, or PDF. Max {MAX_MB} MB.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="fileType" label="Type" options={TYPE_OPTIONS} errors={e("fileType")} />
        <SelectField
          name="isSensitive"
          label="Sensitivity"
          options={SENSITIVITY_OPTIONS}
          defaultValue="true"
          errors={e("isSensitive")}
        />
      </div>

      <TextField
        name="description"
        label="Description"
        placeholder="Optional short note"
        errors={e("description")}
      />

      <FormMessages error={state.error} success={state.success} />
      <SubmitButton label="Upload attachment" />
    </form>
  );
}

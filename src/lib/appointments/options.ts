import {
  APPOINTMENT_TYPE_VALUES,
  APPOINTMENT_STATUS_VALUES,
} from "@/lib/validation/appointment";

/** Form <select> option lists for appointment type and status. */
export const APPOINTMENT_TYPE_OPTIONS = [
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "CONSULT", label: "Consult" },
  { value: "INITIAL", label: "Initial" },
] as const satisfies ReadonlyArray<{
  value: (typeof APPOINTMENT_TYPE_VALUES)[number];
  label: string;
}>;

export const APPOINTMENT_STATUS_OPTIONS = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NO_SHOW", label: "No-show" },
] as const satisfies ReadonlyArray<{
  value: (typeof APPOINTMENT_STATUS_VALUES)[number];
  label: string;
}>;

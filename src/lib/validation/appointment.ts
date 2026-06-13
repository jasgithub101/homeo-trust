import { z } from "zod";

/**
 * Zod schemas for Feature A1 appointments. All inputs validated server-side
 * before any DB write. `notes` is free text (PII-capable) and is never logged;
 * `reason` (soft-delete) is a short operator label only, never clinical content.
 */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const optionalDuration = z
  .union([z.coerce.number().int().min(0).max(1440), z.literal("")])
  .optional();

// Mirror the Prisma enums; also drive the form <select>s.
export const APPOINTMENT_TYPE_VALUES = [
  "FOLLOW_UP",
  "CONSULT",
  "INITIAL",
] as const;

export const APPOINTMENT_STATUS_VALUES = [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

const appointmentFields = {
  scheduledAt: z
    .string()
    .trim()
    .min(1, "Date & time is required")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date & time"),
  durationMinutes: optionalDuration,
  // Checkbox: "on" when ticked, "" / absent otherwise.
  allDay: z.union([z.literal("on"), z.literal("true"), z.literal("")]).optional(),
  type: z.enum(APPOINTMENT_TYPE_VALUES),
  notes: optionalText(500),
};

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  ...appointmentFields,
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1),
  ...appointmentFields,
});
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export const changeAppointmentStatusSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1),
  status: z.enum(APPOINTMENT_STATUS_VALUES),
});
export type ChangeAppointmentStatusInput = z.infer<
  typeof changeAppointmentStatusSchema
>;

// Soft-delete ("created in error"). `reason` is a short operator label only.
export const softDeleteAppointmentSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1),
  reason: optionalText(200),
});
export type SoftDeleteAppointmentInput = z.infer<
  typeof softDeleteAppointmentSchema
>;

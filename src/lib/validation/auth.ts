import { z } from "zod";

/**
 * Zod schemas for all Phase 2 auth inputs. Every server action validates with
 * these before touching the database.
 */

// Password policy: min 12 chars, with lower, upper, and a digit.
export const passwordPolicy = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(200, "Password is too long")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const loginSchema = z.object({
  // Single field matched against email OR username, so we never reveal which.
  identifier: z.string().min(1, "Enter your email or username").max(254),
  password: z.string().min(1, "Enter your password").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Normal change-password flow (mustChangePassword = false): the current
// password is required and must be verified. Do not weaken this.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(200),
    newPassword: passwordPolicy,
    confirmPassword: z.string().min(1, "Confirm your new password").max(200),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// Forced first-login flow (mustChangePassword = true): the user has already
// authenticated with the temporary password, so the current password is NOT
// requested again. Only the new password + confirmation are required.
export const forcedPasswordChangeSchema = z
  .object({
    newPassword: passwordPolicy,
    confirmPassword: z.string().min(1, "Confirm your new password").max(200),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ForcedPasswordChangeInput = z.infer<
  typeof forcedPasswordChangeSchema
>;

// Create any user (doctor, nurse, assistant, reception, etc.). A DoctorProfile
// is OPTIONAL and only created when `isDoctor` is set — "doctor" is a clinical
// profile, not an authorization role. Access is granted separately via roles.
export const createUserSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(120),
    email: z.string().email("Enter a valid email").max(254),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(40)
      .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dot, dash or underscore"),
    phone: z.string().max(40).optional().or(z.literal("")),
    // Doctor profile is optional; fields only required when isDoctor is true.
    isDoctor: z.boolean().default(false),
    qualification: z.string().max(120).optional().or(z.literal("")),
    registrationNumber: z.string().max(80).optional().or(z.literal("")),
    specialization: z.string().max(120).optional().or(z.literal("")),
    // Optional roles to assign at creation. Existing DB role ids only; may be
    // empty (a user can be created with no roles). Validated to exist in the
    // action before assignment.
    roleIds: z.array(z.string().min(1)).optional().default([]),
  })
  .refine(
    (d) => !d.isDoctor || (typeof d.qualification === "string" && d.qualification.trim().length > 0),
    { message: "Qualification is required when adding a doctor profile", path: ["qualification"] },
  );
export type CreateUserInput = z.infer<typeof createUserSchema>;

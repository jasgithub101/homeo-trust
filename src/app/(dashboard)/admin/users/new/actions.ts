"use server";

import { db } from "@/lib/db";
import { requireAdminAccess } from "@/lib/permissions/check";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { sendMail } from "@/lib/mail/mailer";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { env } from "@/lib/env";
import { APP_NAME, APP_NAME_SHORT } from "@/lib/branding";
import { createUserSchema } from "@/lib/validation/auth";

export interface CreateUserState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: {
    name: string;
    username: string;
    email: string;
    isDoctor: boolean;
    /** One-time display — never persisted/logged; admin hands it over. */
    tempPassword: string;
    /** Whether the invite email was actually delivered (best-effort). */
    mailDelivered: boolean;
  };
}

function emptyToNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

export async function createUserAction(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const admin = await requireAdminAccess();

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    username: formData.get("username"),
    phone: formData.get("phone") ?? "",
    isDoctor: formData.get("isDoctor") === "on",
    qualification: formData.get("qualification") ?? "",
    registrationNumber: formData.get("registrationNumber") ?? "",
    specialization: formData.get("specialization") ?? "",
    roleIds: formData.getAll("roleIds"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;
  const email = input.email.toLowerCase();
  const roleIds = Array.from(new Set(input.roleIds));

  // Optional roles must reference existing DB roles (never a hardcoded role).
  if (roleIds.length > 0) {
    const found = await db.role.count({ where: { id: { in: roleIds } } });
    if (found !== roleIds.length) {
      return { error: "One or more selected roles no longer exist." };
    }
  }

  // Pre-check uniqueness for friendly field errors.
  const existing = await db.user.findFirst({
    where: { OR: [{ email }, { username: input.username }] },
    select: { email: true, username: true },
  });
  if (existing) {
    const fieldErrors: Record<string, string[]> = {};
    if (existing.email === email) fieldErrors.email = ["Email already in use"];
    if (existing.username === input.username)
      fieldErrors.username = ["Username already in use"];
    return { fieldErrors };
  }

  // Temp password — forced change on first login. Never logged here.
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  let created: { id: string };
  try {
    created = await db.user.create({
      data: {
        name: input.name,
        email,
        username: input.username,
        phone: emptyToNull(input.phone),
        passwordHash,
        active: true,
        mustChangePassword: true,
        createdByUserId: admin.id,
        // DoctorProfile only for users who are actually doctors.
        doctorProfile: input.isDoctor
          ? {
              create: {
                qualification: input.qualification!.trim(),
                registrationNumber: emptyToNull(input.registrationNumber),
                specialization: emptyToNull(input.specialization),
              },
            }
          : undefined,
        userRoles: roleIds.length
          ? {
              create: roleIds.map((roleId) => ({
                roleId,
                assignedByUserId: admin.id,
              })),
            }
          : undefined,
      },
      select: { id: true },
    });
  } catch {
    // Unique race or other constraint failure.
    return { error: "Could not create the user. Please try again." };
  }

  await writeAuditLog({
    action: AUDIT_ACTIONS.USER_CREATED,
    actorUserId: admin.id,
    entityType: "User",
    entityId: created.id,
    metadata: { username: input.username, isDoctor: input.isDoctor },
  });

  if (roleIds.length > 0) {
    await writeAuditLog({
      action: AUDIT_ACTIONS.USER_ROLES_CHANGED,
      actorUserId: admin.id,
      entityType: "User",
      entityId: created.id,
      metadata: { added: roleIds, removed: [] },
    });
  }

  // Email is BEST-EFFORT and decoupled from success: the admin always receives
  // the temp password on screen to hand over, so a missing/disabled/failing
  // mailer must never block or fail user creation. If SMTP is configured it
  // sends; otherwise (dev console fallback, or any error) we simply record that
  // delivery did not happen. The temp password is never logged here.
  const e = env();
  // Only attempt delivery when SMTP is actually configured. This deliberately
  // skips the mailer's dev console fallback so the temp password is NEVER
  // written to a log/console — the admin uses the one-time on-screen value.
  const smtpConfigured = Boolean(e.SMTP_HOST && e.SMTP_PORT);
  let mailDelivered = false;
  if (smtpConfigured) {
    try {
      await sendMail({
        to: email,
        subject: `Your ${APP_NAME_SHORT} account`,
        text: [
          `Hello ${input.name},`,
          "",
          `An account has been created for you on ${APP_NAME}.`,
          "",
          `  Sign in:   ${e.NEXT_PUBLIC_APP_URL}/login`,
          `  Username:  ${input.username}`,
          `  Temporary password: ${tempPassword}`,
          "",
          "You will be required to set a new password on first login.",
          "",
          `— ${APP_NAME}`,
        ].join("\n"),
      });
      mailDelivered = true;
    } catch {
      // Swallow — the admin hands over the on-screen temp password instead.
      mailDelivered = false;
    }
  }

  return {
    success: {
      name: input.name,
      username: input.username,
      email,
      isDoctor: input.isDoctor,
      tempPassword,
      mailDelivered,
    },
  };
}

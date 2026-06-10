"use server";

import { db } from "@/lib/db";
import { requireAdminAccess } from "@/lib/permissions/check";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { sendMail } from "@/lib/mail/mailer";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { env } from "@/lib/env";
import { createDoctorSchema } from "@/lib/validation/auth";

export interface CreateDoctorState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: { name: string; username: string; email: string };
}

function emptyToNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

export async function createDoctorAction(
  _prevState: CreateDoctorState,
  formData: FormData,
): Promise<CreateDoctorState> {
  const admin = await requireAdminAccess();

  const parsed = createDoctorSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    username: formData.get("username"),
    phone: formData.get("phone") ?? "",
    qualification: formData.get("qualification"),
    registrationNumber: formData.get("registrationNumber") ?? "",
    specialization: formData.get("specialization") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;
  const email = input.email.toLowerCase();

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
        doctorProfile: {
          create: {
            qualification: input.qualification,
            registrationNumber: emptyToNull(input.registrationNumber),
            specialization: emptyToNull(input.specialization),
          },
        },
      },
      select: { id: true },
    });
  } catch {
    // Unique race or other constraint failure.
    return { error: "Could not create the doctor. Please try again." };
  }

  await writeAuditLog({
    action: AUDIT_ACTIONS.USER_CREATED,
    actorUserId: admin.id,
    entityType: "User",
    entityId: created.id,
    metadata: { username: input.username, createdAsDoctor: true },
  });

  // Send credentials. In dev (no SMTP) this prints to the server console,
  // clearly marked development-only; in production it is emailed.
  const appUrl = env().NEXT_PUBLIC_APP_URL;
  await sendMail({
    to: email,
    subject: "Your Homeo Trust account",
    text: [
      `Hello ${input.name},`,
      "",
      "An account has been created for you on Homeo Trust.",
      "",
      `  Sign in:   ${appUrl}/login`,
      `  Username:  ${input.username}`,
      `  Temporary password: ${tempPassword}`,
      "",
      "You will be required to set a new password on first login.",
    ].join("\n"),
  });

  return {
    success: { name: input.name, username: input.username, email },
  };
}

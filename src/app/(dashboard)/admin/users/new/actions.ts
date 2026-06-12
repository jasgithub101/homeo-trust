"use server";

import { db } from "@/lib/db";
import { requireAdminAccess } from "@/lib/permissions/check";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
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

  // No email is sent: user creation always surfaces the temp password once,
  // on screen, for the admin to hand over (the one-time OneTimeSecret display).
  // The temp password is never logged or persisted in clear.
  return {
    success: {
      name: input.name,
      username: input.username,
      email,
      isDoctor: input.isDoctor,
      tempPassword,
    },
  };
}

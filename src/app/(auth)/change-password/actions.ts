"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  requireUser,
  hashPassword,
  verifyPassword,
  destroyAllUserSessions,
  createSession,
} from "@/lib/auth";
import { getRequestInfo } from "@/lib/auth/request-info";
import {
  checkLoginRateLimit,
  resetLoginRateLimit,
} from "@/lib/auth/rate-limit";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import {
  changePasswordSchema,
  forcedPasswordChangeSchema,
} from "@/lib/validation/auth";

export interface ChangePasswordState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Apply a new password: hash + store, clear mustChangePassword, audit, and
 * rotate sessions (invalidate all, then issue a fresh one so the user stays
 * signed in on this device). Never logs passwords.
 */
async function applyNewPassword(userId: string, newPassword: string) {
  const newHash = await hashPassword(newPassword);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  await writeAuditLog({
    action: AUDIT_ACTIONS.PASSWORD_CHANGED,
    actorUserId: userId,
  });

  await destroyAllUserSessions(userId);
  const { ip, userAgent } = await getRequestInfo();
  await createSession({ userId, ip, userAgent });
}

export async function changePasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser();

  // The flow is decided by the SERVER-SIDE flag, never by a client field.
  if (user.mustChangePassword) {
    // Forced first-login flow — current password is NOT required because the
    // user already authenticated with the temporary password.
    const parsed = forcedPasswordChangeSchema.safeParse({
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    });
    if (!parsed.success) {
      return { fieldErrors: parsed.error.flatten().fieldErrors };
    }

    await applyNewPassword(user.id, parsed.data.newPassword);
    redirect("/dashboard");
  }

  // Normal flow — current password required and verified. Unchanged security.
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Rate-limit the current-password verification so this action can't be used
  // as a password-guessing oracle (reuses the login limiter, keyed per user).
  const rlKey = `pwchange:${user.id}`;
  const rl = checkLoginRateLimit(rlKey);
  if (!rl.allowed) {
    return {
      error: `Too many attempts. Try again in about ${Math.ceil(
        rl.retryAfterSeconds / 60,
      )} minute(s).`,
    };
  }

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record) {
    return { error: "Account not found." };
  }

  // Server-side, constant-time (argon2) verification of the CURRENT password —
  // never trust the session alone to authorize a password change.
  const ok = await verifyPassword(record.passwordHash, parsed.data.currentPassword);
  if (!ok) {
    return { fieldErrors: { currentPassword: ["Current password is incorrect"] } };
  }

  // Correct current password → clear the limiter for this user.
  resetLoginRateLimit(rlKey);
  await applyNewPassword(user.id, parsed.data.newPassword);
  redirect("/dashboard");
}

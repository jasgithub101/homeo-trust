"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, dummyVerify, verifyPassword } from "@/lib/auth";
import { getRequestInfo } from "@/lib/auth/request-info";
import {
  checkLoginRateLimit,
  resetLoginRateLimit,
} from "@/lib/auth/rate-limit";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";
import { loginSchema } from "@/lib/validation/auth";

export interface LoginState {
  error?: string;
}

// Generic message used for ALL failure modes so we never reveal whether an
// account exists or which field was wrong.
const GENERIC_ERROR = "Invalid email/username or password.";

function isSafeNext(next: unknown): next is string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//");
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: GENERIC_ERROR };
  }
  const { identifier, password } = parsed.data;
  const nextParam = formData.get("next");

  const { ip, userAgent } = await getRequestInfo();

  // Brute-force control (best-effort, single-instance — see rate-limit.ts).
  const rl = checkLoginRateLimit(`${ip ?? "unknown"}:${identifier.toLowerCase()}`);
  if (!rl.allowed) {
    await writeAuditLog({
      action: AUDIT_ACTIONS.FAILED_LOGIN,
      metadata: { reason: "rate_limited", identifier, ip, userAgent },
    });
    return {
      error: `Too many attempts. Try again in about ${Math.ceil(
        rl.retryAfterSeconds / 60,
      )} minute(s).`,
    };
  }

  const user = await db.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
    select: { id: true, passwordHash: true, active: true, mustChangePassword: true },
  });

  // Unknown user: spend comparable time, then fail generically.
  if (!user) {
    await dummyVerify(password);
    await writeAuditLog({
      action: AUDIT_ACTIONS.FAILED_LOGIN,
      metadata: { reason: "unknown_user", identifier, ip, userAgent },
    });
    return { error: GENERIC_ERROR };
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok || !user.active) {
    await writeAuditLog({
      action: AUDIT_ACTIONS.FAILED_LOGIN,
      actorUserId: user.id,
      metadata: {
        reason: ok ? "inactive" : "bad_password",
        ip,
        userAgent,
      },
    });
    return { error: GENERIC_ERROR };
  }

  // Success.
  resetLoginRateLimit(`${ip ?? "unknown"}:${identifier.toLowerCase()}`);
  await createSession({ userId: user.id, ip, userAgent });
  await writeAuditLog({
    action: AUDIT_ACTIONS.LOGIN,
    actorUserId: user.id,
    metadata: { ip, userAgent },
  });

  // Forced password change takes priority over any requested destination.
  if (user.mustChangePassword) {
    redirect("/change-password");
  }
  redirect(isSafeNext(nextParam) ? nextParam : "/dashboard");
}

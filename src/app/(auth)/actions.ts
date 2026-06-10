"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, destroyCurrentSession } from "@/lib/auth";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/audit/log";

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  await destroyCurrentSession();
  if (user) {
    await writeAuditLog({ action: AUDIT_ACTIONS.LOGOUT, actorUserId: user.id });
  }
  redirect("/login");
}

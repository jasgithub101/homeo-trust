import "server-only";
import { headers } from "next/headers";

/**
 * Best-effort client IP + user-agent for audit/rate-limit purposes.
 * Behind a proxy, x-forwarded-for's first hop is used. Never trust these for
 * authorization — they are advisory metadata only.
 */
export async function getRequestInfo(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded
    ? (forwarded.split(",")[0]?.trim() ?? null)
    : (h.get("x-real-ip") ?? null);
  return { ip, userAgent: h.get("user-agent") };
}

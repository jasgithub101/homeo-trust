import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Database-backed opaque sessions.
 *
 * - The raw token lives only in the user's httpOnly cookie.
 * - Only an HMAC-SHA256 of the token (keyed with AUTH_SECRET) is stored in the
 *   DB, so a database leak cannot be used to forge live sessions.
 * - Idle expiry slides forward on use; absolute expiry is a hard cap.
 * - Validation rejects sessions for inactive users.
 */

export const SESSION_COOKIE_NAME = "ht_session";

// Idle window slides forward each time the session is used.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
// Absolute cap from creation, regardless of activity.
const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(token: string): string {
  return createHmac("sha256", env().AUTH_SECRET).update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

interface CreateSessionInput {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}

/** Create a session row and set the session cookie. Returns the session id. */
export async function createSession({
  userId,
  ip,
  userAgent,
}: CreateSessionInput): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = Date.now();

  const session = await db.session.create({
    data: {
      userId,
      tokenHash,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      idleExpiresAt: new Date(now + IDLE_TIMEOUT_MS),
      absoluteExpiresAt: new Date(now + ABSOLUTE_TIMEOUT_MS),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Cookie lifetime tracks the absolute cap; server-side checks remain
    // authoritative regardless of what the client sends.
    maxAge: Math.floor(ABSOLUTE_TIMEOUT_MS / 1000),
  });

  return session.id;
}

export interface ValidatedSession {
  userId: string;
  sessionId: string;
}

/**
 * Validate the current request's session cookie. Returns the userId on success,
 * or null if there is no valid, unexpired session for an active user.
 *
 * On success the idle expiry slides forward (capped at the absolute expiry).
 * Expired or inactive-user sessions are deleted as a side effect.
 */
export async function validateSession(): Promise<ValidatedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, active: true } } },
  });

  if (!session) return null;

  const now = new Date();

  // Expiry checks (idle or absolute) — drop the session if past either.
  if (session.idleExpiresAt < now || session.absoluteExpiresAt < now) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Reject sessions for deactivated users.
  if (!session.user.active) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Slide the idle window forward, never beyond the absolute cap.
  const nextIdle = new Date(
    Math.min(now.getTime() + IDLE_TIMEOUT_MS, session.absoluteExpiresAt.getTime()),
  );
  await db.session
    .update({
      where: { id: session.id },
      data: { lastUsedAt: now, idleExpiresAt: nextIdle },
    })
    .catch(() => {});

  return { userId: session.user.id, sessionId: session.id };
}

/** Verify a raw token against a stored hash in constant time (helper/testing). */
export function tokenMatchesHash(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Destroy the current session (DB row + cookie). Safe to call when none. */
export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await db.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** Invalidate every session for a user (e.g. on deactivation or password change). */
export async function destroyAllUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

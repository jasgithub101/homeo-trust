import "server-only";

/**
 * Best-effort login rate limiting.
 *
 * ⚠️ IN-MEMORY, SINGLE-INSTANCE ONLY. This is a real (not pretend) limiter for
 * local/dev and single-process deployments, but it does NOT survive restarts
 * and is NOT shared across instances.
 *
 * TODO(Phase 10): replace the in-memory store with a shared, durable backend
 * (e.g. Redis / Postgres) and consider per-IP + per-identifier compound keys,
 * exponential backoff, and account lockout policy. Failed-login auditing is for
 * forensics, not throttling — this limiter is the actual brute-force control.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10; // per key per window

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Record an attempt for `key` and report whether it is allowed. */
export function checkLoginRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - existing.count,
    retryAfterSeconds: 0,
  };
}

/** Clear a key's attempts (call after a successful login). */
export function resetLoginRateLimit(key: string): void {
  buckets.delete(key);
}

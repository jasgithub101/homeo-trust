import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Short-lived HMAC tokens binding a storage `key` to an absolute expiry.
 *
 * Used by the local-disk "signed URL" (a token on the authenticated download
 * route). The token is signed with `AUTH_SECRET`; it proves the URL was minted
 * by the server and has not expired. It is DEFENSE-IN-DEPTH only — the download
 * route always re-authorizes the session and re-checks patient scope, so a
 * leaked token by itself never grants access to a different user.
 */

/** Build the canonical signing payload for a key + expiry. */
function payload(key: string, expiresAtMs: number): string {
  return `${key}:${expiresAtMs}`;
}

export function signKey(key: string, expiresAtMs: number): string {
  return createHmac("sha256", env().AUTH_SECRET)
    .update(payload(key, expiresAtMs))
    .digest("hex");
}

/** Constant-time verification that `sig` matches and `expiresAtMs` is in the future. */
export function verifyKeySignature(
  key: string,
  expiresAtMs: number,
  sig: string,
): boolean {
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) return false;
  const expected = signKey(key, expiresAtMs);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

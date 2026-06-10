import "server-only";
import { randomInt } from "crypto";

/**
 * Generate a strong temporary password that satisfies the password policy
 * (lower + upper + digit, length >= 12). Used when an admin onboards a doctor;
 * the doctor is forced to change it on first login.
 */
const LOWER = "abcdefghijkmnpqrstuvwxyz"; // no l/o
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O
const DIGITS = "23456789"; // no 0/1
const ALL = LOWER + UPPER + DIGITS;

function pick(set: string): string {
  return set[randomInt(set.length)];
}

export function generateTempPassword(length = 16): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  const rest = Array.from({ length: Math.max(length, 12) - required.length }, () =>
    pick(ALL),
  );
  const chars = [...required, ...rest];

  // Fisher–Yates shuffle so the required chars aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

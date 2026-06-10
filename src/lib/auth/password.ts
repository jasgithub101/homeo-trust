import "server-only";
import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing with argon2id.
 *
 * argon2id is @node-rs/argon2's default algorithm, so it is not set explicitly
 * (its `Algorithm` export is an ambient const enum, incompatible with
 * `isolatedModules`). Parameters follow OWASP guidance (m=19 MiB, t=2, p=1).
 * Passwords are never logged or returned anywhere.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456, // KiB (~19 MiB)
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, password, ARGON2_OPTIONS);
  } catch {
    // Malformed hash, etc. — treat as a failed verification, never throw.
    return false;
  }
}

/**
 * A precomputed argon2id hash of a throwaway secret, used to perform a dummy
 * verification when a login identifier does not match any user. This keeps the
 * response time for "user not found" close to "wrong password", reducing user
 * enumeration via timing. Computed once, lazily, at first use.
 */
let dummyHashPromise: Promise<string> | null = null;

export function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("timing-attack-mitigation-placeholder");
  }
  return dummyHashPromise;
}

/** Burn comparable CPU time when no user exists, then always return false. */
export async function dummyVerify(password: string): Promise<false> {
  const h = await getDummyHash();
  await verifyPassword(h, password);
  return false;
}

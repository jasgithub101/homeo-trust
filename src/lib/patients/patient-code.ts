import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

/**
 * Generate a unique, human-friendly patient display code, e.g. "PT-4F9K2A7B".
 * Retries on the (rare) unique collision. The code is a display identifier and
 * is itself treated as sensitive (not shown in Explore/AI).
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

function randomCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `PT-${out}`;
}

export async function generateUniquePatientCode(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode();
    const existing = await db.patient.findUnique({
      where: { patientCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique patient code");
}

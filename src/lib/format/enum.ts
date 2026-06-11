/**
 * Server-safe enum formatting. No "use client" — importable from both Server
 * and Client Components. Turns an UPPER_SNAKE_CASE enum value into a
 * human-readable label, e.g. PRESCRIPTION_AND_FOLLOW_UP → "Prescription And
 * Follow Up".
 */
export function prettyEnum(v: string): string {
  return v
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

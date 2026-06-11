/** Coarse age bucket for de-identified display (never the exact DOB/age). */
export function ageRange(age: number | null | undefined): string {
  if (age == null) return "—";
  if (age < 0) return "—";
  const lo = Math.floor(age / 10) * 10;
  return `${lo}-${lo + 9}`;
}

/** yyyy-mm-dd for a date input default value. */
export function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

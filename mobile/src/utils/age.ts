/**
 * Client-side mirror of the backend's age gate (COPPA — see
 * backend/src/common/age.ts and gameplayRules.auth.minimumAgeYears).
 * This is a UX convenience only — it lets RegistrationScreen show the
 * "must be 13+" message before hitting the network, the same way
 * password length is pre-checked client-side. The server is always the
 * real enforcement point (AuthService.register rejects independently).
 */
export const MINIMUM_AGE_YEARS = 13;

/** True for a real calendar date (month 1-12, day valid for that month/year) — rejects e.g. Feb 30. */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function calculateAge(
  year: number,
  month: number,
  day: number,
  asOf: Date = new Date(),
): number {
  let age = asOf.getUTCFullYear() - year;
  const monthDiff = asOf.getUTCMonth() - (month - 1);
  const dayDiff = asOf.getUTCDate() - day;
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

/** "YYYY-MM-DD" for the register() API call — zero-padded, matches the server's IsDateString expectation. */
export function toIsoDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Age-in-whole-years calculation for the registration age gate (COPPA —
 * see gameplayRules.auth.minimumAgeYears). Deliberately a plain calendar
 * calculation (not "days since birth / 365.25") so it matches how a
 * person actually states their age: someone born 2013-09-21 is 13 on
 * 2026-09-21, not 12.99-something.
 */
export function calculateAge(dateOfBirth: Date, asOf: Date = new Date()): number {
  let age = asOf.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = asOf.getUTCMonth() - dateOfBirth.getUTCMonth();
  const dayDiff = asOf.getUTCDate() - dateOfBirth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

/** True when a birthdate is missing, unparsable, or in the future — never a valid age to register with. */
export function isValidPastDate(dateOfBirth: Date, asOf: Date = new Date()): boolean {
  return !Number.isNaN(dateOfBirth.getTime()) && dateOfBirth.getTime() <= asOf.getTime();
}

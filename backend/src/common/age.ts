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

/**
 * The coarse age bucket a player's exact dateOfBirth falls into —
 * derived, never separately collected (Barth, Sept 2026: registration
 * keeps asking for exact DOB for the COPPA gate above; this is what
 * feeds a friendlier STARTING difficulty at Initial Calibration —
 * see gameplayRules.learningProfile.startingDifficultyByAgeRange and
 * AuthService.register). UNDER_13 is unreachable through normal
 * registration today (the COPPA gate above rejects it outright) —
 * kept here only so this function is total over every possible DOB,
 * never so a caller should expect to see it.
 */
export type AgeRange = 'UNDER_13' | 'TEENS_13_18' | 'YOUNG_ADULT_19_24' | 'ADULT_25_PLUS';

export function getAgeRange(dateOfBirth: Date, asOf: Date = new Date()): AgeRange {
  const age = calculateAge(dateOfBirth, asOf);
  if (age < 13) return 'UNDER_13';
  if (age <= 18) return 'TEENS_13_18';
  if (age <= 24) return 'YOUNG_ADULT_19_24';
  return 'ADULT_25_PLUS';
}

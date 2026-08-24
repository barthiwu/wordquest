/**
 * Player Timezone System (V1 Remaining Systems Spec §15).
 *
 * The single place "player local date" gets computed anywhere in the
 * backend. Every caller that used to accept a client-submitted `localDate`
 * string (QuestsController, MasterChallengeController) now calls
 * `playerLocalDate(user.timezone)` instead — the server derives it from
 * the user's stored IANA timezone + its own UTC clock, exactly as the spec
 * requires ("never trust client-submitted local time").
 *
 * Deliberately built on the built-in `Intl` API rather than a timezone
 * library (date-fns-tz/luxon/moment-timezone) — Node's ICU build already
 * has the full IANA database, and `Intl.DateTimeFormat` with `timeZone`
 * is all a "what's the local calendar date/hour right now" computation
 * needs. No new dependency for a well-covered platform capability.
 */

const FALLBACK_TIMEZONE = 'UTC';

/** True if `tz` is a timezone name Node's ICU data actually recognizes. */
export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a user's stored timezone to one safe to pass to Intl — falls
 * back to UTC for null/invalid values (an account that hasn't completed
 * onboarding yet, or a corrupted value) rather than throwing. Every date
 * computation in the app should still work, just UTC-anchored, for a user
 * who hasn't set a timezone — never a 500.
 */
export function resolveTimezone(tz: string | null | undefined): string {
  return isValidTimezone(tz) ? (tz as string) : FALLBACK_TIMEZONE;
}

/**
 * The player's current local calendar date as "YYYY-MM-DD", derived from
 * server UTC `now` + their stored timezone. `en-CA` is the one common
 * locale whose default date formatting is already ISO (YYYY-MM-DD) —
 * using it avoids hand-parsing `Intl.DateTimeFormat`'s part list.
 */
export function playerLocalDate(tz: string | null | undefined, now: Date = new Date()): string {
  const zone = resolveTimezone(tz);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The player's current local hour (0-23) — for quest window checks and quiet-hours. */
export function playerLocalHour(tz: string | null | undefined, now: Date = new Date()): number {
  const zone = resolveTimezone(tz);
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    hour12: false,
  }).format(now);
  // "24" is midnight in some ICU outputs for hour12:false — normalize to 0.
  const hour = parseInt(hourStr, 10);
  return hour === 24 ? 0 : hour;
}

/** Whether `now` (in the player's local time) falls inside a quiet-hours window. Handles a window that wraps past midnight (e.g. 22 -> 7). */
export function isWithinQuietHours(
  tz: string | null | undefined,
  startHour: number | null | undefined,
  endHour: number | null | undefined,
  now: Date = new Date(),
): boolean {
  if (startHour == null || endHour == null) return false;
  const hour = playerLocalHour(tz, now);
  if (startHour === endHour) return false; // a zero-width window means "no quiet hours"
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  // Wraps past midnight, e.g. 22 -> 7.
  return hour >= startHour || hour < endHour;
}

export { FALLBACK_TIMEZONE };

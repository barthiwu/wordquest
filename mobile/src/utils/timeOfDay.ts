export type TimeOfDayPeriod = 'Morning' | 'Afternoon' | 'Evening';

/**
 * Derived from the player's own device clock, never server time — a
 * player in Lagos and a player in Los Angeles each get a greeting that
 * matches what's actually happening on their screen right now, not
 * WordQuest's server timezone.
 *
 *   00:00–11:59 → Morning
 *   12:00–15:59 → Afternoon
 *   16:00–23:59 → Evening
 */
export function timeOfDayPeriod(date: Date = new Date()): TimeOfDayPeriod {
  const hour = date.getHours();
  if (hour < 12) return 'Morning';
  if (hour < 16) return 'Afternoon';
  return 'Evening';
}

export function timeOfDayGreeting(date: Date = new Date()): string {
  return `Good ${timeOfDayPeriod(date).toLowerCase()}`;
}

/**
 * Player-local calendar date as "YYYY-MM-DD", built from local
 * year/month/day components — never toISOString(), which converts to
 * UTC and can silently roll the date over near midnight for anyone not
 * in UTC themselves. This is what quest-window gating sends the server,
 * alongside the local hour.
 */
/**
 * The player's exact local wall-clock time as "HH:MM" (24-hour,
 * zero-padded) -- e.g. "18:07", never floored/bucketed to the hour.
 * QuestScreen's "Your local time" display used to show only
 * `getHours()` (always ":00"), which read as an approximation rather
 * than the actual current time.
 */
export function formatLocalClock(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function localDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

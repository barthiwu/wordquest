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

/**
 * The player's local ISO-8601 week, e.g. "2026-W39" — built from local
 * date components (never UTC, same reasoning as localDateString), for
 * client-only "this week" comparisons that have no server-side week
 * concept of their own (e.g. Home's Clan Rank "gained N spots this
 * week" delta, which only ever compares a rank fetched now to one
 * fetched earlier in the *player's own* current week — it never needs
 * to agree with any other clock). Uses the same Thursday-anchored ISO
 * week algorithm as the backend's isoWeekId (boss-battle/battle-schedule.ts),
 * just against local rather than UTC date parts.
 */
export function localIsoWeekKey(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = d.getDay() || 7; // Monday=1 .. Sunday=7
  d.setDate(d.getDate() + 4 - dayNum); // Thursday of this ISO week fixes the ISO year unambiguously
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

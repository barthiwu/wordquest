export type BossBattleStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED';

export interface BattleWindow {
  weekId: string;
  start: Date;
  end: Date;
}

/**
 * The weekly battle window that is either currently live or next
 * upcoming, relative to `now` — never one that has already ended. Every
 * Sunday 17:00:00-18:00:00 UTC (spec §2/§21) — this is the one place
 * that literal schedule lives; nothing else should hardcode "17" or
 * "Sunday" anywhere.
 */
export function nextBattleWindow(now: Date): BattleWindow {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 0, 0, 0),
  );
  const day = start.getUTCDay(); // 0 = Sunday
  const daysUntilSunday = (7 - day) % 7;
  start.setUTCDate(start.getUTCDate() + daysUntilSunday);

  let end = new Date(start.getTime() + 60 * 60 * 1000);

  if (now.getTime() >= end.getTime()) {
    // This week's window (if `now` fell on a Sunday) has already ended — roll to next Sunday.
    start.setUTCDate(start.getUTCDate() + 7);
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  return { weekId: isoWeekId(start), start, end };
}

/** ISO 8601 week date, e.g. "2026-W33" — matches the spec's bossbattle_2026_w33_... identifier example. */
export function isoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Monday=1 .. Sunday=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this ISO week fixes the ISO year unambiguously
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Status is always computed fresh from server UTC time, never trusted
 * from a stored flag — spec §4/§21: the authoritative clock decides
 * everything, and that applies just as much to OUR server process as to
 * a player's device. A process restart at the wrong moment must never
 * leave a battle stuck showing a stale status; recomputing on every read
 * is what guarantees that a timer-driven flag cannot.
 */
export function deriveStatus(
  scheduledStartUtc: Date,
  scheduledEndUtc: Date,
  now: Date,
): BossBattleStatus {
  if (now.getTime() < scheduledStartUtc.getTime()) return 'SCHEDULED';
  if (now.getTime() < scheduledEndUtc.getTime()) return 'LIVE';
  return 'COMPLETED';
}

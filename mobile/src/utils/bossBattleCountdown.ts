/**
 * Formats the real /boss-battle/upcoming response (services/bossBattle.ts's
 * UpcomingBattle) into Home's soft countdown badge — added in the Sept
 * 2026 redesign to replace a plain "available now" red dot, which was
 * misleading given Boss Battle is only ever live one hour a week
 * (backend battle-schedule.ts: Sundays 17:00-18:00 UTC). Every value
 * here is derived from the server-authoritative scheduledStartUtc/status
 * already returned by that endpoint — nothing new is computed about
 * when battles happen, this only formats it for display.
 */
export interface BossBattleCountdown {
  /** Short badge text: "Live", "3d", "5h", or "12m". */
  compact: string;
  /** e.g. "Sun 5PM UTC" — the battle's real scheduled start. */
  subtitle: string;
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHourUtc(date: Date): string {
  const hour24 = date.getUTCHours();
  const period = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}${period}`;
}

export function formatBossBattleCountdown(
  scheduledStartUtc: string,
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED',
  now: Date = new Date(),
): BossBattleCountdown {
  const start = new Date(scheduledStartUtc);
  const subtitle = `${WEEKDAY_ABBR[start.getUTCDay()]} ${formatHourUtc(start)} UTC`;

  if (status === 'LIVE') {
    return { compact: 'Live', subtitle };
  }

  const ms = Math.max(0, start.getTime() - now.getTime());
  const minutes = Math.round(ms / 60_000);
  const hours = Math.round(ms / 3_600_000);
  const days = Math.round(ms / 86_400_000);

  if (minutes < 60) return { compact: `${Math.max(1, minutes)}m`, subtitle };
  if (hours < 24) return { compact: `${hours}h`, subtitle };
  return { compact: `${days}d`, subtitle };
}

import { ApiError, apiRequest } from './apiClient';
import type { ArcadeGameKind } from './arcadeStatus';

/** Where a player stands for one Arcade game today (backend ArcadeGameAllowance). */
export interface ArcadeGameAllowance {
  game: ArcadeGameKind;
  used: number;
  /** null on WordQuest+ (no limit). */
  limit: number | null;
  remaining: number | null;
  locked: boolean;
}

export interface ArcadeAllowance {
  unlimited: boolean;
  limit: number | null;
  /** ISO time the counters reset: the start of the player's next local day. */
  resetsAt: string;
  games: ArcadeGameAllowance[];
}

/** Sent back by every game start: the standing after this play, and the
 * percent threshold it crossed (50 / 70 / 90 / 100), if any. */
export interface ArcadePlayNotice {
  game: ArcadeGameKind;
  used: number;
  limit: number | null;
  remaining: number | null;
  percent: 50 | 70 | 90 | 100 | null;
}

/** Today's plays used / left for every Arcade game. */
export function getArcadeAllowance(accessToken: string): Promise<ArcadeAllowance> {
  return apiRequest<ArcadeAllowance>('/arcade/plays', { accessToken });
}

/** True when the server refused a start because the daily cap is used up. */
export function isPlayLimitError(err: unknown): err is ApiError {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  const body = err.body as { error?: unknown } | undefined;
  return body?.error === 'ARCADE_PLAY_LIMIT';
}

/** The allowance after a play was taken (keeps the tiles right without a refetch). */
export function applyNoticeToAllowance(
  allowance: ArcadeAllowance | null,
  notice: ArcadePlayNotice,
): ArcadeAllowance | null {
  if (!allowance) return allowance;
  return {
    ...allowance,
    games: allowance.games.map((g) =>
      g.game === notice.game
        ? {
            ...g,
            used: notice.used,
            remaining: notice.remaining,
            locked: notice.limit !== null && notice.used >= notice.limit,
          }
        : g,
    ),
  };
}

export type PlaysBadge = { kind: 'left'; left: number } | { kind: 'locked' };

/** What a game tile shows: nothing on WordQuest+ (or before the data loads). */
export function playsBadge(
  allowance: ArcadeAllowance | null,
  game: ArcadeGameKind,
): PlaysBadge | null {
  if (!allowance || allowance.unlimited) return null;
  const row = allowance.games.find((g) => g.game === game);
  if (!row || row.limit === null) return null;
  if (row.locked) return { kind: 'locked' };
  return { kind: 'left', left: row.remaining ?? 0 };
}

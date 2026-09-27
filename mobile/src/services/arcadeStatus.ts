import { apiRequest } from './apiClient';

export type ArcadeGameKind = 'SCRAMBLE_QUEST' | 'WORD_DUEL' | 'COMPLETE_IT';

export interface LastPlayedArcadeGame {
  game: ArcadeGameKind;
  playedAt: string;
}

/**
 * The most recently completed Arcade session across all three games
 * (ScrambleQuest/Complete It/Word Duel) — backs Home's "Play <Game>
 * again" card (Barth, Sept 2026). null when the player has never
 * finished one.
 */
export function getLastPlayedArcadeGame(accessToken: string): Promise<LastPlayedArcadeGame | null> {
  return apiRequest<LastPlayedArcadeGame | null>('/arcade/last-played', { accessToken });
}

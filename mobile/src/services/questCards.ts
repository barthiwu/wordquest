import { apiRequest } from './apiClient';

export type QuestCardRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface QuestCard {
  id: string;
  source: string;
  sourceEventId: string;
  title: string;
  category: string | null;
  playerDisplayNameSnapshot: string;
  artwork: string | null;
  rarity: QuestCardRarity;
  journeyStageKey: string | null;
  earnedAt: string;
  isShowcased: boolean;
  showcaseOrder: number | null;
}

/** The bounded "highlight reel" a player picks to feature on their profile (max MAX_SHOWCASE_CARDS, kept in sync with the backend's own constant). */
export const MAX_SHOWCASE_CARDS = 5;

/** Quest Cards — "permanent identity" collectibles earned from Journey/Achievement/Boss Battle milestones. */
export function getMyQuestCards(accessToken: string): Promise<QuestCard[]> {
  return apiRequest<QuestCard[]>('/quest-cards/me', { accessToken });
}

export function getQuestCard(accessToken: string, id: string): Promise<QuestCard> {
  return apiRequest<QuestCard>(`/quest-cards/me/${id}`, { accessToken });
}

/** Just the player's current profile showcase, in display order (V22 §7/§9: this and setMyShowcase existed on the backend but were never called from the app). */
export function getMyShowcase(accessToken: string): Promise<QuestCard[]> {
  return apiRequest<QuestCard[]>('/quest-cards/me/showcase', { accessToken });
}

/** Replaces the whole showcase set (not additive) — an empty array clears it. Order of cardIds becomes the display order. */
export function setMyShowcase(accessToken: string, cardIds: string[]): Promise<QuestCard[]> {
  return apiRequest<QuestCard[]>('/quest-cards/me/showcase', {
    method: 'PATCH',
    accessToken,
    body: { cardIds },
  });
}

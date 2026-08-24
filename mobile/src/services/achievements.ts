import { apiRequest } from './apiClient';

export type AchievementCategory =
  'DISCOVERY' | 'MASTERY' | 'CONSISTENCY' | 'INDEPENDENT_LEARNING' | 'COMPETITION';

export interface AchievementCatalogEntry {
  /** Immutable — this is the same id AchievementUnlock.achievementId stores. */
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  /** False for an achievement whose unlock condition depends on a feature not live yet — it's still a real, permanent catalog entry, just currently unreachable. */
  checkable: boolean;
}

export interface AchievementUnlock {
  achievementId: string;
  unlockedAt: string;
}

/** The full v1.0 achievement list — public info, same for every player. */
export function getAchievementCatalog(accessToken: string): Promise<AchievementCatalogEntry[]> {
  return apiRequest<AchievementCatalogEntry[]>('/achievements/catalog', { accessToken });
}

/** The player's own unlocks, most recent first. */
export function getMyAchievements(accessToken: string): Promise<AchievementUnlock[]> {
  return apiRequest<AchievementUnlock[]>('/achievements/me', { accessToken });
}

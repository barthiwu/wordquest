import { apiRequest } from './apiClient';
import type { QuestCardRarity } from './questCards';

export interface PassportAchievement {
  id: string;
  name: string;
  category: string | null;
  unlockedAt: string;
}

export interface PassportShowcasedCard {
  id: string;
  title: string;
  category: string | null;
  rarity: QuestCardRarity;
  artwork: string | null;
  journeyStageKey: string | null;
}

export interface PassportBossBattleResult {
  weekId: string;
  placement: number;
  isWinner: boolean;
  battleXp: number;
}

export interface PassportOrder {
  key: string;
  name: string;
  symbol: string;
  colour: string;
  banner: string;
}

export interface PassportView {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  countryCode: string | null;
  clan: { name: string; bannerAsset: string } | null;
  level: number;
  totalXp: number;
  journeyStageName: string;
  wordsMastered: number;
  currentStreak: number;
  longestStreak: number;
  cefrUnlocked: boolean;
  estimatedCefrLevel: string | null;
  estimatedCefrConfidence: number | null;
  order: PassportOrder | null;
  achievements: PassportAchievement[];
  bossBattleHistory: PassportBossBattleResult[];
  memberSince: string;
  showcasedCards: PassportShowcasedCard[];
}

export function getMyPassport(accessToken: string): Promise<PassportView> {
  return apiRequest<PassportView>('/passport/me', { accessToken });
}

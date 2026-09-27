import { apiRequest } from './apiClient';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  clanName: string | null;
  countryCode: string | null;
  level: number;
  totalXp: number;
}

export interface LeaderboardView {
  entries: LeaderboardEntry[];
  viewer: LeaderboardEntry;
}

export function getGlobalLeaderboard(accessToken: string): Promise<LeaderboardView> {
  return apiRequest<LeaderboardView>('/leaderboards/global', { accessToken });
}

export function getClanLeaderboard(accessToken: string): Promise<LeaderboardView> {
  return apiRequest<LeaderboardView>('/leaderboards/clan', { accessToken });
}

export function getCountryLeaderboard(accessToken: string): Promise<LeaderboardView> {
  return apiRequest<LeaderboardView>('/leaderboards/country', { accessToken });
}

export function getContinentLeaderboard(accessToken: string): Promise<LeaderboardView> {
  return apiRequest<LeaderboardView>('/leaderboards/continent', { accessToken });
}

/** Ranks the viewer together with their accepted friends only. */
export function getFriendLeaderboard(accessToken: string): Promise<LeaderboardView> {
  return apiRequest<LeaderboardView>('/leaderboards/friends', { accessToken });
}

/** Ranks players by lifetime Boss Battle XP — entry.level is always 0 here and entry.totalXp holds the lifetime Boss Battle XP sum, not general XP. */
export function getBossBattleXpLeaderboard(accessToken: string): Promise<LeaderboardView> {
  return apiRequest<LeaderboardView>('/leaderboards/boss-battle', { accessToken });
}

import { apiRequest } from './apiClient';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
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

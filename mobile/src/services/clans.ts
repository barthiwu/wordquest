import { apiRequest } from './apiClient';

export interface Clan {
  id: string;
  name: string;
  description: string;
  lore: string;
  bannerAsset: string;
}

export function getClans(): Promise<Clan[]> {
  return apiRequest<Clan[]>('/clans');
}

import { apiRequest } from './apiClient';

export interface SkillDimension {
  key: string;
  label: string;
  score: number;
  measured: boolean;
}

export interface SkillsView {
  dimensions: SkillDimension[];
}

export function getMySkills(accessToken: string): Promise<SkillsView> {
  return apiRequest<SkillsView>('/skills/me', { accessToken });
}

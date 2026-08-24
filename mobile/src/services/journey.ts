import { apiRequest } from './apiClient';

export interface JourneyStageView {
  stage: number;
  key: string;
  name: string;
  /** §2.1's "Primary Title" — the player-facing identity title for this stage, e.g. "The Seeker". */
  primaryTitle: string;
  minLevel: number;
  requiredMasteredWords: number;
  /** §2.1/§2.5's "Identity Theme" name (e.g. "Warm Earth") — see constants/journeyVisuals.ts for the hex rendering. */
  colorIdentity: string;
  /** §2.1's "Major Unlock" column — the stage-specific feature this Journey grants. */
  majorUnlock: string;
  unlocked: boolean;
  current: boolean;
}

export interface JourneyView {
  currentStage: JourneyStageView;
  nextStage: JourneyStageView | null;
  stages: JourneyStageView[];
}

export function getMyJourney(accessToken: string): Promise<JourneyView> {
  return apiRequest<JourneyView>('/journey/me', { accessToken });
}

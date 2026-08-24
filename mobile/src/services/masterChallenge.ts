import { apiRequest } from './apiClient';

export interface MasterChallengeStatus {
  status: 'LOCKED' | 'AVAILABLE' | 'COMPLETED';
  eligible: boolean;
  wordsCompletedToday: number;
  wordsRequired: number;
}

export interface MasterChallengeScores {
  wordUsage: number;
  coherence: number;
  grammar: number;
  vocabulary: number;
  context: number;
}

export interface MasterChallengeResult {
  scores: MasterChallengeScores;
  xpAwarded: number;
  allWordsUsedCorrectly: boolean;
  whatWentWell: string;
  whatNeedsImprovement: string;
  nextAction: string;
}

/**
 * Whether today's three daily words are all complete, unlocking the
 * Master Challenge. Player local date is now derived server-side from
 * the player's stored timezone (Player Timezone System, V1 Remaining
 * Systems Spec §15) rather than a client-submitted query param — see
 * `startQuest`'s doc comment in the quests service for why that changed.
 */
export function getMasterChallengeStatus(accessToken: string): Promise<MasterChallengeStatus> {
  return apiRequest<MasterChallengeStatus>('/master-challenge/status', { accessToken });
}

/** Submits one paragraph using all three of today's words — the capstone, separate from and not duplicating the per-word learning reward. */
export function submitMasterChallenge(
  accessToken: string,
  paragraph: string,
): Promise<MasterChallengeResult> {
  return apiRequest<MasterChallengeResult>('/master-challenge/submit', {
    method: 'POST',
    body: { paragraph },
    accessToken,
  });
}

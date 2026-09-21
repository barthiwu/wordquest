import { apiRequest } from './apiClient';
import type { MasteryLevel } from './users';

export interface PracticeWordOverview {
  wordId: string;
  word: string;
  definition: string;
  partOfSpeech: string;
  pronunciation: string | null;
  phoneticRepresentation: string | null;
  synonyms: string[];
  exampleSentence: string;
  currentLevel: MasteryLevel;
  guessScore: number;
  sentenceScore: number;
  paragraphScore: number;
}

export interface PracticeGuessChallenge {
  displayPattern: string;
  missingIndexes: number[];
}

export interface PracticeGuessResult {
  isCorrect: boolean;
  correctAnswer: string;
  masteryLevel: MasteryLevel;
  justMastered: boolean;
}

export interface PracticeWritingResult {
  scores: Record<string, number>;
  score: number;
  masteryLevel: MasteryLevel;
  justMastered: boolean;
  whatWentWell: string;
  whatNeedsImprovement: string;
  nextAction: string;
}

/** Profile > My Words > practice a specific word — no XP or rewards, just mastery practice (see backend PracticeService's doc comment). */
export function getPracticeOverview(
  accessToken: string,
  wordId: string,
): Promise<PracticeWordOverview> {
  return apiRequest<PracticeWordOverview>(`/practice/words/${wordId}`, { accessToken });
}

export function getPracticeGuessChallenge(
  accessToken: string,
  wordId: string,
): Promise<PracticeGuessChallenge> {
  return apiRequest<PracticeGuessChallenge>(`/practice/words/${wordId}/guess`, { accessToken });
}

export function submitPracticeGuess(
  accessToken: string,
  wordId: string,
  answer: string,
): Promise<PracticeGuessResult> {
  return apiRequest<PracticeGuessResult>(`/practice/words/${wordId}/guess`, {
    method: 'POST',
    body: { answer },
    accessToken,
  });
}

export function submitPracticeSentence(
  accessToken: string,
  wordId: string,
  sentence: string,
): Promise<PracticeWritingResult> {
  return apiRequest<PracticeWritingResult>(`/practice/words/${wordId}/sentence`, {
    method: 'POST',
    body: { sentence },
    accessToken,
  });
}

export function submitPracticeParagraph(
  accessToken: string,
  wordId: string,
  paragraph: string,
): Promise<PracticeWritingResult> {
  return apiRequest<PracticeWritingResult>(`/practice/words/${wordId}/paragraph`, {
    method: 'POST',
    body: { paragraph },
    accessToken,
  });
}

import { apiRequest } from './apiClient';

export type MasteryLevel = 'NEW' | 'RECOGNIZING' | 'RECALLING' | 'STRONG' | 'MASTERED';

export type WordStage =
  | 'GUESSING'
  | 'UNDERSTANDING'
  | 'SENTENCE'
  | 'PARAGRAPH'
  | 'OPTIONAL_WILD'
  | 'WORD_COMPLETE';

export interface ChallengeView {
  questAttemptId: string;
  /** The attempt's actual current stage — resuming an in-progress attempt lands here, not always at Guess. */
  wordStage: WordStage;
  wordIndex: number;
  wordCount: number;
  /** e.g. "C O M P _ S S I O N" — the blanked word to reconstruct. */
  displayPattern: string;
  /** Zero-based indexes into the word that are blanked. */
  missingIndexes: number[];
  wordLength: number;
  /** The clue shown alongside the blanked word. */
  definition: string;
  partOfSpeech: string;
}

export interface QuestCatalogEntry {
  key: string;
  title: string;
  description: string;
  /** Player-local hour (0-23) this quest unlocks at. null = always available. */
  windowStartHour: number | null;
  /** Player-local hour (0-23) — display only, e.g. "12:00-15:59". Never enforced as a cutoff. */
  windowEndHour: number | null;
}

export interface UnderstandingContent {
  word: string;
  definition: string;
  partOfSpeech: string;
  pronunciation: string | null;
  phoneticRepresentation: string | null;
  synonyms: string[];
  exampleSentence: string;
}

export interface AnswerResult {
  isCorrect: boolean;
  /** True when the 2-minute Guess timer had already expired — isCorrect is meaningless in this case. */
  timedOut: boolean;
  correctAnswer: string;
  xpAwarded: number;
  masteryLevel: MasteryLevel;
  /** Non-null only when isCorrect — the Understanding content the player now transitions to. */
  understanding: UnderstandingContent | null;
  /** A short, zero-cost ALI reaction to this specific answer (V21 §6) — null only when timedOut. */
  aliQuickReaction: string | null;
}

export interface HintResult {
  hint: string | null;
  hintsUsed: number;
  hintsRemaining: number;
}

export interface SynonymResult {
  synonym: string | null;
  synonymsUsed: number;
  synonymsRemaining: number;
}

export interface LetterRevealResult {
  displayPattern: string;
  missingIndexes: number[];
  lettersRevealed: number;
}

export interface SentenceScores {
  grammar: number;
  vocabulary: number;
  context: number;
  naturalness: number;
  clarity: number;
}

export interface SentenceResult {
  scores: SentenceScores;
  xpAwarded: number;
  whatWentWell: string;
  whatNeedsImprovement: string;
  betterVersion: string | null;
  nextAction: string;
}

export interface ParagraphScores {
  grammar: number;
  vocabulary: number;
  structure: number;
  flow: number;
  context: number;
}

export interface ParagraphResult {
  scores: ParagraphScores;
  xpAwarded: number;
  estimatedProficiency: string;
  whatWentWell: string;
  whatNeedsImprovement: string;
  suggestedRevision: string | null;
  nextAction: string;
}

export interface WordCompletionResult {
  xpAwarded: number;
  glyphAwarded: number;
  correctCount: number;
  totalCount: number;
  /** True when this word completion was the 3rd Daily Quest word, triggering the Adaptive AI Learning Engine's Initial Calibration. */
  calibrationJustCompleted: boolean;
  /** ALI's send-off for this word, shown on QuestCompleteScreen before the player heads home. null when ALI wasn't configured or the call failed. */
  aliMessage: { text: string; recommendation: string | null } | null;
}

export interface OptionalWildMission {
  id: string;
  wordId: string;
  word: string;
  definition: string;
  status: 'OPEN' | 'SUBMITTED';
  createdAt: string;
}

export function listQuests(accessToken: string): Promise<QuestCatalogEntry[]> {
  return apiRequest<QuestCatalogEntry[]>('/quests', { accessToken });
}

/**
 * Starts (or resumes) the named quest. Player local date/hour used to be
 * a client-submitted body (a real spoofing vector — nothing stopped a
 * client from lying about its own clock to unlock a quest window early
 * or replay "today" indefinitely). The Player Timezone System (V1
 * Remaining Systems Spec §15) removed that entirely: the server derives
 * both from the player's stored IANA timezone + its own UTC clock, so
 * this call takes no body at all now. The one client responsibility left
 * is making sure that stored timezone is actually current — see
 * `updateMe({ timezone })` in the users service, called once during
 * onboarding and again whenever the device's timezone changes.
 */
export function startQuest(accessToken: string, questKey: string): Promise<ChallengeView> {
  return apiRequest<ChallengeView>(`/quests/${questKey}/start`, {
    method: 'POST',
    accessToken,
  });
}

/** Guess stage: submits a reconstructed word. A correct answer moves the word to Understanding — it does NOT complete the quest by itself. */
export function submitAnswer(
  accessToken: string,
  questAttemptId: string,
  answer: string,
): Promise<AnswerResult> {
  return apiRequest<AnswerResult>(`/quests/attempts/${questAttemptId}/answer`, {
    method: 'POST',
    body: { answer },
    accessToken,
  });
}

/** Reveals one of the word's related words as a hint. Free if the word has no related words on file — nothing is charged for content that isn't there. */
export function requestHint(accessToken: string, questAttemptId: string): Promise<HintResult> {
  return apiRequest<HintResult>(`/quests/attempts/${questAttemptId}/hint`, {
    method: 'POST',
    accessToken,
  });
}

/** Reveals one of the word's synonyms, cycling through if requested more than once. */
export function requestSynonym(
  accessToken: string,
  questAttemptId: string,
): Promise<SynonymResult> {
  return apiRequest<SynonymResult>(`/quests/attempts/${questAttemptId}/synonym`, {
    method: 'POST',
    accessToken,
  });
}

/** Reveals exactly one more blanked letter, lowest remaining index first. */
export function requestLetterReveal(
  accessToken: string,
  questAttemptId: string,
): Promise<LetterRevealResult> {
  return apiRequest<LetterRevealResult>(`/quests/attempts/${questAttemptId}/reveal-letter`, {
    method: 'POST',
    accessToken,
  });
}

/** Understanding is a read/acknowledge stage, not a scored one — advances Understanding -> Sentence. */
export function acknowledgeUnderstanding(
  accessToken: string,
  questAttemptId: string,
): Promise<{ wordStage: string }> {
  return apiRequest<{ wordStage: string }>(
    `/quests/attempts/${questAttemptId}/acknowledge-understanding`,
    {
      method: 'POST',
      accessToken,
    },
  );
}

/** Sentence stage: one AI-scored sentence using the word. Advances Sentence -> Paragraph. */
export function submitSentence(
  accessToken: string,
  questAttemptId: string,
  sentence: string,
): Promise<SentenceResult> {
  return apiRequest<SentenceResult>(`/quests/attempts/${questAttemptId}/sentence`, {
    method: 'POST',
    body: { sentence },
    accessToken,
  });
}

/**
 * Paragraph stage: 30-100 words, 5 AI-scored dimensions. Advances
 * Paragraph -> Optional Wild directly — Speaking/Pronunciation was
 * removed from V1 entirely (Correction & Completion Spec §1).
 */
export function submitParagraph(
  accessToken: string,
  questAttemptId: string,
  paragraph: string,
): Promise<ParagraphResult> {
  return apiRequest<ParagraphResult>(`/quests/attempts/${questAttemptId}/paragraph`, {
    method: 'POST',
    body: { paragraph },
    accessToken,
  });
}

/** Ties Word in the Wild's mission creation to this quest's specific word. Optional — the player can skip straight to completeWord. */
export function createOptionalWildMission(
  accessToken: string,
  questAttemptId: string,
): Promise<OptionalWildMission> {
  return apiRequest<OptionalWildMission>(
    `/quests/attempts/${questAttemptId}/optional-wild-mission`,
    {
      method: 'POST',
      accessToken,
    },
  );
}

/**
 * Completes the word: Optional Wild -> Word Complete, whether or not
 * the player submitted Word in the Wild evidence for it. This is where
 * the quest attempt actually finishes and its rewards are granted.
 */
export function completeWord(
  accessToken: string,
  questAttemptId: string,
): Promise<WordCompletionResult> {
  return apiRequest<WordCompletionResult>(`/quests/attempts/${questAttemptId}/complete-word`, {
    method: 'POST',
    accessToken,
  });
}

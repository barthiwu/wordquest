import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MasteryService, type MasteryLevel } from '../mastery/mastery.service';
import { SentenceEvaluationService } from '../sentence/sentence-evaluation.service';
import { ParagraphEvaluationService } from '../paragraph/paragraph-evaluation.service';
import { generateOmissionChallenge } from '../vocabulary/omission-engine';

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
  /** This submission's own composite score — feedback on exactly what was just written. */
  score: number;
  /** What actually got stored (may be higher than `score` — see MasteryService.recordSkillAreaPractice doc comment). */
  bestScore: number;
  masteryLevel: MasteryLevel;
  justMastered: boolean;
  whatWentWell: string;
  whatNeedsImprovement: string;
  nextAction: string;
}

/**
 * "My Words" practice mode (Correction & Completion Spec follow-up):
 * re-attempt Guess/Sentence/Paragraph for a word the player has already
 * met, entirely outside the Daily Quest / QuestAttempt machinery. No XP,
 * no Glyphs, no streak, no quest-completion bookkeeping -- deliberately
 * so, per the request this was built from ("just a way to improve
 * mastery"). What DOES happen for real: Mastery's guess/sentence/
 * paragraph scores update exactly as they would from a live quest
 * (MasteryService.recordAnswer / recordSkillAreaPractice), which means
 * a word can still cross MASTERED here, still moves masteredWordsCount
 * (so it shows up on Passport), and still re-checks the CEFR-unlock
 * gate (masteredWordsCount >= 100 etc, ProgressionService.
 * checkCefrEligibility) the same way onWordMastered always has. What
 * does NOT move from here: the rolling estimatedCefrLevel recompute
 * (ProgressionService.updateUnifiedCefrEstimate) only reads evidence
 * off QuestAttempt rows today -- practice text isn't folded into that
 * estimate. That's a real gap, not an oversight, and worth revisiting
 * if practice mode becomes the primary way players revisit words.
 */
@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mastery: MasteryService,
    private readonly sentenceEvaluation: SentenceEvaluationService,
    private readonly paragraphEvaluation: ParagraphEvaluationService,
  ) {}

  async getOverview(userId: string, wordId: string): Promise<PracticeWordOverview> {
    const word = await this.prisma.word.findUnique({ where: { id: wordId } });
    if (!word || !word.isActive) throw new NotFoundException('Word not found');

    // A practice-only word (never presented via a real quest) has no
    // Mastery row yet -- getDetail already returns the all-zero NEW
    // shape for that case, so this reads the same either way.
    const detail = await this.mastery.getDetail(userId, wordId);

    return {
      wordId: word.id,
      word: word.word,
      definition: word.definition,
      partOfSpeech: word.partOfSpeech,
      pronunciation: word.pronunciation,
      phoneticRepresentation: word.phoneticRepresentation,
      synonyms: word.synonyms,
      exampleSentence: word.exampleSentence,
      currentLevel: detail.currentLevel,
      guessScore: detail.guessScore,
      sentenceScore: detail.sentenceScore,
      paragraphScore: detail.paragraphScore,
    };
  }

  async getGuessChallenge(userId: string, wordId: string): Promise<PracticeGuessChallenge> {
    const word = await this.prisma.word.findUnique({ where: { id: wordId } });
    if (!word || !word.isActive) throw new NotFoundException('Word not found');

    const masteryLevel = await this.mastery.getLevel(userId, wordId);
    const challenge = generateOmissionChallenge({
      word: word.word,
      baseDifficulty: word.baseDifficulty,
      masteryLevel,
    });

    return { displayPattern: challenge.displayPattern, missingIndexes: challenge.missingIndexes };
  }

  async submitGuess(userId: string, wordId: string, rawAnswer: string): Promise<PracticeGuessResult> {
    const word = await this.prisma.word.findUnique({ where: { id: wordId } });
    if (!word || !word.isActive) throw new NotFoundException('Word not found');

    const isCorrect = this.normalize(rawAnswer) === word.normalizedWord;

    // Practice still runs the same recordAnswer path a live Guess does
    // (streak/level ladder, guessScore EMA, MASTERED re-check) -- the
    // only thing skipped is XP, which recordAnswer never awarded on its
    // own anyway (QuestsService does that separately around it).
    const { level, justMastered } = await this.mastery.recordAnswer(userId, wordId, isCorrect);

    return { isCorrect, correctAnswer: word.word, masteryLevel: level, justMastered };
  }

  async submitSentence(
    userId: string,
    wordId: string,
    sentence: string,
  ): Promise<PracticeWritingResult> {
    const [word, player] = await Promise.all([
      this.prisma.word.findUnique({ where: { id: wordId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { nativeLanguage: true } }),
    ]);
    if (!word || !word.isActive) throw new NotFoundException('Word not found');

    const evaluation = await this.sentenceEvaluation.evaluate(
      word.word,
      word.definition,
      word.partOfSpeech,
      sentence,
      player?.nativeLanguage,
    );

    const { attemptScore, bestScore, level, justMastered } = await this.mastery.recordSkillAreaPractice(
      userId,
      wordId,
      'sentence',
      evaluation.scores as unknown as Record<string, number>,
    );

    return {
      scores: evaluation.scores as unknown as Record<string, number>,
      score: attemptScore,
      bestScore,
      masteryLevel: level,
      justMastered,
      whatWentWell: evaluation.whatWentWell,
      whatNeedsImprovement: evaluation.whatNeedsImprovement,
      nextAction: evaluation.nextAction,
    };
  }

  async submitParagraph(
    userId: string,
    wordId: string,
    paragraph: string,
  ): Promise<PracticeWritingResult> {
    const wordCount = this.countWords(paragraph);
    if (wordCount < 30 || wordCount > 100) {
      throw new BadRequestException(`Paragraph must be 30-100 words (got ${wordCount}).`);
    }

    const [word, player] = await Promise.all([
      this.prisma.word.findUnique({ where: { id: wordId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { nativeLanguage: true } }),
    ]);
    if (!word || !word.isActive) throw new NotFoundException('Word not found');

    const evaluation = await this.paragraphEvaluation.evaluate(
      word.word,
      word.definition,
      word.partOfSpeech,
      paragraph,
      player?.nativeLanguage,
    );

    const { attemptScore, bestScore, level, justMastered } = await this.mastery.recordSkillAreaPractice(
      userId,
      wordId,
      'paragraph',
      evaluation.scores as unknown as Record<string, number>,
    );

    return {
      scores: evaluation.scores as unknown as Record<string, number>,
      score: attemptScore,
      bestScore,
      masteryLevel: level,
      justMastered,
      whatWentWell: evaluation.whatWentWell,
      whatNeedsImprovement: evaluation.whatNeedsImprovement,
      nextAction: evaluation.nextAction,
    };
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private countWords(text: string): number {
    const trimmed = text.trim();
    if (trimmed.length === 0) return 0;
    return trimmed.split(/\s+/).length;
  }
}

import { Test } from '@nestjs/testing';
import { MasteryService } from './mastery.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { AchievementService } from '../achievement/achievement.service';
import { AliService } from '../ali/ali.service';
import { gameplayRules } from '../config/gameplay-rules';

describe('MasteryService', () => {
  let service: MasteryService;

  const prismaMock = {
    mastery: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    userProgression: {
      update: jest.fn().mockResolvedValue({ level: 1, journeyStage: 0, masteredWordsCount: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ masteredWordsCount: 1 }),
    },
    word: { findUnique: jest.fn().mockResolvedValue({ word: 'resilient' }) },
  };

  const progressionMock = {
    checkJourneyAdvancement: jest.fn().mockResolvedValue(undefined),
    checkCefrEligibility: jest.fn().mockResolvedValue(undefined),
  };

  const achievementsMock = {
    checkDiscoveryAndMastery: jest.fn().mockResolvedValue(undefined),
  };

  const aliMock = { reactFireAndForget: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.userProgression.update.mockResolvedValue({
      level: 1,
      journeyStage: 0,
      masteredWordsCount: 1,
    });
    prismaMock.userProgression.findUniqueOrThrow.mockResolvedValue({ masteredWordsCount: 1 });
    prismaMock.word.findUnique.mockResolvedValue({ word: 'resilient' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        MasteryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ProgressionService, useValue: progressionMock },
        { provide: AchievementService, useValue: achievementsMock },
        { provide: AliService, useValue: aliMock },
      ],
    }).compile();
    service = moduleRef.get(MasteryService);
  });

  describe('recordAnswer — the NEW..STRONG guess-streak ladder', () => {
    it('moves a NEW word to RECOGNIZING on its first correct answer', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce(null);
      const result = await service.recordAnswer('u1', 'w1', true);
      expect(result.level).toBe('RECOGNIZING');
      expect(result.justMastered).toBe(false);
    });

    it('climbs the ladder up to STRONG as consecutive correct answers accumulate, but never reaches MASTERED from streak alone', async () => {
      expect(gameplayRules.mastery.streakForRecalling).toBe(2);
      expect(gameplayRules.mastery.streakForStrong).toBe(4);
      expect(gameplayRules.mastery.streakForMastered).toBe(6);

      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'RECOGNIZING',
        masteryScore: 15,
        currentCorrectStreak: 1,
      });
      expect((await service.recordAnswer('u1', 'w1', true)).level).toBe('RECALLING');

      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'RECALLING',
        masteryScore: 30,
        currentCorrectStreak: 3,
      });
      expect((await service.recordAnswer('u1', 'w1', true)).level).toBe('STRONG');

      // A 6th consecutive correct answer (>= streakForMastered) — per the
      // Correction & Completion Spec's three-area gate, this is STILL
      // just STRONG. Guess alone, with no Sentence/Paragraph evidence,
      // can never complete mastery on its own.
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        masteryScore: 60,
        currentCorrectStreak: 5,
      });
      const result = await service.recordAnswer('u1', 'w1', true);
      expect(result.level).toBe('STRONG');
      expect(result.justMastered).toBe(false);
      expect(progressionMock.checkJourneyAdvancement).not.toHaveBeenCalled();
    });

    it('demotes exactly one rung on a miss — never straight back to NEW — and resets the streak', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        masteryScore: 60,
        currentCorrectStreak: 5,
      });
      const result = await service.recordAnswer('u1', 'w1', false);
      expect(result.level).toBe('RECALLING');
      expect(prismaMock.mastery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ currentLevel: 'RECALLING', currentCorrectStreak: 0 }),
        }),
      );
    });

    it('a miss on a NEW word stays NEW (the ladder floor)', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'NEW',
        masteryScore: 0,
        currentCorrectStreak: 0,
      });
      const result = await service.recordAnswer('u1', 'w1', false);
      expect(result.level).toBe('NEW');
    });

    it('clamps masteryScore within [0, 100]', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        masteryScore: 95,
        currentCorrectStreak: 5,
      });
      await service.recordAnswer('u1', 'w1', true);
      const call = prismaMock.mastery.upsert.mock.calls.at(-1)![0];
      expect(call.update.masteryScore).toBeLessThanOrEqual(100);
    });
  });

  describe('recordAnswer — the single MASTERED gate', () => {
    it('completes mastery on the FIRST-EVER correct guess when the other two areas were already at threshold', async () => {
      // Guess is a one-time pass now, not a guessScore threshold — the
      // word has never been guessed correctly before (timesCorrect: 0),
      // and this very answer (isCorrect: true) is what satisfies it.
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        masteryScore: 60,
        currentCorrectStreak: 5,
        timesCorrect: 0,
        sentenceScore: 80,
        paragraphScore: 82,
      });
      prismaMock.userProgression.update.mockResolvedValueOnce({
        level: 6,
        journeyStage: 0,
        masteredWordsCount: 50,
      });

      const result = await service.recordAnswer('u1', 'w1', true);

      expect(result.level).toBe('MASTERED');
      expect(result.justMastered).toBe(true);
      expect(progressionMock.checkJourneyAdvancement).toHaveBeenCalledWith(
        'u1',
        6,
        0,
        50,
        prismaMock,
      );
    });

    it('does NOT complete mastery on a correct guess when the other two areas are not both at threshold, even after the guess dimension is satisfied', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        masteryScore: 60,
        currentCorrectStreak: 5,
        timesCorrect: 3, // guess dimension already satisfied from past correct guesses
        sentenceScore: 100,
        paragraphScore: 40, // still below threshold
      });

      const result = await service.recordAnswer('u1', 'w1', true);

      expect(result.level).toBe('STRONG');
      expect(result.justMastered).toBe(false);
    });

    it('does not re-increment masteredWordsCount for a word that is already MASTERED (all three areas still at threshold)', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'MASTERED',
        masteryScore: 100,
        currentCorrectStreak: 8,
        timesCorrect: 12,
        guessScore: 90,
        sentenceScore: 90,
        paragraphScore: 90,
      });
      const result = await service.recordAnswer('u1', 'w1', true);
      expect(result.justMastered).toBe(false);
      expect(result.level).toBe('MASTERED');
      expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
      expect(progressionMock.checkJourneyAdvancement).not.toHaveBeenCalled();
    });

    it('MASTERED is permanent — a guess miss on an already-mastered word never demotes it or touches masteredWordsCount', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'MASTERED',
        masteryScore: 100,
        currentCorrectStreak: 6,
        timesCorrect: 12,
        guessScore: 90,
        sentenceScore: 90,
        paragraphScore: 90,
      });
      const result = await service.recordAnswer('u1', 'w1', false);
      expect(result.level).toBe('MASTERED');
      expect(prismaMock.mastery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ currentLevel: 'MASTERED' }),
        }),
      );
      expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
      expect(progressionMock.checkJourneyAdvancement).not.toHaveBeenCalled();
    });
  });

  describe('evaluateWordCycleCompletion', () => {
    const allHighScores = {
      sentence: { grammar: 80, vocabulary: 90, context: 75, naturalness: 85, clarity: 100 },
      paragraph: { grammar: 80, vocabulary: 90, structure: 75, flow: 85, context: 100 },
    };

    it('always persists the updated area scores, even when the cycle does not complete mastery', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'RECOGNIZING',
        timesCorrect: 0,
      });
      const scoresWithOneLowDimension = { ...allHighScores.paragraph, flow: 40 };

      const result = await service.evaluateWordCycleCompletion(
        'u1',
        'w1',
        allHighScores.sentence,
        scoresWithOneLowDimension,
      );

      expect(result.masteredViaSkillCheck).toBe(false);
      expect(prismaMock.mastery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            currentLevel: 'RECOGNIZING', // unchanged — never demoted by a so-so cycle
            paragraphScore: expect.any(Number),
            sentenceScore: expect.any(Number),
          }),
        }),
      );
    });

    it('never lowers a stored sentence/paragraph score — a weaker later cycle keeps the higher one on file', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'RECOGNIZING',
        timesCorrect: 0,
        sentenceScore: 90, // a strong score already on file
        paragraphScore: 90,
      });
      const weakerCycle = {
        sentence: { grammar: 40, vocabulary: 40, context: 40, naturalness: 40, clarity: 40 },
        paragraph: { grammar: 40, vocabulary: 40, structure: 40, flow: 40, context: 40 },
      };

      await service.evaluateWordCycleCompletion('u1', 'w1', weakerCycle.sentence, weakerCycle.paragraph);

      expect(prismaMock.mastery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ sentenceScore: 90, paragraphScore: 90 }),
        }),
      );
    });

    it('does NOT complete mastery from a perfect cycle alone — Guess is also required (the bug this spec fixes)', async () => {
      // timesCorrect 0 (never guessed correctly) — a perfect Sentence/
      // Paragraph cycle must not be sufficient by itself; the mastery
      // gate requires all THREE areas, and Guess is a one-time pass.
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'RECOGNIZING',
        timesCorrect: 0,
      });

      const result = await service.evaluateWordCycleCompletion(
        'u1',
        'w1',
        allHighScores.sentence,
        allHighScores.paragraph,
      );

      expect(result.masteredViaSkillCheck).toBe(false);
    });

    it('completes mastery when the cycle is perfect AND the word had already been guessed correctly at least once', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        timesCorrect: 4,
      });
      prismaMock.userProgression.update.mockResolvedValueOnce({
        level: 3,
        journeyStage: 0,
        masteredWordsCount: 10,
      });

      const result = await service.evaluateWordCycleCompletion(
        'u1',
        'w1',
        allHighScores.sentence,
        allHighScores.paragraph,
      );

      expect(result.masteredViaSkillCheck).toBe(true);
      expect(prismaMock.mastery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_wordId: { userId: 'u1', wordId: 'w1' } },
          update: expect.objectContaining({ currentLevel: 'MASTERED' }),
        }),
      );
    });

    it('is a no-op (no new transition) when the word is already MASTERED, even with a perfect cycle', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'MASTERED',
        timesCorrect: 9,
      });

      const result = await service.evaluateWordCycleCompletion(
        'u1',
        'w1',
        allHighScores.sentence,
        allHighScores.paragraph,
      );

      expect(result.masteredViaSkillCheck).toBe(false);
      expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
    });

    it('increments masteredWordsCount and checks Journey/CEFR/achievements on a genuine promotion', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        timesCorrect: 4,
      });
      prismaMock.userProgression.update.mockResolvedValueOnce({
        level: 5,
        journeyStage: 1,
        masteredWordsCount: 51,
      });

      await service.evaluateWordCycleCompletion(
        'u1',
        'w1',
        allHighScores.sentence,
        allHighScores.paragraph,
      );

      expect(prismaMock.userProgression.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { masteredWordsCount: { increment: 1 } },
      });
      expect(progressionMock.checkJourneyAdvancement).toHaveBeenCalledWith(
        'u1',
        5,
        1,
        51,
        prismaMock,
      );
      expect(progressionMock.checkCefrEligibility).toHaveBeenCalledWith('u1', prismaMock);
      expect(achievementsMock.checkDiscoveryAndMastery).toHaveBeenCalledWith('u1', 51, prismaMock);
    });
  });

  describe('recordSkillAreaPractice', () => {
    const highScores = { grammar: 90, vocabulary: 90, context: 90, naturalness: 90, clarity: 90 };
    const lowScores = { grammar: 30, vocabulary: 30, context: 30, naturalness: 30, clarity: 30 };

    it('stores a first-ever attempt as both the attempt score and the best score', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({ currentLevel: 'NEW' });

      const result = await service.recordSkillAreaPractice('u1', 'w1', 'sentence', highScores);

      expect(result.attemptScore).toBe(90);
      expect(result.bestScore).toBe(90);
      expect(prismaMock.mastery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ sentenceScore: 90 }) }),
      );
    });

    it('keeps the higher score on file when a re-practice attempt scores lower — never overwrites downward', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'RECOGNIZING',
        sentenceScore: 90, // a strong score already on file
      });

      const result = await service.recordSkillAreaPractice('u1', 'w1', 'sentence', lowScores);

      expect(result.attemptScore).toBe(30); // honest feedback on what was just written
      expect(result.bestScore).toBe(90); // but the stored score doesn't move backward
      expect(prismaMock.mastery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ sentenceScore: 90 }) }),
      );
    });

    it('raises the stored score when a re-practice attempt beats the existing one', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'RECOGNIZING',
        paragraphScore: 30,
      });

      const result = await service.recordSkillAreaPractice('u1', 'w1', 'paragraph', highScores);

      expect(result.attemptScore).toBe(90);
      expect(result.bestScore).toBe(90);
      expect(prismaMock.mastery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ paragraphScore: 90 }) }),
      );
    });

    it('leaves the other area untouched when practicing just one', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'RECOGNIZING',
        sentenceScore: 55,
        paragraphScore: 70,
      });

      await service.recordSkillAreaPractice('u1', 'w1', 'sentence', highScores);

      const call = prismaMock.mastery.upsert.mock.calls.at(-1)![0];
      expect(call.update).not.toHaveProperty('paragraphScore');
    });

    it('completes mastery via practice once Guess (ever passed), sentence, and paragraph are all satisfied', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        timesCorrect: 5, // guess dimension already satisfied
        sentenceScore: 80,
        paragraphScore: 40, // this practice attempt is what clears it
      });
      prismaMock.userProgression.update.mockResolvedValueOnce({
        level: 3,
        journeyStage: 0,
        masteredWordsCount: 20,
      });

      const result = await service.recordSkillAreaPractice('u1', 'w1', 'paragraph', highScores);

      expect(result.level).toBe('MASTERED');
      expect(result.justMastered).toBe(true);
    });

    it('does not complete mastery via practice when the word has never been guessed correctly', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'RECOGNIZING',
        timesCorrect: 0,
        sentenceScore: 90,
        paragraphScore: 40,
      });

      const result = await service.recordSkillAreaPractice('u1', 'w1', 'paragraph', highScores);

      expect(result.level).not.toBe('MASTERED');
      expect(result.justMastered).toBe(false);
    });
  });

  describe('recheckGate — the one-time backfill helper', () => {
    it('promotes to MASTERED when stored data already satisfies the new gate', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        timesCorrect: 5,
        sentenceScore: 80,
        paragraphScore: 82,
      });
      prismaMock.userProgression.update.mockResolvedValueOnce({
        level: 4,
        journeyStage: 0,
        masteredWordsCount: 11,
      });

      const result = await service.recheckGate('u1', 'w1');

      expect(result.justMastered).toBe(true);
      expect(prismaMock.mastery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_wordId: { userId: 'u1', wordId: 'w1' } },
          data: expect.objectContaining({ currentLevel: 'MASTERED' }),
        }),
      );
      expect(progressionMock.checkJourneyAdvancement).toHaveBeenCalledWith('u1', 4, 0, 11, prismaMock);
    });

    it('is a no-op when the word has never been guessed correctly', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        timesCorrect: 0,
        sentenceScore: 90,
        paragraphScore: 90,
      });

      const result = await service.recheckGate('u1', 'w1');

      expect(result.justMastered).toBe(false);
      expect(prismaMock.mastery.update).not.toHaveBeenCalled();
    });

    it('is a no-op when sentence or paragraph is still below threshold', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        timesCorrect: 3,
        sentenceScore: 90,
        paragraphScore: 40,
      });

      const result = await service.recheckGate('u1', 'w1');

      expect(result.justMastered).toBe(false);
      expect(prismaMock.mastery.update).not.toHaveBeenCalled();
    });

    it('is a no-op when the word is already MASTERED', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'MASTERED',
        timesCorrect: 9,
        sentenceScore: 90,
        paragraphScore: 90,
      });

      const result = await service.recheckGate('u1', 'w1');

      expect(result.justMastered).toBe(false);
      expect(prismaMock.mastery.update).not.toHaveBeenCalled();
      expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
    });

    it('is a no-op when there is no Mastery row for the word at all', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce(null);

      const result = await service.recheckGate('u1', 'w1');

      expect(result.justMastered).toBe(false);
      expect(prismaMock.mastery.update).not.toHaveBeenCalled();
    });
  });

  describe('getLevel', () => {
    it('returns NEW when the player has no Mastery row for the word yet', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce(null);
      const level = await service.getLevel('u1', 'w1');
      expect(level).toBe('NEW');
    });

    it('returns the stored currentLevel when a Mastery row exists', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce({ currentLevel: 'STRONG' });
      const level = await service.getLevel('u1', 'w1');
      expect(level).toBe('STRONG');
    });
  });

  describe('getDetail', () => {
    it('returns an honest NEW/zeroed detail when the player has no Mastery row yet', async () => {
      prismaMock.mastery.findUnique.mockResolvedValueOnce(null);

      const detail = await service.getDetail('u1', 'w1');

      expect(detail).toEqual({
        wordId: 'w1',
        currentLevel: 'NEW',
        masteryScore: 0,
        timesPresented: 0,
        timesCorrect: 0,
        timesIncorrect: 0,
        currentCorrectStreak: 0,
        guessScore: 0,
        sentenceScore: 0,
        paragraphScore: 0,
        lastPresentedAt: null,
        lastCorrectAt: null,
        masteredAt: null,
        nextReviewDueAt: null,
      });
    });

    it('returns the full stored detail when a Mastery row exists', async () => {
      const lastPresentedAt = new Date('2026-08-14T10:00:00Z');
      const nextReviewDue = new Date('2026-08-23T10:00:00Z');
      prismaMock.mastery.findUnique.mockResolvedValueOnce({
        currentLevel: 'STRONG',
        masteryScore: 75,
        timesPresented: 12,
        timesCorrect: 10,
        timesIncorrect: 2,
        currentCorrectStreak: 5,
        guessScore: 80,
        sentenceScore: 70,
        paragraphScore: 65,
        lastPresentedAt,
        lastCorrectAt: lastPresentedAt,
        masteredAt: null,
        nextReviewDueAt: nextReviewDue,
      });

      const detail = await service.getDetail('u1', 'w1');

      expect(detail).toEqual({
        wordId: 'w1',
        currentLevel: 'STRONG',
        masteryScore: 75,
        timesPresented: 12,
        timesCorrect: 10,
        timesIncorrect: 2,
        currentCorrectStreak: 5,
        guessScore: 80,
        sentenceScore: 70,
        paragraphScore: 65,
        lastPresentedAt,
        lastCorrectAt: lastPresentedAt,
        masteredAt: null,
        nextReviewDueAt: nextReviewDue,
      });
    });
  });
});

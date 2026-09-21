import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { QuestsService } from './quests.service';
import { PrismaService } from '../prisma/prisma.service';
import { WordsService } from '../vocabulary/words.service';
import { MasteryService } from '../mastery/mastery.service';
import { ProgressionService } from '../progression/progression.service';
import { AchievementService } from '../achievement/achievement.service';
import { SentenceEvaluationService } from '../sentence/sentence-evaluation.service';
import { ParagraphEvaluationService } from '../paragraph/paragraph-evaluation.service';
import { WordInTheWildService } from '../word-in-the-wild/word-in-the-wild.service';
import { LearningProfileService } from '../learning-profile/learning-profile.service';
import { AliService } from '../ali/ali.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { gameplayRules } from '../config/gameplay-rules';

describe('QuestsService', () => {
  let service: QuestsService;

  const prismaMock = {
    quest: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
    },
    questAttempt: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      // startTimedQuest's excludeWordIds lookup (V21 §3) — the caller's
      // other IN_PROGRESS attempts. Empty by default so pickWordsForQuest
      // gets called with excludeWordIds: [] unless a test overrides it.
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      // Default: every claimStageTransition atomic claim succeeds unless a
      // specific test overrides it with mockResolvedValueOnce({ count: 0 })
      // to exercise the race-loser path.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    word: {
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ word: 'greeting' }),
    },
    userProgression: {
      findUnique: jest.fn().mockResolvedValue({ journeyStage: 0 }),
    },
    challengeAttempt: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn(),
    },
    cefrAssessment: {
      create: jest.fn().mockResolvedValue({}),
    },
    // Runs the callback with prismaMock itself as `tx` — every existing
    // `prismaMock.X.Y` mock/assertion below therefore also covers calls
    // made through the transaction, with no separate tx double needed.
    $transaction: jest.fn((callback: (tx: any) => unknown): unknown => callback(prismaMock)),
  };

  const wordsMock = {
    pickWordsForQuest: jest.fn(),
  };

  const masteryMock = {
    recordAnswer: jest.fn(),
    getLevel: jest.fn(),
    evaluateWordCycleCompletion: jest.fn().mockResolvedValue({ masteredViaSkillCheck: false }),
  };

  const progressionMock = {
    awardXp: jest.fn().mockResolvedValue({}),
    awardGlyphs: jest.fn().mockResolvedValue({}),
    recordDailyActivity: jest.fn().mockResolvedValue({ currentStreak: 1 }),
    updateUnifiedCefrEstimate: jest.fn().mockResolvedValue(undefined),
  };

  const achievementsMock = {
    checkConsistency: jest.fn().mockResolvedValue(undefined),
    checkIndependentLearning: jest.fn().mockResolvedValue(undefined),
  };

  const sentenceEvaluationMock = {
    evaluate: jest.fn(),
  };

  const paragraphEvaluationMock = {
    evaluate: jest.fn(),
  };

  const wordInTheWildMock = {
    createMission: jest.fn(),
  };

  const learningProfileMock = {
    recordWordCompletion: jest.fn().mockResolvedValue({ calibrationJustCompleted: false }),
  };

  const aliMock = {
    reactFireAndForget: jest.fn(),
    react: jest.fn(),
  };
  const analyticsMock = { track: jest.fn() };

  // Real English-vocabulary fixtures — generateOmissionChallenge is a
  // real pure function here (not mocked), so these need to be shapes it
  // can actually run against.
  const greetingWord = {
    id: 'w1',
    word: 'greeting',
    normalizedWord: 'greeting',
    length: 8,
    definition: 'A word or gesture of welcome.',
    partOfSpeech: 'noun',
    exampleSentence: 'She gave a warm greeting.',
    baseDifficulty: 'BEGINNER',
  };
  const farewellWord = {
    id: 'w2',
    word: 'farewell',
    normalizedWord: 'farewell',
    length: 8,
    definition: 'An act of parting or leave-taking.',
    partOfSpeech: 'noun',
    exampleSentence: 'They exchanged a quick farewell.',
    baseDifficulty: 'BEGINNER',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    masteryMock.getLevel.mockResolvedValue('NEW');
    const moduleRef = await Test.createTestingModule({
      providers: [
        QuestsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WordsService, useValue: wordsMock },
        { provide: MasteryService, useValue: masteryMock },
        { provide: ProgressionService, useValue: progressionMock },
        { provide: AchievementService, useValue: achievementsMock },
        { provide: SentenceEvaluationService, useValue: sentenceEvaluationMock },
        { provide: ParagraphEvaluationService, useValue: paragraphEvaluationMock },
        { provide: WordInTheWildService, useValue: wordInTheWildMock },
        { provide: LearningProfileService, useValue: learningProfileMock },
        { provide: AliService, useValue: aliMock },
        { provide: AnalyticsService, useValue: analyticsMock },
      ],
    }).compile();
    service = moduleRef.get(QuestsService);
  });

  describe('startTimedQuest', () => {
    it('throws NotFoundException when the quest key does not exist', async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce(null);
      await expect(service.startTimedQuest('u1', 'morning-quest', '2026-08-14', 8)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the quest exists but is inactive', async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce({
        id: 'q1',
        isActive: false,
        wordCount: 5,
      });
      await expect(service.startTimedQuest('u1', 'morning-quest', '2026-08-14', 8)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resumes an existing IN_PROGRESS attempt instead of creating a new one, regardless of the window', async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce({
        id: 'q1',
        isActive: true,
        wordCount: 5,
        windowStartHour: 16,
        windowEndHour: 23,
      });
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce({
        id: 'a1',
        wordIds: ['w1', 'w2'],
        currentIndex: 1,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(farewellWord);

      // Local hour (8) is before this quest's window (16) — an in-progress
      // attempt still resumes; the floor only gates NEW attempts.
      const view = await service.startTimedQuest('u1', 'evening-quest', '2026-08-14', 8);

      expect(prismaMock.questAttempt.create).not.toHaveBeenCalled();
      expect(wordsMock.pickWordsForQuest).not.toHaveBeenCalled();
      expect(view.questAttemptId).toBe('a1');
      expect(view.wordIndex).toBe(1);
      expect(view.wordCount).toBe(2);
      expect(view.definition).toBe(farewellWord.definition);
      expect(view.wordLength).toBe(8);
    });

    it("throws when the local hour is before the quest's windowStartHour and there is nothing to resume", async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce({
        id: 'q1',
        isActive: true,
        wordCount: 5,
        windowStartHour: 16,
        windowEndHour: 23,
      });
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null); // no in-progress
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null); // not completed today either

      await expect(
        service.startTimedQuest('u1', 'evening-quest', '2026-08-14', 14),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.questAttempt.create).not.toHaveBeenCalled();
    });

    it('allows starting once the local hour has reached windowStartHour', async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce({
        id: 'q1',
        isActive: true,
        wordCount: 5,
        windowStartHour: 16,
        windowEndHour: 23,
      });
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      wordsMock.pickWordsForQuest.mockResolvedValueOnce(['w1']);
      prismaMock.questAttempt.create.mockResolvedValueOnce({
        id: 'a2',
        wordIds: ['w1'],
        currentIndex: 0,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      await service.startTimedQuest('u1', 'evening-quest', '2026-08-14', 16);

      expect(prismaMock.questAttempt.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          questId: 'q1',
          localDate: '2026-08-14',
          wordIds: ['w1'],
          guessStartedAt: expect.any(Date),
        },
      });
    });

    it('has no ceiling — stays startable well past windowEndHour, even the next day, once past the floor', async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce({
        id: 'q1',
        isActive: true,
        wordCount: 5,
        windowStartHour: 0,
        windowEndHour: 11,
      });
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      wordsMock.pickWordsForQuest.mockResolvedValueOnce(['w1']);
      prismaMock.questAttempt.create.mockResolvedValueOnce({
        id: 'a3',
        wordIds: ['w1'],
        currentIndex: 0,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      // Morning Quest's window is 0-11, but it's 23:00 the NEXT day and
      // still never got started — no ceiling means it's still fair game.
      await service.startTimedQuest('u1', 'morning-quest', '2026-08-15', 23);

      expect(prismaMock.questAttempt.create).toHaveBeenCalled();
    });

    it("throws when today's attempt for this quest is already COMPLETED, rather than spawning another", async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce({
        id: 'q1',
        isActive: true,
        wordCount: 5,
        windowStartHour: 0,
        windowEndHour: 11,
      });
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null); // no in-progress
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce({
        id: 'done-1',
        status: 'COMPLETED',
      }); // completed today

      await expect(service.startTimedQuest('u1', 'morning-quest', '2026-08-14', 8)).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.questAttempt.create).not.toHaveBeenCalled();
      expect(prismaMock.questAttempt.findFirst).toHaveBeenNthCalledWith(2, {
        where: { userId: 'u1', questId: 'q1', status: 'COMPLETED', localDate: '2026-08-14' },
      });
    });

    it('a quest with no window (windowStartHour null) is never floor-gated', async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce({
        id: 'q1',
        isActive: true,
        wordCount: 5,
        windowStartHour: null,
        windowEndHour: null,
      });
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      wordsMock.pickWordsForQuest.mockResolvedValueOnce(['w1']);
      prismaMock.questAttempt.create.mockResolvedValueOnce({
        id: 'a4',
        wordIds: ['w1'],
        currentIndex: 0,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      await service.startTimedQuest('u1', 'unwindowed-quest', '2026-08-14', 0);

      expect(prismaMock.questAttempt.create).toHaveBeenCalled();
    });

    it('creates a new attempt with quest.wordCount words when none is in progress', async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce({
        id: 'q1',
        isActive: true,
        wordCount: 7,
        windowStartHour: null,
        windowEndHour: null,
      });
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      wordsMock.pickWordsForQuest.mockResolvedValueOnce(['w1']);
      prismaMock.questAttempt.create.mockResolvedValueOnce({
        id: 'a2',
        wordIds: ['w1'],
        currentIndex: 0,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      await service.startTimedQuest('u1', 'morning-quest', '2026-08-14', 8);

      expect(wordsMock.pickWordsForQuest).toHaveBeenCalledWith('u1', 7, []);
    });

    it('falls back to the configured default word count when quest.wordCount is unset', async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce({
        id: 'q1',
        isActive: true,
        wordCount: 0,
        windowStartHour: null,
        windowEndHour: null,
      });
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      wordsMock.pickWordsForQuest.mockResolvedValueOnce(['w1']);
      prismaMock.questAttempt.create.mockResolvedValueOnce({
        id: 'a3',
        wordIds: ['w1'],
        currentIndex: 0,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      await service.startTimedQuest('u1', 'morning-quest', '2026-08-14', 8);

      expect(wordsMock.pickWordsForQuest).toHaveBeenCalledWith(
        'u1',
        gameplayRules.quest.defaultWordCount,
        [],
      );
    });

    it("excludes word IDs already pending in the player's other in-progress attempts (V21 §3)", async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce({
        id: 'q1',
        isActive: true,
        wordCount: 5,
        windowStartHour: null,
        windowEndHour: null,
      });
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce(null);
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        { wordIds: ['pending-1', 'pending-2'] },
        { wordIds: ['pending-3'] },
      ]);
      wordsMock.pickWordsForQuest.mockResolvedValueOnce(['w1']);
      prismaMock.questAttempt.create.mockResolvedValueOnce({
        id: 'a5',
        wordIds: ['w1'],
        currentIndex: 0,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      await service.startTimedQuest('u1', 'morning-quest', '2026-08-14', 8);

      expect(prismaMock.questAttempt.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', status: 'IN_PROGRESS' },
        select: { wordIds: true },
      });
      expect(wordsMock.pickWordsForQuest).toHaveBeenCalledWith('u1', 5, [
        'pending-1',
        'pending-2',
        'pending-3',
      ]);
    });

    it('looks up mastery level for the word before generating the challenge, and persists the shown pattern', async () => {
      prismaMock.quest.findUnique.mockResolvedValueOnce({
        id: 'q1',
        isActive: true,
        wordCount: 5,
        windowStartHour: null,
        windowEndHour: null,
      });
      prismaMock.questAttempt.findFirst.mockResolvedValueOnce({
        id: 'a1',
        wordIds: ['w1'],
        currentIndex: 0,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      masteryMock.getLevel.mockResolvedValueOnce('STRONG');

      const view = await service.startTimedQuest('u1', 'morning-quest', '2026-08-14', 8);

      expect(masteryMock.getLevel).toHaveBeenCalledWith('u1', 'w1');
      expect(prismaMock.questAttempt.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: {
          currentDisplayPattern: view.displayPattern,
          currentMissingIndexes: view.missingIndexes,
        },
      });
    });
  });

  describe('listQuests', () => {
    it('returns the active quest catalog with window hours, ordered by windowStartHour', async () => {
      prismaMock.quest.findMany.mockResolvedValueOnce([
        {
          key: 'morning-quest',
          title: 'Morning Quest',
          description: 'Five words to start the day.',
          windowStartHour: 0,
          windowEndHour: 11,
        },
      ]);

      const result = await service.listQuests();

      expect(prismaMock.quest.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { windowStartHour: 'asc' },
      });
      expect(result).toEqual([
        {
          key: 'morning-quest',
          title: 'Morning Quest',
          description: 'Five words to start the day.',
          windowStartHour: 0,
          windowEndHour: 11,
        },
      ]);
    });
  });

  describe('submitAnswer', () => {
    const guessStartedAt = new Date('2026-08-14T10:00:00.000Z');
    const inProgressAttempt = {
      id: 'a1',
      userId: 'u1',
      questId: 'q1',
      status: 'IN_PROGRESS',
      wordStage: 'GUESSING',
      currentIndex: 0,
      wordIds: ['w1', 'w2'],
      currentDisplayPattern: 'G R _ _ T I N G',
      currentMissingIndexes: [2, 3],
      guessStartedAt,
      wrongAttempts: 0,
      hintsUsed: 0,
      synonymsUsed: 0,
      lettersRevealed: 0,
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it('throws NotFoundException when the attempt does not exist', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce(null);
      await expect(service.submitAnswer('u1', 'missing', 'greeting')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the attempt belongs to another user', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
        ...inProgressAttempt,
        userId: 'someone-else',
      });
      await expect(service.submitAnswer('u1', 'a1', 'greeting')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when the attempt is not IN_PROGRESS', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
        ...inProgressAttempt,
        status: 'COMPLETED',
      });
      await expect(service.submitAnswer('u1', 'a1', 'greeting')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when the word is not at the Guess stage', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
        ...inProgressAttempt,
        wordStage: 'SENTENCE',
      });
      await expect(service.submitAnswer('u1', 'a1', 'greeting')).rejects.toThrow(
        BadRequestException,
      );
    });

    describe('timeout (server-authoritative 2-minute timer)', () => {
      it('marks the attempt ABANDONED and rejects the answer once the timer has expired', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 121_000)); // 121s elapsed > 120s timer
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
        masteryMock.getLevel.mockResolvedValueOnce('NEW');

        const result = await service.submitAnswer('u1', 'a1', 'greeting');

        expect(result.timedOut).toBe(true);
        expect(result.xpAwarded).toBe(0);
        expect(result.understanding).toBeNull();
        // No answer was actually evaluated on a timeout, so there's
        // nothing for the lightweight canned reaction to react to.
        expect(result.aliQuickReaction).toBeNull();
        expect(prismaMock.questAttempt.update).toHaveBeenCalledWith({
          where: { id: 'a1' },
          data: { status: 'ABANDONED' },
        });
      });

      it('does not evaluate the submitted answer or touch mastery/XP when timed out', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 121_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
        masteryMock.getLevel.mockResolvedValueOnce('NEW');

        await service.submitAnswer('u1', 'a1', 'greeting'); // even the objectively correct answer

        expect(masteryMock.recordAnswer).not.toHaveBeenCalled();
        expect(progressionMock.awardXp).not.toHaveBeenCalled();
        expect(prismaMock.$transaction).not.toHaveBeenCalled();
      });

      it('is still answerable right up to the exact 120-second boundary', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 120_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
        masteryMock.recordAnswer.mockResolvedValueOnce({
          level: 'RECOGNIZING',
          justMastered: false,
        });

        const result = await service.submitAnswer('u1', 'a1', 'greeting');

        expect(result.timedOut).toBe(false);
      });
    });

    describe('wrong answer — unlimited attempts until timeout', () => {
      it('does not transition the word stage', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 5_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

        const result = await service.submitAnswer('u1', 'a1', 'wrong-guess');

        expect(result.isCorrect).toBe(false);
        expect(result.understanding).toBeNull();
        expect(result.xpAwarded).toBe(0);
        // A lightweight, non-AI canned reaction (V21 §6) fires on every
        // evaluated wrong answer — distinct from ALI's AI-generated
        // milestone reactions, and kept cost-flat regardless of guess
        // volume (see ali-quick-reactions.ts).
        expect(typeof result.aliQuickReaction).toBe('string');
        expect(result.aliQuickReaction).not.toBeNull();
      });

      it('increments wrongAttempts rather than transitioning wordStage', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 5_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

        await service.submitAnswer('u1', 'a1', 'wrong-guess');

        expect(prismaMock.questAttempt.update).toHaveBeenCalledWith({
          where: { id: 'a1' },
          data: { wrongAttempts: { increment: 1 } },
        });
      });

      it('records a ChallengeAttempt row with isCorrect: false and 0 XP', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 5_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

        await service.submitAnswer('u1', 'a1', 'wrong-guess');

        expect(prismaMock.challengeAttempt.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            isCorrect: false,
            xpAwarded: 0,
            submittedAnswer: 'wrong-guess',
          }),
        });
      });

      it('never calls mastery.recordAnswer or awards XP for a wrong guess', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 5_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

        await service.submitAnswer('u1', 'a1', 'wrong-guess');

        expect(masteryMock.recordAnswer).not.toHaveBeenCalled();
        expect(progressionMock.awardXp).not.toHaveBeenCalled();
      });
    });

    describe('correct answer — transitions to Understanding, does not complete the quest', () => {
      it('normalizes case and whitespace when checking the answer against normalizedWord', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 5_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
        masteryMock.recordAnswer.mockResolvedValueOnce({
          level: 'RECOGNIZING',
          justMastered: false,
        });

        const result = await service.submitAnswer('u1', 'a1', '  GREETING  ');

        expect(result.isCorrect).toBe(true);
        expect(masteryMock.recordAnswer).toHaveBeenCalledWith('u1', 'w1', true, prismaMock);
      });

      it('includes a lightweight, non-null aliQuickReaction on a correct answer (V21 §6)', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 5_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
        masteryMock.recordAnswer.mockResolvedValueOnce({
          level: 'RECOGNIZING',
          justMastered: false,
        });

        const result = await service.submitAnswer('u1', 'a1', 'greeting');

        expect(typeof result.aliQuickReaction).toBe('string');
        expect(result.aliQuickReaction).not.toBeNull();
      });

      it('awards XP computed by computeGuessXp using the elapsed time and the attempt\u2019s tracked penalties', async () => {
        // 5s elapsed -> fastest band (750); clean run -> +500 no-hint bonus -> clamped to 750.
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 5_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
        masteryMock.recordAnswer.mockResolvedValueOnce({
          level: 'RECOGNIZING',
          justMastered: false,
        });

        const result = await service.submitAnswer('u1', 'a1', 'greeting');

        expect(result.xpAwarded).toBe(750);
        expect(progressionMock.awardXp).toHaveBeenCalledWith(
          'u1',
          750,
          'QUEST_ANSWER',
          'quests',
          'a1',
          prismaMock,
        );
      });

      it('reduces XP when the attempt used hints/synonyms/reveals before answering correctly', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 5_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
          ...inProgressAttempt,
          hintsUsed: 2,
        });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
        masteryMock.recordAnswer.mockResolvedValueOnce({
          level: 'RECOGNIZING',
          justMastered: false,
        });

        const result = await service.submitAnswer('u1', 'a1', 'greeting');

        // 750 (band) - 100 (2 hints * 50) = 650, no no-hint bonus since a hint was used.
        expect(result.xpAwarded).toBe(650);
      });

      it('transitions wordStage from GUESSING to UNDERSTANDING', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 5_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
        masteryMock.recordAnswer.mockResolvedValueOnce({
          level: 'RECOGNIZING',
          justMastered: false,
        });

        await service.submitAnswer('u1', 'a1', 'greeting');

        expect(prismaMock.questAttempt.updateMany).toHaveBeenCalledWith({
          where: { id: 'a1', wordStage: 'GUESSING', status: 'IN_PROGRESS' },
          data: { wordStage: 'UNDERSTANDING', xpAwarded: { increment: 750 } },
        });
      });

      it('does NOT complete the quest, award a completion bonus, or record daily activity — that now happens later in the word cycle', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 5_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
        masteryMock.recordAnswer.mockResolvedValueOnce({
          level: 'RECOGNIZING',
          justMastered: false,
        });

        await service.submitAnswer('u1', 'a1', 'greeting');

        expect(progressionMock.recordDailyActivity).not.toHaveBeenCalled();
        expect(progressionMock.awardGlyphs).not.toHaveBeenCalled();
        expect(achievementsMock.checkConsistency).not.toHaveBeenCalled();
        expect(achievementsMock.checkIndependentLearning).not.toHaveBeenCalled();
      });

      it('returns full Understanding content (definition, pronunciation, synonyms, example)', async () => {
        jest.useFakeTimers().setSystemTime(new Date(guessStartedAt.getTime() + 5_000));
        prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...inProgressAttempt });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce({
          ...greetingWord,
          pronunciation: 'audio-url',
          phoneticRepresentation: '/ˈɡriːtɪŋ/',
          synonyms: ['salutation', 'welcome'],
        });
        masteryMock.recordAnswer.mockResolvedValueOnce({
          level: 'RECOGNIZING',
          justMastered: false,
        });

        const result = await service.submitAnswer('u1', 'a1', 'greeting');

        expect(result.understanding).toEqual({
          word: 'greeting',
          definition: greetingWord.definition,
          partOfSpeech: greetingWord.partOfSpeech,
          pronunciation: 'audio-url',
          phoneticRepresentation: '/ˈɡriːtɪŋ/',
          synonyms: ['salutation', 'welcome'],
          exampleSentence: greetingWord.exampleSentence,
        });
      });
    });
  });

  describe('acknowledgeUnderstanding', () => {
    const understandingAttempt = {
      id: 'a1',
      userId: 'u1',
      status: 'IN_PROGRESS',
      wordStage: 'UNDERSTANDING',
    };

    it('throws NotFoundException when the attempt does not exist', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce(null);
      await expect(service.acknowledgeUnderstanding('u1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the word is not at the Understanding stage', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
        ...understandingAttempt,
        wordStage: 'SENTENCE',
      });
      await expect(service.acknowledgeUnderstanding('u1', 'a1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('transitions wordStage from UNDERSTANDING to SENTENCE', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...understandingAttempt });

      const result = await service.acknowledgeUnderstanding('u1', 'a1');

      expect(result.wordStage).toBe('SENTENCE');
      expect(prismaMock.questAttempt.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { wordStage: 'SENTENCE' },
      });
    });
  });

  describe('submitSentence', () => {
    const sentenceAttempt = {
      id: 'a1',
      userId: 'u1',
      status: 'IN_PROGRESS',
      wordStage: 'SENTENCE',
      currentIndex: 0,
      wordIds: ['w1'],
    };

    const evaluation = {
      scores: { grammar: 80, vocabulary: 90, context: 70, naturalness: 60, clarity: 100 },
      xpAwarded: 1000,
      confidence: 0.9,
      whatWentWell: 'Good structure.',
      whatNeedsImprovement: 'Could be more natural.',
      betterVersion: 'A better sentence.',
      nextAction: 'Try varying sentence length.',
    };

    it('throws NotFoundException when the attempt does not exist', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce(null);
      await expect(service.submitSentence('u1', 'missing', 'She is resilient.')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the word is not at the Sentence stage', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
        ...sentenceAttempt,
        wordStage: 'PARAGRAPH',
      });
      await expect(service.submitSentence('u1', 'a1', 'She is resilient.')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sends the word, definition, and part of speech to the evaluator', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...sentenceAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      sentenceEvaluationMock.evaluate.mockResolvedValueOnce(evaluation);

      await service.submitSentence('u1', 'a1', 'She gave a warm greeting.');

      expect(sentenceEvaluationMock.evaluate).toHaveBeenCalledWith(
        greetingWord.word,
        greetingWord.definition,
        greetingWord.partOfSpeech,
        'She gave a warm greeting.',
      );
    });

    it('awards the evaluated XP via ProgressionService', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...sentenceAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      sentenceEvaluationMock.evaluate.mockResolvedValueOnce(evaluation);

      await service.submitSentence('u1', 'a1', 'She gave a warm greeting.');

      expect(progressionMock.awardXp).toHaveBeenCalledWith(
        'u1',
        1000,
        'SENTENCE_STAGE',
        'quests',
        'a1',
        prismaMock,
      );
    });

    it("recomputes the player's blended rolling CEFR estimate, since Sentence quality is one of its inputs", async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...sentenceAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      sentenceEvaluationMock.evaluate.mockResolvedValueOnce(evaluation);

      await service.submitSentence('u1', 'a1', 'She gave a warm greeting.');

      expect(progressionMock.updateUnifiedCefrEstimate).toHaveBeenCalledWith('u1', prismaMock);
    });

    it('persists the sentence text, scores, and XP, and advances wordStage to PARAGRAPH', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...sentenceAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      sentenceEvaluationMock.evaluate.mockResolvedValueOnce(evaluation);

      await service.submitSentence('u1', 'a1', 'She gave a warm greeting.');

      expect(prismaMock.questAttempt.updateMany).toHaveBeenCalledWith({
        where: { id: 'a1', wordStage: 'SENTENCE', status: 'IN_PROGRESS' },
        data: {
          wordStage: 'PARAGRAPH',
          sentenceText: 'She gave a warm greeting.',
          sentenceScores: evaluation.scores,
          sentenceXpAwarded: 1000,
          xpAwarded: { increment: 1000 },
        },
      });
    });

    it('returns the scores and feedback to the caller', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...sentenceAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      sentenceEvaluationMock.evaluate.mockResolvedValueOnce(evaluation);

      const result = await service.submitSentence('u1', 'a1', 'She gave a warm greeting.');

      expect(result).toEqual({
        scores: evaluation.scores,
        xpAwarded: 1000,
        whatWentWell: 'Good structure.',
        whatNeedsImprovement: 'Could be more natural.',
        betterVersion: 'A better sentence.',
        nextAction: 'Try varying sentence length.',
      });
    });
  });

  describe('submitParagraph', () => {
    const paragraphAttempt = {
      id: 'a1',
      userId: 'u1',
      status: 'IN_PROGRESS',
      wordStage: 'PARAGRAPH',
      currentIndex: 0,
      wordIds: ['w1'],
    };

    const thirtyWordParagraph = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');

    const paragraphEvaluation = {
      scores: { grammar: 80, vocabulary: 90, structure: 70, flow: 60, context: 100 },
      xpAwarded: 1400,
      confidence: 0.9,
      estimatedProficiency: 'B1',
      whatWentWell: 'Good structure.',
      whatNeedsImprovement: 'Could flow better.',
      suggestedRevision: 'A revised paragraph.',
      nextAction: 'Practice linking sentences.',
    };

    it('throws NotFoundException when the attempt does not exist', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce(null);
      await expect(service.submitParagraph('u1', 'missing', thirtyWordParagraph)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the word is not at the Paragraph stage', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
        ...paragraphAttempt,
        wordStage: 'OPTIONAL_WILD',
      });
      await expect(service.submitParagraph('u1', 'a1', thirtyWordParagraph)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a paragraph under 30 words without calling the AI evaluator', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...paragraphAttempt });
      await expect(service.submitParagraph('u1', 'a1', 'too short')).rejects.toThrow(
        BadRequestException,
      );
      expect(paragraphEvaluationMock.evaluate).not.toHaveBeenCalled();
    });

    it('rejects a paragraph over 100 words without calling the AI evaluator', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...paragraphAttempt });
      const tooLong = Array.from({ length: 101 }, (_, i) => `word${i}`).join(' ');
      await expect(service.submitParagraph('u1', 'a1', tooLong)).rejects.toThrow(
        BadRequestException,
      );
      expect(paragraphEvaluationMock.evaluate).not.toHaveBeenCalled();
    });

    it('accepts a paragraph at exactly the 30-word and 100-word boundaries', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...paragraphAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      paragraphEvaluationMock.evaluate.mockResolvedValueOnce(paragraphEvaluation);

      await expect(service.submitParagraph('u1', 'a1', thirtyWordParagraph)).resolves.toBeDefined();
    });

    it('sends the word, definition, and part of speech to the evaluator', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...paragraphAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      paragraphEvaluationMock.evaluate.mockResolvedValueOnce(paragraphEvaluation);

      await service.submitParagraph('u1', 'a1', thirtyWordParagraph);

      expect(paragraphEvaluationMock.evaluate).toHaveBeenCalledWith(
        greetingWord.word,
        greetingWord.definition,
        greetingWord.partOfSpeech,
        thirtyWordParagraph,
      );
    });

    it('awards the evaluated XP via ProgressionService', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...paragraphAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      paragraphEvaluationMock.evaluate.mockResolvedValueOnce(paragraphEvaluation);

      await service.submitParagraph('u1', 'a1', thirtyWordParagraph);

      expect(progressionMock.awardXp).toHaveBeenCalledWith(
        'u1',
        1400,
        'PARAGRAPH_STAGE',
        'quests',
        'a1',
        prismaMock,
      );
    });

    it('persists the paragraph text, scores, and XP, and advances wordStage to OPTIONAL_WILD', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...paragraphAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      paragraphEvaluationMock.evaluate.mockResolvedValueOnce(paragraphEvaluation);

      await service.submitParagraph('u1', 'a1', thirtyWordParagraph);

      expect(prismaMock.questAttempt.updateMany).toHaveBeenCalledWith({
        where: { id: 'a1', wordStage: 'PARAGRAPH', status: 'IN_PROGRESS' },
        data: {
          wordStage: 'OPTIONAL_WILD',
          paragraphText: thirtyWordParagraph,
          paragraphScores: paragraphEvaluation.scores,
          paragraphEstimatedProficiency: 'B1',
          paragraphXpAwarded: 1400,
          xpAwarded: { increment: 1400 },
        },
      });
    });

    it("recomputes the player's blended rolling CEFR estimate", async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...paragraphAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      paragraphEvaluationMock.evaluate.mockResolvedValueOnce(paragraphEvaluation);

      await service.submitParagraph('u1', 'a1', thirtyWordParagraph);

      expect(progressionMock.updateUnifiedCefrEstimate).toHaveBeenCalledWith('u1', prismaMock);
    });

    it('records a CefrAssessment for the permanent CEFR evidence history', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...paragraphAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      paragraphEvaluationMock.evaluate.mockResolvedValueOnce(paragraphEvaluation);

      await service.submitParagraph('u1', 'a1', thirtyWordParagraph);

      expect(prismaMock.cefrAssessment.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          source: 'PARAGRAPH_SUBMISSION',
          level: 'B1',
          confidence: 0.9,
          dimensions: paragraphEvaluation.scores,
        },
      });
    });

    it('returns the scores, proficiency estimate, and feedback to the caller', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...paragraphAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);
      paragraphEvaluationMock.evaluate.mockResolvedValueOnce(paragraphEvaluation);

      const result = await service.submitParagraph('u1', 'a1', thirtyWordParagraph);

      expect(result).toEqual({
        scores: paragraphEvaluation.scores,
        xpAwarded: 1400,
        estimatedProficiency: 'B1',
        whatWentWell: 'Good structure.',
        whatNeedsImprovement: 'Could flow better.',
        suggestedRevision: 'A revised paragraph.',
        nextAction: 'Practice linking sentences.',
      });
    });
  });

  describe('createOptionalWildMission', () => {
    const optionalWildAttempt = {
      id: 'a1',
      userId: 'u1',
      status: 'IN_PROGRESS',
      wordStage: 'OPTIONAL_WILD',
      currentIndex: 0,
      wordIds: ['w1'],
    };

    it('throws NotFoundException when the attempt does not exist', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce(null);
      await expect(service.createOptionalWildMission('u1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the word is not at the Optional Wild stage', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
        ...optionalWildAttempt,
        wordStage: 'PARAGRAPH',
      });
      await expect(service.createOptionalWildMission('u1', 'a1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it("creates the Word in the Wild mission using THIS quest's specific word, not a freely chosen one", async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...optionalWildAttempt });
      wordInTheWildMock.createMission.mockResolvedValueOnce({
        id: 'mission1',
        wordId: 'w1',
        word: 'greeting',
        definition: greetingWord.definition,
        status: 'OPEN',
        createdAt: new Date(),
      });

      const result = await service.createOptionalWildMission('u1', 'a1');

      expect(wordInTheWildMock.createMission).toHaveBeenCalledWith('u1', 'w1');
      expect(result.word).toBe('greeting');
    });
  });

  describe('completeWord', () => {
    const optionalWildAttempt = {
      id: 'a1',
      userId: 'u1',
      questId: 'q1',
      status: 'IN_PROGRESS',
      wordStage: 'OPTIONAL_WILD',
      currentIndex: 0,
      wordIds: ['w1'],
    };

    it('throws NotFoundException when the attempt does not exist', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce(null);
      await expect(service.completeWord('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the word is not at the Optional Wild stage', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
        ...optionalWildAttempt,
        wordStage: 'PARAGRAPH',
      });
      await expect(service.completeWord('u1', 'a1')).rejects.toThrow(BadRequestException);
    });

    it('awards the quest completion XP and Glyph bonus', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...optionalWildAttempt });
      prismaMock.quest.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'q1',
        baseXp: 50,
        baseGlyphs: 10,
      });
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);

      await service.completeWord('u1', 'a1');

      expect(progressionMock.awardXp).toHaveBeenCalledWith(
        'u1',
        50,
        'QUEST_COMPLETION',
        'quests',
        'a1',
        prismaMock,
      );
      expect(progressionMock.awardGlyphs).toHaveBeenCalledWith(
        'u1',
        10,
        'QUEST_COMPLETION',
        'quests',
        'a1',
        prismaMock,
      );
    });

    it('rejects and awards nothing when a concurrent call already claimed this completion (V19 Stabilization Spec §9 race protection)', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...optionalWildAttempt });
      prismaMock.quest.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'q1',
        baseXp: 50,
        baseGlyphs: 10,
      });
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);
      prismaMock.questAttempt.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.completeWord('u1', 'a1')).rejects.toThrow(
        'This quest step was already submitted',
      );

      expect(progressionMock.awardXp).not.toHaveBeenCalled();
      expect(progressionMock.awardGlyphs).not.toHaveBeenCalled();
    });

    it('records daily activity and checks Consistency/Independent-Learning achievements', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...optionalWildAttempt });
      prismaMock.quest.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'q1',
        baseXp: 50,
        baseGlyphs: 10,
      });
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);

      await service.completeWord('u1', 'a1');

      expect(progressionMock.recordDailyActivity).toHaveBeenCalledWith('u1', prismaMock);
      expect(achievementsMock.checkConsistency).toHaveBeenCalledWith('u1', 1, prismaMock);
      expect(achievementsMock.checkIndependentLearning).toHaveBeenCalledWith('u1', prismaMock);
    });

    it('fires an ALI QUEST_COMPLETION reaction (V20 Beta Release Checklist §10: ALI must respond to Quest completion)', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...optionalWildAttempt });
      prismaMock.quest.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'q1',
        baseXp: 50,
        baseGlyphs: 10,
      });
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);
      prismaMock.word.findUnique.mockResolvedValueOnce({ word: 'greeting' });
      prismaMock.userProgression.findUnique.mockResolvedValueOnce({ journeyStage: 2 });

      await service.completeWord('u1', 'a1');

      expect(aliMock.react).toHaveBeenCalledWith('u1', {
        type: 'QUEST_COMPLETION',
        journeyStage: 2,
        context: { word: 'greeting', xpAwarded: 50, glyphAwarded: 10, currentStreak: 1 },
      });
    });

    it('marks the attempt COMPLETED with wordStage WORD_COMPLETE', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...optionalWildAttempt });
      prismaMock.quest.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'q1',
        baseXp: 50,
        baseGlyphs: 10,
      });
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);

      await service.completeWord('u1', 'a1');

      expect(prismaMock.questAttempt.updateMany).toHaveBeenCalledWith({
        where: { id: 'a1', wordStage: 'OPTIONAL_WILD', status: 'IN_PROGRESS' },
        data: {
          status: 'COMPLETED',
          wordStage: 'WORD_COMPLETE',
          completedAt: expect.any(Date),
          xpAwarded: { increment: 50 },
          glyphAwarded: { increment: 10 },
        },
      });
    });

    it('returns the completion summary', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...optionalWildAttempt });
      prismaMock.quest.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'q1',
        baseXp: 50,
        baseGlyphs: 10,
      });
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);

      const result = await service.completeWord('u1', 'a1');

      expect(result).toEqual({
        xpAwarded: 50,
        glyphAwarded: 10,
        correctCount: 1,
        totalCount: 1,
        calibrationJustCompleted: false,
        aliMessage: null,
      });
    });

    it('evaluates the skill-area mastery check using the stage scores stored on the attempt', async () => {
      const scoredAttempt = {
        ...optionalWildAttempt,
        sentenceScores: { grammar: 90 },
        paragraphScores: { grammar: 85 },
      };
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce(scoredAttempt);
      prismaMock.quest.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'q1',
        baseXp: 50,
        baseGlyphs: 10,
      });
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);

      await service.completeWord('u1', 'a1');

      expect(masteryMock.evaluateWordCycleCompletion).toHaveBeenCalledWith(
        'u1',
        'w1',
        { grammar: 90 },
        { grammar: 85 },
        prismaMock,
      );
    });

    it('passes empty objects rather than crashing when a stage score is missing', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...optionalWildAttempt }); // no *Scores fields set
      prismaMock.quest.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'q1',
        baseXp: 50,
        baseGlyphs: 10,
      });
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);

      await service.completeWord('u1', 'a1');

      expect(masteryMock.evaluateWordCycleCompletion).toHaveBeenCalledWith(
        'u1',
        'w1',
        {},
        {},
        prismaMock,
      );
    });

    it('records the Guess-stage AND Sentence/Paragraph signal onto the Learning Profile, and surfaces calibration completion', async () => {
      const now = Date.now();
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
        ...optionalWildAttempt,
        wrongAttempts: 0,
        hintsUsed: 1,
        guessStartedAt: new Date(now - 10_000),
        // Correction & Completion Spec §6 ("connect all available
        // learning signals") — these must reach the Learning Profile as
        // the same 0-100 averages Mastery computes, not get dropped.
        sentenceScores: { grammar: 80, vocabulary: 90 },
        paragraphScores: { grammar: 70, vocabulary: 60 },
      });
      prismaMock.quest.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'q1',
        baseXp: 50,
        baseGlyphs: 10,
      });
      prismaMock.challengeAttempt.count.mockResolvedValueOnce(1);
      learningProfileMock.recordWordCompletion.mockResolvedValueOnce({
        calibrationJustCompleted: true,
      });

      const result = await service.completeWord('u1', 'a1');

      expect(learningProfileMock.recordWordCompletion).toHaveBeenCalledWith(
        'u1',
        {
          cleanGuess: true,
          hintsUsed: 1,
          maxHints: gameplayRules.guessStage.maxHints,
          elapsedSeconds: expect.any(Number),
          sentenceScore: 85, // average(80, 90)
          paragraphScore: 65, // average(70, 60)
        },
        prismaMock,
      );
      expect(result.calibrationJustCompleted).toBe(true);
    });
  });

  describe('requestHint', () => {
    const openAttempt = {
      wordStage: 'GUESSING',
      id: 'a1',
      userId: 'u1',
      status: 'IN_PROGRESS',
      currentIndex: 0,
      wordIds: ['w1'],
      hintsUsed: 0,
    };

    it('throws NotFoundException when the attempt does not exist', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce(null);
      await expect(service.requestHint('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException for another user's attempt", async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
        ...openAttempt,
        userId: 'someone-else',
      });
      await expect(service.requestHint('u1', 'a1')).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException once the max (4) hints have been used', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...openAttempt, hintsUsed: 4 });
      await expect(service.requestHint('u1', 'a1')).rejects.toThrow(BadRequestException);
    });

    it('returns null and does not charge a hint when the word has no relatedWords', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...openAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce({ relatedWords: [] });

      const result = await service.requestHint('u1', 'a1');

      expect(result.hint).toBeNull();
      expect(prismaMock.questAttempt.update).not.toHaveBeenCalled();
    });

    it('returns a relatedWord and increments hintsUsed', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...openAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce({
        relatedWords: ['warmth', 'welcome'],
      });
      prismaMock.questAttempt.update.mockResolvedValueOnce({ hintsUsed: 1 });

      const result = await service.requestHint('u1', 'a1');

      expect(result.hint).toBe('warmth');
      expect(result.hintsUsed).toBe(1);
      expect(result.hintsRemaining).toBe(3);
      expect(prismaMock.questAttempt.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { hintsUsed: { increment: 1 } },
      });
    });

    it('cycles through relatedWords on repeated requests', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...openAttempt, hintsUsed: 1 });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce({
        relatedWords: ['warmth', 'welcome'],
      });
      prismaMock.questAttempt.update.mockResolvedValueOnce({ hintsUsed: 2 });

      const result = await service.requestHint('u1', 'a1');

      expect(result.hint).toBe('welcome'); // index 1 % 2 = 1
    });
  });

  describe('requestSynonym', () => {
    const openAttempt = {
      wordStage: 'GUESSING',
      id: 'a1',
      userId: 'u1',
      status: 'IN_PROGRESS',
      currentIndex: 0,
      wordIds: ['w1'],
      synonymsUsed: 0,
    };

    it('throws BadRequestException once the max (2) synonyms have been used', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...openAttempt, synonymsUsed: 2 });
      await expect(service.requestSynonym('u1', 'a1')).rejects.toThrow(BadRequestException);
    });

    it('returns null and does not charge when the word has no synonyms', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...openAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce({ synonyms: [] });

      const result = await service.requestSynonym('u1', 'a1');

      expect(result.synonym).toBeNull();
      expect(prismaMock.questAttempt.update).not.toHaveBeenCalled();
    });

    it('returns a synonym and increments synonymsUsed', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...openAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce({
        synonyms: ['salutation', 'hello'],
      });
      prismaMock.questAttempt.update.mockResolvedValueOnce({ synonymsUsed: 1 });

      const result = await service.requestSynonym('u1', 'a1');

      expect(result.synonym).toBe('salutation');
      expect(result.synonymsUsed).toBe(1);
      expect(result.synonymsRemaining).toBe(1);
    });
  });

  describe('requestLetterReveal', () => {
    const openAttempt = {
      wordStage: 'GUESSING',
      id: 'a1',
      userId: 'u1',
      status: 'IN_PROGRESS',
      currentIndex: 0,
      wordIds: ['w1'],
      currentDisplayPattern: 'G R _ _ T I N G',
      currentMissingIndexes: [2, 3],
      lettersRevealed: 0,
    };

    it('throws BadRequestException when no blanked letters remain', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({
        ...openAttempt,
        currentMissingIndexes: [],
      });
      await expect(service.requestLetterReveal('u1', 'a1')).rejects.toThrow(BadRequestException);
    });

    it('reveals the lowest remaining missing index deterministically', async () => {
      prismaMock.questAttempt.findUnique.mockResolvedValueOnce({ ...openAttempt });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce({ normalizedWord: 'greeting' });
      prismaMock.questAttempt.update.mockResolvedValueOnce({
        currentDisplayPattern: 'G R E _ T I N G',
        currentMissingIndexes: [3],
        lettersRevealed: 1,
      });

      const result = await service.requestLetterReveal('u1', 'a1');

      expect(prismaMock.questAttempt.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: {
          lettersRevealed: { increment: 1 },
          currentDisplayPattern: 'G R E _ T I N G',
          currentMissingIndexes: [3],
        },
      });
      expect(result.displayPattern).toBe('G R E _ T I N G');
      expect(result.missingIndexes).toEqual([3]);
      expect(result.lettersRevealed).toBe(1);
    });
  });
});

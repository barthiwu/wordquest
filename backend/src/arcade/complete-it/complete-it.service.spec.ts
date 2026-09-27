import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CompleteItService } from './complete-it.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ArcadeChallengeService } from '../challenge.service';
import { RewardEngineService } from '../reward-engine.service';
import { ProgressionService } from '../../progression/progression.service';

describe('CompleteItService', () => {
  let service: CompleteItService;

  const trainWord = {
    id: 'w1',
    word: 'train',
    normalizedWord: 'train',
    exampleSentence: 'I need to train every day.',
    definition: 'to practice a skill regularly',
    partOfSpeech: 'verb',
    baseDifficulty: 'BEGINNER',
  };

  const baseSession = () => ({
    id: 's1',
    userId: 'u1',
    game: 'COMPLETE_IT',
    status: 'ACTIVE',
    currentStreak: 0,
    longestStreak: 0,
    wordsTotal: 3,
    totalXpAwarded: 0,
    wordIds: ['w1', 'w2', 'w3'],
    currentIndex: 0,
    currentWordStartedAt: new Date(),
    currentWordHintsUsed: 0,
  });

  const prismaMock = {
    arcadeGameSession: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    arcadeAnswer: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(1),
    },
    word: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(trainWord),
    },
    $transaction: jest.fn((callback: (tx: any) => unknown): unknown => callback(prismaMock)),
  };

  const challengesMock = { pickChallenges: jest.fn() };
  const rewardEngineMock = { calculate: jest.fn() };
  const progressionMock = {
    awardXp: jest.fn().mockResolvedValue(undefined),
    recordDailyActivity: jest.fn().mockResolvedValue({ currentStreak: 1 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.arcadeAnswer.create.mockResolvedValue({});
    prismaMock.arcadeAnswer.count.mockResolvedValue(1);
    prismaMock.arcadeGameSession.update.mockResolvedValue({});
    prismaMock.arcadeGameSession.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.word.findUniqueOrThrow.mockResolvedValue(trainWord);
    progressionMock.awardXp.mockResolvedValue(undefined);
    progressionMock.recordDailyActivity.mockResolvedValue({ currentStreak: 1 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        CompleteItService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ArcadeChallengeService, useValue: challengesMock },
        { provide: RewardEngineService, useValue: rewardEngineMock },
        { provide: ProgressionService, useValue: progressionMock },
      ],
    }).compile();
    service = moduleRef.get(CompleteItService);
  });

  describe('start', () => {
    it('creates a fresh session when none is active', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([
        { word: { id: 'w1', word: 'train', exampleSentence: 'I need to train every day.' } },
        { word: { id: 'w2', word: 'humid', exampleSentence: 'The air felt humid today.' } },
      ]);
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce(baseSession());

      const view = await service.start('u1');

      expect(challengesMock.pickChallenges).toHaveBeenCalledWith('u1', 20, [], 3);
      expect(prismaMock.arcadeGameSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'u1', game: 'COMPLETE_IT', wordsTotal: 2 }),
      });
      expect(view.sentenceWithBlank).toBe('I need to _____ every day.');
      expect(view.definition).toBe(trainWord.definition);
      expect(view.wordIndex).toBe(0);
    });

    it('filters out words whose example sentence does not actually contain the word', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([
        { word: { id: 'w1', word: 'train', exampleSentence: 'I need to train every day.' } },
        { word: { id: 'w2', word: 'humid', exampleSentence: 'This sentence forgot its word.' } },
      ]);
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce(baseSession());

      await service.start('u1');

      expect(prismaMock.arcadeGameSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ wordsTotal: 1, wordIds: ['w1'] }),
      });
    });

    it('resumes an active session whose current-word timer has not expired', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(baseSession());

      const view = await service.start('u1');

      expect(challengesMock.pickChallenges).not.toHaveBeenCalled();
      expect(prismaMock.arcadeGameSession.create).not.toHaveBeenCalled();
      expect(view.sessionId).toBe('s1');
    });

    it('abandons a stale session (timer already expired) and starts a fresh one', async () => {
      const stale = { ...baseSession(), currentWordStartedAt: new Date(Date.now() - 120_000) };
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(stale);
      challengesMock.pickChallenges.mockResolvedValueOnce([
        { word: { id: 'w1', word: 'train', exampleSentence: 'I need to train every day.' } },
      ]);
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce(baseSession());

      await service.start('u1');

      expect(prismaMock.arcadeGameSession.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: expect.objectContaining({ status: 'ABANDONED' }),
      });
      expect(challengesMock.pickChallenges).toHaveBeenCalled();
    });

    it('throws BadRequestException when no words are available at all', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([]);

      await expect(service.start('u1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no picked word survives the blankable filter', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([
        { word: { id: 'w1', word: 'train', exampleSentence: 'This sentence forgot its word.' } },
      ]);

      await expect(service.start('u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('loadActiveSession guards (via submitAnswer)', () => {
    it('throws NotFoundException when the session does not exist', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(null);
      await expect(service.submitAnswer('u1', 'missing', 'train')).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws ForbiddenException for another player's session", async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        userId: 'someone-else',
      });
      await expect(service.submitAnswer('u1', 's1', 'train')).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException for a session that has already ended', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        status: 'COMPLETED',
      });
      await expect(service.submitAnswer('u1', 's1', 'train')).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitAnswer', () => {
    it('awards XP and extends the streak on a correct answer', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(baseSession());
      rewardEngineMock.calculate.mockReturnValueOnce({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 1,
      });

      const result = await service.submitAnswer('u1', 's1', 'train');

      expect(result.isCorrect).toBe(true);
      expect(result.xpAwarded).toBe(30);
      expect(result.currentStreak).toBe(1);
      expect(result.sessionComplete).toBe(false);
      expect(result.nextChallenge?.sentenceWithBlank).toBe('I need to _____ every day.');
      expect(rewardEngineMock.calculate).toHaveBeenCalledWith(
        expect.objectContaining({ hintsUsed: 0 }),
      );
      expect(progressionMock.awardXp).toHaveBeenCalledWith(
        'u1',
        30,
        'ARCADE_COMPLETE_IT_ANSWER',
        'arcade',
        's1:0',
        prismaMock,
      );
      expect(progressionMock.recordDailyActivity).not.toHaveBeenCalled();
    });

    it('resets the streak and awards no XP on a wrong answer', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentStreak: 4,
      });
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 1,
      });

      const result = await service.submitAnswer('u1', 's1', 'wrong-guess');

      expect(result.isCorrect).toBe(false);
      expect(result.currentStreak).toBe(0);
      expect(result.xpAwarded).toBe(0);
      expect(rewardEngineMock.calculate).not.toHaveBeenCalled();
      expect(progressionMock.awardXp).not.toHaveBeenCalled();
    });

    it('treats an answer submitted after the timer as a timeout miss, even if correct', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentWordStartedAt: new Date(Date.now() - 60_000), // 60s ago, timer is 45s
      });
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 1,
      });

      const result = await service.submitAnswer('u1', 's1', 'train');

      expect(result.isCorrect).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(progressionMock.awardXp).not.toHaveBeenCalled();
    });

    it('throws ConflictException on a duplicate/raced submission', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(baseSession());
      rewardEngineMock.calculate.mockReturnValueOnce({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });
      prismaMock.arcadeAnswer.create.mockRejectedValueOnce({ code: 'P2002' });

      await expect(service.submitAnswer('u1', 's1', 'train')).rejects.toThrow(ConflictException);
      expect(progressionMock.awardXp).not.toHaveBeenCalled();
    });

    it('completes the session on the last word and records daily activity', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 2, // last of 3 words (0-based)
      });
      rewardEngineMock.calculate.mockReturnValueOnce({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });

      const result = await service.submitAnswer('u1', 's1', 'train');

      expect(result.sessionComplete).toBe(true);
      expect(result.nextChallenge).toBeNull();
      expect(progressionMock.recordDailyActivity).toHaveBeenCalledWith('u1', prismaMock);
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });
  });
});

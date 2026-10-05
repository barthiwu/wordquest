import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MasterChallengeService } from './master-challenge.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { MasterChallengeEvaluationService } from './master-challenge-evaluation.service';
import { AliService } from '../ali/ali.service';

const LONG_PARAGRAPH = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');

describe('MasterChallengeService', () => {
  let service: MasterChallengeService;

  const prismaMock = {
    questAttempt: { findMany: jest.fn() },
    quest: { count: jest.fn() },
    dailyMasterChallenge: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      // Default: the atomic completion claim succeeds unless a specific
      // test overrides it with mockResolvedValueOnce({ count: 0 }) to
      // exercise the race-loser path.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    word: { findMany: jest.fn() },
    // Default: no native-language preference set -- the dedicated
    // localization test below overrides this per-call.
    user: { findUnique: jest.fn().mockResolvedValue({ nativeLanguage: null }) },
    $transaction: jest.fn((callback: (tx: any) => unknown): unknown => callback(prismaMock)),
  };

  const progressionMock = { awardXp: jest.fn().mockResolvedValue({}) };
  const evaluationMock = { evaluate: jest.fn() };
  const aliMock = { react: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MasterChallengeService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ProgressionService, useValue: progressionMock },
        { provide: MasterChallengeEvaluationService, useValue: evaluationMock },
        { provide: AliService, useValue: aliMock },
      ],
    }).compile();
    service = moduleRef.get(MasterChallengeService);
  });

  describe('getStatus', () => {
    it('is not eligible when fewer than all active quests are completed today', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        { questId: 'q1' },
        { questId: 'q2' },
      ]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce(null);

      const result = await service.getStatus('u1', '2026-08-14');

      expect(result.eligible).toBe(false);
      expect(result.wordsCompletedToday).toBe(2);
      expect(result.wordsRequired).toBe(3);
      expect(result.status).toBe('LOCKED');
    });

    it('is eligible once all active quests are completed, and creates an AVAILABLE record', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        { questId: 'q1' },
        { questId: 'q2' },
        { questId: 'q3' },
      ]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce(null);
      prismaMock.dailyMasterChallenge.create.mockResolvedValueOnce({ status: 'AVAILABLE' });

      const result = await service.getStatus('u1', '2026-08-14');

      expect(result.eligible).toBe(true);
      expect(result.status).toBe('AVAILABLE');
      expect(prismaMock.dailyMasterChallenge.create).toHaveBeenCalledWith({
        data: { userId: 'u1', localDate: '2026-08-14', status: 'AVAILABLE' },
      });
    });

    it('counts distinct quest IDs, not raw attempt count, so a resumed/retried quest is not double-counted', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        { questId: 'q1' },
        { questId: 'q1' },
        { questId: 'q2' },
      ]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce(null);

      const result = await service.getStatus('u1', '2026-08-14');

      expect(result.wordsCompletedToday).toBe(2);
    });

    it('promotes an existing LOCKED record to AVAILABLE once eligibility is newly met', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        { questId: 'q1' },
        { questId: 'q2' },
        { questId: 'q3' },
      ]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce({
        id: 'mc1',
        status: 'LOCKED',
      });
      prismaMock.dailyMasterChallenge.update.mockResolvedValueOnce({ status: 'AVAILABLE' });

      const result = await service.getStatus('u1', '2026-08-14');

      expect(result.status).toBe('AVAILABLE');
      expect(prismaMock.dailyMasterChallenge.update).toHaveBeenCalledWith({
        where: { id: 'mc1' },
        data: { status: 'AVAILABLE' },
      });
    });

    it('does not recreate or modify an already-COMPLETED record', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        { questId: 'q1' },
        { questId: 'q2' },
        { questId: 'q3' },
      ]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce({
        id: 'mc1',
        status: 'COMPLETED',
      });

      const result = await service.getStatus('u1', '2026-08-14');

      expect(result.status).toBe('COMPLETED');
      expect(prismaMock.dailyMasterChallenge.create).not.toHaveBeenCalled();
      expect(prismaMock.dailyMasterChallenge.update).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    const threeWordIds = ['w1', 'w2', 'w3'];
    const words = [
      { word: 'resilient', definition: 'x' },
      { word: 'gratitude', definition: 'y' },
      { word: 'perspective', definition: 'z' },
    ];
    const evaluation = {
      scores: { wordUsage: 100, coherence: 80, grammar: 90, vocabulary: 70, context: 60 },
      xpAwarded: 200,
      allWordsUsedCorrectly: true,
      whatWentWell: 'Good synthesis.',
      whatNeedsImprovement: 'Vary sentence length.',
      nextAction: 'Read more sample paragraphs.',
    };

    it('throws BadRequestException when not yet eligible, without evaluating anything', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([{ questId: 'q1' }]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce(null);

      await expect(service.submit('u1', '2026-08-14', LONG_PARAGRAPH)).rejects.toThrow(
        BadRequestException,
      );
      expect(evaluationMock.evaluate).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when already completed today', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        { questId: 'q1' },
        { questId: 'q2' },
        { questId: 'q3' },
      ]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce({
        id: 'mc1',
        status: 'COMPLETED',
      });
      prismaMock.dailyMasterChallenge.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'mc1',
        status: 'COMPLETED',
      });

      await expect(service.submit('u1', '2026-08-14', LONG_PARAGRAPH)).rejects.toThrow(
        BadRequestException,
      );
      expect(evaluationMock.evaluate).not.toHaveBeenCalled();
    });

    it("gathers today's three completed words and sends them to the evaluator", async () => {
      prismaMock.questAttempt.findMany
        .mockResolvedValueOnce([{ questId: 'q1' }, { questId: 'q2' }, { questId: 'q3' }])
        .mockResolvedValueOnce([{ wordIds: ['w1'] }, { wordIds: ['w2'] }, { wordIds: ['w3'] }]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.dailyMasterChallenge.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.word.findMany.mockResolvedValueOnce(words);
      evaluationMock.evaluate.mockResolvedValueOnce(evaluation);

      await service.submit('u1', '2026-08-14', LONG_PARAGRAPH);

      expect(prismaMock.word.findMany).toHaveBeenCalledWith({
        where: { id: { in: threeWordIds } },
        select: { word: true, definition: true },
      });
      expect(evaluationMock.evaluate).toHaveBeenCalledWith(words, LONG_PARAGRAPH, null);
    });

    it("passes the player's native language through to the evaluator", async () => {
      prismaMock.questAttempt.findMany
        .mockResolvedValueOnce([{ questId: 'q1' }, { questId: 'q2' }, { questId: 'q3' }])
        .mockResolvedValueOnce([{ wordIds: ['w1'] }, { wordIds: ['w2'] }, { wordIds: ['w3'] }]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.dailyMasterChallenge.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.word.findMany.mockResolvedValueOnce(words);
      prismaMock.user.findUnique.mockResolvedValueOnce({ nativeLanguage: 'hi' });
      evaluationMock.evaluate.mockResolvedValueOnce(evaluation);

      await service.submit('u1', '2026-08-14', LONG_PARAGRAPH);

      expect(evaluationMock.evaluate).toHaveBeenCalledWith(words, LONG_PARAGRAPH, 'hi');
    });

    it('awards XP via ProgressionService with a MASTER_CHALLENGE reason, separate from any quest', async () => {
      prismaMock.questAttempt.findMany
        .mockResolvedValueOnce([{ questId: 'q1' }, { questId: 'q2' }, { questId: 'q3' }])
        .mockResolvedValueOnce([{ wordIds: ['w1'] }, { wordIds: ['w2'] }, { wordIds: ['w3'] }]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.dailyMasterChallenge.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.word.findMany.mockResolvedValueOnce(words);
      evaluationMock.evaluate.mockResolvedValueOnce(evaluation);

      await service.submit('u1', '2026-08-14', LONG_PARAGRAPH);

      expect(progressionMock.awardXp).toHaveBeenCalledWith(
        'u1',
        200,
        'MASTER_CHALLENGE',
        'master-challenge',
        'mc1',
        prismaMock,
        [],
      );
    });

    it('marks the record COMPLETED with the paragraph, scores, and XP', async () => {
      prismaMock.questAttempt.findMany
        .mockResolvedValueOnce([{ questId: 'q1' }, { questId: 'q2' }, { questId: 'q3' }])
        .mockResolvedValueOnce([{ wordIds: ['w1'] }, { wordIds: ['w2'] }, { wordIds: ['w3'] }]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.dailyMasterChallenge.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.word.findMany.mockResolvedValueOnce(words);
      evaluationMock.evaluate.mockResolvedValueOnce(evaluation);

      await service.submit('u1', '2026-08-14', LONG_PARAGRAPH);

      expect(prismaMock.dailyMasterChallenge.updateMany).toHaveBeenCalledWith({
        where: { id: 'mc1', status: { not: 'COMPLETED' } },
        data: {
          status: 'COMPLETED',
          paragraphText: LONG_PARAGRAPH,
          scores: evaluation.scores,
          xpAwarded: 200,
          completedAt: expect.any(Date),
        },
      });
    });

    it('rejects and awards nothing when a concurrent call already claimed completion (V19 Stabilization Spec §9 race protection)', async () => {
      prismaMock.questAttempt.findMany
        .mockResolvedValueOnce([{ questId: 'q1' }, { questId: 'q2' }, { questId: 'q3' }])
        .mockResolvedValueOnce([{ wordIds: ['w1'] }, { wordIds: ['w2'] }, { wordIds: ['w3'] }]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.dailyMasterChallenge.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.word.findMany.mockResolvedValueOnce(words);
      evaluationMock.evaluate.mockResolvedValueOnce(evaluation);
      prismaMock.dailyMasterChallenge.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.submit('u1', '2026-08-14', LONG_PARAGRAPH)).rejects.toThrow(
        "Today's Master Challenge has already been completed.",
      );

      expect(progressionMock.awardXp).not.toHaveBeenCalled();
    });

    it('returns the scores, word-usage flag, and feedback', async () => {
      prismaMock.questAttempt.findMany
        .mockResolvedValueOnce([{ questId: 'q1' }, { questId: 'q2' }, { questId: 'q3' }])
        .mockResolvedValueOnce([{ wordIds: ['w1'] }, { wordIds: ['w2'] }, { wordIds: ['w3'] }]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.dailyMasterChallenge.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.word.findMany.mockResolvedValueOnce(words);
      evaluationMock.evaluate.mockResolvedValueOnce(evaluation);

      const result = await service.submit('u1', '2026-08-14', LONG_PARAGRAPH);

      expect(result).toEqual({
        scores: evaluation.scores,
        xpAwarded: 200,
        allWordsUsedCorrectly: true,
        whatWentWell: 'Good synthesis.',
        whatNeedsImprovement: 'Vary sentence length.',
        nextAction: 'Read more sample paragraphs.',
        deferredAliReactions: [],
      });
    });

    it("resolves any LEVEL_UP/JOURNEY reaction this challenge's own XP award triggers (task #99 follow-up)", async () => {
      prismaMock.questAttempt.findMany
        .mockResolvedValueOnce([{ questId: 'q1' }, { questId: 'q2' }, { questId: 'q3' }])
        .mockResolvedValueOnce([{ wordIds: ['w1'] }]);
      prismaMock.quest.count.mockResolvedValueOnce(3);
      prismaMock.dailyMasterChallenge.findUnique.mockResolvedValueOnce(null);
      prismaMock.dailyMasterChallenge.create.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.dailyMasterChallenge.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'mc1',
        status: 'AVAILABLE',
      });
      prismaMock.word.findMany.mockResolvedValueOnce([{ word: 'resilient', definition: 'x' }]);
      prismaMock.dailyMasterChallenge.updateMany.mockResolvedValueOnce({ count: 1 });
      const evaluation = {
        scores: { grammar: 90, vocabulary: 90, context: 60, naturalness: 80, coherence: 80 },
        xpAwarded: 200,
        allWordsUsedCorrectly: true,
        whatWentWell: 'Good synthesis.',
        whatNeedsImprovement: 'Vary sentence length.',
        nextAction: 'Read more sample paragraphs.',
      };
      evaluationMock.evaluate.mockResolvedValueOnce(evaluation);
      progressionMock.awardXp.mockImplementationOnce(
        async (
          _userId: string,
          _amount: number,
          _reason: string,
          _source: string,
          _reference: string,
          _db: unknown,
          aliEvents?: Array<{ type: string }>,
        ) => {
          aliEvents?.push({ type: 'LEVEL_UP', journeyStage: 3, context: { newLevel: 9 } } as never);
        },
      );
      aliMock.react.mockResolvedValueOnce({
        text: 'Level 9!',
        recommendation: null,
        tone: 'Village',
        promptVersion: 'v2',
        expression: 'EXCITED',
        pose: 'CELEBRATORY_HOP',
        intensity: 4,
        priority: 4,
        durationMs: 3000,
      });

      const result = await service.submit('u1', '2026-08-14', LONG_PARAGRAPH);

      expect(result.deferredAliReactions).toEqual([
        {
          text: 'Level 9!',
          recommendation: null,
          expression: 'EXCITED',
          pose: 'CELEBRATORY_HOP',
          intensity: 4,
          priority: 4,
          durationMs: 3000,
        },
      ]);
    });
  });
  describe('paragraph bounds', () => {
    it('rejects a paragraph under 30 words before any lookups or AI call', async () => {
      await expect(service.submit('u1', '2026-08-14', 'too short')).rejects.toThrow(/30-150 words/);
    });
  });
});

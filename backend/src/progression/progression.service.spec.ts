import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { ProgressionService } from './progression.service';
import { PrismaService } from '../prisma/prisma.service';
import { AliService } from '../ali/ali.service';
import { NotificationService } from '../notifications/notification.service';
import { QuestCardService } from '../quest-card/quest-card.service';

describe('ProgressionService — streak logic', () => {
  let service: ProgressionService;

  const prismaMock = {
    userProgression: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    xpTransaction: { create: jest.fn().mockResolvedValue({}) },
    glyphTransaction: { create: jest.fn().mockResolvedValue({}) },
  };

  const questCardsMock = { createCard: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default so checkCefrEligibility (called internally by
    // recordDailyActivity / checkJourneyAdvancement) has something safe
    // to read — none of these conditions are met, so it's a no-op
    // unless a specific test overrides this.
    prismaMock.userProgression.findUniqueOrThrow.mockResolvedValue({
      cefrUnlocked: false,
      journeyStage: 0,
      masteredWordsCount: 0,
      currentStreak: 0,
      bossBattlesCompleted: 0,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProgressionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AliService, useValue: { reactFireAndForget: jest.fn() } },
        { provide: NotificationService, useValue: { notifyFireAndForget: jest.fn() } },
        { provide: QuestCardService, useValue: questCardsMock },
      ],
    }).compile();
    service = moduleRef.get(ProgressionService);
  });

  it('starts the streak at 1 for a brand-new player (no prior activity)', async () => {
    prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
      currentStreak: 0,
      longestStreak: 0,
      lastActiveOn: null,
    });
    await service.recordDailyActivity('u1');
    expect(prismaMock.userProgression.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStreak: 1, longestStreak: 1 }),
      }),
    );
  });

  it('increments the streak when the last activity was exactly yesterday (UTC)', async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
      currentStreak: 4,
      longestStreak: 6,
      lastActiveOn: yesterday,
    });
    await service.recordDailyActivity('u1');
    expect(prismaMock.userProgression.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStreak: 5, longestStreak: 6 }),
      }),
    );
  });

  it('resets the streak to 1 after a gap of more than one day', async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
      currentStreak: 10,
      longestStreak: 10,
      lastActiveOn: threeDaysAgo,
    });
    await service.recordDailyActivity('u1');
    expect(prismaMock.userProgression.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStreak: 1, longestStreak: 10 }),
      }),
    );
  });

  it('is a no-op if activity was already recorded today (no double counting)', async () => {
    prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
      currentStreak: 3,
      longestStreak: 3,
      lastActiveOn: new Date(),
    });
    await service.recordDailyActivity('u1');
    expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
  });

  it('awardXp is a no-op for a zero or negative amount (no ledger row, no update)', async () => {
    await service.awardXp('u1', 0, 'TEST', 'test');
    await service.awardXp('u1', -5, 'TEST', 'test');
    expect(prismaMock.xpTransaction.create).not.toHaveBeenCalled();
    expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
  });
});

describe('ProgressionService — level-up and Journey advancement', () => {
  let service: ProgressionService;

  const prismaMock = {
    userProgression: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    questAttempt: { findMany: jest.fn() },
    cefrAssessment: { create: jest.fn().mockResolvedValue({}) },
    xpTransaction: { create: jest.fn().mockResolvedValue({}) },
    glyphTransaction: { create: jest.fn().mockResolvedValue({}) },
  };

  const questCardsMock = { createCard: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default so checkCefrEligibility (called internally by
    // recordDailyActivity / checkJourneyAdvancement) has something safe
    // to read — none of these conditions are met, so it's a no-op
    // unless a specific test overrides this.
    prismaMock.userProgression.findUniqueOrThrow.mockResolvedValue({
      cefrUnlocked: false,
      journeyStage: 0,
      masteredWordsCount: 0,
      currentStreak: 0,
      bossBattlesCompleted: 0,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProgressionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AliService, useValue: { reactFireAndForget: jest.fn() } },
        { provide: NotificationService, useValue: { notifyFireAndForget: jest.fn() } },
        { provide: QuestCardService, useValue: questCardsMock },
      ],
    }).compile();
    service = moduleRef.get(ProgressionService);
  });

  it('does nothing extra when an XP award does not cross a level boundary', async () => {
    prismaMock.userProgression.update.mockResolvedValueOnce({
      totalXp: 100,
      level: 1,
      journeyStage: 0,
      masteredWordsCount: 0,
    }); // still level 1 at 100 XP (threshold for level 2 is 6160)

    await service.awardXp('u1', 50, 'QUEST_ANSWER', 'quests');

    expect(prismaMock.userProgression.update).toHaveBeenCalledTimes(1); // only the totalXp increment — no level/glyph/journey writes
  });

  it('grants the correct Glyph tier reward on a single level-up', async () => {
    prismaMock.userProgression.update
      .mockResolvedValueOnce({ totalXp: 6160, level: 1, journeyStage: 0, masteredWordsCount: 0 }) // totalXp increment result -> newLevel becomes 2
      .mockResolvedValueOnce({}) // level write
      .mockResolvedValueOnce({}); // glyphBalance increment inside awardGlyphs

    await service.awardXp('u1', 6160, 'QUEST_ANSWER', 'quests');

    expect(prismaMock.userProgression.update).toHaveBeenNthCalledWith(2, {
      where: { userId: 'u1' },
      data: { level: 2 },
    });
    expect(prismaMock.glyphTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 2, reason: 'LEVEL_UP' }) }),
    );
  });

  it('sums Glyph rewards across every level crossed when one award jumps several levels', async () => {
    // Levels 2 and 3 both fall in the 2-10 tier (2 Glyphs each) -> 4 total.
    prismaMock.userProgression.update
      .mockResolvedValueOnce({ totalXp: 12459, level: 1, journeyStage: 0, masteredWordsCount: 0 }) // jumps straight to level 3
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await service.awardXp('u1', 12459, 'QUEST_ANSWER', 'quests');

    expect(prismaMock.glyphTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 4, reason: 'LEVEL_UP' }) }),
    );
  });

  describe('LEVEL_UP/JOURNEY_COMPLETION ledger idempotency (V21 §10 duplicate reward prevention)', () => {
    // Mirrors what Postgres actually raises for the partial unique index
    // on (userId, reason, reference) — isUniqueConstraintError checks
    // structurally for err.code === 'P2002', not any particular class.
    const uniqueConstraintError = Object.assign(new Error('duplicate'), { code: 'P2002' });

    it('awardXp treats a unique-constraint error from xpTransaction.create as an idempotent no-op, not a throw', async () => {
      prismaMock.xpTransaction.create.mockRejectedValueOnce(uniqueConstraintError);

      await expect(
        service.awardXp('u1', 300, 'JOURNEY_COMPLETION', 'progression'),
      ).resolves.toBeUndefined();

      // Never reaches the totalXp increment (or anything past it) — a
      // retried/racing grant for the exact same reason+reference is a
      // clean early return, not a second, partial award.
      expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
    });

    it('awardXp still throws a non-unique-constraint error from xpTransaction.create', async () => {
      const otherError = new Error('connection reset');
      prismaMock.xpTransaction.create.mockRejectedValueOnce(otherError);

      await expect(service.awardXp('u1', 300, 'JOURNEY_COMPLETION', 'progression')).rejects.toThrow(
        'connection reset',
      );
    });

    it('awardGlyphs treats a unique-constraint error from glyphTransaction.create as an idempotent no-op, not a throw', async () => {
      prismaMock.glyphTransaction.create.mockRejectedValueOnce(uniqueConstraintError);

      await expect(
        service.awardGlyphs('u1', 5, 'JOURNEY_COMPLETION', 'progression'),
      ).resolves.toBeUndefined();

      expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
    });

    it('awardGlyphs still throws a non-unique-constraint error from glyphTransaction.create', async () => {
      const otherError = new Error('connection reset');
      prismaMock.glyphTransaction.create.mockRejectedValueOnce(otherError);

      await expect(
        service.awardGlyphs('u1', 5, 'JOURNEY_COMPLETION', 'progression'),
      ).rejects.toThrow('connection reset');
    });
  });

  describe('checkJourneyAdvancement', () => {
    it('does nothing when the computed stage is not higher than the current one', async () => {
      await service.checkJourneyAdvancement('u1', 3, 0, 0, prismaMock as any);
      expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
    });

    it('advances the stage and grants the journey completion reward when both gates clear', async () => {
      prismaMock.userProgression.update
        .mockResolvedValueOnce({}) // journeyStage write
        .mockResolvedValueOnce({}) // glyphBalance increment (5 Glyphs)
        .mockResolvedValueOnce({ totalXp: 300, level: 6, journeyStage: 1, masteredWordsCount: 50 }); // totalXp increment (300 XP) inside the nested awardXp call

      // Hamlet: level >= 6 AND masteredWords >= 50.
      await service.checkJourneyAdvancement('u1', 6, 0, 50, prismaMock as any);

      expect(prismaMock.userProgression.update).toHaveBeenNthCalledWith(1, {
        where: { userId: 'u1' },
        data: { journeyStage: 1 },
      });
      expect(prismaMock.glyphTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 5, reason: 'JOURNEY_COMPLETION' }),
        }),
      );
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 300, reason: 'JOURNEY_COMPLETION' }),
        }),
      );
    });

    it('requires BOTH level and mastered words — clearing only one gate advances nothing', async () => {
      await service.checkJourneyAdvancement('u1', 6, 0, 0, prismaMock as any); // level cleared, words not
      await service.checkJourneyAdvancement('u1', 1, 0, 50, prismaMock as any); // words cleared, level not
      expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
    });

    it('scales the reward by how many stages were crossed in one jump', async () => {
      prismaMock.userProgression.update
        .mockResolvedValueOnce({}) // journeyStage write
        .mockResolvedValueOnce({}) // glyphBalance increment
        .mockResolvedValueOnce({
          totalXp: 600,
          level: 25,
          journeyStage: 3,
          masteredWordsCount: 200,
        }); // nested awardXp's totalXp increment

      // Jumping straight to Mountain (stage 3) from Forest (stage 0) — 3 stages crossed.
      await service.checkJourneyAdvancement('u1', 25, 0, 200, prismaMock as any);

      expect(prismaMock.glyphTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amount: 15 }) }), // 5 * 3 stages
      );
      expect(prismaMock.xpTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amount: 900 }) }), // 300 * 3 stages
      );
    });

    it('issues one Quest Card per stage actually crossed, not just the final one', async () => {
      prismaMock.userProgression.update
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          totalXp: 600,
          level: 25,
          journeyStage: 3,
          masteredWordsCount: 200,
        });

      // Forest (0) -> Hamlet (1) -> Village (2) -> Mountain (3): 3 stages crossed.
      await service.checkJourneyAdvancement('u1', 25, 0, 200, prismaMock as any);

      expect(questCardsMock.createCard).toHaveBeenCalledTimes(3);
      expect(questCardsMock.createCard).toHaveBeenNthCalledWith(
        1,
        'u1',
        'JOURNEY_COMPLETION',
        'hamlet',
        'Reached Hamlet',
        undefined,
        prismaMock,
        expect.objectContaining({ journeyStageKey: 'hamlet' }),
      );
      expect(questCardsMock.createCard).toHaveBeenNthCalledWith(
        3,
        'u1',
        'JOURNEY_COMPLETION',
        'mountain',
        'Reached Mountain',
        undefined,
        prismaMock,
        expect.objectContaining({ journeyStageKey: 'mountain', rarity: 'RARE' }),
      );
    });
  });

  describe('checkCefrEligibility', () => {
    const cityStageOrAbove = 5; // JOURNEY_STAGES[5] = 'city'

    it('does nothing when already unlocked (idempotent)', async () => {
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        cefrUnlocked: true,
        journeyStage: cityStageOrAbove,
        masteredWordsCount: 100,
        currentStreak: 15,
        bossBattlesCompleted: 4,
      });

      await service.checkCefrEligibility('u1', prismaMock as any);

      expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
    });

    it('unlocks when all four conditions are exactly met', async () => {
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        cefrUnlocked: false,
        journeyStage: cityStageOrAbove,
        masteredWordsCount: 100,
        currentStreak: 15,
        bossBattlesCompleted: 4,
      });

      await service.checkCefrEligibility('u1', prismaMock as any);

      expect(prismaMock.userProgression.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { cefrUnlocked: true, cefrUnlockedAt: expect.any(Date) },
      });
    });

    it.each([
      [
        'journeyStage below City',
        { journeyStage: 4, masteredWordsCount: 100, currentStreak: 15, bossBattlesCompleted: 4 },
      ],
      [
        'masteredWordsCount below 100',
        {
          journeyStage: cityStageOrAbove,
          masteredWordsCount: 99,
          currentStreak: 15,
          bossBattlesCompleted: 4,
        },
      ],
      [
        'currentStreak below 15',
        {
          journeyStage: cityStageOrAbove,
          masteredWordsCount: 100,
          currentStreak: 14,
          bossBattlesCompleted: 4,
        },
      ],
      [
        'bossBattlesCompleted below 4',
        {
          journeyStage: cityStageOrAbove,
          masteredWordsCount: 100,
          currentStreak: 15,
          bossBattlesCompleted: 3,
        },
      ],
    ])('does not unlock when only %s', async (_label, progression) => {
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        cefrUnlocked: false,
        ...progression,
      });

      await service.checkCefrEligibility('u1', prismaMock as any);

      expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
    });

    it('unlocks with room to spare above every threshold, not just exactly at them', async () => {
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        cefrUnlocked: false,
        journeyStage: 8, // Legend — well past City
        masteredWordsCount: 500,
        currentStreak: 40,
        bossBattlesCompleted: 10,
      });

      await service.checkCefrEligibility('u1', prismaMock as any);

      expect(prismaMock.userProgression.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cefrUnlocked: true }) }),
      );
    });
  });

  describe('updateUnifiedCefrEstimate (V20 Beta Release Checklist §8: final CEFR formula)', () => {
    it('does nothing when there is no Sentence/Paragraph submission history yet', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([]);

      await service.updateUnifiedCefrEstimate('u1', prismaMock as any);

      expect(prismaMock.userProgression.update).not.toHaveBeenCalled();
      expect(prismaMock.cefrAssessment.create).not.toHaveBeenCalled();
    });

    it('queries recent Sentence-or-Paragraph submissions, most recent first, capped at 5', async () => {
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        {
          sentenceScores: null,
          paragraphScores: { grammar: 80, vocabulary: 80, structure: 80, flow: 80, context: 80 },
        },
      ]);

      await service.updateUnifiedCefrEstimate('u1', prismaMock as any);

      expect(prismaMock.questAttempt.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          OR: [
            { sentenceScores: { not: Prisma.JsonNull } },
            { paragraphScores: { not: Prisma.JsonNull } },
          ],
        },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: { sentenceScores: true, paragraphScores: true },
      });
    });

    it('blends Vocabulary growth with Sentence/Paragraph/Grammar/Contextual-usage evidence into one ordinal-scale estimate', async () => {
      // masteredWordsCount 100 -> vocabularyGrowthOrdinal 4 (C1 band floor).
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        masteredWordsCount: 100,
      });
      // A single Paragraph submission scoring 80 across the board -> paragraphQuality 80,
      // grammar 80, contextualUsage 80 (no Sentence evidence this round) -> ordinal 4 each.
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        {
          sentenceScores: null,
          paragraphScores: { grammar: 80, vocabulary: 80, structure: 80, flow: 80, context: 80 },
        },
      ]);

      await service.updateUnifiedCefrEstimate('u1', prismaMock as any);

      // All four available components agree at ordinal 4 -> weighted average 4 -> 'C1'.
      expect(prismaMock.userProgression.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: {
          estimatedCefrLevel: 'C1',
          estimatedCefrConfidence: expect.closeTo(0.68, 2),
        },
      });
      expect(prismaMock.cefrAssessment.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          source: 'UNIFIED_ASSESSMENT',
          level: 'C1',
          confidence: expect.closeTo(0.68, 2),
          dimensions: {
            vocabularyGrowthOrdinal: 4,
            sentenceQuality: null,
            paragraphQuality: 80,
            grammar: 80,
            contextualUsage: 80,
          },
        },
      });
    });

    it('omits a component with no evidence yet instead of defaulting it to 0', async () => {
      // No Sentence evidence at all this round -> sentenceQuality/writingAbility must still be
      // computed from Paragraph alone, not dragged toward A1 by a missing Sentence score.
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ masteredWordsCount: 0 });
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        {
          sentenceScores: null,
          paragraphScores: {
            grammar: 100,
            vocabulary: 100,
            structure: 100,
            flow: 100,
            context: 100,
          },
        },
      ]);

      await service.updateUnifiedCefrEstimate('u1', prismaMock as any);

      const call = prismaMock.cefrAssessment.create.mock.calls[0][0];
      expect(call.data.dimensions.sentenceQuality).toBeNull();
      expect(call.data.dimensions.paragraphQuality).toBe(100);
    });

    it('averages Sentence and Paragraph evidence together across multiple submissions', async () => {
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ masteredWordsCount: 0 });
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        {
          sentenceScores: {
            grammar: 60,
            vocabulary: 60,
            context: 60,
            naturalness: 60,
            clarity: 60,
          },
          paragraphScores: null,
        },
        {
          sentenceScores: null,
          paragraphScores: { grammar: 40, vocabulary: 40, structure: 40, flow: 40, context: 40 },
        },
      ]);

      await service.updateUnifiedCefrEstimate('u1', prismaMock as any);

      const call = prismaMock.cefrAssessment.create.mock.calls[0][0];
      expect(call.data.dimensions.sentenceQuality).toBe(60);
      expect(call.data.dimensions.paragraphQuality).toBe(40);
      // Grammar and Contextual usage are each averaged across both submissions independently:
      // grammar (60 + 40) / 2 = 50, contextualUsage (60 + 40) / 2 = 50.
      expect(call.data.dimensions.grammar).toBe(50);
      expect(call.data.dimensions.contextualUsage).toBe(50);
    });

    it('tracks Grammar and Contextual usage as independent components (V20 §8), not blended together', async () => {
      // A player strong on grammar but weak on contextual usage should show that gap in the
      // stored dimensions rather than being averaged into one indistinguishable "grammarContext"
      // number, which is what the pre-V20 formula did.
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ masteredWordsCount: 0 });
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        {
          sentenceScores: null,
          paragraphScores: { grammar: 90, vocabulary: 50, structure: 50, flow: 50, context: 20 },
        },
      ]);

      await service.updateUnifiedCefrEstimate('u1', prismaMock as any);

      const call = prismaMock.cefrAssessment.create.mock.calls[0][0];
      expect(call.data.dimensions.grammar).toBe(90);
      expect(call.data.dimensions.contextualUsage).toBe(20);
    });
  });
});

describe('ProgressionService — spendGlyphs (Correction & Completion Spec §6: atomic spend)', () => {
  let service: ProgressionService;

  const prismaMock = {
    userProgression: { updateMany: jest.fn() },
    glyphTransaction: { create: jest.fn().mockResolvedValue({}) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProgressionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AliService, useValue: { reactFireAndForget: jest.fn() } },
        { provide: NotificationService, useValue: { notifyFireAndForget: jest.fn() } },
        { provide: QuestCardService, useValue: { createCard: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ProgressionService);
  });

  it('is a no-op for a zero or negative amount', async () => {
    await service.spendGlyphs('u1', 0, 'TEST', 'test');
    await service.spendGlyphs('u1', -5, 'TEST', 'test');
    expect(prismaMock.userProgression.updateMany).not.toHaveBeenCalled();
  });

  it('decrements via a single conditional updateMany — balance check and write are the same statement', async () => {
    prismaMock.userProgression.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.spendGlyphs('u1', 30, 'SHOP_PURCHASE', 'shop', 'item-1');

    expect(prismaMock.userProgression.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', glyphBalance: { gte: 30 } },
      data: { glyphBalance: { decrement: 30 } },
    });
  });

  it('records a DEBIT ledger row only after the decrement actually matched a row', async () => {
    prismaMock.userProgression.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.spendGlyphs('u1', 30, 'SHOP_PURCHASE', 'shop', 'item-1');

    expect(prismaMock.glyphTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        amount: 30,
        direction: 'DEBIT',
        reason: 'SHOP_PURCHASE',
        source: 'shop',
        reference: 'item-1',
      },
    });
  });

  it('throws and records no ledger row when the conditional updateMany matches nothing (insufficient balance, or a concurrent spend won the race)', async () => {
    prismaMock.userProgression.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.spendGlyphs('u1', 30, 'SHOP_PURCHASE', 'shop')).rejects.toThrow(
      'Insufficient Glyph balance',
    );
    expect(prismaMock.glyphTransaction.create).not.toHaveBeenCalled();
  });
});

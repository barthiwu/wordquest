import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BossBattleService } from './boss-battle.service';
import { PrismaService } from '../prisma/prisma.service';
import { WordsService } from '../vocabulary/words.service';
import { MasteryService } from '../mastery/mastery.service';
import { ProgressionService } from '../progression/progression.service';
import { AchievementService } from '../achievement/achievement.service';
import { AliService } from '../ali/ali.service';
import { NotificationService } from '../notifications/notification.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { QuestCardService } from '../quest-card/quest-card.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { gameplayRules, bossBattleRewardForRank } from '../config/gameplay-rules';

function utc(y: number, m: number, d: number, h = 0, min = 0, s = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min, s));
}

describe('BossBattleService', () => {
  let service: BossBattleService;

  const prismaMock = {
    bossBattle: { findUnique: jest.fn(), create: jest.fn() },
    bossBattleGroup: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      // Default: every atomic claim (group-slot join, finalization status
      // claim) succeeds unless a specific test overrides it with
      // mockResolvedValueOnce({ count: 0 }) to exercise the race/retry path.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    bossBattlePlayer: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      // Default: the submitAnswer CAS claim succeeds unless a specific
      // test overrides it with mockResolvedValueOnce({ count: 0 }) to
      // exercise the duplicate-submission rejection path.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    bossBattleEvent: { create: jest.fn().mockResolvedValue({}) },
    userProgression: { findUniqueOrThrow: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    word: { findUniqueOrThrow: jest.fn() },
    // Defaults every player to the UK-fallback (no preference recorded) so
    // every existing test in this file keeps exercising the pre-variant
    // behavior unchanged; the dedicated describe block below overrides
    // this per test to exercise the US/UK-specific paths.
    user: { findUnique: jest.fn().mockResolvedValue({ englishVariant: null }) },
    // findOrCreateOpenGroup queries the triggering user's own in-progress
    // quest attempts for excludeWordIds (V21 §3) — empty by default so
    // pickWordsForQuest gets called with excludeWordIds: [] unless a test
    // overrides it.
    questAttempt: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (tx: any) => unknown): unknown => callback(prismaMock)),
  };

  const wordsMock = { pickWordsForQuest: jest.fn() };
  const masteryMock = {
    recordAnswer: jest.fn().mockResolvedValue({ level: 'RECOGNIZING' }),
    getLevel: jest.fn().mockResolvedValue('NEW'),
  };
  const progressionMock = {
    awardXp: jest.fn().mockResolvedValue({}),
    awardGlyphs: jest.fn().mockResolvedValue({}),
    checkCefrEligibility: jest.fn().mockResolvedValue(undefined),
  };
  const achievementsMock = { checkCompetition: jest.fn().mockResolvedValue(undefined) };
  const aliMock = { reactFireAndForget: jest.fn() };
  const notificationsMock = { notifyFireAndForget: jest.fn() };
  const idempotencyMock = {
    checkCache: jest.fn(),
    recordInTransaction: jest.fn().mockResolvedValue(undefined),
  };
  const questCardsMock = { createCard: jest.fn().mockResolvedValue(undefined) };
  const analyticsMock = { track: jest.fn() };

  const greetingWord = {
    id: 'w1',
    word: 'resilient',
    normalizedWord: 'resilient',
    length: 9,
    definition: 'able to recover quickly',
    partOfSpeech: 'adjective',
    exampleSentence: 'She was resilient after the setback.',
    baseDifficulty: 'INTERMEDIATE',
  };

  // 'Colour'/'Color' differ both in spelling and in letter count (6 vs
  // 5) so a wrong-variant render is impossible to miss in an assertion.
  const colourBattleWord = {
    id: 'w-colour',
    word: 'Colour',
    normalizedWord: 'colour',
    length: 6,
    definition: 'a property of light',
    partOfSpeech: 'noun',
    exampleSentence: 'The colour was striking.',
    baseDifficulty: 'BEGINNER',
    wordUS: 'Color',
    normalizedWordUS: 'color',
    exampleSentenceUS: 'The color was striking.',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BossBattleService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: WordsService, useValue: wordsMock },
        { provide: MasteryService, useValue: masteryMock },
        { provide: ProgressionService, useValue: progressionMock },
        { provide: AchievementService, useValue: achievementsMock },
        { provide: AliService, useValue: aliMock },
        { provide: NotificationService, useValue: notificationsMock },
        { provide: IdempotencyService, useValue: idempotencyMock },
        { provide: QuestCardService, useValue: questCardsMock },
        { provide: AnalyticsService, useValue: analyticsMock },
      ],
    }).compile();
    service = moduleRef.get(BossBattleService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('joinBattle', () => {
    const battle = {
      id: 'b1',
      weekId: '2026-W33',
      scheduledStartUtc: utc(2026, 8, 16, 17),
      scheduledEndUtc: utc(2026, 8, 16, 18),
    };

    it('throws BadRequestException before the battle has started', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 10));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);

      await expect(service.joinBattle('u1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException after the battle has ended', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 19));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(null);
      prismaMock.bossBattle.create.mockResolvedValueOnce({
        id: 'b2',
        weekId: '2026-W34',
        scheduledStartUtc: utc(2026, 8, 23, 17),
        scheduledEndUtc: utc(2026, 8, 23, 18),
      });

      // "now" (Aug 16 19:00) is after this week's battle ended, so the
      // service correctly finds/creates NEXT week's (not-yet-started)
      // battle — still SCHEDULED, so still rejected, just for the other reason.
      await expect(service.joinBattle('u1')).rejects.toThrow(BadRequestException);
    });

    it("throws ForbiddenException when the player's level is below the eligibility floor", async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({
        level: gameplayRules.bossBattle.minLevelToJoin - 1,
      });

      await expect(service.joinBattle('u1')).rejects.toThrow(ForbiddenException);
    });

    it('resumes an existing player instead of creating a duplicate', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ level: 10 });
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        id: 'p1',
        userId: 'u1',
        groupId: 'g1',
        questionIndex: 0,
        currentWordId: 'w1',
        currentDisplayPattern: 'R _ S I L I E N T',
        currentMissingIndexes: [1],
        joinedAt: utc(2026, 8, 16, 17, 30),
        group: { id: 'g1', sharedWordIds: ['w1', 'w2'] },
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      const view = await service.joinBattle('u1');

      expect(prismaMock.bossBattlePlayer.create).not.toHaveBeenCalled();
      expect(view.displayPattern).toBe('R _ S I L I E N T');
    });

    it("returns the ended shape directly, without touching word or mastery lookups, when a resumed player's own 30-minute window has already elapsed", async () => {
      // Battle is still LIVE for the group (17:00-18:00, "now" 17:35), but
      // this player joined at 17:00 so their own window closed at 17:30.
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 35));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ level: 10 });
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        id: 'p1',
        userId: 'u1',
        groupId: 'g1',
        questionIndex: 5,
        currentWordId: 'w1',
        currentDisplayPattern: 'R _ S I L I E N T',
        currentMissingIndexes: [1],
        joinedAt: utc(2026, 8, 16, 17, 0),
        group: { id: 'g1', sharedWordIds: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] },
      });

      const view = await service.joinBattle('u1');

      expect(view).toEqual({
        groupId: 'g1',
        battleEndsAt: utc(2026, 8, 16, 17, 30).toISOString(),
        battleEnded: true,
        questionsAnswered: 5,
        maxQuestions: 6,
        displayPattern: '',
        missingIndexes: [],
        wordLength: 0,
        definition: '',
        partOfSpeech: '',
      });
      // The stale in-flight challenge is cleared directly...
      expect(prismaMock.bossBattlePlayer.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { currentWordId: null, currentDisplayPattern: null, currentMissingIndexes: [] },
      });
      // ...and nothing about word content or mastery is ever looked up for
      // an already-ended player.
      expect(prismaMock.word.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(masteryMock.getLevel).not.toHaveBeenCalled();
    });

    it("returns the ended shape directly when a resumed player has already exhausted the group's shared word sequence, even though their personal window has not elapsed", async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 10));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ level: 10 });
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        id: 'p1',
        userId: 'u1',
        groupId: 'g1',
        questionIndex: 2,
        currentWordId: null,
        currentDisplayPattern: null,
        currentMissingIndexes: [],
        joinedAt: utc(2026, 8, 16, 17, 5), // 5 minutes ago -- personal window nowhere near up
        group: { id: 'g1', sharedWordIds: ['w1', 'w2'] }, // questionIndex 2 >= length 2 -> exhausted
      });

      const view = await service.joinBattle('u1');

      expect(view.battleEnded).toBe(true);
      expect(view.questionsAnswered).toBe(2);
      expect(view.maxQuestions).toBe(2);
      // No currentWordId was set on this row, so there's nothing to clear.
      expect(prismaMock.bossBattlePlayer.update).not.toHaveBeenCalled();
      expect(prismaMock.word.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(masteryMock.getLevel).not.toHaveBeenCalled();
    });

    it('joins an existing open group rather than always creating a new one', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ level: 10 });
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(null);
      prismaMock.bossBattleGroup.findFirst.mockResolvedValueOnce({
        id: 'g1',
        groupNumber: 1,
        status: 'LIVE',
        playerCount: 5,
        sharedWordIds: ['w1', 'w2'],
      });
      prismaMock.bossBattlePlayer.create.mockResolvedValueOnce({
        id: 'p2',
        userId: 'u1',
        groupId: 'g1',
        questionIndex: 0,
        currentWordId: null,
        currentDisplayPattern: null,
        currentMissingIndexes: [],
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      await service.joinBattle('u1');

      expect(prismaMock.bossBattleGroup.create).not.toHaveBeenCalled();
      // An already-existing group's shared sequence is reused — no fresh
      // pickWordsForQuest call for a player joining an OPEN group.
      expect(wordsMock.pickWordsForQuest).not.toHaveBeenCalled();
      expect(prismaMock.bossBattlePlayer.create).toHaveBeenCalledWith({
        data: { groupId: 'g1', userId: 'u1' },
      });
    });

    it('creates a new group when no open group exists (full or none yet)', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ level: 10 });
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(null);
      prismaMock.bossBattleGroup.findFirst
        .mockResolvedValueOnce(null) // no open group
        .mockResolvedValueOnce(null); // no prior group at all -> groupNumber 1
      prismaMock.bossBattleGroup.create.mockResolvedValueOnce({
        id: 'g1',
        groupNumber: 1,
        status: 'LIVE',
        playerCount: 0,
        sharedWordIds: ['w1'],
      });
      prismaMock.bossBattlePlayer.create.mockResolvedValueOnce({
        id: 'p3',
        userId: 'u1',
        groupId: 'g1',
        questionIndex: 0,
        currentWordId: null,
        currentDisplayPattern: null,
        currentMissingIndexes: [],
      });
      wordsMock.pickWordsForQuest.mockResolvedValueOnce(['w1']);
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      await service.joinBattle('u1');

      // The shared sequence is generated ONCE, from the joiner who
      // triggers the group's creation, at the configured length, and
      // excludes any words that joiner already has pending in an
      // unresolved Daily Quest attempt (empty here — none mocked).
      expect(wordsMock.pickWordsForQuest).toHaveBeenCalledWith(
        'u1',
        gameplayRules.bossBattle.sharedSequenceLength,
        [],
        gameplayRules.bossBattle.minWordLength,
      );
      expect(prismaMock.bossBattleGroup.create).toHaveBeenCalledWith({
        data: { battleId: 'b1', groupNumber: 1, status: 'LIVE', sharedWordIds: ['w1'] },
      });
    });

    it("excludes the triggering player's own in-progress quest words from the new group's shared sequence", async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ level: 10 });
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(null);
      prismaMock.bossBattleGroup.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prismaMock.questAttempt.findMany.mockResolvedValueOnce([
        { wordIds: ['pending-1', 'pending-2'] },
      ]);
      prismaMock.bossBattleGroup.create.mockResolvedValueOnce({
        id: 'g1',
        groupNumber: 1,
        status: 'LIVE',
        playerCount: 0,
        sharedWordIds: ['w1'],
      });
      prismaMock.bossBattlePlayer.create.mockResolvedValueOnce({
        id: 'p3b',
        userId: 'u1',
        groupId: 'g1',
        questionIndex: 0,
        currentWordId: null,
        currentDisplayPattern: null,
        currentMissingIndexes: [],
      });
      wordsMock.pickWordsForQuest.mockResolvedValueOnce(['w1']);
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      await service.joinBattle('u1');

      expect(prismaMock.questAttempt.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', status: 'IN_PROGRESS' },
        select: { wordIds: true },
      });
      expect(wordsMock.pickWordsForQuest).toHaveBeenCalledWith(
        'u1',
        gameplayRules.bossBattle.sharedSequenceLength,
        ['pending-1', 'pending-2'],
        gameplayRules.bossBattle.minWordLength,
      );
    });

    it('assigns a fresh challenge for a brand-new player using the shared omission engine', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ level: 10 });
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(null);
      prismaMock.bossBattleGroup.findFirst.mockResolvedValueOnce({
        id: 'g1',
        groupNumber: 1,
        status: 'LIVE',
        playerCount: 3,
        sharedWordIds: ['w1', 'w2'],
      });
      prismaMock.bossBattlePlayer.create.mockResolvedValueOnce({
        id: 'p4',
        userId: 'u1',
        groupId: 'g1',
        questionIndex: 0,
        currentWordId: null,
        currentDisplayPattern: null,
        currentMissingIndexes: [],
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      const view = await service.joinBattle('u1');

      expect(view.definition).toBe(greetingWord.definition);
      expect(view.wordLength).toBe(9);
      expect(view.battleEndsAt).toBe(battle.scheduledEndUtc.toISOString());
      expect(view.battleEnded).toBe(false);
      expect(view.questionsAnswered).toBe(0);
      expect(view.maxQuestions).toBe(2); // sharedWordIds.length for this group
    });

    it("assigns the group's shared word at the player's current question index, not a fresh pick", async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ level: 10 });
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(null);
      prismaMock.bossBattleGroup.findFirst.mockResolvedValueOnce({
        id: 'g1',
        groupNumber: 1,
        status: 'LIVE',
        playerCount: 3,
        sharedWordIds: ['shared-w1', 'shared-w2'],
      });
      prismaMock.bossBattlePlayer.create.mockResolvedValueOnce({
        id: 'p5',
        userId: 'u1',
        groupId: 'g1',
        questionIndex: 0,
        currentWordId: null,
        currentDisplayPattern: null,
        currentMissingIndexes: [],
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      await service.joinBattle('u1');

      expect(wordsMock.pickWordsForQuest).not.toHaveBeenCalled();
      expect(prismaMock.word.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'shared-w1' },
      });
    });

    it('retries onto a different group when the atomic slot claim loses a race at the 20-player cap', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
      prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ level: 10 });
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(null);
      // First findOrCreateOpenGroup call finds a group that LOOKS open...
      prismaMock.bossBattleGroup.findFirst
        .mockResolvedValueOnce({
          id: 'g-full',
          groupNumber: 1,
          status: 'LIVE',
          playerCount: 19,
          sharedWordIds: ['w1'],
        })
        // ...second attempt (after the claim loses) finds none open, so a new group is created.
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'g-full', groupNumber: 1 }); // "last" group, for groupNumber+1
      // The claim on g-full loses the race (someone else took the last slot).
      prismaMock.bossBattleGroup.updateMany.mockResolvedValueOnce({ count: 0 });
      wordsMock.pickWordsForQuest.mockResolvedValueOnce(['w2']);
      prismaMock.bossBattleGroup.create.mockResolvedValueOnce({
        id: 'g-new',
        groupNumber: 2,
        status: 'LIVE',
        playerCount: 0,
        sharedWordIds: ['w2'],
      });
      prismaMock.bossBattlePlayer.create.mockResolvedValueOnce({
        id: 'p-retry',
        userId: 'u1',
        groupId: 'g-new',
        questionIndex: 0,
        currentWordId: null,
        currentDisplayPattern: null,
        currentMissingIndexes: [],
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      await service.joinBattle('u1');

      // The loser's claim attempt targeted the full group...
      expect(prismaMock.bossBattleGroup.updateMany).toHaveBeenCalledWith({
        where: { id: 'g-full', playerCount: { lt: 20 } },
        data: { playerCount: { increment: 1 }, status: 'LIVE' },
      });
      // ...but the player actually ended up in the freshly-created group, not g-full.
      expect(prismaMock.bossBattlePlayer.create).toHaveBeenCalledWith({
        data: { groupId: 'g-new', userId: 'u1' },
      });
    });
  });

  describe('submitAnswer', () => {
    const battle = {
      id: 'b1',
      scheduledStartUtc: utc(2026, 8, 16, 17),
      scheduledEndUtc: utc(2026, 8, 16, 18),
    };
    const player = {
      id: 'p1',
      userId: 'u1',
      groupId: 'g1',
      battleXp: 45,
      questionIndex: 0,
      currentWordId: 'w1',
      currentWord: greetingWord,
      currentDisplayPattern: 'R _ S I L I E N T',
      currentMissingIndexes: [1],
      // Exactly 30 minutes (perPlayerDurationMs) before the battle's own
      // scheduledEndUtc (18:00), matching most of this block's "now" of
      // 17:30 -- gives every test here room before playerDeadline (personal
      // window) is reached, while the dedicated personal-deadline tests
      // below override joinedAt to actually exercise that path.
      joinedAt: utc(2026, 8, 16, 17, 30),
      group: { id: 'g1', status: 'LIVE', battle, sharedWordIds: ['w1', 'w2', 'w3'] },
    };

    it('throws NotFoundException when the player never joined a battle', async () => {
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(null);
      await expect(service.submitAnswer('u1', 'resilient')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when there is no active challenge', async () => {
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        ...player,
        currentWord: null,
        currentDisplayPattern: null,
      });
      await expect(service.submitAnswer('u1', 'resilient')).rejects.toThrow(BadRequestException);
    });

    describe('idempotency', () => {
      it('records the response in the same transaction as the reward grant when a key is given', async () => {
        jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
        prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(player);
        prismaMock.bossBattlePlayer.update.mockResolvedValueOnce({
          ...player,
          battleXp: 45 + gameplayRules.bossBattle.perCorrectAnswer,
        });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

        await service.submitAnswer('u1', 'resilient', 'idem-key-1');

        expect(idempotencyMock.recordInTransaction).toHaveBeenCalledWith(
          prismaMock,
          'u1',
          'idem-key-1',
          'boss-battle.submitAnswer',
          expect.objectContaining({
            isCorrect: true,
            xpAwarded: gameplayRules.bossBattle.perCorrectAnswer,
          }),
        );
      });

      it('never calls recordInTransaction when no key is given — IdempotencyService itself is a no-op in that case', async () => {
        jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
        prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(player);
        prismaMock.bossBattlePlayer.update.mockResolvedValueOnce({ ...player });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

        await service.submitAnswer('u1', 'resilient');

        // recordInTransaction is still called (it's always invoked), but
        // with undefined — verifying the call happened with the right
        // "no key" shape rather than asserting it was skipped entirely,
        // since IdempotencyService itself owns the no-op decision.
        expect(idempotencyMock.recordInTransaction).toHaveBeenCalledWith(
          prismaMock,
          'u1',
          undefined,
          'boss-battle.submitAnswer',
          expect.anything(),
        );
      });
    });

    it('rejects a duplicate/racing submission for the same question with ConflictException, without granting XP twice', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(player);
      // The CAS claim loses — another request already advanced this
      // player's currentWordId between our read and our attempt.
      prismaMock.bossBattlePlayer.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.submitAnswer('u1', 'resilient')).rejects.toThrow(ConflictException);

      expect(prismaMock.bossBattlePlayer.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', currentWordId: 'w1' },
        data: { currentWordId: 'w1' },
      });
      const answerXpCalls = progressionMock.awardXp.mock.calls.filter(
        (c) => c[2] === 'BOSS_BATTLE_ANSWER',
      );
      expect(answerXpCalls).toHaveLength(0);
    });

    it('normalizes and checks the answer against normalizedWord', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(player);
      prismaMock.bossBattlePlayer.update.mockResolvedValueOnce({
        ...player,
        battleXp: 45 + gameplayRules.bossBattle.perCorrectAnswer,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      const result = await service.submitAnswer('u1', '  RESILIENT  ');

      expect(result.isCorrect).toBe(true);
      expect(masteryMock.recordAnswer).toHaveBeenCalledWith('u1', 'w1', true, prismaMock);
    });

    it('includes a non-null aliQuickReaction on every evaluated (non-timed-out) answer', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(player);
      prismaMock.bossBattlePlayer.update.mockResolvedValueOnce({ ...player });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      const result = await service.submitAnswer('u1', 'not-the-word');

      expect(result.isCorrect).toBe(false);
      expect(typeof result.aliQuickReaction).toBe('string');
      expect(result.aliQuickReaction).not.toBeNull();
    });

    it('returns a null aliQuickReaction once the battle has already ended', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(player);
      prismaMock.bossBattleGroup.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([
        { ...player, finalRank: null, lastXpAt: null, correctAnswers: 0, incorrectAnswers: 0 },
      ]);

      const result = await service.submitAnswer('u1', 'resilient');

      expect(result.aliQuickReaction).toBeNull();
    });

    it('awards perCorrectAnswer battle XP and lifetime XP for a correct answer', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(player);
      prismaMock.bossBattlePlayer.update.mockResolvedValueOnce({
        ...player,
        battleXp: 45 + gameplayRules.bossBattle.perCorrectAnswer,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      const result = await service.submitAnswer('u1', 'resilient');

      expect(result.xpAwarded).toBe(gameplayRules.bossBattle.perCorrectAnswer);
      expect(progressionMock.awardXp).toHaveBeenCalledWith(
        'u1',
        gameplayRules.bossBattle.perCorrectAnswer,
        'BOSS_BATTLE_ANSWER',
        'boss-battle',
        'b1',
        prismaMock,
      );
    });

    it('assigns a next challenge and keeps the battle going while time remains', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(player);
      prismaMock.bossBattlePlayer.update.mockResolvedValueOnce({ ...player });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      const result = await service.submitAnswer('u1', 'resilient');

      expect(result.battleEnded).toBe(false);
      expect(result.nextChallenge).not.toBeNull();
    });

    it("advances to the group's shared word at questionIndex + 1, never a fresh pickWordsForQuest call", async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(player);
      // The XP-award update returns the player row as it stood BEFORE
      // this challenge advances — questionIndex still 0.
      prismaMock.bossBattlePlayer.update.mockResolvedValueOnce({ ...player, questionIndex: 0 });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord);

      await service.submitAnswer('u1', 'resilient');

      expect(wordsMock.pickWordsForQuest).not.toHaveBeenCalled();
      expect(prismaMock.word.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'w2' } });
      expect(prismaMock.bossBattlePlayer.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({ questionIndex: 1 }),
      });
    });

    it("ends this player's battle once they exhaust the shared sequence -- never wraps back to word 0 (Barth bugfix, Sept 2026), and does not finalize the group while its own clock still has time left", async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        ...player,
        questionIndex: 2, // last index of a 3-word sharedWordIds ['w1','w2','w3']
      });
      prismaMock.bossBattlePlayer.update.mockResolvedValueOnce({ ...player, questionIndex: 2 });

      const result = await service.submitAnswer('u1', 'resilient');

      expect(result.battleEnded).toBe(true);
      expect(result.nextChallenge).toBeNull();
      // Never wraps back to sharedWordIds[0] = 'w1' -- no next-challenge
      // word lookup happens at all once the sequence is exhausted.
      expect(prismaMock.word.findUniqueOrThrow).not.toHaveBeenCalled();
      // The player's own in-flight challenge is cleared...
      expect(prismaMock.bossBattlePlayer.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { currentWordId: null, currentDisplayPattern: null, currentMissingIndexes: [] },
      });
      // ...but the GROUP's own clock (ends 18:00, "now" is 17:30) still has
      // plenty of time left -- this one player finishing their 30 words
      // must NOT rank/reward/lock the whole group while others may still
      // be mid-battle (the finalization-timing architectural fix).
      expect(prismaMock.bossBattleGroup.updateMany).not.toHaveBeenCalled();
    });

    it("ends the answer without scoring it, and without finalizing the group, once this player's own personal time window has elapsed even though the group is still LIVE", async () => {
      // Group's battle runs 17:00-18:00 and is still LIVE at 17:35. This
      // player joined right at 17:00, so their own 30-minute window
      // (perPlayerDurationMs) closed at 17:30 -- five minutes ago.
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 35));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        ...player,
        joinedAt: utc(2026, 8, 16, 17, 0),
      });

      const result = await service.submitAnswer('u1', 'resilient');

      expect(result).toEqual({
        isCorrect: false,
        correctAnswer: expect.any(String),
        exampleSentence: expect.any(String),
        xpAwarded: 0,
        battleXp: player.battleXp,
        battleEnded: true,
        nextChallenge: null,
        aliQuickReaction: null,
      });
      // Not scored at all -- no mastery record, no event log, no XP.
      expect(masteryMock.recordAnswer).not.toHaveBeenCalled();
      expect(prismaMock.bossBattleEvent.create).not.toHaveBeenCalled();
      const answerXpCalls = progressionMock.awardXp.mock.calls.filter(
        (c) => c[2] === 'BOSS_BATTLE_ANSWER',
      );
      expect(answerXpCalls).toHaveLength(0);
      // Handled entirely outside the scoring transaction...
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      // ...and the group's own clock still has time left, so this
      // player's early personal cutoff must not finalize it for everyone
      // else still playing.
      expect(prismaMock.bossBattleGroup.updateMany).not.toHaveBeenCalled();
      // The player's in-flight challenge is cleared directly.
      expect(prismaMock.bossBattlePlayer.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { currentWordId: null, currentDisplayPattern: null, currentMissingIndexes: [] },
      });
    });

    it('ends the battle and finalizes the group once the clock passes the end time mid-answer', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 59, 59));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(player);
      prismaMock.bossBattlePlayer.update.mockResolvedValueOnce({ ...player });
      // Advance the clock past end time right as the transaction runs.
      prismaMock.$transaction.mockImplementationOnce((callback: (tx: any) => unknown) => {
        jest.setSystemTime(utc(2026, 8, 16, 18, 0, 1));
        return callback(prismaMock);
      });
      prismaMock.bossBattleGroup.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([
        { ...player, finalRank: null, lastXpAt: null, correctAnswers: 1, incorrectAnswers: 0 },
      ]);

      const result = await service.submitAnswer('u1', 'resilient');

      expect(result.battleEnded).toBe(true);
      expect(result.nextChallenge).toBeNull();
      // The GROUP's own clock ending (as opposed to this player's personal
      // window or word count) is the one case that finalizes -- confirm
      // finalizeGroupIfNeeded's atomic FINALIZING claim actually ran.
      expect(prismaMock.bossBattleGroup.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'g1' }) }),
      );
      expect(prismaMock.bossBattleGroup.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { status: 'COMPLETED' },
      });
    });

    it('rejects further answers once the battle has already ended, without awarding XP', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(player);
      prismaMock.bossBattleGroup.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([
        { ...player, finalRank: null, lastXpAt: null, correctAnswers: 0, incorrectAnswers: 0 },
      ]);

      const result = await service.submitAnswer('u1', 'resilient');

      expect(result.battleEnded).toBe(true);
      expect(result.xpAwarded).toBe(0);
      const answerXpCalls = progressionMock.awardXp.mock.calls.filter(
        (c) => c[2] === 'BOSS_BATTLE_ANSWER',
      );
      expect(answerXpCalls).toHaveLength(0);
    });
  });

  describe('getMyGroupLeaderboard', () => {
    it('throws NotFoundException when the player never joined a battle', async () => {
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(null);
      await expect(service.getMyGroupLeaderboard('u1')).rejects.toThrow(NotFoundException);
    });

    it("returns only the player's own entry — no other player's name/score and no rank — while the battle is LIVE (Correction & Completion Spec §4)", async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        groupId: 'g1',
        battleXp: 30,
        correctAnswers: 2,
        incorrectAnswers: 0,
        group: {
          id: 'g1',
          status: 'LIVE',
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
        user: { id: 'u1', username: 'Ada' },
      });

      const result = await service.getMyGroupLeaderboard('u1');

      expect(result.status).toBe('LIVE');
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toEqual({
        userId: 'u1',
        username: 'Ada',
        rank: null,
        battleXp: 30,
        correctAnswers: 2,
        incorrectAnswers: 0,
        isYou: true,
        rewardXp: null,
        rewardGlyphs: null,
      });
      // No group-wide query at all — the private view is built entirely
      // from the requesting player's own row, so there's no path by
      // which another player's data could leak into the response.
      expect(prismaMock.bossBattlePlayer.findMany).not.toHaveBeenCalled();
    });

    it('also keeps the view private before the battle has started (SCHEDULED)', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 16, 30));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        groupId: 'g1',
        battleXp: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        group: {
          id: 'g1',
          status: 'FORMING',
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
        user: { id: 'u1', username: 'Ada' },
      });

      const result = await service.getMyGroupLeaderboard('u1');

      expect(result.status).toBe('SCHEDULED');
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].isYou).toBe(true);
      expect(result.entries[0].rank).toBeNull();
    });

    it('ranks players by battleXp descending', async () => {
      // Past scheduledEndUtc -> COMPLETED, and the group is already
      // marked COMPLETED so finalizeGroupIfNeeded short-circuits — this
      // test is only exercising the ranking/ordering logic, not the
      // finalization transaction (covered separately below).
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        groupId: 'g1',
        group: {
          id: 'g1',
          status: 'COMPLETED',
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
        user: { id: 'u1', username: 'Ada' },
      });
      prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([
        {
          id: 'p1',
          userId: 'u1',
          battleXp: 30,
          correctAnswers: 2,
          incorrectAnswers: 0,
          lastXpAt: null,
          finalRank: null,
          user: { id: 'u1', username: 'Ada' },
        },
        {
          id: 'p2',
          userId: 'u2',
          battleXp: 90,
          correctAnswers: 6,
          incorrectAnswers: 0,
          lastXpAt: null,
          finalRank: null,
          user: { id: 'u2', username: 'Bo' },
        },
      ]);

      const result = await service.getMyGroupLeaderboard('u1');

      expect(result.entries[0].userId).toBe('u2');
      expect(result.entries[0].rank).toBe(1);
      expect(result.entries[1].userId).toBe('u1');
      expect(result.entries[1].rank).toBe(2);
    });

    it('marks the requesting player with isYou', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        groupId: 'g1',
        group: {
          id: 'g1',
          status: 'COMPLETED',
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
        user: { id: 'u1', username: 'Ada' },
      });
      prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([
        {
          id: 'p1',
          userId: 'u1',
          battleXp: 30,
          correctAnswers: 2,
          incorrectAnswers: 0,
          lastXpAt: null,
          finalRank: null,
          user: { id: 'u1', username: 'Ada' },
        },
      ]);

      const result = await service.getMyGroupLeaderboard('u1');

      expect(result.entries[0].isYou).toBe(true);
    });

    it('breaks a full tie (same XP, same correct, same incorrect) by earliest lastXpAt', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        groupId: 'g1',
        group: {
          id: 'g1',
          status: 'COMPLETED',
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
        user: { id: 'late', username: 'Late' },
      });
      prismaMock.bossBattlePlayer.findMany.mockResolvedValueOnce([
        {
          id: 'p1',
          userId: 'late',
          battleXp: 60,
          correctAnswers: 4,
          incorrectAnswers: 0,
          lastXpAt: utc(2026, 8, 16, 17, 40),
          finalRank: null,
          user: { id: 'late', username: 'Late' },
        },
        {
          id: 'p2',
          userId: 'early',
          battleXp: 60,
          correctAnswers: 4,
          incorrectAnswers: 0,
          lastXpAt: utc(2026, 8, 16, 17, 20),
          finalRank: null,
          user: { id: 'early', username: 'Early' },
        },
      ]);

      const result = await service.getMyGroupLeaderboard('late');

      expect(result.entries[0].userId).toBe('early');
      expect(result.entries[1].userId).toBe('late');
    });

    it('triggers finalization when the battle has ended', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        groupId: 'g1',
        group: {
          id: 'g1',
          status: 'LIVE',
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
      });
      prismaMock.bossBattleGroup.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.bossBattlePlayer.findMany
        .mockResolvedValueOnce([
          {
            id: 'p1',
            userId: 'u1',
            battleXp: 60,
            correctAnswers: 4,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: null,
          },
        ]) // finalize's internal query
        .mockResolvedValueOnce([
          {
            id: 'p1',
            userId: 'u1',
            battleXp: 60,
            correctAnswers: 4,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: 1,
            user: { id: 'u1', username: 'Ada' },
          },
        ]); // leaderboard query after finalizing

      await service.getMyGroupLeaderboard('u1');

      // Two-phase claim (V21 §5): the group is claimed into FINALIZING
      // first via the atomic updateMany guard...
      expect(prismaMock.bossBattleGroup.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'g1',
          OR: [
            { status: { notIn: ['COMPLETED', 'FINALIZING'] } },
            { status: 'FINALIZING', finalizingAt: { lt: expect.any(Date) } },
          ],
        },
        data: { status: 'FINALIZING', finalizingAt: expect.any(Date) },
      });
      // ...and only flips to COMPLETED as the LAST statement inside the
      // same transaction that grants every reward.
      expect(prismaMock.bossBattleGroup.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { status: 'COMPLETED' },
      });
    });
  });

  describe('finalization rewards and concurrency safety', () => {
    it('does not grant rewards twice if two callers race to finalize the same group', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      const playerRow = {
        groupId: 'g1',
        group: {
          id: 'g1',
          status: 'LIVE',
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
      };

      prismaMock.bossBattlePlayer.findFirst.mockResolvedValue(playerRow);
      // First caller wins the atomic claim; second caller loses it.
      prismaMock.bossBattleGroup.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      prismaMock.bossBattlePlayer.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 'u1',
          battleXp: 60,
          correctAnswers: 4,
          incorrectAnswers: 0,
          lastXpAt: null,
          finalRank: null,
          user: { id: 'u1', username: 'Ada' },
        },
      ]);

      await Promise.all([service.getMyGroupLeaderboard('u1'), service.getMyGroupLeaderboard('u1')]);

      const rewardCalls = progressionMock.awardXp.mock.calls.filter(
        (c) => c[2] === 'BOSS_BATTLE_REWARD',
      );
      expect(rewardCalls).toHaveLength(1);
    });

    it('does not reclaim a group still actively FINALIZING (claim loses, no reward work happens)', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        groupId: 'g1',
        group: {
          id: 'g1',
          status: 'FINALIZING',
          finalizingAt: new Date(
            Date.now() - gameplayRules.bossBattle.finalizationStuckThresholdMs / 2,
          ),
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
      });
      // The claim's WHERE clause won't match a still-fresh FINALIZING
      // group, so the real service would return count: 0 here — asserted
      // via the mock rather than re-deriving the WHERE logic in the test.
      prismaMock.bossBattleGroup.updateMany.mockResolvedValueOnce({ count: 0 });

      await service.getMyGroupLeaderboard('u1');

      // bossBattlePlayer.findMany is still called exactly once here — for
      // the leaderboard view itself (it always includes `user`) — never a
      // second time for finalizeGroupIfNeeded's own reward-loop query
      // (which has no `include` and never runs, since the claim lost).
      expect(prismaMock.bossBattlePlayer.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.bossBattlePlayer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: expect.anything() }),
      );
      expect(progressionMock.awardXp).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'BOSS_BATTLE_REWARD',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('reclaims a group stuck in FINALIZING past the stale threshold and completes it', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        groupId: 'g1',
        group: {
          id: 'g1',
          status: 'FINALIZING',
          finalizingAt: new Date(
            Date.now() - gameplayRules.bossBattle.finalizationStuckThresholdMs * 2,
          ),
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
      });
      prismaMock.bossBattleGroup.updateMany.mockResolvedValueOnce({ count: 1 });
      const finalizedPlayer = {
        id: 'p1',
        userId: 'u1',
        battleXp: 60,
        correctAnswers: 4,
        incorrectAnswers: 0,
        lastXpAt: null,
        finalRank: null,
        user: { id: 'u1', username: 'Ada' },
      };
      prismaMock.bossBattlePlayer.findMany
        .mockResolvedValueOnce([finalizedPlayer]) // finalize's internal query
        .mockResolvedValueOnce([{ ...finalizedPlayer, finalRank: 1 }]); // leaderboard query after finalizing

      await service.getMyGroupLeaderboard('u1');

      expect(prismaMock.bossBattlePlayer.findMany).toHaveBeenCalledTimes(2);
      expect(prismaMock.bossBattleGroup.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { status: 'COMPLETED' },
      });
    });

    it('awards the correct reward tier by final rank', () => {
      expect(bossBattleRewardForRank(1)).toEqual(gameplayRules.bossBattle.rewards.first);
      expect(bossBattleRewardForRank(2)).toEqual(gameplayRules.bossBattle.rewards.second);
      expect(bossBattleRewardForRank(3)).toEqual(gameplayRules.bossBattle.rewards.third);
      expect(bossBattleRewardForRank(4)).toEqual(gameplayRules.bossBattle.rewards.participation);
      expect(bossBattleRewardForRank(11)).toEqual(gameplayRules.bossBattle.rewards.participation);
      expect(bossBattleRewardForRank(20)).toEqual(gameplayRules.bossBattle.rewards.participation);
    });

    it('increments bossBattlesCompleted for every finalized participant, not just the winner', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        groupId: 'g1',
        group: {
          id: 'g1',
          status: 'LIVE',
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
      });
      prismaMock.bossBattleGroup.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.bossBattlePlayer.findMany
        .mockResolvedValueOnce([
          {
            id: 'p1',
            userId: 'winner',
            battleXp: 90,
            correctAnswers: 6,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: null,
          },
          {
            id: 'p2',
            userId: 'runnerUp',
            battleXp: 30,
            correctAnswers: 2,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: null,
          },
        ]) // finalize's internal query
        .mockResolvedValueOnce([
          {
            id: 'p1',
            userId: 'winner',
            battleXp: 90,
            correctAnswers: 6,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: 1,
            user: { id: 'winner', username: 'Winner' },
          },
          {
            id: 'p2',
            userId: 'runnerUp',
            battleXp: 30,
            correctAnswers: 2,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: 2,
            user: { id: 'runnerUp', username: 'RunnerUp' },
          },
        ]); // leaderboard query after finalizing

      await service.getMyGroupLeaderboard('winner');

      expect(prismaMock.userProgression.update).toHaveBeenCalledWith({
        where: { userId: 'winner' },
        data: { bossBattlesCompleted: { increment: 1 } },
      });
      expect(prismaMock.userProgression.update).toHaveBeenCalledWith({
        where: { userId: 'runnerUp' },
        data: { bossBattlesCompleted: { increment: 1 } },
      });
    });

    it('notifies every finalized participant of their result', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        groupId: 'g1',
        group: {
          id: 'g1',
          status: 'LIVE',
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
      });
      prismaMock.bossBattleGroup.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.bossBattlePlayer.findMany
        .mockResolvedValueOnce([
          {
            id: 'p1',
            userId: 'u1',
            battleXp: 90,
            correctAnswers: 6,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: null,
          },
        ]) // finalize's internal query
        .mockResolvedValueOnce([
          {
            id: 'p1',
            userId: 'u1',
            battleXp: 90,
            correctAnswers: 6,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: 1,
            user: { id: 'u1', username: 'Ada' },
          },
        ]); // leaderboard query after finalizing

      await service.getMyGroupLeaderboard('u1');

      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u1',
        'BOSS_BATTLE_RESULT',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ data: expect.objectContaining({ rank: 1 }) }),
      );
    });

    it('snapshots rewardXp/rewardGlyphs onto the winning and losing players, and mints a BOSS_BATTLE_WIN card only for the winner', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce({
        groupId: 'g1',
        group: {
          id: 'g1',
          status: 'LIVE',
          battle: {
            scheduledStartUtc: utc(2026, 8, 16, 17),
            scheduledEndUtc: utc(2026, 8, 16, 18),
          },
        },
      });
      prismaMock.bossBattleGroup.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.bossBattlePlayer.findMany
        .mockResolvedValueOnce([
          {
            id: 'p1',
            userId: 'winner',
            battleXp: 90,
            correctAnswers: 6,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: null,
          },
          {
            id: 'p2',
            userId: 'runnerUp',
            battleXp: 30,
            correctAnswers: 2,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: null,
          },
        ]) // finalize's internal query
        .mockResolvedValueOnce([
          {
            id: 'p1',
            userId: 'winner',
            battleXp: 90,
            correctAnswers: 6,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: 1,
            user: { id: 'winner', username: 'Winner' },
          },
          {
            id: 'p2',
            userId: 'runnerUp',
            battleXp: 30,
            correctAnswers: 2,
            incorrectAnswers: 0,
            lastXpAt: null,
            finalRank: 2,
            user: { id: 'runnerUp', username: 'RunnerUp' },
          },
        ]); // leaderboard query after finalizing
      prismaMock.userProgression.update.mockResolvedValue({ journeyStage: 2 });

      await service.getMyGroupLeaderboard('winner');

      expect(prismaMock.bossBattlePlayer.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({
          finalRank: 1,
          isWinner: true,
          rewardXp: gameplayRules.bossBattle.rewards.first.xp,
          rewardGlyphs: gameplayRules.bossBattle.rewards.first.glyphs,
        }),
      });
      expect(prismaMock.bossBattlePlayer.update).toHaveBeenCalledWith({
        where: { id: 'p2' },
        data: expect.objectContaining({
          finalRank: 2,
          isWinner: false,
          rewardXp: gameplayRules.bossBattle.rewards.second.xp,
          rewardGlyphs: gameplayRules.bossBattle.rewards.second.glyphs,
        }),
      });
      expect(questCardsMock.createCard).toHaveBeenCalledTimes(1);
      expect(questCardsMock.createCard).toHaveBeenCalledWith(
        'winner',
        'BOSS_BATTLE_WIN',
        'g1',
        'Boss Battle Victory',
        'COMPETITION',
        expect.anything(),
        expect.objectContaining({ rarity: 'RARE' }),
      );
    });
  });

  describe('autoFinalizeEndedBattles', () => {
    it('finalizes every non-completed group whose battle has already ended', async () => {
      jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 18, 5));
      prismaMock.bossBattleGroup.findMany.mockResolvedValueOnce([
        { id: 'g1', status: 'LIVE' },
        { id: 'g2', status: 'FORMING' },
      ]);
      prismaMock.bossBattleGroup.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.bossBattlePlayer.findMany.mockResolvedValue([]);

      await service.autoFinalizeEndedBattles();

      expect(prismaMock.bossBattleGroup.findMany).toHaveBeenCalledWith({
        where: {
          status: { not: 'COMPLETED' },
          battle: { scheduledEndUtc: { lt: expect.any(Date) } },
        },
      });
      // Each stale group gets claimed into FINALIZING via the atomic
      // updateMany guard, then flipped to COMPLETED as the last statement
      // of finalizeGroupIfNeeded's reward transaction (see the dedicated
      // two-phase-claim assertion above for the exact claim shape).
      expect(prismaMock.bossBattleGroup.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'g1' }) }),
      );
      expect(prismaMock.bossBattleGroup.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'g2' }) }),
      );
      expect(prismaMock.bossBattleGroup.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { status: 'COMPLETED' },
      });
      expect(prismaMock.bossBattleGroup.update).toHaveBeenCalledWith({
        where: { id: 'g2' },
        data: { status: 'COMPLETED' },
      });
    });

    it('does nothing when there are no stale groups', async () => {
      prismaMock.bossBattleGroup.findMany.mockResolvedValueOnce([]);
      await service.autoFinalizeEndedBattles();
      expect(prismaMock.bossBattleGroup.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('US/UK spelling-variant rendering (2026-09 fairness feature)', () => {
    const battle = {
      id: 'b1',
      weekId: '2026-W33',
      scheduledStartUtc: utc(2026, 8, 16, 17),
      scheduledEndUtc: utc(2026, 8, 16, 18),
    };

    describe('joinBattle (resumed challenge)', () => {
      const resumedPlayer = {
        id: 'p1',
        userId: 'u1',
        groupId: 'g1',
        questionIndex: 0,
        currentWordId: 'w-colour',
        currentDisplayPattern: 'C _ L O U R',
        currentMissingIndexes: [1],
        joinedAt: utc(2026, 8, 16, 17, 30),
        group: { id: 'g1', sharedWordIds: ['w-colour', 'w2'] },
      };

      it('sizes the resumed challenge to the US spelling for a US-preference player', async () => {
        jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
        prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
        prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ level: 10 });
        prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(resumedPlayer);
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(colourBattleWord);
        prismaMock.user.findUnique.mockResolvedValueOnce({ englishVariant: 'US' });

        const view = await service.joinBattle('u1');

        expect(view.wordLength).toBe('Color'.length);
      });

      it('falls back to the UK spelling and its own letter count for a player with no preference recorded', async () => {
        jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
        prismaMock.bossBattle.findUnique.mockResolvedValueOnce(battle);
        prismaMock.userProgression.findUniqueOrThrow.mockResolvedValueOnce({ level: 10 });
        prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(resumedPlayer);
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(colourBattleWord);
        // englishVariant: null -- the prismaMock.user default set at the top of this file.

        const view = await service.joinBattle('u1');

        expect(view.wordLength).toBe('Colour'.length);
      });
    });

    describe('submitAnswer', () => {
      const colourPlayer = {
        id: 'p1',
        userId: 'u1',
        groupId: 'g1',
        battleXp: 0,
        questionIndex: 0,
        currentWordId: 'w-colour',
        currentWord: colourBattleWord,
        currentDisplayPattern: 'C _ L O U R',
        currentMissingIndexes: [1],
        joinedAt: utc(2026, 8, 16, 17, 30),
        group: { id: 'g1', status: 'LIVE', battle, sharedWordIds: ['w-colour', 'w2', 'w3'] },
      };

      it('accepts the US spelling as correct for a US-preference player and reports it back as the correct answer', async () => {
        jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
        prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(colourPlayer);
        prismaMock.bossBattlePlayer.update.mockResolvedValueOnce({ ...colourPlayer, battleXp: 45 });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord); // next-challenge word, unrelated to this assertion
        prismaMock.user.findUnique.mockResolvedValueOnce({ englishVariant: 'US' });

        const result = await service.submitAnswer('u1', 'color');

        expect(result.isCorrect).toBe(true);
        expect(result.correctAnswer).toBe('Color');
        expect(result.exampleSentence).toBe('The color was striking.');
      });

      it('rejects the US spelling for a player who defaults to UK (no preference recorded)', async () => {
        jest.useFakeTimers().setSystemTime(utc(2026, 8, 16, 17, 30));
        prismaMock.bossBattlePlayer.findFirst.mockResolvedValueOnce(colourPlayer);
        prismaMock.bossBattlePlayer.update.mockResolvedValueOnce({ ...colourPlayer });
        prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(greetingWord); // next-challenge word, unrelated to this assertion
        // englishVariant: null -- the prismaMock.user default set at the top of this file.

        const result = await service.submitAnswer('u1', 'color');

        expect(result.isCorrect).toBe(false);
        expect(result.correctAnswer).toBe('Colour');
        expect(result.exampleSentence).toBe('The colour was striking.');
      });
    });
  });
});

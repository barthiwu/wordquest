import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CompleteItService } from './complete-it.service';
import { hintRevealOrder } from '../scramble-quest/scramble.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ArcadeChallengeService } from '../challenge.service';
import { RewardEngineService } from '../reward-engine.service';
import { ProgressionService } from '../../progression/progression.service';
import { AliService } from '../../ali/ali.service';
import { ArcadeVersusService } from '../versus/versus.service';
import { ArcadeGroupService } from '../group/group.service';
import { ArcadePlayLimitService } from '../limits/play-limit.service';

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
    startedAt: new Date('2026-09-01T00:00:00Z'),
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
    user: {
      // englishVariant preference lookup (2026-09 US/UK fairness
      // feature) -- defaults to "no preference recorded" so every
      // existing test in this file keeps exercising the UK path
      // unchanged unless it explicitly overrides this.
      findUnique: jest.fn().mockResolvedValue({ englishVariant: null }),
    },
    $transaction: jest.fn((callback: (tx: any) => unknown): unknown => callback(prismaMock)),
  };

  const challengesMock = { pickChallenges: jest.fn() };
  const versusMock = { resolveStart: jest.fn() };
  const groupMock = { resolveStart: jest.fn() };
  const rewardEngineMock = { calculate: jest.fn() };
  const progressionMock = {
    awardXp: jest.fn().mockResolvedValue(undefined),
    recordDailyActivity: jest.fn().mockResolvedValue({ currentStreak: 1 }),
  };
  const aliMock = {
    react: jest.fn(),
    listReactionsSince: jest.fn().mockResolvedValue([]),
  };

  const playLimitMock = {
    assertCanPlay: jest.fn().mockResolvedValue(undefined),
    isLocked: jest.fn().mockResolvedValue(false),
    consumePlay: jest.fn().mockResolvedValue({
      game: 'X',
      used: 1,
      limit: 10,
      remaining: 9,
      percent: null,
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.arcadeAnswer.create.mockResolvedValue({});
    prismaMock.arcadeAnswer.count.mockResolvedValue(1);
    prismaMock.arcadeGameSession.update.mockResolvedValue({});
    prismaMock.arcadeGameSession.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.word.findUniqueOrThrow.mockResolvedValue(trainWord);
    prismaMock.user.findUnique.mockResolvedValue({ englishVariant: null });
    progressionMock.awardXp.mockResolvedValue(undefined);
    progressionMock.recordDailyActivity.mockResolvedValue({ currentStreak: 1 });
    aliMock.listReactionsSince.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CompleteItService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ArcadePlayLimitService, useValue: playLimitMock },
        { provide: ArcadeChallengeService, useValue: challengesMock },
        { provide: RewardEngineService, useValue: rewardEngineMock },
        { provide: ProgressionService, useValue: progressionMock },
        { provide: AliService, useValue: aliMock },
        { provide: ArcadeVersusService, useValue: versusMock },
        { provide: ArcadeGroupService, useValue: groupMock },
      ],
    }).compile();
    service = moduleRef.get(CompleteItService);
  });

  describe('start (daily play cap)', () => {
    it('only checks the cap when a solo session starts (the play is counted on finish)', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([{ word: { id: 'w1' } }]);
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce(baseSession());

      const view = await service.start('u1');

      expect(playLimitMock.assertCanPlay).toHaveBeenCalledWith('u1', 'COMPLETE_IT');
      expect(playLimitMock.consumePlay).not.toHaveBeenCalled();
      expect(view.playLimit).toBeUndefined();
    });

    it('refuses a new solo play at the cap and creates nothing', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      playLimitMock.assertCanPlay.mockRejectedValueOnce(new Error('ARCADE_PLAY_LIMIT'));

      await expect(service.start('u1')).rejects.toThrow('ARCADE_PLAY_LIMIT');
      expect(prismaMock.arcadeGameSession.create).not.toHaveBeenCalled();
      expect(playLimitMock.consumePlay).not.toHaveBeenCalled();
    });

    it('does not charge a resumed session', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(baseSession());

      await service.start('u1');

      expect(playLimitMock.assertCanPlay).not.toHaveBeenCalled();
      expect(playLimitMock.consumePlay).not.toHaveBeenCalled();
    });

    it('a head-to-head start takes no play yet (it counts when the match is finished)', async () => {
      versusMock.resolveStart.mockResolvedValueOnce({ existing: null, wordIds: ['w1'], matchId: 'm1' });
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce({ ...baseSession(), versusMatchId: 'm1' });

      await service.start('u1', 'm1');

      expect(playLimitMock.assertCanPlay).toHaveBeenCalledWith('u1', 'COMPLETE_IT');
      expect(playLimitMock.consumePlay).not.toHaveBeenCalled();
    });
  });

  describe('start (group play)', () => {
    it("creates the session on the group's shared words and ties it to the group", async () => {
      groupMock.resolveStart.mockResolvedValueOnce({ existing: null, wordIds: ['w1', 'w2'], groupId: 'g1' });
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce({ ...baseSession(), groupId: 'g1' });

      await service.start('u1', undefined, 'g1');

      expect(groupMock.resolveStart).toHaveBeenCalledWith('u1', 'g1', 'COMPLETE_IT', expect.any(Function));
      expect(prismaMock.arcadeGameSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          game: 'COMPLETE_IT',
          wordsTotal: 2,
          wordIds: ['w1', 'w2'],
          groupId: 'g1',
        }),
      });
      // Never touches the solo resume lookup.
      expect(prismaMock.arcadeGameSession.findFirst).not.toHaveBeenCalled();
    });

    it('is not counted against the daily limit, so a locked-out player can still join their class', async () => {
      groupMock.resolveStart.mockResolvedValueOnce({ existing: null, wordIds: ['w1'], groupId: 'g1' });
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce({ ...baseSession(), groupId: 'g1' });

      await service.start('u1', undefined, 'g1');

      expect(playLimitMock.assertCanPlay).not.toHaveBeenCalled();
      expect(playLimitMock.consumePlay).not.toHaveBeenCalled();
    });

    it("resumes the member's play after a relaunch", async () => {
      const existing = { ...baseSession(), groupId: 'g1' };
      groupMock.resolveStart.mockResolvedValueOnce({ existing, wordIds: existing.wordIds, groupId: 'g1' });

      await service.start('u1', undefined, 'g1');

      expect(prismaMock.arcadeGameSession.create).not.toHaveBeenCalled();
    });

    it("the first member's word pick uses this game's own picker", async () => {
      challengesMock.pickChallenges.mockResolvedValueOnce([{ word: { id: 'w9' } }]);
      groupMock.resolveStart.mockImplementationOnce(
        async (_u: string, _g: string, _game: string, pick: () => Promise<string[]>) => ({
          existing: null,
          wordIds: await pick(),
          groupId: 'g1',
        }),
      );
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce(baseSession());

      await service.start('u1', undefined, 'g1');

      expect(prismaMock.arcadeGameSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ wordIds: ['w9'] }),
      });
    });
  });

  describe('start (head-to-head)', () => {
    it('creates the session on the match\'s shared words and ties it to the match', async () => {
      versusMock.resolveStart.mockResolvedValueOnce({
        existing: null,
        wordIds: ['w1', 'w2'],
        matchId: 'm1',
      });
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce({
        ...baseSession(),
        versusMatchId: 'm1',
      });

      await service.start('u1', 'm1');

      expect(versusMock.resolveStart).toHaveBeenCalledWith(
        'u1',
        'm1',
        'COMPLETE_IT',
        expect.any(Function),
      );
      expect(prismaMock.arcadeGameSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          game: 'COMPLETE_IT',
          wordsTotal: 2,
          wordIds: ['w1', 'w2'],
          versusMatchId: 'm1',
        }),
      });
      // Never touches the solo resume lookup.
      expect(prismaMock.arcadeGameSession.findFirst).not.toHaveBeenCalled();
    });

    it('resumes the player\'s half of the match after a relaunch', async () => {
      const existing = { ...baseSession(), versusMatchId: 'm1' };
      versusMock.resolveStart.mockResolvedValueOnce({
        existing,
        wordIds: existing.wordIds,
        matchId: 'm1',
      });

      await service.start('u1', 'm1');

      expect(prismaMock.arcadeGameSession.create).not.toHaveBeenCalled();
    });

    it('the first player\'s word pick uses this game\'s own picker', async () => {
      challengesMock.pickChallenges.mockResolvedValueOnce([{ word: { id: 'w9' } }]);
      versusMock.resolveStart.mockImplementationOnce(
        async (_u: string, _m: string, _g: string, pick: () => Promise<string[]>) => ({
          existing: null,
          wordIds: await pick(),
          matchId: 'm1',
        }),
      );
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce(baseSession());

      await service.start('u1', 'm1');

      expect(prismaMock.arcadeGameSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ wordIds: ['w9'] }),
      });
    });
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

      expect(challengesMock.pickChallenges).toHaveBeenCalledWith(
        'u1',
        20,
        [],
        3,
        10,
        expect.any(Function),
      );
      expect(prismaMock.arcadeGameSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'u1', game: 'COMPLETE_IT', wordsTotal: 2 }),
      });
      expect(view.sentenceWithBlank).toBe('I need to _____ every day.');
      expect(view.definition).toBe(trainWord.definition);
      expect(view.wordIndex).toBe(0);
    });

    it('passes ArcadeChallengeService a quality filter that rejects bad sentences, and trusts its filtered result as-is', async () => {
      // Quality filtering now happens INSIDE pickChallenges (it has to,
      // so it can over-fetch/backfill -- see challenge.service.ts) --
      // start() no longer re-filters the array pickChallenges hands
      // back. This test checks both halves: the filter function passed
      // in actually discriminates good sentences from bad/terse ones,
      // and start() takes pickChallenges's returned set (already
      // filtered) at face value.
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([
        { word: { id: 'w1', word: 'train', exampleSentence: 'I need to train every single day.' } },
      ]);
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce(baseSession());

      await service.start('u1');

      expect(prismaMock.arcadeGameSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ wordsTotal: 1, wordIds: ['w1'] }),
      });

      const qualityFilter = challengesMock.pickChallenges.mock.calls[0][5];
      // Contains the word AND reads like a real sentence -- passes.
      expect(
        qualityFilter({
          word: { word: 'train', exampleSentence: 'I need to train every single day.' },
        }),
      ).toBe(true);
      // Doesn't contain the word at all -- fails.
      expect(
        qualityFilter({
          word: { word: 'humid', exampleSentence: 'This sentence forgot its own word.' },
        }),
      ).toBe(false);
      // Contains the word but is a terse WordNet-style fragment, not a
      // real sentence -- fails (this is the "not an everyday use of
      // English" case Barth reported).
      expect(
        qualityFilter({ word: { word: 'tenderize', exampleSentence: 'Tenderize meat.' } }),
      ).toBe(false);
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

    it('throws BadRequestException when pickChallenges returns no usable words', async () => {
      // pickChallenges (see challenge.service.spec.ts) already applies
      // Complete It's quality filter internally and over-fetches/
      // backfills before giving up -- by the time it returns [], there
      // was genuinely nothing usable left in the eligible pool. This
      // covers both "no words at all" and "everything failed the
      // quality filter", since start() can't tell those apart and
      // doesn't need to -- either way there's nothing to start with.
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([]);

      await expect(service.start('u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('maxHintsFor (60% of word length, rounded, never the final letter)', () => {
    it('gives a 5-letter word 3 hints', () => {
      expect(service['maxHintsFor']('train')).toBe(3);
    });

    it('gives a 10-letter word 6 hints', () => {
      expect(service['maxHintsFor']('vocabulary')).toBe(6);
    });

    it('never exceeds word.length - 1, even if the percentage would round higher', () => {
      // 3 letters * 0.6 = 1.8 -> rounds to 2, which is exactly length-1,
      // so this also doubles as the "leaves at least one letter" check.
      expect(service['maxHintsFor']('cat')).toBe(2);
    });
  });

  describe('requestHint', () => {
    it('reveals a hint letter (randomized order, excluding the last letter) and increments the hint count', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(baseSession());

      const result = await service.requestHint('u1', 's1');

      const expectedPosition = hintRevealOrder('train', 's1:0:hints')[0];
      expect(result).toEqual({
        position: expectedPosition,
        letter: 'train'[expectedPosition],
        hintsRemaining: 2, // maxHintsFor('train') = 3, minus the 1 just used
      });
      expect(result.position).toBeLessThan('train'.length - 1); // never the final letter
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', currentWordHintsUsed: 0 },
        data: { currentWordHintsUsed: { increment: 1 } },
      });
    });

    it('throws BadRequestException once max hints for the word are used', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentWordHintsUsed: 3, // maxHintsFor('train') = 3
      });

      await expect(service.requestHint('u1', 's1')).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when a concurrent hint request wins the race', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(baseSession());
      prismaMock.arcadeGameSession.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.requestHint('u1', 's1')).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when the session does not exist', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(null);
      await expect(service.requestHint('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException for another player's session", async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        userId: 'someone-else',
      });
      await expect(service.requestHint('u1', 's1')).rejects.toThrow(ForbiddenException);
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
      expect(progressionMock.recordDailyActivity).toHaveBeenCalledWith('u1', prismaMock, []);
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      // A solo play is counted once it is finished.
      expect(playLimitMock.consumePlay).toHaveBeenCalledWith('u1', 'COMPLETE_IT', { force: true });
    });

    it('counts a head-to-head play once the last word is answered (not before)', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        versusMatchId: 'm1',
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
      expect(progressionMock.recordDailyActivity).toHaveBeenCalledWith('u1', prismaMock, []);
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      expect(playLimitMock.consumePlay).toHaveBeenCalledWith('u1', 'COMPLETE_IT', { force: true });
    });


    it('never counts a Group Play round against the daily cap', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        groupId: 'g1',
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
      expect(progressionMock.recordDailyActivity).toHaveBeenCalledWith('u1', prismaMock, []);
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      expect(playLimitMock.consumePlay).not.toHaveBeenCalled();
    });

    it('resolves a STREAK_MILESTONE reaction live on the last word (task #99 follow-up: anchored to the streak container)', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 2,
      });
      rewardEngineMock.calculate.mockReturnValueOnce({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });
      progressionMock.recordDailyActivity.mockImplementationOnce(
        async (_userId: string, _db: unknown, aliEvents?: Array<{ type: string }>) => {
          aliEvents?.push({
            type: 'STREAK_MILESTONE',
            journeyStage: 1,
            context: { streakDays: 7 },
          } as never);
          return { currentStreak: 7 };
        },
      );
      aliMock.react.mockResolvedValueOnce({
        text: 'Seven days!',
        recommendation: null,
        tone: 'Village',
        promptVersion: 'v2',
        expression: 'PROUD',
        pose: 'APPROVING_NOD',
        intensity: 3,
        priority: 3,
        durationMs: 2500,
      });

      const result = await service.submitAnswer('u1', 's1', 'train');

      expect(result.streakReaction).toEqual({
        text: 'Seven days!',
        recommendation: null,
        expression: 'PROUD',
        pose: 'APPROVING_NOD',
        intensity: 3,
        priority: 3,
        durationMs: 2500,
      });
    });

    it('reads back any earlier deferred LEVEL_UP/JOURNEY reaction on the last word, via listReactionsSince since the session started', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 2,
      });
      rewardEngineMock.calculate.mockReturnValueOnce({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });
      aliMock.listReactionsSince.mockResolvedValueOnce([
        {
          text: 'Level 5!',
          recommendation: null,
          expression: 'EXCITED',
          pose: 'CELEBRATORY_HOP',
          intensity: 4,
          priority: 4,
          durationMs: 3000,
        },
      ]);

      const result = await service.submitAnswer('u1', 's1', 'train');

      expect(aliMock.listReactionsSince).toHaveBeenCalledWith(
        'u1',
        baseSession().startedAt,
        AliService.DEFERRED_REACTION_EVENT_TYPES,
      );
      expect(result.deferredAliReactions).toEqual([
        {
          text: 'Level 5!',
          recommendation: null,
          expression: 'EXCITED',
          pose: 'CELEBRATORY_HOP',
          intensity: 4,
          priority: 4,
          durationMs: 3000,
        },
      ]);
    });

    it('leaves streakReaction/deferredAliReactions empty on a non-final word', async () => {
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

      expect(result.sessionComplete).toBe(false);
      expect(result.streakReaction).toBeNull();
      expect(result.deferredAliReactions).toEqual([]);
      expect(aliMock.listReactionsSince).not.toHaveBeenCalled();
    });
  });

  describe('hint usage feeds the shared XP penalty (submitAnswer)', () => {
    it('passes the hints used this word into the reward engine', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentWordHintsUsed: 2,
      });
      rewardEngineMock.calculate.mockReturnValueOnce({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 0.7225, // 0.85^2, same compounding every Arcade game uses
        streakModifier: 1,
        finalXp: 22,
      });
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 1,
      });

      const result = await service.submitAnswer('u1', 's1', 'train');

      expect(rewardEngineMock.calculate).toHaveBeenCalledWith(
        expect.objectContaining({ hintsUsed: 2 }),
      );
      expect(result.xpAwarded).toBe(22);
    });

    it('resets currentWordHintsUsed to 0 when advancing to the next word', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentWordHintsUsed: 1,
      });
      rewardEngineMock.calculate.mockReturnValueOnce({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 0.85,
        streakModifier: 1,
        finalXp: 26,
      });
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 1,
      });

      await service.submitAnswer('u1', 's1', 'train');

      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentWordHintsUsed: 0 }),
        }),
      );
    });
  });

  describe('US/UK spelling-variant rendering (2026-09 fairness feature)', () => {
    const colourWord = {
      id: 'w1',
      word: 'Colour',
      normalizedWord: 'colour',
      exampleSentence: 'The colour of the theatre was a favourite topic.',
      definition: 'a property perceived by the eye',
      partOfSpeech: 'noun',
      baseDifficulty: 'BEGINNER',
      wordUS: 'Color',
      normalizedWordUS: 'color',
      exampleSentenceUS: 'The color of the theater was a favorite topic.',
    };

    it('blanks the US spelling, sized to the US word length, for a US-preference player', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ englishVariant: 'US' });
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([{ word: colourWord }]);
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce(baseSession());
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(colourWord);

      const view = await service.start('u1');

      expect(view.sentenceWithBlank).toBe('The _____ of the theater was a favorite topic.');
      expect(view.wordLength).toBe('color'.length);
    });

    it('still blanks the UK spelling for a player with no preference recorded', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ englishVariant: null });
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([{ word: colourWord }]);
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce(baseSession());
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(colourWord);

      const view = await service.start('u1');

      expect(view.sentenceWithBlank).toBe('The ______ of the theatre was a favourite topic.');
      expect(view.wordLength).toBe('colour'.length);
    });

    it('accepts the US spelling as correct, and reports it as the correct answer, for a US-preference player', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ englishVariant: 'US' });
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(baseSession());
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 1,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(colourWord);
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(colourWord);
      rewardEngineMock.calculate.mockReturnValueOnce({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });

      const result = await service.submitAnswer('u1', 's1', 'color');

      expect(result.isCorrect).toBe(true);
      expect(result.correctAnswer).toBe('Color');
    });

    it('rejects the US spelling as incorrect for a player with no preference recorded (UK default)', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ englishVariant: null });
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(baseSession());
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 1,
      });
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(colourWord);
      prismaMock.word.findUniqueOrThrow.mockResolvedValueOnce(colourWord);

      const result = await service.submitAnswer('u1', 's1', 'color');

      expect(result.isCorrect).toBe(false);
      expect(result.correctAnswer).toBe('Colour');
    });
  });
});

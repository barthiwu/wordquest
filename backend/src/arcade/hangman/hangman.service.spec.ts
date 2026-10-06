import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HangmanService } from './hangman.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ArcadeChallengeService } from '../challenge.service';
import { RewardEngineService } from '../reward-engine.service';
import { ProgressionService } from '../../progression/progression.service';
import { AliService } from '../../ali/ali.service';
import { ArcadeVersusService } from '../versus/versus.service';
import { ArcadeGroupService } from '../group/group.service';
import { ArcadePlayLimitService } from '../limits/play-limit.service';

describe('HangmanService', () => {
  let service: HangmanService;

  const catWord = {
    id: 'w1',
    word: 'cat',
    normalizedWord: 'cat',
    baseDifficulty: 'BEGINNER',
    definition: 'A small furry animal.',
    partOfSpeech: 'noun',
    synonyms: ['feline'],
  };

  const baseSession = () => ({
    id: 's1',
    userId: 'u1',
    game: 'HANGMAN',
    status: 'ACTIVE',
    currentStreak: 0,
    longestStreak: 0,
    wordsTotal: 2,
    totalXpAwarded: 0,
    wordIds: ['w1', 'w2'],
    currentIndex: 0,
    currentWordStartedAt: new Date(),
    currentWordHintsUsed: 0,
    currentWordGuesses: [] as string[],
    currentWordGuessCount: 0,
    startedAt: new Date('2026-09-01T00:00:00Z'),
  });

  const prismaMock = {
    arcadeGameSession: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    arcadeAnswer: { create: jest.fn(), count: jest.fn() },
    word: { findUniqueOrThrow: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn((cb: (tx: any) => unknown): unknown => cb(prismaMock)),
  };
  const challengesMock = { pickChallenges: jest.fn() };
  const versusMock = { resolveStart: jest.fn() };
  const groupMock = { resolveStart: jest.fn() };
  const rewardEngineMock = { calculate: jest.fn() };
  const progressionMock = {
    awardXp: jest.fn(),
    recordDailyActivity: jest.fn(),
  };
  const aliMock = { react: jest.fn(), listReactionsSince: jest.fn() };

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
    prismaMock.arcadeGameSession.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.arcadeAnswer.create.mockResolvedValue({});
    prismaMock.arcadeAnswer.count.mockResolvedValue(1);
    prismaMock.word.findUniqueOrThrow.mockResolvedValue(catWord);
    prismaMock.user.findUnique.mockResolvedValue({ englishVariant: null });
    progressionMock.awardXp.mockResolvedValue(undefined);
    progressionMock.recordDailyActivity.mockResolvedValue({ currentStreak: 1 });
    aliMock.listReactionsSince.mockResolvedValue([]);
    rewardEngineMock.calculate.mockReturnValue({
      baseXp: 30,
      speedModifier: 1,
      hintModifier: 1,
      streakModifier: 1,
      finalXp: 30,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        HangmanService,
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
    service = moduleRef.get(HangmanService);
  });

  describe('start (daily play cap)', () => {
    it('takes one play before a new solo session and reports the notice', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([{ word: { id: 'w1' } }]);
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce(baseSession());
      playLimitMock.consumePlay.mockResolvedValueOnce({
        game: 'HANGMAN', used: 5, limit: 10, remaining: 5, percent: 50,
      });

      const view = await service.start('u1');

      expect(playLimitMock.assertCanPlay).toHaveBeenCalledWith('u1', 'HANGMAN');
      expect(playLimitMock.consumePlay).toHaveBeenCalledWith('u1', 'HANGMAN');
      expect(view.playLimit).toEqual(expect.objectContaining({ used: 5, percent: 50 }));
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

      expect(playLimitMock.assertCanPlay).toHaveBeenCalledWith('u1', 'HANGMAN');
      expect(playLimitMock.consumePlay).not.toHaveBeenCalled();
    });
  });

  describe('start (group play)', () => {
    it("creates the session on the group's shared words and ties it to the group", async () => {
      groupMock.resolveStart.mockResolvedValueOnce({ existing: null, wordIds: ['w1', 'w2'], groupId: 'g1' });
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce({ ...baseSession(), groupId: 'g1' });

      await service.start('u1', undefined, 'g1');

      expect(groupMock.resolveStart).toHaveBeenCalledWith('u1', 'g1', 'HANGMAN', expect.any(Function));
      expect(prismaMock.arcadeGameSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          game: 'HANGMAN',
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
        'HANGMAN',
        expect.any(Function),
      );
      expect(prismaMock.arcadeGameSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          game: 'HANGMAN',
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
    it('creates a session and never sends the word', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([
        { word: { id: 'w1' } },
        { word: { id: 'w2' } },
      ]);
      prismaMock.arcadeGameSession.create.mockResolvedValueOnce(baseSession());

      const view = await service.start('u1');

      expect(challengesMock.pickChallenges).toHaveBeenCalledWith('u1', 5, [], 3, 10);
      expect(prismaMock.arcadeGameSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'u1', game: 'HANGMAN', wordsTotal: 2 }),
      });
      expect(view.pattern).toBe('___');
      expect(view.maxWrong).toBe(6);
      expect(JSON.stringify(view)).not.toContain('"cat"');
    });

    it('resumes an active session, keeping its guesses', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce({
        ...baseSession(),
        currentWordGuesses: ['c', 'z'],
        currentWordGuessCount: 2,
      });

      const view = await service.start('u1');

      expect(challengesMock.pickChallenges).not.toHaveBeenCalled();
      expect(view.pattern).toBe('c__');
      expect(view.wrongLetters).toEqual(['z']);
      expect(view.wrongCount).toBe(1);
    });

    it('throws when no words are available', async () => {
      prismaMock.arcadeGameSession.findFirst.mockResolvedValueOnce(null);
      challengesMock.pickChallenges.mockResolvedValueOnce([]);
      await expect(service.start('u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('guessLetter', () => {
    it('records a correct guess and reveals its positions', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(baseSession());
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentWordGuesses: ['a'],
        currentWordGuessCount: 1,
      });

      const result = await service.guessLetter('u1', 's1', 'A');

      expect(result.isHit).toBe(true);
      expect(result.completion).toBeNull();
      expect(result.view.pattern).toBe('_a_');
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', currentIndex: 0, currentWordGuessCount: 0 },
        data: { currentWordGuesses: { push: 'a' }, currentWordGuessCount: { increment: 1 } },
      });
    });

    it('records a wrong guess as a body part', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(baseSession());
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentWordGuesses: ['z'],
        currentWordGuessCount: 1,
      });

      const result = await service.guessLetter('u1', 's1', 'z');

      expect(result.isHit).toBe(false);
      expect(result.view.wrongCount).toBe(1);
      expect(result.view.wrongLetters).toEqual(['z']);
    });

    it('rejects a repeated letter', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentWordGuesses: ['a'],
        currentWordGuessCount: 1,
      });
      await expect(service.guessLetter('u1', 's1', 'a')).rejects.toThrow(BadRequestException);
    });

    it('rejects anything that is not a single letter', async () => {
      await expect(service.guessLetter('u1', 's1', 'ab')).rejects.toThrow(BadRequestException);
      await expect(service.guessLetter('u1', 's1', '1')).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when a concurrent guess wins the race', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(baseSession());
      prismaMock.arcadeGameSession.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.guessLetter('u1', 's1', 'a')).rejects.toThrow(ConflictException);
    });

    it('saves the man: the last missing letter wins the word, awards XP and advances', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentWordGuesses: ['c', 'a'],
        currentWordGuessCount: 2,
      });
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 1,
        currentStreak: 1,
        longestStreak: 1,
      });

      const result = await service.guessLetter('u1', 's1', 't');

      expect(result.completion?.outcome).toBe('WON');
      expect(result.completion?.xpAwarded).toBe(30);
      expect(result.completion?.correctAnswer).toBe('cat');
      expect(result.completion?.currentStreak).toBe(1);
      expect(result.completion?.sessionComplete).toBe(false);
      expect(result.view.pattern).toBe('cat');
      expect(prismaMock.arcadeAnswer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 's1',
          wordIndex: 0,
          isCorrect: true,
          submittedAnswer: 'cat',
        }),
      });
      expect(progressionMock.awardXp).toHaveBeenCalledWith(
        'u1',
        30,
        'ARCADE_HANGMAN_ANSWER',
        'arcade',
        's1:0',
        expect.anything(),
      );
      expect(progressionMock.recordDailyActivity).not.toHaveBeenCalled();
    });

    it('takes a mistake penalty off the XP of a win', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentWordGuesses: ['x', 'y', 'c', 'a'],
        currentWordGuessCount: 4,
      });
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 1,
      });

      const result = await service.guessLetter('u1', 's1', 't');

      // 30 * 0.9^2 = 24.3 -> 24
      expect(result.completion?.xpAwarded).toBe(24);
    });

    it('hangs the man on the sixth wrong letter: no XP, streak resets', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentStreak: 3,
        longestStreak: 3,
        currentWordGuesses: ['x', 'y', 'z', 'q', 'w'],
        currentWordGuessCount: 5,
      });
      prismaMock.arcadeAnswer.count.mockResolvedValueOnce(0);
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 1,
      });

      const result = await service.guessLetter('u1', 's1', 'v');

      expect(result.completion?.outcome).toBe('LOST');
      expect(result.completion?.xpAwarded).toBe(0);
      expect(result.completion?.currentStreak).toBe(0);
      expect(result.completion?.longestStreak).toBe(3);
      expect(result.completion?.correctAnswer).toBe('cat');
      expect(result.view.wrongCount).toBe(6);
      expect(progressionMock.awardXp).not.toHaveBeenCalled();
      expect(rewardEngineMock.calculate).not.toHaveBeenCalled();
    });

    it('completes the session and records daily activity on the last word', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentIndex: 1,
        currentWordGuesses: ['c', 'a'],
        currentWordGuessCount: 2,
      });
      prismaMock.arcadeAnswer.count.mockResolvedValueOnce(2);

      const result = await service.guessLetter('u1', 's1', 't');

      expect(result.completion?.sessionComplete).toBe(true);
      expect(result.completion?.nextChallenge).toBeNull();
      expect(result.completion?.correctCount).toBe(2);
      expect(progressionMock.recordDailyActivity).toHaveBeenCalled();
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', currentIndex: 1, currentWordGuessCount: 2 },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      });
      // A solo play was already counted when it started.
      expect(playLimitMock.consumePlay).not.toHaveBeenCalled();
    });

    it('counts a head-to-head play once the last word is answered (not before)', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        versusMatchId: 'm1',
        currentIndex: 1,
        currentWordGuesses: ['c', 'a'],
        currentWordGuessCount: 2,
      });
      prismaMock.arcadeAnswer.count.mockResolvedValueOnce(2);

      const result = await service.guessLetter('u1', 's1', 't');

      expect(result.completion?.sessionComplete).toBe(true);
      expect(result.completion?.nextChallenge).toBeNull();
      expect(result.completion?.correctCount).toBe(2);
      expect(progressionMock.recordDailyActivity).toHaveBeenCalled();
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', currentIndex: 1, currentWordGuessCount: 2 },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      });
      expect(playLimitMock.consumePlay).toHaveBeenCalledWith('u1', 'HANGMAN', { force: true });
    });

    it('does not double-award when the claim loses a race', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentWordGuesses: ['c', 'a'],
        currentWordGuessCount: 2,
      });
      prismaMock.arcadeGameSession.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.guessLetter('u1', 's1', 't')).rejects.toThrow(ConflictException);
      expect(progressionMock.awardXp).not.toHaveBeenCalled();
    });

    it("refuses another player's session", async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        userId: 'someone-else',
      });
      await expect(service.guessLetter('u1', 's1', 'a')).rejects.toThrow(ForbiddenException);
    });

    it('refuses a missing or ended session, or one from another game', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(null);
      await expect(service.guessLetter('u1', 's1', 'a')).rejects.toThrow(NotFoundException);
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        status: 'COMPLETED',
      });
      await expect(service.guessLetter('u1', 's1', 'a')).rejects.toThrow(BadRequestException);
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        game: 'SCRAMBLE_QUEST',
      });
      await expect(service.guessLetter('u1', 's1', 'a')).rejects.toThrow(BadRequestException);
    });
  });

  describe('requestHint', () => {
    it('reveals one missing letter, costs a hint, and is not a body part', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(baseSession());
      prismaMock.arcadeGameSession.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseSession(),
        currentWordHintsUsed: 1,
        currentWordGuesses: ['a'],
        currentWordGuessCount: 1,
      });

      const result = await service.requestHint('u1', 's1');

      expect(['c', 'a', 't']).toContain(result.letter);
      expect(result.view.hintsRemaining).toBe(0);
      expect(result.view.wrongCount).toBe(0);
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', currentIndex: 0, currentWordGuessCount: 0 },
        data: {
          currentWordGuesses: { push: result.letter },
          currentWordGuessCount: { increment: 1 },
          currentWordHintsUsed: { increment: 1 },
        },
      });
    });

    it('refuses a second hint on the same word', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentWordHintsUsed: 1,
      });
      await expect(service.requestHint('u1', 's1')).rejects.toThrow(BadRequestException);
    });

    it('refuses a hint that would give the word away', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        ...baseSession(),
        currentWordGuesses: ['c', 'a'],
        currentWordGuessCount: 2,
      });
      await expect(service.requestHint('u1', 's1')).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when a guess slips in first', async () => {
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(baseSession());
      prismaMock.arcadeGameSession.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.requestHint('u1', 's1')).rejects.toThrow(ConflictException);
    });
  });
});

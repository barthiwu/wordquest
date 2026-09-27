import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WordDuelService } from './word-duel.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ArcadeChallengeService } from '../challenge.service';
import { RewardEngineService } from '../reward-engine.service';
import { ProgressionService } from '../../progression/progression.service';
import { WORD_DUEL_CONFIG, WORD_DUEL_TIEBREAK_DESCRIPTION } from '../config/arcade.config';

/**
 * Word Duel's two-player, multiply-queried shape (buildStateView and
 * finalizeIfNeeded each re-read match/playerState state independently,
 * and both run more than once per public call) makes a plain queue of
 * `mockResolvedValueOnce` calls -- the pattern ScrambleQuestService/
 * CompleteItService's specs use -- brittle to get right and to keep
 * right as the service evolves. Instead this file backs the Prisma
 * mock with a tiny in-memory fake store (below) that understands just
 * the handful of query/update shapes WordDuelService actually issues,
 * so tests seed state and assert on real outcomes rather than
 * enumerating call order.
 */

interface FakeMatch {
  id: string;
  status: 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  wordIds: string[];
  startedAt: Date | null;
  endsAt: Date | null;
  completedAt: Date | null;
  winnerId: string | null;
  tieBreakReason: string | null;
  createdAt: Date;
}

interface FakePlayerState {
  id: string;
  matchId: string;
  userId: string;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  correctCount: number;
  currentIndex: number;
  currentWordStartedAt: Date;
  joinedAt: Date;
  disconnectedAt: Date | null;
  reconnectedAt: Date | null;
}

interface FakeAnswer {
  id: string;
  matchId: string;
  playerStateId: string;
  wordIndex: number;
  wordId: string;
  submittedAnswer: string;
  isCorrect: boolean;
  cluesRevealed: number;
  baseXp: number;
  speedModifier: number;
  streakModifier: number;
  finalXpAwarded: number;
  streakBefore: number;
  streakAfter: number;
  responseTimeMs: number | null;
  answeredAt: Date;
}

interface FakeWord {
  id: string;
  word: string;
  normalizedWord: string;
  baseDifficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
}

function makeStore() {
  const matches = new Map<string, FakeMatch>();
  const playerStates = new Map<string, FakePlayerState>();
  const answers: FakeAnswer[] = [];
  const words = new Map<string, FakeWord>();
  let matchSeq = 0;
  let playerStateSeq = 0;
  let answerSeq = 0;

  const playersOf = (matchId: string) =>
    [...playerStates.values()].filter((p) => p.matchId === matchId);

  const answersOf = (playerStateId: string) =>
    answers
      .filter((a) => a.playerStateId === playerStateId)
      .sort((a, b) => a.answeredAt.getTime() - b.answeredAt.getTime());

  const wordDuelMatch = {
    findFirst: jest.fn((args: any) => {
      const { where = {}, orderBy } = args;
      let candidates = [...matches.values()];
      if (where.status !== undefined)
        candidates = candidates.filter((m) => m.status === where.status);
      if (where.createdAt?.gte) {
        candidates = candidates.filter(
          (m) => m.createdAt.getTime() >= where.createdAt.gte.getTime(),
        );
      }
      if (where.players?.none?.userId !== undefined) {
        const excluded = where.players.none.userId;
        candidates = candidates.filter((m) => !playersOf(m.id).some((p) => p.userId === excluded));
      }
      if (orderBy?.createdAt === 'asc') {
        candidates.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return candidates[0] ? { ...candidates[0] } : null;
    }),
    findUniqueOrThrow: jest.fn((args: any) => {
      const m = matches.get(args.where.id);
      if (!m) throw new Error(`WordDuelMatch ${args.where.id} not found`);
      return { ...m };
    }),
    findUnique: jest.fn((args: any) => {
      const m = matches.get(args.where.id);
      if (!m) return null;
      if (args.include?.players) {
        return {
          ...m,
          players: playersOf(m.id).map((p) => ({ ...p, answers: answersOf(p.id) })),
        };
      }
      return { ...m };
    }),
    create: jest.fn((args: any) => {
      // Prefixed distinctly from any hand-seeded fixture id ('m1',
      // 'm-stale', ...) so an auto-created row in one test can never
      // collide with a manually-seeded row in another.
      const id = `gen-match-${++matchSeq}`;
      const row: FakeMatch = {
        id,
        status: 'WAITING',
        startedAt: null,
        endsAt: null,
        completedAt: null,
        winnerId: null,
        tieBreakReason: null,
        createdAt: new Date(),
        ...args.data,
      };
      matches.set(id, row);
      return { ...row };
    }),
    updateMany: jest.fn((args: any) => {
      const m = matches.get(args.where.id);
      if (!m) return { count: 0 };
      if (args.where.status !== undefined && m.status !== args.where.status) return { count: 0 };
      Object.assign(m, args.data);
      return { count: 1 };
    }),
    update: jest.fn((args: any) => {
      const m = matches.get(args.where.id);
      if (!m) throw new Error(`WordDuelMatch ${args.where.id} not found`);
      Object.assign(m, args.data);
      return { ...m };
    }),
  };

  const wordDuelPlayerState = {
    findFirst: jest.fn((args: any) => {
      const { where = {} } = args;
      let candidates = [...playerStates.values()];
      if (where.userId !== undefined)
        candidates = candidates.filter((p) => p.userId === where.userId);
      if (where.matchId !== undefined)
        candidates = candidates.filter((p) => p.matchId === where.matchId);
      if (where.match?.status?.in) {
        candidates = candidates.filter((p) => {
          const m = matches.get(p.matchId);
          return m && where.match.status.in.includes(m.status);
        });
      }
      return candidates[0] ? { ...candidates[0] } : null;
    }),
    findUniqueOrThrow: jest.fn((args: any) => {
      const p = playerStates.get(args.where.id);
      if (!p) throw new Error(`WordDuelPlayerState ${args.where.id} not found`);
      const match = matches.get(p.matchId)!;
      return { ...p, match: { ...match, players: playersOf(p.matchId).map((x) => ({ ...x })) } };
    }),
    create: jest.fn((args: any) => {
      // Same collision-avoidance reasoning as wordDuelMatch.create above.
      const id = `gen-player-${++playerStateSeq}`;
      const row: FakePlayerState = {
        id,
        totalXp: 0,
        currentStreak: 0,
        longestStreak: 0,
        correctCount: 0,
        currentIndex: 0,
        currentWordStartedAt: new Date(),
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
        ...args.data,
      };
      playerStates.set(id, row);
      return { ...row };
    }),
    updateMany: jest.fn((args: any) => {
      const p = playerStates.get(args.where.id);
      if (!p) return { count: 0 };
      if (args.where.currentIndex !== undefined && p.currentIndex !== args.where.currentIndex) {
        return { count: 0 };
      }
      for (const [key, value] of Object.entries<any>(args.data)) {
        if (value && typeof value === 'object' && 'increment' in value) {
          (p as any)[key] = ((p as any)[key] ?? 0) + value.increment;
        } else {
          (p as any)[key] = value;
        }
      }
      return { count: 1 };
    }),
  };

  const word = {
    findUniqueOrThrow: jest.fn((args: any) => {
      const w = words.get(args.where.id);
      if (!w) throw new Error(`Word ${args.where.id} not found`);
      return { ...w };
    }),
  };

  const wordDuelAnswer = {
    create: jest.fn((args: any) => {
      const dup = answers.find(
        (a) => a.playerStateId === args.data.playerStateId && a.wordIndex === args.data.wordIndex,
      );
      if (dup) {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      }
      const row: FakeAnswer = {
        id: `gen-answer-${++answerSeq}`,
        answeredAt: new Date(),
        ...args.data,
      };
      answers.push(row);
      return { ...row };
    }),
  };

  return {
    matches,
    playerStates,
    answers,
    words,
    wordDuelMatch,
    wordDuelPlayerState,
    word,
    wordDuelAnswer,
  };
}

describe('WordDuelService', () => {
  let service: WordDuelService;
  let store: ReturnType<typeof makeStore>;
  let prismaMock: any;

  const challengesMock = { pickChallenges: jest.fn() };
  const rewardEngineMock = { calculate: jest.fn() };
  const progressionMock = {
    awardXp: jest.fn().mockResolvedValue(undefined),
    recordDailyActivity: jest.fn().mockResolvedValue({ currentStreak: 1 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    store = makeStore();
    prismaMock = {
      wordDuelMatch: store.wordDuelMatch,
      wordDuelPlayerState: store.wordDuelPlayerState,
      wordDuelAnswer: store.wordDuelAnswer,
      word: store.word,
      $transaction: jest.fn((callback: (tx: any) => unknown) => callback(prismaMock)),
    };
    progressionMock.awardXp.mockResolvedValue(undefined);
    progressionMock.recordDailyActivity.mockResolvedValue({ currentStreak: 1 });

    store.words.set('w1', {
      id: 'w1',
      word: 'train',
      normalizedWord: 'train',
      baseDifficulty: 'BEGINNER',
    });
    store.words.set('w2', {
      id: 'w2',
      word: 'humid',
      normalizedWord: 'humid',
      baseDifficulty: 'INTERMEDIATE',
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        WordDuelService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ArcadeChallengeService, useValue: challengesMock },
        { provide: RewardEngineService, useValue: rewardEngineMock },
        { provide: ProgressionService, useValue: progressionMock },
      ],
    }).compile();
    service = moduleRef.get(WordDuelService);
  });

  describe('joinQueue', () => {
    it('starts a fresh WAITING match when no opponent is queued', async () => {
      challengesMock.pickChallenges.mockResolvedValueOnce([
        { word: { id: 'w1' } },
        { word: { id: 'w2' } },
      ]);

      const view = await service.joinQueue('u1');

      expect(challengesMock.pickChallenges).toHaveBeenCalledWith(
        'u1',
        WORD_DUEL_CONFIG.WORDS_PER_MATCH,
        [],
        WORD_DUEL_CONFIG.MIN_WORD_LENGTH,
      );
      expect(view.status).toBe('WAITING');
      expect(view.wordsTotal).toBe(2);
      expect(view.opponent).toBeNull();
      expect(view.current).toBeNull(); // no clock runs until a second player arrives
    });

    it('throws BadRequestException when no words are available for a fresh match', async () => {
      challengesMock.pickChallenges.mockResolvedValueOnce([]);
      await expect(service.joinQueue('u1')).rejects.toThrow(BadRequestException);
    });

    it('claims a waiting opponent, activating the match for both players', async () => {
      store.matches.set('m1', {
        id: 'm1',
        status: 'WAITING',
        wordIds: ['w1', 'w2'],
        startedAt: null,
        endsAt: null,
        completedAt: null,
        winnerId: null,
        tieBreakReason: null,
        createdAt: new Date(),
      });
      store.playerStates.set('ps1', {
        id: 'ps1',
        matchId: 'm1',
        userId: 'u1',
        totalXp: 0,
        currentStreak: 0,
        longestStreak: 0,
        correctCount: 0,
        currentIndex: 0,
        currentWordStartedAt: new Date(),
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
      });

      const view = await service.joinQueue('u2');

      expect(view.status).toBe('ACTIVE');
      expect(view.matchEndsAt).not.toBeNull();
      expect(view.opponent).toEqual({ correctCount: 0, totalXp: 0 });
      expect(view.current).not.toBeNull(); // clock now runs — an opponent has joined
      expect(challengesMock.pickChallenges).not.toHaveBeenCalled();
    });

    it("resumes the caller's own ACTIVE match without creating anything new", async () => {
      store.matches.set('m1', {
        id: 'm1',
        status: 'ACTIVE',
        wordIds: ['w1', 'w2'],
        startedAt: new Date(),
        endsAt: new Date(Date.now() + 60_000),
        completedAt: null,
        winnerId: null,
        tieBreakReason: null,
        createdAt: new Date(),
      });
      for (const [id, userId] of [
        ['ps1', 'u1'],
        ['ps2', 'u2'],
      ] as const) {
        store.playerStates.set(id, {
          id,
          matchId: 'm1',
          userId,
          totalXp: 0,
          currentStreak: 0,
          longestStreak: 0,
          correctCount: 0,
          currentIndex: 0,
          currentWordStartedAt: new Date(),
          joinedAt: new Date(),
          disconnectedAt: null,
          reconnectedAt: null,
        });
      }

      const view = await service.joinQueue('u1');

      expect(view.matchId).toBe('m1');
      expect(view.status).toBe('ACTIVE');
      expect(challengesMock.pickChallenges).not.toHaveBeenCalled();
      expect(store.wordDuelPlayerState.create).not.toHaveBeenCalled();
    });

    it("abandons the caller's own stale WAITING match and starts fresh matchmaking", async () => {
      store.matches.set('m-stale', {
        id: 'm-stale',
        status: 'WAITING',
        wordIds: ['w1'],
        startedAt: null,
        endsAt: null,
        completedAt: null,
        winnerId: null,
        tieBreakReason: null,
        createdAt: new Date(Date.now() - (WORD_DUEL_CONFIG.MATCHMAKING_TIMEOUT_SECONDS + 5) * 1000),
      });
      store.playerStates.set('ps-stale', {
        id: 'ps-stale',
        matchId: 'm-stale',
        userId: 'u1',
        totalXp: 0,
        currentStreak: 0,
        longestStreak: 0,
        correctCount: 0,
        currentIndex: 0,
        currentWordStartedAt: new Date(),
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
      });
      challengesMock.pickChallenges.mockResolvedValueOnce([{ word: { id: 'w1' } }]);

      const view = await service.joinQueue('u1');

      expect(store.matches.get('m-stale')?.status).toBe('ABANDONED');
      expect(challengesMock.pickChallenges).toHaveBeenCalled();
      expect(view.matchId).not.toBe('m-stale');
      expect(view.status).toBe('WAITING');
    });
  });

  describe('getState', () => {
    it('throws NotFoundException when the caller has no state in that match', async () => {
      await expect(service.getState('u1', 'missing-match')).rejects.toThrow(NotFoundException);
    });

    it("returns the opponent's live progress without their current word", async () => {
      store.matches.set('m1', {
        id: 'm1',
        status: 'ACTIVE',
        wordIds: ['w1', 'w2'],
        startedAt: new Date(),
        endsAt: new Date(Date.now() + 60_000),
        completedAt: null,
        winnerId: null,
        tieBreakReason: null,
        createdAt: new Date(),
      });
      store.playerStates.set('ps1', {
        id: 'ps1',
        matchId: 'm1',
        userId: 'u1',
        totalXp: 0,
        currentStreak: 0,
        longestStreak: 0,
        correctCount: 0,
        currentIndex: 0,
        currentWordStartedAt: new Date(),
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
      });
      store.playerStates.set('ps2', {
        id: 'ps2',
        matchId: 'm1',
        userId: 'u2',
        totalXp: 40,
        currentStreak: 2,
        longestStreak: 2,
        correctCount: 2,
        currentIndex: 1,
        currentWordStartedAt: new Date(),
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
      });

      const view = await service.getState('u1', 'm1');

      expect(view.opponent).toEqual({ correctCount: 2, totalXp: 40 }); // score only, never their current word
      expect(view.current?.displayHint).toBe('_ _ _ _ _'); // no clues revealed yet
    });
  });

  describe('submitAnswer', () => {
    const seedActiveMatch = (overrides: Partial<FakeMatch> = {}) => {
      store.matches.set('m1', {
        id: 'm1',
        status: 'ACTIVE',
        wordIds: ['w1', 'w2'],
        startedAt: new Date(Date.now() - 5_000),
        endsAt: new Date(Date.now() + 60_000),
        completedAt: null,
        winnerId: null,
        tieBreakReason: null,
        createdAt: new Date(Date.now() - 5_000),
        ...overrides,
      });
      store.playerStates.set('ps1', {
        id: 'ps1',
        matchId: 'm1',
        userId: 'u1',
        totalXp: 0,
        currentStreak: 0,
        longestStreak: 0,
        correctCount: 0,
        currentIndex: 0,
        currentWordStartedAt: new Date(),
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
      });
      store.playerStates.set('ps2', {
        id: 'ps2',
        matchId: 'm1',
        userId: 'u2',
        totalXp: 0,
        currentStreak: 0,
        longestStreak: 0,
        correctCount: 0,
        currentIndex: 0,
        currentWordStartedAt: new Date(),
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
      });
    };

    it('throws NotFoundException when the caller has no state in that match', async () => {
      seedActiveMatch();
      await expect(service.submitAnswer('u9', 'm1', 'train')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the match is not ACTIVE yet', async () => {
      seedActiveMatch({ status: 'WAITING' });
      await expect(service.submitAnswer('u1', 'm1', 'train')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException once this player has exhausted every word', async () => {
      seedActiveMatch();
      store.playerStates.get('ps1')!.currentIndex = 2; // wordIds.length
      await expect(service.submitAnswer('u1', 'm1', 'train')).rejects.toThrow(BadRequestException);
    });

    it('awards XP, extends the streak, and advances on a correct answer', async () => {
      seedActiveMatch();
      rewardEngineMock.calculate.mockReturnValue({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });

      const result = await service.submitAnswer('u1', 'm1', 'train');

      expect(result.isCorrect).toBe(true);
      expect(result.correctAnswer).toBe('train');
      expect(result.xpAwarded).toBe(30);
      expect(result.currentStreak).toBe(1);
      expect(rewardEngineMock.calculate).toHaveBeenCalledWith(
        expect.objectContaining({ hintsUsed: 0, streakBefore: 0 }),
      );
      expect(progressionMock.awardXp).toHaveBeenCalledWith(
        'u1',
        30,
        'ARCADE_WORD_DUEL_ANSWER',
        'arcade',
        'm1:ps1:0',
        prismaMock,
      );
      const ps1 = store.playerStates.get('ps1')!;
      expect(ps1.currentIndex).toBe(1);
      expect(ps1.correctCount).toBe(1);
      expect(ps1.totalXp).toBe(30);
      expect(result.state.wordIndex).toBe(1);
    });

    it('resets the streak and awards no XP on a wrong answer, but still advances', async () => {
      seedActiveMatch();
      store.playerStates.get('ps1')!.currentStreak = 3;

      const result = await service.submitAnswer('u1', 'm1', 'not-the-word');

      expect(result.isCorrect).toBe(false);
      expect(result.xpAwarded).toBe(0);
      expect(result.currentStreak).toBe(0);
      expect(rewardEngineMock.calculate).not.toHaveBeenCalled();
      expect(progressionMock.awardXp).not.toHaveBeenCalled();
      expect(store.playerStates.get('ps1')!.currentIndex).toBe(1);
    });

    it('throws ConflictException on a duplicate/raced submission for the same word', async () => {
      seedActiveMatch();
      // The race this guards: two requests both compute a correct
      // answer for the same word before either has advanced
      // currentIndex, so calculate() is genuinely invoked here too.
      rewardEngineMock.calculate.mockReturnValue({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });
      store.answers.push({
        id: 'a-existing',
        matchId: 'm1',
        playerStateId: 'ps1',
        wordIndex: 0,
        wordId: 'w1',
        submittedAnswer: 'train',
        isCorrect: true,
        cluesRevealed: 0,
        baseXp: 30,
        speedModifier: 1,
        streakModifier: 1,
        finalXpAwarded: 30,
        streakBefore: 0,
        streakAfter: 1,
        responseTimeMs: 1000,
        answeredAt: new Date(),
      });

      await expect(service.submitAnswer('u1', 'm1', 'train')).rejects.toThrow(ConflictException);
      expect(progressionMock.awardXp).not.toHaveBeenCalled();
    });

    it('completes the match once the deadline passes, crediting daily activity for both players', async () => {
      seedActiveMatch({ wordIds: ['w1'], endsAt: new Date(Date.now() - 1_000) });
      rewardEngineMock.calculate.mockReturnValue({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });

      const result = await service.submitAnswer('u1', 'm1', 'train');

      expect(store.matches.get('m1')?.status).toBe('COMPLETED');
      expect(result.state.status).toBe('COMPLETED');
      expect(result.state.result).not.toBeNull();
      expect(progressionMock.recordDailyActivity).toHaveBeenCalledWith('u1');
      expect(progressionMock.recordDailyActivity).toHaveBeenCalledWith('u2');
    });

    it('breaks a tie in correctCount by whoever reached their final total earliest', async () => {
      seedActiveMatch({ wordIds: ['w1'], endsAt: new Date(Date.now() - 1_000) });
      const earlier = new Date(Date.now() - 30_000);
      store.playerStates.get('ps2')!.currentIndex = 1;
      store.playerStates.get('ps2')!.correctCount = 1;
      store.playerStates.get('ps2')!.totalXp = 30;
      store.answers.push({
        id: 'a-ps2',
        matchId: 'm1',
        playerStateId: 'ps2',
        wordIndex: 0,
        wordId: 'w1',
        submittedAnswer: 'train',
        isCorrect: true,
        cluesRevealed: 0,
        baseXp: 30,
        speedModifier: 1,
        streakModifier: 1,
        finalXpAwarded: 30,
        streakBefore: 0,
        streakAfter: 1,
        responseTimeMs: 1000,
        answeredAt: earlier,
      });
      rewardEngineMock.calculate.mockReturnValue({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });

      await service.submitAnswer('u1', 'm1', 'train'); // ps1 answers correctly too, now (now)

      const match = store.matches.get('m1')!;
      expect(match.tieBreakReason).toBe(WORD_DUEL_TIEBREAK_DESCRIPTION);
      expect(match.winnerId).toBe('u2'); // reached their final total earlier
    });
  });
});

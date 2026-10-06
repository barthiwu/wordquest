import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WordDuelService } from './word-duel.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ArcadeChallengeService } from '../challenge.service';
import { RewardEngineService } from '../reward-engine.service';
import { ProgressionService } from '../../progression/progression.service';
import { FriendsService } from '../../friends/friends.service';
import { AliService } from '../../ali/ali.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { WORD_DUEL_CONFIG, WORD_DUEL_TIEBREAK_DESCRIPTION } from '../config/arcade.config';
import { ArcadePlayLimitService } from '../limits/play-limit.service';

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
  currentWordCluesRevealed: number;
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
  // US/UK spelling-variant fields (2026-09 fairness feature) -- optional
  // because most fixtures in this file don't need a distinct US form;
  // renderWord() falls back to the UK word/normalizedWord/exampleSentence
  // fields whenever these are absent, exactly like the real Word model.
  exampleSentence?: string;
  wordUS?: string | null;
  normalizedWordUS?: string | null;
  exampleSentenceUS?: string | null;
  // Meaning/clue fields -- optional with defaults below so existing
  // fixtures that don't care about them (most of this file) don't need
  // updating; tests that DO care set them explicitly.
  definition?: string;
  synonyms?: string[];
  category?: string | null;
}

function makeStore() {
  const matches = new Map<string, FakeMatch>();
  const playerStates = new Map<string, FakePlayerState>();
  const answers: FakeAnswer[] = [];
  const words = new Map<string, FakeWord>();
  // englishVariant preference per userId -- absent means "never set",
  // which resolveEnglishVariant treats identically to null (UK
  // fallback), matching production's nullable-column behavior.
  const users = new Map<string, 'US' | 'UK' | null>();
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
        currentWordCluesRevealed: 0,
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
      // Generic CAS guard: any scalar `where` field beyond `id` (e.g.
      // currentIndex for submitAnswer's claim, currentWordCluesRevealed
      // for requestClue's) must still match the row's current value, or
      // this is a lost race -- same "count: 0 on a stale read" contract
      // Prisma's real updateMany gives.
      for (const [key, value] of Object.entries<any>(args.where)) {
        if (key === 'id') continue;
        if ((p as any)[key] !== value) return { count: 0 };
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
      // Real Word rows always have a definition and a (possibly empty)
      // synonyms array -- default fixtures that don't set them
      // explicitly get harmless stand-ins rather than undefined, same
      // as production's non-null columns. category defaults to null
      // (a real, nullable column) and exampleSentence to '' (fixtures
      // that don't care about the EXAMPLE clue's exact text never set
      // it -- blankSentence() on an empty string just leaves it
      // unblanked/empty, it never throws).
      return { definition: '', synonyms: [], category: null, exampleSentence: '', ...w };
    }),
  };

  const user = {
    findUnique: jest.fn((args: any) => {
      const variant = users.has(args.where.id) ? users.get(args.where.id)! : null;
      return { englishVariant: variant };
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
    users,
    wordDuelMatch,
    wordDuelPlayerState,
    word,
    user,
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
  const friendsMock = {
    areBlocked: jest.fn().mockResolvedValue(false),
    getPublicIdentity: jest.fn().mockResolvedValue(null),
  };
  const aliMock = {
    react: jest.fn(),
    listReactionsSince: jest.fn().mockResolvedValue([]),
  };
  const analyticsMock = { track: jest.fn() };

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
    store = makeStore();
    prismaMock = {
      wordDuelMatch: store.wordDuelMatch,
      wordDuelPlayerState: store.wordDuelPlayerState,
      wordDuelAnswer: store.wordDuelAnswer,
      word: store.word,
      user: store.user,
      $transaction: jest.fn((callback: (tx: any) => unknown) => callback(prismaMock)),
    };
    progressionMock.awardXp.mockResolvedValue(undefined);
    progressionMock.recordDailyActivity.mockResolvedValue({ currentStreak: 1 });
    friendsMock.areBlocked.mockReset().mockResolvedValue(false);
    friendsMock.getPublicIdentity.mockReset().mockResolvedValue(null);
    aliMock.react.mockReset();
    aliMock.listReactionsSince.mockReset().mockResolvedValue([]);
    analyticsMock.track.mockReset();

    store.words.set('w1', {
      id: 'w1',
      word: 'train',
      normalizedWord: 'train',
      baseDifficulty: 'BEGINNER',
      definition: 'To teach a skill through practice.',
      synonyms: ['coach', 'drill'],
      category: 'Skills',
      exampleSentence: 'The coach will train the new recruits every morning.',
    });
    store.words.set('w2', {
      id: 'w2',
      word: 'humid',
      normalizedWord: 'humid',
      baseDifficulty: 'INTERMEDIATE',
      definition: 'Containing a high amount of moisture in the air.',
      synonyms: ['damp'],
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        WordDuelService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ArcadePlayLimitService, useValue: playLimitMock },
        { provide: ArcadeChallengeService, useValue: challengesMock },
        { provide: RewardEngineService, useValue: rewardEngineMock },
        { provide: ProgressionService, useValue: progressionMock },
        { provide: FriendsService, useValue: friendsMock },
        { provide: AliService, useValue: aliMock },
        { provide: AnalyticsService, useValue: analyticsMock },
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
        WORD_DUEL_CONFIG.MAX_WORD_LENGTH,
        // The EXAMPLE-clue sentence-quality filter (2026-09-30 spec).
        expect.any(Function),
      );
      expect(view.status).toBe('WAITING');
      expect(view.wordsTotal).toBe(2);
      expect(view.opponent).toBeNull();
      expect(view.current).toBeNull(); // no clock runs until a second player arrives
    });

    it('refuses to start a new duel once the daily cap is reached', async () => {
      playLimitMock.assertCanPlay.mockRejectedValueOnce(new Error('ARCADE_PLAY_LIMIT'));

      await expect(service.joinQueue('u1')).rejects.toThrow('ARCADE_PLAY_LIMIT');
      expect(playLimitMock.assertCanPlay).toHaveBeenCalledWith('u1', 'WORD_DUEL');
      expect(challengesMock.pickChallenges).not.toHaveBeenCalled();
      expect(prismaMock.wordDuelMatch.create).not.toHaveBeenCalled();
    });

    it('waiting alone takes no play; the play is counted when an opponent arrives', async () => {
      challengesMock.pickChallenges.mockResolvedValueOnce([{ word: { id: 'w1' } }]);
      await service.joinQueue('u1');
      expect(playLimitMock.consumePlay).not.toHaveBeenCalled();
    });

    it('counts the play for BOTH players when the match goes active, never refusing either', async () => {
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
        currentWordCluesRevealed: 0,
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
      });
      playLimitMock.consumePlay.mockResolvedValueOnce({
        game: 'WORD_DUEL',
        used: 7,
        limit: 10,
        remaining: 3,
        percent: 70,
      });

      const view = await service.joinQueue('u2');

      expect(playLimitMock.consumePlay).toHaveBeenCalledWith('u2', 'WORD_DUEL', { force: true });
      expect(playLimitMock.consumePlay).toHaveBeenCalledWith('u1', 'WORD_DUEL', { force: true });
      expect(view.playLimit).toEqual(expect.objectContaining({ used: 7, percent: 70 }));
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
        currentWordCluesRevealed: 0,
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
      // DUEL_STARTED fires for BOTH participants, not just the joiner —
      // the waiting player finds out the match went ACTIVE on their next
      // poll, but the event itself is recorded the moment it actually
      // happened, server-side.
      expect(analyticsMock.track).toHaveBeenCalledWith(
        'u2',
        'DUEL_STARTED',
        { matchId: 'm1' },
        { screen: 'WordDuel' },
      );
      expect(analyticsMock.track).toHaveBeenCalledWith(
        'u1',
        'DUEL_STARTED',
        { matchId: 'm1' },
        { screen: 'WordDuel' },
      );
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
          currentWordCluesRevealed: 0,
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

    it('never claims a WAITING match whose only player has blocked (or been blocked by) the joiner', async () => {
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
        currentWordCluesRevealed: 0,
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
      });
      friendsMock.areBlocked.mockResolvedValue(true);
      challengesMock.pickChallenges.mockResolvedValueOnce([{ word: { id: 'w1' } }]);

      const view = await service.joinQueue('u2');

      expect(friendsMock.areBlocked).toHaveBeenCalledWith('u2', 'u1');
      expect(store.matches.get('m1')?.status).toBe('WAITING'); // never claimed
      expect(view.matchId).not.toBe('m1'); // u2 got a fresh match of their own instead
      expect(view.status).toBe('WAITING');
      expect(challengesMock.pickChallenges).toHaveBeenCalled();
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
        currentWordCluesRevealed: 0,
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
        currentWordCluesRevealed: 0,
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
        currentWordCluesRevealed: 0,
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
      });

      const view = await service.getState('u1', 'm1');

      expect(view.opponent).toEqual({ correctCount: 2, totalXp: 40 }); // score only, never their current word
      expect(view.current?.displayHint).toBe('_ _ _ _ _'); // no clues revealed yet
      // Meaning is always shown, unlike the letter/clue reveal -- 2026-09-29 spec.
      expect(view.current?.meaning).toBe('To teach a skill through practice.');
      expect(view.current?.clues).toEqual([]);
    });

    it("shows the opponent's real username live, once they've joined an ACTIVE match (2026-09-29: no longer COMPLETED-only)", async () => {
      store.matches.set('m1', {
        id: 'm1',
        status: 'ACTIVE',
        wordIds: ['w1'],
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
        currentWordCluesRevealed: 0,
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
        currentWordCluesRevealed: 0,
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
      });
      friendsMock.getPublicIdentity.mockResolvedValueOnce({
        userId: 'u2',
        username: 'RivalRex',
        avatarUrl: null,
      });

      const view = await service.getState('u1', 'm1');

      expect(friendsMock.getPublicIdentity).toHaveBeenCalledWith('u2');
      expect(view.opponent?.username).toBe('RivalRex');
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
        currentWordCluesRevealed: 0,
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
        currentWordCluesRevealed: 0,
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

    it('tracks DUEL_LOCK_IN and DUEL_ANSWER_RESULT with the actual computed reward, never the hidden answer', async () => {
      seedActiveMatch();
      store.playerStates.get('ps1')!.currentWordCluesRevealed = 2;
      rewardEngineMock.calculate.mockReturnValue({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });

      await service.submitAnswer('u1', 'm1', 'train');

      expect(analyticsMock.track).toHaveBeenCalledWith(
        'u1',
        'DUEL_LOCK_IN',
        expect.objectContaining({ cluesUsed: 2, currentRewardXp: 30 }),
        { screen: 'WordDuel' },
      );
      expect(analyticsMock.track).toHaveBeenCalledWith(
        'u1',
        'DUEL_ANSWER_RESULT',
        { correct: true, cluesUsed: 2, responseTimeMs: expect.any(Number), xpAwarded: 30 },
        { screen: 'WordDuel' },
      );
      const answerResultCall = analyticsMock.track.mock.calls.find(
        (call: unknown[]) => call[1] === 'DUEL_ANSWER_RESULT',
      );
      expect(JSON.stringify(answerResultCall)).not.toContain('train');
    });

    it('reports currentRewardXp: 0 on an incorrect answer', async () => {
      seedActiveMatch();

      await service.submitAnswer('u1', 'm1', 'not-the-word');

      expect(analyticsMock.track).toHaveBeenCalledWith(
        'u1',
        'DUEL_LOCK_IN',
        expect.objectContaining({ currentRewardXp: 0 }),
        { screen: 'WordDuel' },
      );
      expect(analyticsMock.track).toHaveBeenCalledWith(
        'u1',
        'DUEL_ANSWER_RESULT',
        expect.objectContaining({ correct: false, xpAwarded: 0 }),
        { screen: 'WordDuel' },
      );
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

    it('completes the match once both players are done, crediting daily activity for both players', async () => {
      seedActiveMatch({ wordIds: ['w1'], endsAt: new Date(Date.now() + 60_000) });
      store.playerStates.get('ps2')!.currentIndex = 1; // opponent already done: u1's answer ends it
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
      expect(analyticsMock.track).toHaveBeenCalledWith(
        'u1',
        'DUEL_COMPLETED',
        expect.objectContaining({ correct: 1, won: true, tie: false }),
      );
      expect(analyticsMock.track).toHaveBeenCalledWith(
        'u2',
        'DUEL_COMPLETED',
        expect.objectContaining({ correct: 0, won: false, tie: false }),
      );
    });

    it('reads back a STREAK_MILESTONE and any deferred reactions once the match completes (task #99 follow-up)', async () => {
      seedActiveMatch({ wordIds: ['w1'], endsAt: new Date(Date.now() + 60_000) });
      store.playerStates.get('ps2')!.currentIndex = 1; // opponent already done: u1's answer ends it
      rewardEngineMock.calculate.mockReturnValue({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });
      aliMock.listReactionsSince.mockResolvedValueOnce([
        {
          text: 'Seven days!',
          recommendation: null,
          eventType: 'STREAK_MILESTONE',
          createdAt: new Date().toISOString(),
          expression: 'PROUD',
          pose: 'APPROVING_NOD',
          intensity: 3,
          priority: 3,
          durationMs: 2500,
        },
        {
          text: 'Level 5!',
          recommendation: null,
          eventType: 'LEVEL_UP',
          createdAt: new Date().toISOString(),
          expression: 'EXCITED',
          pose: 'CELEBRATORY_HOP',
          intensity: 4,
          priority: 4,
          durationMs: 3000,
        },
      ]);

      const result = await service.submitAnswer('u1', 'm1', 'train');

      expect(aliMock.listReactionsSince).toHaveBeenCalledWith(
        'u1',
        store.matches.get('m1')!.startedAt,
        expect.arrayContaining(['STREAK_MILESTONE', 'LEVEL_UP', 'JOURNEY_COMPLETION']),
      );
      expect(result.state.streakReaction?.text).toBe('Seven days!');
      expect(result.state.deferredAliReactions).toHaveLength(1);
      expect(result.state.deferredAliReactions[0].text).toBe('Level 5!');
    });

    it('leaves streakReaction/deferredAliReactions empty while the match is still ACTIVE', async () => {
      seedActiveMatch();

      const view = await service.getState('u1', 'm1');

      expect(view.streakReaction).toBeNull();
      expect(view.deferredAliReactions).toEqual([]);
      expect(aliMock.listReactionsSince).not.toHaveBeenCalled();
    });

    it('breaks a tie in correctCount by whoever reached their final total earliest', async () => {
      seedActiveMatch({ wordIds: ['w1'], endsAt: new Date(Date.now() + 60_000) });
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

    it('refuses an answer that arrives after the deadline, and finalizes the match without scoring it', async () => {
      seedActiveMatch({ wordIds: ['w1'], endsAt: new Date(Date.now() - 1_000) });

      await expect(service.submitAnswer('u1', 'm1', 'train')).rejects.toThrow('Time is up');

      expect(store.matches.get('m1')?.status).toBe('COMPLETED');
      expect(store.playerStates.get('ps1')!.correctCount).toBe(0);
      expect(rewardEngineMock.calculate).not.toHaveBeenCalled();
    });
  });

  describe('requestClue (2026-09-29: player-triggered, replacing the old automatic time-based reveal)', () => {
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
        currentWordCluesRevealed: 0,
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
        currentWordCluesRevealed: 0,
        joinedAt: new Date(),
        disconnectedAt: null,
        reconnectedAt: null,
      });
    };

    it('reveals category, synonym, first & last letters, example, then 60% of the letters, in that fixed order (2026-09-30 spec)', async () => {
      seedActiveMatch();

      const afterFirst = await service.requestClue('u1', 'm1');
      expect(afterFirst.current?.cluesRevealed).toBe(1);
      expect(afterFirst.current?.clues).toEqual([{ type: 'CATEGORY', text: 'Skills' }]);
      expect(afterFirst.current?.displayHint).toBe('_ _ _ _ _'); // no letters revealed yet

      const afterSecond = await service.requestClue('u1', 'm1');
      expect(afterSecond.current?.cluesRevealed).toBe(2);
      expect(afterSecond.current?.clues).toEqual([
        { type: 'CATEGORY', text: 'Skills' },
        { type: 'SYNONYM', text: 'coach' },
      ]);
      expect(afterSecond.current?.displayHint).toBe('_ _ _ _ _'); // still no letters revealed

      const afterThird = await service.requestClue('u1', 'm1');
      expect(afterThird.current?.cluesRevealed).toBe(3);
      expect(afterThird.current?.clues[2]).toEqual({ type: 'FIRST_LAST', text: null });
      // 'train' -- first (T) and last (N) letters only.
      expect(afterThird.current?.displayHint).toBe('T _ _ _ N');

      const afterFourth = await service.requestClue('u1', 'm1');
      expect(afterFourth.current?.cluesRevealed).toBe(4);
      expect(afterFourth.current?.clues[3]).toEqual({
        type: 'EXAMPLE',
        text: 'The coach will _____ the new recruits every morning.',
      });
      expect(afterFourth.current?.displayHint).toBe('T _ _ _ N'); // EXAMPLE reveals no letters

      const afterFifth = await service.requestClue('u1', 'm1');
      expect(afterFifth.current?.cluesRevealed).toBe(5);
      expect(afterFifth.current?.clues[4]).toEqual({ type: 'LETTERS', text: null });
      // round(5 * 0.6) = 3 letters total, always including the FIRST_LAST
      // pair (T, N) -- the 3rd position is a deterministic-random pick
      // from the interior, so assert on the shape rather than which
      // exact interior letter it lands on.
      const parts = afterFifth.current!.displayHint.split(' ');
      expect(parts[0]).toBe('T');
      expect(parts[4]).toBe('N');
      expect(parts.filter((p) => p !== '_')).toHaveLength(3);
    });

    it('throws BadRequestException once all five clues have been used', async () => {
      seedActiveMatch();
      await service.requestClue('u1', 'm1');
      await service.requestClue('u1', 'm1');
      await service.requestClue('u1', 'm1');
      await service.requestClue('u1', 'm1');
      await service.requestClue('u1', 'm1');

      await expect(service.requestClue('u1', 'm1')).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when a concurrent clue request wins the race', async () => {
      seedActiveMatch();
      store.wordDuelPlayerState.updateMany.mockReturnValueOnce({ count: 0 });

      await expect(service.requestClue('u1', 'm1')).rejects.toThrow(ConflictException);
    });

    it("resets a player's clue count to 0 once they advance to the next word", async () => {
      seedActiveMatch();
      await service.requestClue('u1', 'm1');
      await service.requestClue('u1', 'm1');
      expect(store.playerStates.get('ps1')!.currentWordCluesRevealed).toBe(2);

      rewardEngineMock.calculate.mockReturnValue({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });
      await service.submitAnswer('u1', 'm1', 'train');

      expect(store.playerStates.get('ps1')!.currentWordCluesRevealed).toBe(0);
    });

    it('returns a null synonym clue when the word has none recorded, rather than throwing', async () => {
      store.words.set('w3', {
        id: 'w3',
        word: 'zesty',
        normalizedWord: 'zesty',
        baseDifficulty: 'BEGINNER',
        definition: 'Full of lively, energetic flavor.',
        synonyms: [],
      });
      seedActiveMatch({ wordIds: ['w3'] });

      await service.requestClue('u1', 'm1'); // CATEGORY (also null -- w3 has none recorded)
      const view = await service.requestClue('u1', 'm1'); // SYNONYM
      expect(view.current?.clues[1]).toEqual({ type: 'SYNONYM', text: null });
    });

    it('returns a null category clue when the word has none recorded, rather than throwing', async () => {
      store.words.set('w4', {
        id: 'w4',
        word: 'quiet',
        normalizedWord: 'quiet',
        baseDifficulty: 'BEGINNER',
        definition: 'Making little or no noise.',
        synonyms: ['silent'],
        // category deliberately omitted -- defaults to null.
      });
      seedActiveMatch({ wordIds: ['w4'] });

      const view = await service.requestClue('u1', 'm1');
      expect(view.current?.clues).toEqual([{ type: 'CATEGORY', text: null }]);
    });

    it('tracks DUEL_CLUE_USED with a 1-based clueNumber and the matching clueType, never the hidden answer', async () => {
      seedActiveMatch();

      await service.requestClue('u1', 'm1');
      expect(analyticsMock.track).toHaveBeenCalledWith(
        'u1',
        'DUEL_CLUE_USED',
        { clueNumber: 1, clueType: 'CATEGORY', timeSinceWordPresentedMs: expect.any(Number) },
        { screen: 'WordDuel' },
      );

      await service.requestClue('u1', 'm1');
      expect(analyticsMock.track).toHaveBeenCalledWith(
        'u1',
        'DUEL_CLUE_USED',
        { clueNumber: 2, clueType: 'SYNONYM', timeSinceWordPresentedMs: expect.any(Number) },
        { screen: 'WordDuel' },
      );
    });
  });

  describe('US/UK spelling-variant rendering (2026-09 fairness feature)', () => {
    // 'Colour'/'Color' differ both in spelling and in letter count (6 vs
    // 5), so a wrong-variant hint length is impossible to miss.
    beforeEach(() => {
      store.words.set('w-colour', {
        id: 'w-colour',
        word: 'Colour',
        normalizedWord: 'colour',
        baseDifficulty: 'BEGINNER',
        wordUS: 'Color',
        normalizedWordUS: 'color',
      });
    });

    const seedColourMatch = () => {
      store.matches.set('m1', {
        id: 'm1',
        status: 'ACTIVE',
        wordIds: ['w-colour'],
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
          currentWordCluesRevealed: 0,
          joinedAt: new Date(),
          disconnectedAt: null,
          reconnectedAt: null,
        });
      }
    };

    it('shows a US-preference player a hint sized to the US spelling', async () => {
      seedColourMatch();
      store.users.set('u1', 'US');

      const view = await service.getState('u1', 'm1');

      expect(view.current?.displayHint).toBe('_ _ _ _ _'); // 'color' -- 5 letters
    });

    it('falls back to the UK spelling for a player with no preference recorded', async () => {
      seedColourMatch();
      // u2 is never added to store.users -- exercises the null/UK-fallback default.

      const view = await service.getState('u2', 'm1');

      expect(view.current?.displayHint).toBe('_ _ _ _ _ _'); // 'colour' -- 6 letters
    });

    it('lets two players on the same match see the identical underlying word in their own spelling at once', async () => {
      seedColourMatch();
      store.users.set('u1', 'US');
      store.users.set('u2', 'UK');

      const [usView, ukView] = await Promise.all([
        service.getState('u1', 'm1'),
        service.getState('u2', 'm1'),
      ]);

      expect(usView.current?.displayHint).toBe('_ _ _ _ _'); // color
      expect(ukView.current?.displayHint).toBe('_ _ _ _ _ _'); // colour
    });

    it('accepts the US spelling as correct for a US-preference player and reports it back as the correct answer', async () => {
      seedColourMatch();
      store.users.set('u1', 'US');
      rewardEngineMock.calculate.mockReturnValue({
        baseXp: 30,
        speedModifier: 1,
        hintModifier: 1,
        streakModifier: 1,
        finalXp: 30,
      });

      const result = await service.submitAnswer('u1', 'm1', 'color');

      expect(result.isCorrect).toBe(true);
      expect(result.correctAnswer).toBe('Color');
    });

    it('rejects the US spelling for a player who defaults to UK (no preference recorded)', async () => {
      seedColourMatch();
      // u2 has no recorded preference -- UK fallback.

      const result = await service.submitAnswer('u2', 'm1', 'color');

      expect(result.isCorrect).toBe(false);
      expect(result.correctAnswer).toBe('Colour');
    });
  });
});

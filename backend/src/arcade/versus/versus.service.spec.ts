import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ArcadeVersusService } from './versus.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../../friends/friends.service';
import { NotificationService } from '../../notifications/notification.service';
import { ProgressionService } from '../../progression/progression.service';

describe('ArcadeVersusService', () => {
  let service: ArcadeVersusService;

  const matchRow = (over: Record<string, unknown> = {}) => ({
    id: 'm1',
    game: 'SCRAMBLE_QUEST',
    kind: 'RANDOM',
    status: 'ACTIVE',
    hostId: 'host',
    guestId: 'guest',
    wordIds: ['w1', 'w2'],
    wordsPickedAt: new Date('2026-10-06T12:00:00Z'),
    winnerId: null,
    resultReason: null,
    hostCorrect: null,
    guestCorrect: null,
    hostTimeMs: null,
    guestTimeMs: null,
    createdAt: new Date('2026-10-06T12:00:00Z'),
    activatedAt: new Date('2026-10-06T12:00:00Z'),
    expiresAt: new Date(Date.now() + 20 * 60_000),
    settledAt: null,
    ...over,
  });

  const asRow = (m: unknown) => m as Parameters<ArcadeVersusService['settleIfDue']>[0];

  const prismaMock = {
    arcadeVersusMatch: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    arcadeGameSession: { findMany: jest.fn(), findUnique: jest.fn() },
    friendship: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn((cb: (tx: unknown) => unknown): unknown => cb(prismaMock)),
  };
  const friendsMock = { areBlocked: jest.fn(), getPublicIdentity: jest.fn() };
  const notificationsMock = { notifyFireAndForget: jest.fn() };
  const progressionMock = { awardXp: jest.fn() };

  const answers = (correct: number, wrong: number, ms = 1000) => [
    ...Array.from({ length: correct }, () => ({ isCorrect: true, responseTimeMs: ms })),
    ...Array.from({ length: wrong }, () => ({ isCorrect: false, responseTimeMs: ms })),
  ];
  const session = (userId: string, status: string, a: unknown[], endedAt: Date | null = null) => ({
    userId,
    status,
    endedAt,
    answers: a,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$executeRaw.mockResolvedValue(1);
    prismaMock.arcadeVersusMatch.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.arcadeGameSession.findMany.mockResolvedValue([]);
    prismaMock.user.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    friendsMock.areBlocked.mockResolvedValue(false);
    friendsMock.getPublicIdentity.mockImplementation(async (id: string) => ({
      userId: id,
      username: `user_${id}`,
      avatarUrl: null,
    }));
    progressionMock.awardXp.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ArcadeVersusService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FriendsService, useValue: friendsMock },
        { provide: NotificationService, useValue: notificationsMock },
        { provide: ProgressionService, useValue: progressionMock },
      ],
    }).compile();
    service = moduleRef.get(ArcadeVersusService);
  });

  describe('queue', () => {
    it('rejects Word Duel and unknown games', async () => {
      await expect(service.queue('u1', 'WORD_DUEL' as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('takes the per-game lock, then creates a SEARCHING row when nobody is waiting', async () => {
      prismaMock.arcadeVersusMatch.findMany.mockResolvedValue([]); // none of mine, no candidates
      prismaMock.arcadeVersusMatch.create.mockResolvedValueOnce({ id: 'm1' });
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(
        matchRow({ status: 'SEARCHING', hostId: 'u1', guestId: null }),
      );
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(
        matchRow({ status: 'SEARCHING', hostId: 'u1', guestId: null }),
      );

      const view = await service.queue('u1', 'SCRAMBLE_QUEST');

      expect(prismaMock.$executeRaw).toHaveBeenCalled();
      expect(prismaMock.arcadeVersusMatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          game: 'SCRAMBLE_QUEST',
          kind: 'RANDOM',
          status: 'SEARCHING',
          hostId: 'u1',
        }),
      });
      expect(view.status).toBe('SEARCHING');
    });

    it('pairs with the oldest waiting player', async () => {
      prismaMock.arcadeVersusMatch.findMany
        .mockResolvedValueOnce([]) // my own
        .mockResolvedValueOnce([
          matchRow({ id: 'w', status: 'SEARCHING', hostId: 'other', guestId: null }),
        ]);
      prismaMock.arcadeVersusMatch.update.mockResolvedValue({});
      const active = matchRow({ id: 'w', hostId: 'other', guestId: 'u1' });
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(active);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(active);

      const view = await service.queue('u1', 'SCRAMBLE_QUEST');

      expect(prismaMock.arcadeVersusMatch.update).toHaveBeenCalledWith({
        where: { id: 'w' },
        data: expect.objectContaining({ guestId: 'u1', status: 'ACTIVE' }),
      });
      expect(prismaMock.arcadeVersusMatch.create).not.toHaveBeenCalled();
      expect(view.id).toBe('w');
      expect(view.status).toBe('ACTIVE');
    });

    it('never pairs with a blocked player', async () => {
      friendsMock.areBlocked.mockResolvedValue(true);
      prismaMock.arcadeVersusMatch.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          matchRow({ id: 'w', status: 'SEARCHING', hostId: 'other', guestId: null }),
        ]);
      prismaMock.arcadeVersusMatch.create.mockResolvedValueOnce({ id: 'mine' });
      const mine = matchRow({ id: 'mine', status: 'SEARCHING', hostId: 'u1', guestId: null });
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(mine);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(mine);

      await service.queue('u1', 'SCRAMBLE_QUEST');

      expect(prismaMock.arcadeVersusMatch.update).not.toHaveBeenCalled();
      expect(prismaMock.arcadeVersusMatch.create).toHaveBeenCalled();
    });

    it('resumes an existing search instead of starting a second one', async () => {
      const mine = matchRow({
        id: 'mine',
        status: 'SEARCHING',
        hostId: 'u1',
        guestId: null,
        sessions: [],
      });
      prismaMock.arcadeVersusMatch.findMany.mockResolvedValueOnce([mine]);
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(mine);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(mine);

      const view = await service.queue('u1', 'SCRAMBLE_QUEST');

      expect(view.id).toBe('mine');
      expect(prismaMock.arcadeVersusMatch.create).not.toHaveBeenCalled();
    });

    it('a match the player already finished does not block a new one', async () => {
      const finished = matchRow({ id: 'old', hostId: 'u1', sessions: [{ status: 'COMPLETED' }] });
      prismaMock.arcadeVersusMatch.findMany
        .mockResolvedValueOnce([finished])
        .mockResolvedValueOnce([]);
      prismaMock.arcadeVersusMatch.create.mockResolvedValueOnce({ id: 'new' });
      const fresh = matchRow({ id: 'new', status: 'SEARCHING', hostId: 'u1', guestId: null });
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(fresh);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(fresh);

      const view = await service.queue('u1', 'SCRAMBLE_QUEST');
      expect(view.id).toBe('new');
    });
  });

  describe('invite', () => {
    it('only friends can be challenged', async () => {
      prismaMock.friendship.findFirst.mockResolvedValueOnce(null);
      await expect(service.invite('u1', 'u2', 'HANGMAN')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('cannot challenge yourself or a blocked friend', async () => {
      await expect(service.invite('u1', 'u1', 'HANGMAN')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      prismaMock.friendship.findFirst.mockResolvedValueOnce({ id: 'f' });
      friendsMock.areBlocked.mockResolvedValueOnce(true);
      await expect(service.invite('u1', 'u2', 'HANGMAN')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('creates an INVITED match and notifies the friend', async () => {
      prismaMock.friendship.findFirst.mockResolvedValueOnce({ id: 'f' });
      prismaMock.arcadeVersusMatch.findFirst.mockResolvedValueOnce(null);
      prismaMock.arcadeVersusMatch.count.mockResolvedValueOnce(0);
      prismaMock.arcadeVersusMatch.create.mockResolvedValueOnce({ id: 'm9' });
      const invited = matchRow({
        id: 'm9',
        kind: 'FRIEND',
        status: 'INVITED',
        hostId: 'u1',
        guestId: 'u2',
        game: 'HANGMAN',
        wordsPickedAt: null,
        wordIds: [],
      });
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(invited);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(invited);

      const view = await service.invite('u1', 'u2', 'HANGMAN');

      expect(prismaMock.arcadeVersusMatch.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'FRIEND',
          status: 'INVITED',
          hostId: 'u1',
          guestId: 'u2',
        }),
      });
      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u2',
        'ARCADE_CHALLENGE',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ deepLink: 'wordquest://arcade/versus/m9' }),
      );
      expect(view.status).toBe('INVITED');
    });

    it('caps open challenges', async () => {
      prismaMock.friendship.findFirst.mockResolvedValueOnce({ id: 'f' });
      prismaMock.arcadeVersusMatch.findFirst.mockResolvedValueOnce(null);
      prismaMock.arcadeVersusMatch.count.mockResolvedValueOnce(5);
      await expect(service.invite('u1', 'u2', 'HANGMAN')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('respond', () => {
    const invited = () =>
      matchRow({
        kind: 'FRIEND',
        status: 'INVITED',
        hostId: 'host',
        guestId: 'guest',
        wordsPickedAt: null,
        wordIds: [],
      });

    it('only the challenged player can answer', async () => {
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValueOnce(invited());
      await expect(service.respond('host', 'm1', true)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepting activates the match with a fresh play window', async () => {
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValueOnce(invited());
      const active = matchRow({ kind: 'FRIEND', wordsPickedAt: null, wordIds: [] });
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(active);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(active);

      await service.respond('guest', 'm1', true);

      expect(prismaMock.arcadeVersusMatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', status: 'INVITED' },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      });
    });

    it('a lost race reads as no longer open', async () => {
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValueOnce(invited());
      prismaMock.arcadeVersusMatch.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.respond('guest', 'm1', false)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('resolveStart', () => {
    it('refuses another game, and matches that are not active', async () => {
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(matchRow());
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(matchRow());
      await expect(
        service.resolveStart('host', 'm1', 'HANGMAN', async () => []),
      ).rejects.toBeInstanceOf(BadRequestException);
      const searching = matchRow({ status: 'SEARCHING' });
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(searching);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(searching);
      await expect(
        service.resolveStart('host', 'm1', 'SCRAMBLE_QUEST', async () => []),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('the first starter picks the words once; the second reads them', async () => {
      const unpicked = matchRow({ wordsPickedAt: null, wordIds: [] });
      const picked = matchRow({ wordIds: ['a', 'b', 'c'] });
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(unpicked);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow
        .mockResolvedValueOnce(unpicked) // refresh
        .mockResolvedValueOnce(picked); // after the pick
      prismaMock.arcadeGameSession.findUnique.mockResolvedValue(null);
      const pick = jest.fn().mockResolvedValue(['a', 'b', 'c']);

      const r = await service.resolveStart('host', 'm1', 'SCRAMBLE_QUEST', pick);

      expect(pick).toHaveBeenCalledTimes(1);
      expect(prismaMock.arcadeVersusMatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', wordsPickedAt: null },
        data: expect.objectContaining({ wordIds: ['a', 'b', 'c'] }),
      });
      expect(r.wordIds).toEqual(['a', 'b', 'c']);

      // Second player: already picked, never calls pick.
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(picked);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(picked);
      const pick2 = jest.fn();
      const r2 = await service.resolveStart('guest', 'm1', 'SCRAMBLE_QUEST', pick2);
      expect(pick2).not.toHaveBeenCalled();
      expect(r2.wordIds).toEqual(['a', 'b', 'c']);
    });

    it('resumes an unfinished session but refuses a finished one', async () => {
      const m = matchRow();
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(m);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(m);
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({ id: 's', status: 'ACTIVE' });
      const r = await service.resolveStart('host', 'm1', 'SCRAMBLE_QUEST', jest.fn());
      expect(r.existing).toMatchObject({ id: 's' });

      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        id: 's',
        status: 'COMPLETED',
      });
      await expect(
        service.resolveStart('host', 'm1', 'SCRAMBLE_QUEST', jest.fn()),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hides matches from non-participants', async () => {
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(matchRow());
      await expect(
        service.resolveStart('stranger', 'm1', 'SCRAMBLE_QUEST', jest.fn()),
      ).rejects.toThrow('Match not found');
    });
  });

  describe('settlement', () => {
    const t = (min: number) => new Date(Date.now() - min * 60_000);

    it('settles when both finished: winner by correct answers, bonus XP on a random match', async () => {
      prismaMock.arcadeGameSession.findMany.mockResolvedValue([
        session('host', 'COMPLETED', answers(4, 1), t(2)),
        session('guest', 'COMPLETED', answers(2, 3), t(1)),
      ]);

      const settled = await service.settleIfDue(asRow(matchRow()));

      expect(settled).toBe(true);
      expect(prismaMock.arcadeVersusMatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', status: 'ACTIVE' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          winnerId: 'host',
          resultReason: 'WIN',
          hostCorrect: 4,
          guestCorrect: 2,
        }),
      });
      expect(progressionMock.awardXp).toHaveBeenCalledWith(
        'host',
        40,
        expect.any(String),
        'ARCADE_VERSUS',
        'm1',
      );
      // Live random match, both present: nobody needs a push.
      expect(notificationsMock.notifyFireAndForget).not.toHaveBeenCalled();
    });

    it('friend matches pay no win bonus but notify both players', async () => {
      prismaMock.arcadeGameSession.findMany.mockResolvedValue([
        session('host', 'COMPLETED', answers(3, 2), t(5)),
        session('guest', 'COMPLETED', answers(5, 0), t(1)),
      ]);

      await service.settleIfDue(asRow(matchRow({ kind: 'FRIEND' })));

      expect(progressionMock.awardXp).not.toHaveBeenCalled();
      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledTimes(2);
    });

    it('does nothing while the opponent is still inside the grace window', async () => {
      prismaMock.arcadeGameSession.findMany.mockResolvedValue([
        session('host', 'COMPLETED', answers(4, 1), t(1)),
        session('guest', 'ACTIVE', answers(1, 1)),
      ]);
      expect(await service.settleIfDue(asRow(matchRow()))).toBe(false);
      expect(prismaMock.arcadeVersusMatch.updateMany).not.toHaveBeenCalled();
    });

    it('forfeits an unfinished opponent after the grace window', async () => {
      prismaMock.arcadeGameSession.findMany.mockResolvedValue([
        session('host', 'COMPLETED', answers(4, 1), t(8)),
        session('guest', 'ACTIVE', answers(1, 1)),
      ]);

      expect(await service.settleIfDue(asRow(matchRow()))).toBe(true);
      expect(prismaMock.arcadeVersusMatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', status: 'ACTIVE' },
        data: expect.objectContaining({ winnerId: 'host', resultReason: 'FORFEIT' }),
      });
      // The one who left is told.
      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'guest',
        'ARCADE_RESULT',
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );
    });

    it('expires a match nobody played as no contest, with no bonus', async () => {
      prismaMock.arcadeGameSession.findMany.mockResolvedValue([]);
      const old = matchRow({ expiresAt: t(1) });
      expect(await service.settleIfDue(asRow(old))).toBe(true);
      expect(prismaMock.arcadeVersusMatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', status: 'ACTIVE' },
        data: expect.objectContaining({
          status: 'EXPIRED',
          resultReason: 'NO_CONTEST',
          winnerId: null,
        }),
      });
      expect(progressionMock.awardXp).not.toHaveBeenCalled();
    });

    it('only the compare-and-swap winner runs the side effects', async () => {
      prismaMock.arcadeGameSession.findMany.mockResolvedValue([
        session('host', 'COMPLETED', answers(4, 1), t(2)),
        session('guest', 'COMPLETED', answers(2, 3), t(1)),
      ]);
      prismaMock.arcadeVersusMatch.updateMany.mockResolvedValueOnce({ count: 0 });

      expect(await service.settleIfDue(asRow(matchRow()))).toBe(false);
      expect(progressionMock.awardXp).not.toHaveBeenCalled();
    });
  });

  describe('views', () => {
    it('shows the live opponent progress but only reveals scores once settled', async () => {
      const m = matchRow();
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(m);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(m);
      prismaMock.arcadeGameSession.findMany.mockResolvedValue([
        session('host', 'ACTIVE', answers(1, 1)),
        session('guest', 'ACTIVE', answers(3, 0)),
      ]);

      const view = await service.getMatch('host', 'm1');

      expect(view.me).toEqual({ answered: 2, finished: false });
      expect(view.opponentProgress).toEqual({ answered: 3, finished: false });
      expect(view.result).toBeNull();
      expect(view.opponent?.username).toBe('user_guest');
    });

    it("builds the result from each viewer's side", async () => {
      const settled = matchRow({
        status: 'COMPLETED',
        winnerId: 'host',
        resultReason: 'WIN',
        hostCorrect: 4,
        guestCorrect: 2,
        hostTimeMs: 4000,
        guestTimeMs: 9000,
        settledAt: new Date(),
      });
      prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(settled);
      prismaMock.arcadeVersusMatch.findUniqueOrThrow.mockResolvedValue(settled);

      const host = await service.getMatch('host', 'm1');
      const guest = await service.getMatch('guest', 'm1');

      expect(host.result).toMatchObject({
        outcome: 'WIN',
        myCorrect: 4,
        theirCorrect: 2,
        bonusXp: 40,
      });
      expect(guest.result).toMatchObject({
        outcome: 'LOSS',
        myCorrect: 2,
        theirCorrect: 4,
        bonusXp: 0,
      });
    });
  });
});

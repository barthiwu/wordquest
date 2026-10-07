import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { ArcadeGroupService } from './group.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';

const CODE = 'ABCDEFGHJK';

describe('ArcadeGroupService', () => {
  let service: ArcadeGroupService;

  const groupRow = (over: Record<string, unknown> = {}) => ({
    id: 'g1',
    code: CODE,
    game: 'SCRAMBLE_QUEST',
    status: 'LOBBY',
    hostId: 'host',
    title: 'JSS2 vocabulary',
    maxMembers: 50,
    showLeaderboard: true,
    windowMinutes: 60,
    wordIds: [] as string[],
    wordsPickedAt: null as Date | null,
    createdAt: new Date(Date.now() - 3_600_000),
    allowGuests: true,
    activatedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 3_600_000),
    endedAt: null as Date | null,
    ...over,
  });

  const prismaMock = {
    arcadeGroup: {
      create: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    arcadeGroupMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    arcadeGameSession: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    word: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn((arg: unknown): unknown =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prismaMock)
        : Promise.all(arg as unknown[]),
    ),
  };
  const usersMock = { resolveAvatarUrl: jest.fn().mockResolvedValue(null) };

  const member = (userId: string, username = userId) => ({
    userId,
    groupId: 'g1',
    joinedAt: new Date(),
    user: { id: userId, username, avatarKey: null },
  });
  const answers = (correct: number, wrong: number, ms = 1000) => [
    ...Array.from({ length: correct }, (_, i) => ({
      wordIndex: i,
      isCorrect: true,
      responseTimeMs: ms,
    })),
    ...Array.from({ length: wrong }, (_, i) => ({
      wordIndex: correct + i,
      isCorrect: false,
      responseTimeMs: ms,
    })),
  ];
  const session = (userId: string, status: string, a: unknown[]) => ({
    userId,
    status,
    answers: a,
  });

  /** Makes the caller a member of `row` (loadMemberGroup). */
  const asMember = (row: ReturnType<typeof groupRow>) =>
    prismaMock.arcadeGroup.findFirst.mockResolvedValue(row);

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.arcadeGroup.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.arcadeGameSession.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.arcadeGroupMember.findMany.mockResolvedValue([member('host')]);
    prismaMock.arcadeGameSession.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ArcadeGroupService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UsersService, useValue: usersMock },
      ],
    }).compile();
    service = moduleRef.get(ArcadeGroupService);
  });

  describe('create', () => {
    it('makes a private lobby with the host as its first member', async () => {
      prismaMock.arcadeGroup.count.mockResolvedValueOnce(0);
      prismaMock.arcadeGroup.create.mockResolvedValueOnce(groupRow());

      const view = await service.create('host', {
        game: 'SCRAMBLE_QUEST',
        title: '  JSS2 vocabulary ',
      });

      const data = prismaMock.arcadeGroup.create.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({
          game: 'SCRAMBLE_QUEST',
          title: 'JSS2 vocabulary',
          hostId: 'host',
          maxMembers: 50,
          showLeaderboard: true,
          members: { create: { userId: 'host' } },
        }),
      );
      expect(data.code).toMatch(/^[A-Z2-9]{10}$/);
      expect(view.isHost).toBe(true);
      expect(view.status).toBe('LOBBY');
    });

    it('refuses a game with no group mode (Word Duel is live 1v1)', async () => {
      await expect(service.create('host', { game: 'WORD_DUEL' as never })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.arcadeGroup.create).not.toHaveBeenCalled();
    });

    it('caps how many open groups one host can run', async () => {
      prismaMock.arcadeGroup.count.mockResolvedValueOnce(10);
      await expect(service.create('host', { game: 'HANGMAN' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('retries when the random code collides', async () => {
      const { Prisma } = jest.requireActual('@prisma/client');
      prismaMock.arcadeGroup.count.mockResolvedValueOnce(0);
      prismaMock.arcadeGroup.create
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
        )
        .mockResolvedValueOnce(groupRow());

      await service.create('host', { game: 'HANGMAN' });

      expect(prismaMock.arcadeGroup.create).toHaveBeenCalledTimes(2);
    });

    it('can turn the leaderboard off for assessment use', async () => {
      prismaMock.arcadeGroup.count.mockResolvedValueOnce(0);
      prismaMock.arcadeGroup.create.mockResolvedValueOnce(groupRow({ showLeaderboard: false }));
      await service.create('host', { game: 'COMPLETE_IT', showLeaderboard: false });
      expect(prismaMock.arcadeGroup.create.mock.calls[0][0].data.showLeaderboard).toBe(false);
    });
  });

  describe('preview', () => {
    it('shows the group without naming its members', async () => {
      prismaMock.arcadeGroup.findUnique.mockResolvedValueOnce(groupRow());
      prismaMock.user.findUnique.mockResolvedValueOnce({ username: 'mrs_okafor' });
      prismaMock.arcadeGroupMember.count.mockResolvedValueOnce(12);

      const p = await service.preview('abcdefghjk');

      expect(prismaMock.arcadeGroup.findUnique).toHaveBeenCalledWith({ where: { code: CODE } });
      expect(p).toEqual({
        code: CODE,
        game: 'SCRAMBLE_QUEST',
        title: 'JSS2 vocabulary',
        hostUsername: 'mrs_okafor',
        status: 'LOBBY',
        memberCount: 12,
        maxMembers: 50,
        full: false,
        allowGuests: true,
      });
    });

    it('says not found for a malformed code without querying', async () => {
      await expect(service.preview('nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.arcadeGroup.findUnique).not.toHaveBeenCalled();
    });

    it('treats an ended group exactly like a missing one', async () => {
      prismaMock.arcadeGroup.findUnique.mockResolvedValueOnce(groupRow({ status: 'ENDED' }));
      await expect(service.preview(CODE)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ends a lapsed group on the way past and then refuses it', async () => {
      prismaMock.arcadeGroup.findUnique.mockResolvedValueOnce(
        groupRow({ expiresAt: new Date(Date.now() - 1000) }),
      );
      prismaMock.arcadeGroup.findUniqueOrThrow.mockResolvedValueOnce(groupRow({ status: 'ENDED' }));
      await expect(service.preview(CODE)).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.arcadeGroup.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ENDED' }) }),
      );
    });
  });

  describe('link expiry (48 hours after creation)', () => {
    const old = () => groupRow({ createdAt: new Date(Date.now() - 49 * 3_600_000) });

    it('refuses a preview once the link is older than 48 hours, even for a running group', async () => {
      prismaMock.arcadeGroup.findUnique.mockResolvedValue(
        Object.assign(old(), { status: 'ACTIVE' }),
      );
      await expect(service.preview(CODE)).rejects.toBeInstanceOf(GoneException);
    });

    it('refuses a new person joining after 48 hours', async () => {
      prismaMock.arcadeGroup.findUnique.mockResolvedValue(
        Object.assign(old(), { status: 'ACTIVE' }),
      );
      await expect(service.join('late', CODE)).rejects.toBeInstanceOf(GoneException);
      expect(prismaMock.arcadeGroupMember.create).not.toHaveBeenCalled();
    });

    it('still works just inside the window', async () => {
      prismaMock.arcadeGroup.findUnique.mockResolvedValue(
        groupRow({ createdAt: new Date(Date.now() - 47 * 3_600_000) }),
      );
      prismaMock.user.findUnique.mockResolvedValueOnce({ username: 'host' });
      prismaMock.arcadeGroupMember.count.mockResolvedValueOnce(2);
      await expect(service.preview(CODE)).resolves.toMatchObject({ code: CODE });
    });

    it('tells the host when the link stops working', async () => {
      prismaMock.arcadeGroup.create.mockImplementationOnce(({ data }: { data: object }) =>
        Promise.resolve(groupRow({ ...(data as Record<string, unknown>), createdAt: new Date() })),
      );
      prismaMock.arcadeGroupMember.findMany.mockResolvedValue([]);
      prismaMock.arcadeGameSession.findMany.mockResolvedValue([]);
      const view = await service.create('host', { game: 'SCRAMBLE_QUEST' });
      const left = new Date(view.linkExpiresAt).getTime() - Date.now();
      expect(left).toBeGreaterThan(47 * 3_600_000);
      expect(left).toBeLessThanOrEqual(48 * 3_600_000);
    });
  });

  describe('join', () => {
    beforeEach(() => {
      prismaMock.arcadeGroup.findUnique.mockResolvedValue(groupRow());
    });

    it('adds the player and returns the group', async () => {
      prismaMock.arcadeGroupMember.findUnique.mockResolvedValueOnce(null);
      prismaMock.arcadeGroupMember.count.mockResolvedValueOnce(5);
      prismaMock.arcadeGroupMember.findMany.mockResolvedValue([member('host'), member('stu')]);

      const view = await service.join('stu', CODE);

      expect(prismaMock.arcadeGroupMember.create).toHaveBeenCalledWith({
        data: { groupId: 'g1', userId: 'stu' },
      });
      expect(view.memberCount).toBe(2);
      expect(view.isHost).toBe(false);
    });

    it('takes the per-group lock so the cap holds under a rush', async () => {
      prismaMock.arcadeGroupMember.findUnique.mockResolvedValueOnce(null);
      prismaMock.arcadeGroupMember.count.mockResolvedValueOnce(0);
      await service.join('stu', CODE);
      expect(prismaMock.$executeRaw).toHaveBeenCalled();
    });

    it('is idempotent for someone already in', async () => {
      prismaMock.arcadeGroupMember.findUnique.mockResolvedValueOnce({ id: 'm' });
      await service.join('stu', CODE);
      expect(prismaMock.arcadeGroupMember.create).not.toHaveBeenCalled();
    });

    it('refuses the 51st player', async () => {
      prismaMock.arcadeGroupMember.findUnique.mockResolvedValueOnce(null);
      prismaMock.arcadeGroupMember.count.mockResolvedValueOnce(50);
      await expect(service.join('stu', CODE)).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.arcadeGroupMember.create).not.toHaveBeenCalled();
    });

    it('lets a latecomer in once the round is running', async () => {
      prismaMock.arcadeGroup.findUnique.mockResolvedValue(groupRow({ status: 'ACTIVE' }));
      prismaMock.arcadeGroupMember.findUnique.mockResolvedValueOnce(null);
      prismaMock.arcadeGroupMember.count.mockResolvedValueOnce(3);
      await service.join('late', CODE);
      expect(prismaMock.arcadeGroupMember.create).toHaveBeenCalled();
    });

    it('refuses an ended group', async () => {
      prismaMock.arcadeGroup.findUnique.mockResolvedValue(groupRow({ status: 'ENDED' }));
      await expect(service.join('stu', CODE)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('keeps guests out of an accounts-only group, but not people with accounts', async () => {
      prismaMock.arcadeGroup.findUnique.mockResolvedValue(groupRow({ allowGuests: false }));
      await expect(service.join('guest', CODE, true)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prismaMock.arcadeGroupMember.create).not.toHaveBeenCalled();
      prismaMock.arcadeGroupMember.findUnique.mockResolvedValueOnce(null);
      prismaMock.arcadeGroupMember.count.mockResolvedValueOnce(1);
      await service.join('member', CODE, false);
      expect(prismaMock.arcadeGroupMember.create).toHaveBeenCalled();
    });
  });

  describe('start / end', () => {
    it('only the host may start', async () => {
      asMember(groupRow());
      await expect(service.start('stu', 'g1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('starts the round with the chosen window and sets its end time', async () => {
      asMember(groupRow());
      prismaMock.arcadeGroup.findFirst.mockResolvedValue(groupRow());
      const before = Date.now();

      await service.start('host', 'g1', 30);

      const arg = prismaMock.arcadeGroup.updateMany.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'g1', status: 'LOBBY' });
      expect(arg.data.status).toBe('ACTIVE');
      expect(arg.data.windowMinutes).toBe(30);
      const end = (arg.data.expiresAt as Date).getTime();
      expect(end).toBeGreaterThanOrEqual(before + 30 * 60_000);
      expect(end).toBeLessThan(before + 30 * 60_000 + 5000);
    });

    it('cannot start twice', async () => {
      asMember(groupRow({ status: 'ACTIVE' }));
      await expect(service.start('host', 'g1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('loses a start race cleanly', async () => {
      asMember(groupRow());
      prismaMock.arcadeGroup.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.start('host', 'g1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('ending stops plays still open, once', async () => {
      asMember(groupRow({ status: 'ACTIVE' }));
      await service.end('host', 'g1');
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalledWith({
        where: { groupId: 'g1', status: 'ACTIVE' },
        data: expect.objectContaining({ status: 'ABANDONED' }),
      });
    });

    it('ending an already-ended group does nothing more', async () => {
      asMember(groupRow({ status: 'ENDED' }));
      prismaMock.arcadeGroup.updateMany.mockResolvedValueOnce({ count: 0 });
      await service.end('host', 'g1');
      expect(prismaMock.arcadeGameSession.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('members leaving and being removed', () => {
    it('a member can leave, and their open play stops', async () => {
      asMember(groupRow());
      await service.leave('stu', 'g1');
      expect(prismaMock.arcadeGroupMember.deleteMany).toHaveBeenCalledWith({
        where: { groupId: 'g1', userId: 'stu' },
      });
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalled();
    });

    it('the host cannot leave', async () => {
      asMember(groupRow());
      await expect(service.leave('host', 'g1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('only the host can remove someone, and not themselves', async () => {
      asMember(groupRow());
      await expect(service.removeMember('stu', 'g1', 'other')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.removeMember('host', 'g1', 'host')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await service.removeMember('host', 'g1', 'stu');
      expect(prismaMock.arcadeGroupMember.deleteMany).toHaveBeenCalledWith({
        where: { groupId: 'g1', userId: 'stu' },
      });
    });
  });

  describe('get (results)', () => {
    const active = (over: Record<string, unknown> = {}) =>
      groupRow({
        status: 'ACTIVE',
        wordIds: ['w1', 'w2', 'w3'],
        wordsPickedAt: new Date(),
        activatedAt: new Date(),
        ...over,
      });
    const populate = () => {
      prismaMock.arcadeGroupMember.findMany.mockResolvedValue([
        member('host'),
        member('amaka'),
        member('bayo'),
        member('chi'),
      ]);
      prismaMock.arcadeGameSession.findMany.mockResolvedValue([
        session('amaka', 'COMPLETED', answers(3, 0)),
        session('bayo', 'ACTIVE', answers(1, 1)),
      ]);
    };

    it('hides everything from a non-member', async () => {
      prismaMock.arcadeGroup.findFirst.mockResolvedValueOnce(null);
      await expect(service.get('stranger', 'g1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ranks the table and shows each member their state', async () => {
      asMember(active());
      populate();

      const view = await service.get('amaka', 'g1');

      expect(view.members.map((m) => [m.username, m.state, m.rank, m.correct])).toEqual([
        ['amaka', 'FINISHED', 1, 3],
        ['bayo', 'PLAYING', 2, 1],
        ['host', 'NOT_STARTED', null, 0],
        ['chi', 'NOT_STARTED', null, 0],
      ]);
      expect(view.wordsTotal).toBe(3);
      expect(view.me?.username).toBe('amaka');
      expect(view.wordBreakdown).toBeNull();
    });

    it('in assessment mode a member sees only their own scores; states stay visible', async () => {
      asMember(active({ showLeaderboard: false }));
      populate();

      const view = await service.get('bayo', 'g1');

      const bayo = view.members.find((m) => m.username === 'bayo');
      const amaka = view.members.find((m) => m.username === 'amaka');
      expect(bayo?.correct).toBe(1);
      expect(amaka?.correct).toBeNull();
      expect(amaka?.rank).toBeNull();
      expect(amaka?.state).toBe('FINISHED');
    });

    it('the host always sees every score, even in assessment mode', async () => {
      asMember(active({ showLeaderboard: false }));
      populate();
      const view = await service.get('host', 'g1');
      expect(view.members.find((m) => m.username === 'amaka')?.correct).toBe(3);
      expect(view.isHost).toBe(true);
    });

    it('sends the per-word breakdown to the host only, and only once the round has ended', async () => {
      asMember(active({ status: 'ENDED', endedAt: new Date() }));
      populate();
      prismaMock.word.findMany.mockResolvedValue([
        { id: 'w1', word: 'tenacious', definition: 'holding firm' },
        { id: 'w2', word: 'verdant', definition: 'green' },
        { id: 'w3', word: 'pensive', definition: 'thoughtful' },
      ]);

      const forHost = await service.get('host', 'g1');
      expect(forHost.wordBreakdown?.map((w) => [w.word, w.attempts, w.correct])).toEqual([
        ['tenacious', 2, 2],
        ['verdant', 2, 1],
        ['pensive', 1, 1],
      ]);

      const forMember = await service.get('amaka', 'g1');
      expect(forMember.wordBreakdown).toBeNull();
    });

    it("does not count a removed member's leftover answers in the breakdown", async () => {
      asMember(active({ status: 'ENDED', endedAt: new Date(), hostId: 'host' }));
      prismaMock.arcadeGroupMember.findMany.mockResolvedValue([member('host'), member('amaka')]);
      prismaMock.arcadeGameSession.findMany.mockResolvedValue([
        session('amaka', 'COMPLETED', answers(3, 0)),
        session('gone', 'ABANDONED', answers(3, 0)),
      ]);
      prismaMock.word.findMany.mockResolvedValue([]);
      const view = await service.get('host', 'g1');
      expect(view.wordBreakdown?.[0].attempts).toBe(1);
    });

    it('lapses an expired group when read', async () => {
      asMember(active({ expiresAt: new Date(Date.now() - 1000) }));
      prismaMock.arcadeGroup.findUniqueOrThrow.mockResolvedValueOnce(
        active({ status: 'ENDED', endedAt: new Date() }),
      );
      const view = await service.get('host', 'g1');
      expect(view.status).toBe('ENDED');
      expect(prismaMock.arcadeGameSession.updateMany).toHaveBeenCalled();
    });
  });

  describe('resolveStart (used by the games)', () => {
    const pick = jest.fn();
    beforeEach(() => pick.mockReset());

    it('is for members only', async () => {
      prismaMock.arcadeGroup.findFirst.mockResolvedValueOnce(null);
      await expect(service.resolveStart('x', 'g1', 'SCRAMBLE_QUEST', pick)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('waits for the host to start', async () => {
      asMember(groupRow());
      await expect(
        service.resolveStart('stu', 'g1', 'SCRAMBLE_QUEST', pick),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an ended round', async () => {
      asMember(groupRow({ status: 'ENDED' }));
      await expect(
        service.resolveStart('stu', 'g1', 'SCRAMBLE_QUEST', pick),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses the wrong game', async () => {
      asMember(groupRow({ status: 'ACTIVE' }));
      await expect(service.resolveStart('stu', 'g1', 'HANGMAN', pick)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('the first member picks the words once', async () => {
      asMember(groupRow({ status: 'ACTIVE' }));
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(null);
      pick.mockResolvedValueOnce(['w1', 'w2']);
      prismaMock.arcadeGroup.findUniqueOrThrow.mockResolvedValueOnce(
        groupRow({ status: 'ACTIVE', wordIds: ['w1', 'w2'], wordsPickedAt: new Date() }),
      );

      const r = await service.resolveStart('stu', 'g1', 'SCRAMBLE_QUEST', pick);

      expect(pick).toHaveBeenCalledTimes(1);
      expect(prismaMock.arcadeGroup.updateMany).toHaveBeenCalledWith({
        where: { id: 'g1', wordsPickedAt: null },
        data: expect.objectContaining({ wordIds: ['w1', 'w2'] }),
      });
      expect(r).toEqual({ existing: null, wordIds: ['w1', 'w2'], groupId: 'g1' });
    });

    it('later members read the same words without picking', async () => {
      asMember(groupRow({ status: 'ACTIVE', wordIds: ['w1', 'w2'], wordsPickedAt: new Date() }));
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(null);
      const r = await service.resolveStart('stu2', 'g1', 'SCRAMBLE_QUEST', pick);
      expect(pick).not.toHaveBeenCalled();
      expect(r.wordIds).toEqual(['w1', 'w2']);
    });

    it('resumes an unfinished play, but not a finished one', async () => {
      asMember(groupRow({ status: 'ACTIVE', wordIds: ['w1'], wordsPickedAt: new Date() }));
      const open = { id: 's1', status: 'ACTIVE' };
      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce(open);
      expect((await service.resolveStart('stu', 'g1', 'SCRAMBLE_QUEST', pick)).existing).toBe(open);

      prismaMock.arcadeGameSession.findUnique.mockResolvedValueOnce({
        id: 's1',
        status: 'COMPLETED',
      });
      await expect(
        service.resolveStart('stu', 'g1', 'SCRAMBLE_QUEST', pick),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses when the window has run out', async () => {
      asMember(groupRow({ status: 'ACTIVE', expiresAt: new Date(Date.now() - 1000) }));
      prismaMock.arcadeGroup.findUniqueOrThrow.mockResolvedValueOnce(groupRow({ status: 'ENDED' }));
      await expect(
        service.resolveStart('stu', 'g1', 'SCRAMBLE_QUEST', pick),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listMine / sweep', () => {
    it('lists my groups with their size', async () => {
      prismaMock.arcadeGroupMember.findMany.mockResolvedValueOnce([
        { group: { ...groupRow(), _count: { members: 7 } } },
      ]);
      const list = await service.listMine('host');
      expect(list).toEqual([
        expect.objectContaining({
          id: 'g1',
          isHost: true,
          memberCount: 7,
          status: 'LOBBY',
          code: CODE,
        }),
      ]);
    });

    it('the sweep ends every lapsed group', async () => {
      prismaMock.arcadeGroup.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
      await service.sweep();
      expect(prismaMock.arcadeGroup.updateMany).toHaveBeenCalledTimes(2);
    });

    it('a failing sweep does not throw', async () => {
      prismaMock.arcadeGroup.findMany.mockRejectedValueOnce(new Error('db down'));
      await expect(service.sweep()).resolves.toBeUndefined();
    });
  });
});

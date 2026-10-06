import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WordDuelInviteService } from './word-duel-invite.service';
import { WordDuelService } from './word-duel.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FriendsService } from '../../friends/friends.service';
import { NotificationService } from '../../notifications/notification.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { ArcadeChallengeService } from '../challenge.service';
import { ArcadePlayLimitService } from '../limits/play-limit.service';

describe('WordDuelInviteService', () => {
  let service: WordDuelInviteService;

  const prismaMock = {
    wordDuelMatch: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    wordDuelPlayerState: { findFirst: jest.fn(), create: jest.fn() },
    friendship: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const challengesMock = { pickChallenges: jest.fn() };
  const friendsMock = { areBlocked: jest.fn(), getPublicIdentity: jest.fn() };
  const notificationsMock = { notifyFireAndForget: jest.fn() };
  const analyticsMock = { track: jest.fn() };
  const wordDuelMock = { getState: jest.fn() };

  const fresh = () => new Date(Date.now() - 10_000);
  const old = () => new Date(Date.now() - 10 * 60_000);

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
    prismaMock.friendship.findFirst.mockResolvedValue({ id: 'f' });
    prismaMock.user.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prismaMock.wordDuelPlayerState.findFirst.mockResolvedValue(null);
    prismaMock.wordDuelMatch.updateMany.mockResolvedValue({ count: 1 });
    friendsMock.areBlocked.mockResolvedValue(false);
    friendsMock.getPublicIdentity.mockImplementation(async (id: string) => ({
      userId: id,
      username: `user_${id}`,
      avatarUrl: null,
    }));
    wordDuelMock.getState.mockResolvedValue({ matchId: 'm1', status: 'WAITING' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        WordDuelInviteService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ArcadePlayLimitService, useValue: playLimitMock },
        { provide: ArcadeChallengeService, useValue: challengesMock },
        { provide: FriendsService, useValue: friendsMock },
        { provide: NotificationService, useValue: notificationsMock },
        { provide: AnalyticsService, useValue: analyticsMock },
        { provide: WordDuelService, useValue: wordDuelMock },
      ],
    }).compile();
    service = moduleRef.get(WordDuelInviteService);
  });

  describe('invite', () => {
    it('only friends, never yourself, never a blocked player', async () => {
      await expect(service.invite('u1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
      prismaMock.friendship.findFirst.mockResolvedValueOnce(null);
      await expect(service.invite('u1', 'u2')).rejects.toBeInstanceOf(ForbiddenException);
      friendsMock.areBlocked.mockResolvedValueOnce(true);
      await expect(service.invite('u1', 'u2')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a player at the daily cap cannot send a duel challenge', async () => {
      playLimitMock.assertCanPlay.mockRejectedValueOnce(new Error('ARCADE_PLAY_LIMIT'));
      await expect(service.invite('u1', 'u2')).rejects.toThrow('ARCADE_PLAY_LIMIT');
      expect(prismaMock.wordDuelMatch.create).not.toHaveBeenCalled();
    });

    it('creates a private WAITING match for the friend and notifies them', async () => {
      challengesMock.pickChallenges.mockResolvedValueOnce([{ word: { id: 'w1' } }]);
      prismaMock.wordDuelMatch.create.mockResolvedValueOnce({ id: 'm1' });

      await service.invite('u1', 'u2');

      expect(prismaMock.wordDuelMatch.create).toHaveBeenCalledWith({
        data: { wordIds: ['w1'], invitedUserId: 'u2' },
      });
      expect(prismaMock.wordDuelPlayerState.create).toHaveBeenCalledWith({
        data: { matchId: 'm1', userId: 'u1' },
      });
      expect(notificationsMock.notifyFireAndForget).toHaveBeenCalledWith(
        'u2',
        'ARCADE_CHALLENGE',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ deepLink: 'wordquest://arcade/word-duel/m1' }),
      );
    });

    it('re-inviting the same friend returns the open challenge', async () => {
      prismaMock.wordDuelPlayerState.findFirst.mockResolvedValueOnce({
        matchId: 'm1',
        match: { status: 'WAITING', invitedUserId: 'u2', createdAt: fresh() },
      });
      await service.invite('u1', 'u2');
      expect(prismaMock.wordDuelMatch.create).not.toHaveBeenCalled();
      expect(wordDuelMock.getState).toHaveBeenCalledWith('u1', 'm1');
    });

    it('refuses while the host is mid-duel', async () => {
      prismaMock.wordDuelPlayerState.findFirst.mockResolvedValueOnce({
        matchId: 'm0',
        match: { status: 'ACTIVE', invitedUserId: null, createdAt: fresh() },
      });
      await expect(service.invite('u1', 'u2')).rejects.toBeInstanceOf(ConflictException);
    });

    it('abandons an older waiting match before creating the challenge', async () => {
      prismaMock.wordDuelPlayerState.findFirst.mockResolvedValueOnce({
        matchId: 'm0',
        match: { status: 'WAITING', invitedUserId: null, createdAt: fresh() },
      });
      challengesMock.pickChallenges.mockResolvedValueOnce([{ word: { id: 'w1' } }]);
      prismaMock.wordDuelMatch.create.mockResolvedValueOnce({ id: 'm1' });

      await service.invite('u1', 'u2');

      expect(prismaMock.wordDuelMatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'm0', status: 'WAITING' },
        data: { status: 'ABANDONED' },
      });
    });
  });

  describe('accept', () => {
    const waiting = (over: Record<string, unknown> = {}) => ({
      id: 'm1',
      status: 'WAITING',
      invitedUserId: 'u2',
      createdAt: fresh(),
      players: [{ userId: 'u1' }],
      ...over,
    });

    it('only the invited friend can open it', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce(waiting());
      await expect(service.accept('stranger', 'm1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('joins the match and starts it', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce(waiting());

      await service.accept('u2', 'm1');

      expect(prismaMock.wordDuelMatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', status: 'WAITING', invitedUserId: 'u2' },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      });
      expect(prismaMock.wordDuelPlayerState.create).toHaveBeenCalledWith({
        data: { matchId: 'm1', userId: 'u2' },
      });
      expect(analyticsMock.track).toHaveBeenCalledTimes(2);
    });

    it('a player at the daily cap cannot accept, and nothing is claimed', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce(waiting());
      playLimitMock.assertCanPlay.mockRejectedValueOnce(new Error('ARCADE_PLAY_LIMIT'));

      await expect(service.accept('u2', 'm1')).rejects.toThrow('ARCADE_PLAY_LIMIT');
      expect(prismaMock.wordDuelMatch.updateMany).not.toHaveBeenCalled();
    });

    it('accepting takes no play yet: a duel counts only when it is played to the end', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce(waiting());

      await service.accept('u2', 'm1');

      expect(playLimitMock.consumePlay).not.toHaveBeenCalled();
    });

    it('an expired or already-taken challenge is closed', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce(waiting({ createdAt: old() }));
      await expect(service.accept('u2', 'm1')).rejects.toBeInstanceOf(ConflictException);

      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce(waiting());
      prismaMock.wordDuelMatch.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.accept('u2', 'm1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('reopening after joining just resumes', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce(
        waiting({ status: 'ACTIVE', players: [{ userId: 'u1' }, { userId: 'u2' }] }),
      );
      await service.accept('u2', 'm1');
      expect(prismaMock.wordDuelPlayerState.create).not.toHaveBeenCalled();
      expect(wordDuelMock.getState).toHaveBeenCalledWith('u2', 'm1');
    });

    it('refuses while mid-duel elsewhere or when the host blocked them', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce(waiting());
      prismaMock.wordDuelPlayerState.findFirst.mockResolvedValueOnce({
        matchId: 'm9',
        match: { status: 'ACTIVE' },
      });
      await expect(service.accept('u2', 'm1')).rejects.toBeInstanceOf(ConflictException);

      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce(waiting());
      friendsMock.areBlocked.mockResolvedValueOnce(true);
      await expect(service.accept('u2', 'm1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getInvite / decline', () => {
    it('describes an open challenge, then a closed one', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce({
        id: 'm1',
        status: 'WAITING',
        invitedUserId: 'u2',
        createdAt: fresh(),
        players: [{ userId: 'u1' }],
      });
      const open = await service.getInvite('u2', 'm1');
      expect(open.status).toBe('OPEN');
      expect(open.from?.username).toBe('user_u1');

      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce({
        id: 'm1',
        status: 'ABANDONED',
        invitedUserId: 'u2',
        createdAt: fresh(),
        players: [{ userId: 'u1' }],
      });
      expect((await service.getInvite('u2', 'm1')).status).toBe('CLOSED');
    });

    it('declining closes the waiting match', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce({ id: 'm1', invitedUserId: 'u2' });
      expect(await service.decline('u2', 'm1')).toEqual({ declined: true });
      expect(prismaMock.wordDuelMatch.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', status: 'WAITING' },
        data: { status: 'ABANDONED' },
      });
    });

    it("declining someone else's challenge looks like not found", async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce({ id: 'm1', invitedUserId: 'u3' });
      await expect(service.decline('u2', 'm1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

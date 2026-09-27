import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FriendsService } from './friends.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

describe('FriendsService', () => {
  let service: FriendsService;

  const prismaMock = {
    user: { findUnique: jest.fn() },
    block: { findFirst: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    friendship: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };

  const usersMock = { resolveAvatarUrl: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    usersMock.resolveAvatarUrl.mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        FriendsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: UsersService, useValue: usersMock },
      ],
    }).compile();
    service = moduleRef.get(FriendsService);
  });

  describe('searchByUsername', () => {
    it('returns the public view for an exact username match', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u2',
        username: 'bo',
        avatarKey: null,
      });
      prismaMock.block.findFirst.mockResolvedValueOnce(null);

      const result = await service.searchByUsername('u1', 'bo');

      expect(result).toEqual({ userId: 'u2', username: 'bo', avatarUrl: null });
    });

    it('returns null for no match', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      expect(await service.searchByUsername('u1', 'nobody')).toBeNull();
    });

    it('returns null searching for yourself', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        username: 'me',
        avatarKey: null,
      });
      expect(await service.searchByUsername('u1', 'me')).toBeNull();
    });

    it('returns null when either player has blocked the other', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u2',
        username: 'bo',
        avatarKey: null,
      });
      prismaMock.block.findFirst.mockResolvedValueOnce({ id: 'block-1' });
      expect(await service.searchByUsername('u1', 'bo')).toBeNull();
    });
  });

  describe('sendRequest', () => {
    it('creates a PENDING request when none exists yet', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u2',
        username: 'bo',
        avatarKey: null,
      });
      prismaMock.block.findFirst.mockResolvedValueOnce(null);
      prismaMock.friendship.findUnique
        .mockResolvedValueOnce(null) // reverse
        .mockResolvedValueOnce(null); // forward
      prismaMock.friendship.create.mockResolvedValueOnce({
        id: 'f1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

      const result = await service.sendRequest('u1', 'bo');

      expect(prismaMock.friendship.create).toHaveBeenCalledWith({
        data: { requesterId: 'u1', addresseeId: 'u2' },
      });
      expect(result).toMatchObject({ id: 'f1', user: { userId: 'u2', username: 'bo' } });
    });

    it('throws NotFoundException for an unknown username', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.sendRequest('u1', 'ghost')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when adding yourself', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        username: 'me',
        avatarKey: null,
      });
      await expect(service.sendRequest('u1', 'me')).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when either side has blocked the other', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u2',
        username: 'bo',
        avatarKey: null,
      });
      prismaMock.block.findFirst.mockResolvedValueOnce({ id: 'block-1' });
      await expect(service.sendRequest('u1', 'bo')).rejects.toThrow(ForbiddenException);
    });

    it('auto-accepts when the target already requested the viewer', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u2',
        username: 'bo',
        avatarKey: null,
      });
      prismaMock.block.findFirst.mockResolvedValueOnce(null);
      prismaMock.friendship.findUnique.mockResolvedValueOnce({
        id: 'reverse-1',
        status: 'PENDING',
      });

      const result = await service.sendRequest('u1', 'bo');

      expect(prismaMock.friendship.update).toHaveBeenCalledWith({
        where: { id: 'reverse-1' },
        data: { status: 'ACCEPTED', respondedAt: expect.any(Date) },
      });
      expect(result).toEqual({ accepted: true });
      expect(prismaMock.friendship.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when already friends', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u2',
        username: 'bo',
        avatarKey: null,
      });
      prismaMock.block.findFirst.mockResolvedValueOnce(null);
      prismaMock.friendship.findUnique.mockResolvedValueOnce({
        id: 'reverse-1',
        status: 'ACCEPTED',
      });

      await expect(service.sendRequest('u1', 'bo')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a request is already pending in the same direction', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u2',
        username: 'bo',
        avatarKey: null,
      });
      prismaMock.block.findFirst.mockResolvedValueOnce(null);
      prismaMock.friendship.findUnique
        .mockResolvedValueOnce(null) // reverse
        .mockResolvedValueOnce({ id: 'f1', status: 'PENDING' }); // forward

      await expect(service.sendRequest('u1', 'bo')).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptRequest / declineRequest', () => {
    it('accepts a request sent to the current user', async () => {
      prismaMock.friendship.findUnique.mockResolvedValueOnce({
        id: 'f1',
        addresseeId: 'u1',
        status: 'PENDING',
      });

      await service.acceptRequest('u1', 'f1');

      expect(prismaMock.friendship.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { status: 'ACCEPTED', respondedAt: expect.any(Date) },
      });
    });

    it('throws ForbiddenException accepting a request not addressed to you', async () => {
      prismaMock.friendship.findUnique.mockResolvedValueOnce({
        id: 'f1',
        addresseeId: 'someone-else',
        status: 'PENDING',
      });
      await expect(service.acceptRequest('u1', 'f1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for a missing request', async () => {
      prismaMock.friendship.findUnique.mockResolvedValueOnce(null);
      await expect(service.acceptRequest('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException accepting an already-resolved request', async () => {
      prismaMock.friendship.findUnique.mockResolvedValueOnce({
        id: 'f1',
        addresseeId: 'u1',
        status: 'ACCEPTED',
      });
      await expect(service.acceptRequest('u1', 'f1')).rejects.toThrow(BadRequestException);
    });

    it('deletes the row on decline', async () => {
      prismaMock.friendship.findUnique.mockResolvedValueOnce({
        id: 'f1',
        addresseeId: 'u1',
        status: 'PENDING',
      });
      await service.declineRequest('u1', 'f1');
      expect(prismaMock.friendship.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });
  });

  describe('block', () => {
    it('removes any friendship both ways and upserts a Block row', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u2' });

      await service.block('u1', 'u2');

      expect(prismaMock.friendship.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { requesterId: 'u1', addresseeId: 'u2' },
            { requesterId: 'u2', addresseeId: 'u1' },
          ],
        },
      });
      expect(prismaMock.block.upsert).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId: 'u1', blockedId: 'u2' } },
        create: { blockerId: 'u1', blockedId: 'u2' },
        update: {},
      });
    });

    it('throws BadRequestException blocking yourself', async () => {
      await expect(service.block('u1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException blocking a nonexistent user', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.block('u1', 'ghost')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProfile', () => {
    it("returns the target's public profile with relationship NONE for a stranger", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u2',
        username: 'bo',
        avatarKey: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        clan: { name: 'Ember Vale' },
        progression: { level: 4, currentStreak: 7 },
      });
      prismaMock.block.findFirst.mockResolvedValueOnce(null);
      prismaMock.friendship.findFirst.mockResolvedValueOnce(null);

      const result = await service.getProfile('u1', 'u2');

      expect(result).toMatchObject({
        userId: 'u2',
        username: 'bo',
        level: 4,
        currentStreak: 7,
        clanName: 'Ember Vale',
        relationship: 'NONE',
      });
    });

    it('reports SELF without any friendship/block lookups', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        username: 'me',
        avatarKey: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        clan: null,
        progression: null,
      });

      const result = await service.getProfile('u1', 'u1');

      expect(result.relationship).toBe('SELF');
      expect(result.level).toBe(1); // defaults when no UserProgression row yet
      expect(prismaMock.block.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.friendship.findFirst).not.toHaveBeenCalled();
    });

    it('reports BLOCKED when either side has blocked the other', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u2',
        username: 'bo',
        avatarKey: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        clan: null,
        progression: null,
      });
      prismaMock.block.findFirst.mockResolvedValueOnce({ id: 'block-1' });

      const result = await service.getProfile('u1', 'u2');

      expect(result.relationship).toBe('BLOCKED');
      expect(prismaMock.friendship.findFirst).not.toHaveBeenCalled();
    });

    it('reports REQUEST_SENT vs REQUEST_RECEIVED depending on who initiated', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u2',
        username: 'bo',
        avatarKey: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        clan: null,
        progression: null,
      });
      prismaMock.block.findFirst.mockResolvedValue(null);

      prismaMock.friendship.findFirst.mockResolvedValueOnce({
        requesterId: 'u1',
        addresseeId: 'u2',
        status: 'PENDING',
      });
      expect((await service.getProfile('u1', 'u2')).relationship).toBe('REQUEST_SENT');

      prismaMock.friendship.findFirst.mockResolvedValueOnce({
        requesterId: 'u2',
        addresseeId: 'u1',
        status: 'PENDING',
      });
      expect((await service.getProfile('u1', 'u2')).relationship).toBe('REQUEST_RECEIVED');
    });

    it('reports FRIENDS for an accepted friendship in either direction', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u2',
        username: 'bo',
        avatarKey: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        clan: null,
        progression: null,
      });
      prismaMock.block.findFirst.mockResolvedValueOnce(null);
      prismaMock.friendship.findFirst.mockResolvedValueOnce({
        requesterId: 'u2',
        addresseeId: 'u1',
        status: 'ACCEPTED',
      });

      expect((await service.getProfile('u1', 'u2')).relationship).toBe('FRIENDS');
    });

    it('throws NotFoundException for an unknown user id', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.getProfile('u1', 'ghost')).rejects.toThrow(NotFoundException);
    });
  });

  describe('areBlocked', () => {
    it('checks both directions', async () => {
      prismaMock.block.findFirst.mockResolvedValueOnce({ id: 'b1' });
      expect(await service.areBlocked('u1', 'u2')).toBe(true);
      expect(prismaMock.block.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: 'u1', blockedId: 'u2' },
            { blockerId: 'u2', blockedId: 'u1' },
          ],
        },
        select: { id: true },
      });
    });
  });
});

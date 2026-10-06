import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { WordDuelChatService } from './word-duel-chat.service';

describe('WordDuelChatService', () => {
  const prismaMock = {
    wordDuelMatch: { findUnique: jest.fn() },
    wordDuelMessage: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    report: { findMany: jest.fn() },
  };
  const friendsMock = { areBlocked: jest.fn() };
  let service: WordDuelChatService;

  const activeMatch = () => ({
    id: 'm1',
    status: 'ACTIVE',
    completedAt: null,
    players: [{ userId: 'me' }, { userId: 'rival' }],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.wordDuelMatch.findUnique.mockResolvedValue(activeMatch());
    prismaMock.wordDuelMessage.findMany.mockResolvedValue([]);
    prismaMock.wordDuelMessage.count.mockResolvedValue(0);
    prismaMock.wordDuelMessage.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'msg1', seq: 7, createdAt: new Date('2026-10-06T12:00:00Z'), ...data }),
    );
    friendsMock.areBlocked.mockResolvedValue(false);
    service = new WordDuelChatService(prismaMock as any, friendsMock as any);
  });

  describe('send', () => {
    it('stores a clean message and returns it as mine', async () => {
      const view = await service.send('me', 'm1', '  Good   luck! ');
      expect(prismaMock.wordDuelMessage.create).toHaveBeenCalledWith({
        data: { matchId: 'm1', senderId: 'me', body: 'Good luck!' },
      });
      expect(view).toMatchObject({ id: 'msg1', seq: 7, mine: true, body: 'Good luck!' });
    });

    it('treats a match you are not in the same as a missing one', async () => {
      await expect(service.send('stranger', 'm1', 'hi')).rejects.toThrow(NotFoundException);
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce(null);
      await expect(service.send('me', 'nope', 'hi')).rejects.toThrow(NotFoundException);
    });

    it('is closed while still waiting for an opponent', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValue({
        ...activeMatch(),
        status: 'WAITING',
        players: [{ userId: 'me' }],
      });
      await expect(service.send('me', 'm1', 'hi')).rejects.toThrow(BadRequestException);
    });

    it('stays open for a few minutes after the match, then closes', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce({
        ...activeMatch(),
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 60_000),
      });
      await expect(service.send('me', 'm1', 'gg')).resolves.toMatchObject({ body: 'gg' });

      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce({
        ...activeMatch(),
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 30 * 60_000),
      });
      await expect(service.send('me', 'm1', 'gg')).rejects.toThrow('This match has ended.');
    });

    it('refuses when either player has blocked the other', async () => {
      friendsMock.areBlocked.mockResolvedValue(true);
      await expect(service.send('me', 'm1', 'hi')).rejects.toThrow(ForbiddenException);
    });

    it('rejects links, contact details and bad language with a reason', async () => {
      await expect(service.send('me', 'm1', 'add me www.example.com')).rejects.toThrow(
        "Links and contact details can't be shared in duel chat.",
      );
      await expect(service.send('me', 'm1', 'you bitch')).rejects.toThrow(
        'Please keep the chat friendly.',
      );
      expect(prismaMock.wordDuelMessage.create).not.toHaveBeenCalled();
    });

    it('rate-limits a second message sent too quickly', async () => {
      prismaMock.wordDuelMessage.findMany.mockResolvedValueOnce([
        { body: 'hello', createdAt: new Date(Date.now() - 300) },
      ]);
      await expect(service.send('me', 'm1', 'again')).rejects.toBeInstanceOf(HttpException);
      expect(prismaMock.wordDuelMessage.create).not.toHaveBeenCalled();
    });

    it('rejects the same text repeated within the duplicate window', async () => {
      prismaMock.wordDuelMessage.findMany.mockResolvedValueOnce([
        { body: 'hello', createdAt: new Date(Date.now() - 5000) },
      ]);
      await expect(service.send('me', 'm1', 'hello')).rejects.toThrow('You just sent that.');
    });

    it('allows the same text again once the window has passed', async () => {
      prismaMock.wordDuelMessage.findMany.mockResolvedValueOnce([
        { body: 'hello', createdAt: new Date(Date.now() - 20_000) },
      ]);
      await expect(service.send('me', 'm1', 'hello')).resolves.toMatchObject({ body: 'hello' });
    });

    it('caps how many messages one player can send in a match', async () => {
      prismaMock.wordDuelMessage.count.mockResolvedValue(60);
      await expect(service.send('me', 'm1', 'one more')).rejects.toThrow(
        'You have reached the chat limit for this match.',
      );
    });
  });

  describe('listForViewer', () => {
    it('returns visible messages after the cursor, marking which are mine', async () => {
      prismaMock.wordDuelMessage.findMany.mockResolvedValue([
        {
          id: 'a',
          seq: 4,
          senderId: 'rival',
          body: 'hi',
          createdAt: new Date('2026-10-06T12:00:00Z'),
        },
        {
          id: 'b',
          seq: 5,
          senderId: 'me',
          body: 'yo',
          createdAt: new Date('2026-10-06T12:00:01Z'),
        },
      ]);
      const out = await service.listForViewer('me', 'm1', 3);
      expect(prismaMock.wordDuelMessage.findMany).toHaveBeenCalledWith({
        where: { matchId: 'm1', hidden: false, seq: { gt: 3 } },
        orderBy: { seq: 'asc' },
        take: 50,
      });
      expect(out.map((m) => [m.seq, m.mine])).toEqual([
        [4, false],
        [5, true],
      ]);
    });

    it('returns nothing while waiting for an opponent', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValue({
        ...activeMatch(),
        status: 'WAITING',
        players: [{ userId: 'me' }],
      });
      expect(await service.listForViewer('me', 'm1', 0)).toEqual([]);
      expect(prismaMock.wordDuelMessage.findMany).not.toHaveBeenCalled();
    });

    it('returns nothing for a blocked pair', async () => {
      friendsMock.areBlocked.mockResolvedValue(true);
      expect(await service.listForViewer('me', 'm1', 0)).toEqual([]);
    });

    it('refuses someone who is not in the match', async () => {
      await expect(service.listForViewer('stranger', 'm1', 0)).rejects.toThrow(NotFoundException);
    });
  });

  describe('cleanupOldMessages', () => {
    it('deletes old messages but keeps reported ones', async () => {
      prismaMock.report.findMany.mockResolvedValue([{ targetId: 'keep-1' }]);
      prismaMock.wordDuelMessage.deleteMany.mockResolvedValue({ count: 3 });
      await service.cleanupOldMessages();
      expect(prismaMock.wordDuelMessage.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: expect.any(Date) }, id: { notIn: ['keep-1'] } },
      });
    });

    it('never throws if the purge fails', async () => {
      prismaMock.report.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.cleanupOldMessages()).resolves.toBeUndefined();
    });
  });
});

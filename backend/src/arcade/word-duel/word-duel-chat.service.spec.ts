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
  const safetyMock = {
    assertCanChat: jest.fn(),
    record: jest.fn(),
    reportedByViewer: jest.fn(),
  };
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
    safetyMock.assertCanChat.mockResolvedValue(undefined);
    safetyMock.record.mockResolvedValue(false);
    safetyMock.reportedByViewer.mockResolvedValue(new Set());
    service = new WordDuelChatService(prismaMock as any, friendsMock as any, safetyMock as any);
  });

  describe('send', () => {
    it('refuses profanity, records it as a flag, and never stores it', async () => {
      await expect(service.send('me', 'm1', { body: 'you are a cunt' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.wordDuelMessage.create).not.toHaveBeenCalled();
      expect(safetyMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'me', source: 'WORD_DUEL', severity: 'BLOCKED', matchId: 'm1' }),
      );
    });

    it('tells the sender their chat is paused once the flag earns a mute', async () => {
      safetyMock.record.mockResolvedValueOnce(true);
      await expect(service.send('me', 'm1', { body: 'fuck this' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('does not flag a clean message or a refusal that is not about language', async () => {
      await service.send('me', 'm1', { body: 'good game' });
      await expect(service.send('me', 'm1', { body: 'see www.example.com' })).rejects.toThrow(
        BadRequestException,
      );
      expect(safetyMock.record).not.toHaveBeenCalled();
    });

    it('delivers a milder insult but records it against the message', async () => {
      const view = await service.send('me', 'm1', { body: 'you are an idiot' });
      expect(view.body).toBe('you are an idiot');
      expect(safetyMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'INSULT', messageId: 'msg1' }),
      );
    });

    it('stops a muted player before anything else', async () => {
      safetyMock.assertCanChat.mockRejectedValueOnce(new ForbiddenException('paused'));
      await expect(service.send('me', 'm1', { body: 'hi' })).rejects.toThrow('paused');
      expect(prismaMock.wordDuelMessage.create).not.toHaveBeenCalled();
    });

    it('stores a clean message and returns it as mine', async () => {
      const view = await service.send('me', 'm1', { body: '  Good   luck! ' });
      expect(prismaMock.wordDuelMessage.create).toHaveBeenCalledWith({
        data: { matchId: 'm1', senderId: 'me', body: 'Good luck!', kind: 'TEXT' },
      });
      expect(view).toMatchObject({ id: 'msg1', seq: 7, mine: true, body: 'Good luck!' });
    });

    it('sends a quick chat code without running the text filter', async () => {
      const view = await service.send('me', 'm1', { quick: 'FIRE' });
      expect(prismaMock.wordDuelMessage.create).toHaveBeenCalledWith({
        data: { matchId: 'm1', senderId: 'me', body: 'FIRE', kind: 'QUICK' },
      });
      expect(view).toMatchObject({ kind: 'QUICK', body: 'FIRE' });
    });

    it('rejects an unknown quick chat code', async () => {
      await expect(service.send('me', 'm1', { quick: 'NOT_A_CODE' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('treats a match you are not in the same as a missing one', async () => {
      await expect(service.send('stranger', 'm1', { body: 'hi' })).rejects.toThrow(NotFoundException);
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce(null);
      await expect(service.send('me', 'nope', { body: 'hi' })).rejects.toThrow(NotFoundException);
    });

    it('is closed while still waiting for an opponent', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValue({
        ...activeMatch(),
        status: 'WAITING',
        players: [{ userId: 'me' }],
      });
      await expect(service.send('me', 'm1', { body: 'hi' })).rejects.toThrow(BadRequestException);
    });

    it('stays open for a few minutes after the match, then closes', async () => {
      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce({
        ...activeMatch(),
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 60_000),
      });
      await expect(service.send('me', 'm1', { body: 'gg' })).resolves.toMatchObject({ body: 'gg' });

      prismaMock.wordDuelMatch.findUnique.mockResolvedValueOnce({
        ...activeMatch(),
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 30 * 60_000),
      });
      await expect(service.send('me', 'm1', { body: 'gg' })).rejects.toThrow('This match has ended.');
    });

    it('refuses when either player has blocked the other', async () => {
      friendsMock.areBlocked.mockResolvedValue(true);
      await expect(service.send('me', 'm1', { body: 'hi' })).rejects.toThrow(ForbiddenException);
    });

    it('rejects links, contact details and bad language with a reason', async () => {
      await expect(service.send('me', 'm1', { body: 'add me www.example.com' })).rejects.toThrow(
        "Links and contact details can't be shared in duel chat.",
      );
      await expect(service.send('me', 'm1', { body: 'you bitch' })).rejects.toThrow(
        'Please keep the chat friendly.',
      );
      expect(prismaMock.wordDuelMessage.create).not.toHaveBeenCalled();
    });

    it('rate-limits a second message sent too quickly', async () => {
      prismaMock.wordDuelMessage.findMany.mockResolvedValueOnce([
        { body: 'hello', kind: 'TEXT', createdAt: new Date(Date.now() - 300) },
      ]);
      await expect(service.send('me', 'm1', { body: 'again' })).rejects.toBeInstanceOf(HttpException);
      expect(prismaMock.wordDuelMessage.create).not.toHaveBeenCalled();
    });

    it('rejects the same text repeated within the duplicate window', async () => {
      prismaMock.wordDuelMessage.findMany.mockResolvedValueOnce([
        { body: 'hello', kind: 'TEXT', createdAt: new Date(Date.now() - 5000) },
      ]);
      await expect(service.send('me', 'm1', { body: 'hello' })).rejects.toThrow('You just sent that.');
    });

    it('allows the same text again once the window has passed', async () => {
      prismaMock.wordDuelMessage.findMany.mockResolvedValueOnce([
        { body: 'hello', kind: 'TEXT', createdAt: new Date(Date.now() - 20_000) },
      ]);
      await expect(service.send('me', 'm1', { body: 'hello' })).resolves.toMatchObject({ body: 'hello' });
    });

    it('caps how many messages one player can send in a match', async () => {
      prismaMock.wordDuelMessage.count.mockResolvedValue(60);
      await expect(service.send('me', 'm1', { body: 'one more' })).rejects.toThrow(
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
          kind: 'TEXT',
          body: 'hi',
          createdAt: new Date('2026-10-06T12:00:00Z'),
        },
        {
          id: 'b',
          seq: 5,
          senderId: 'me',
          kind: 'TEXT',
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

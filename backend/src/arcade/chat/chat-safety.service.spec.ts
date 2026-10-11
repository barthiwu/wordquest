import { ForbiddenException } from '@nestjs/common';
import { ChatSafetyService, chatMuteMinutes } from './chat-safety.service';

describe('chatMuteMinutes', () => {
  const none = { blocked24h: 0, insults24h: 0, reporters7d: 0 };

  it('does nothing for a clean record or a couple of slips', () => {
    expect(chatMuteMinutes(none)).toBe(0);
    expect(chatMuteMinutes({ ...none, blocked24h: 2, insults24h: 4, reporters7d: 2 })).toBe(0);
  });

  it('pauses for an hour at 3 refused messages and a day at 6', () => {
    expect(chatMuteMinutes({ ...none, blocked24h: 3 })).toBe(60);
    expect(chatMuteMinutes({ ...none, blocked24h: 6 })).toBe(24 * 60);
  });

  it('pauses for 30 minutes after 5 delivered insults', () => {
    expect(chatMuteMinutes({ ...none, insults24h: 5 })).toBe(30);
  });

  it('pauses for a day when 3 different players reported them', () => {
    expect(chatMuteMinutes({ ...none, reporters7d: 3 })).toBe(24 * 60);
  });

  it('takes the longest pause that applies', () => {
    expect(chatMuteMinutes({ blocked24h: 3, insults24h: 5, reporters7d: 0 })).toBe(60);
  });
});

describe('ChatSafetyService', () => {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    chatFlag: { create: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    report: { findMany: jest.fn() },
  };
  let service: ChatSafetyService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.chatFlag.create.mockResolvedValue({});
    prisma.chatFlag.count.mockResolvedValue(0);
    prisma.chatFlag.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ chatMutedUntil: null });
    service = new ChatSafetyService(prisma as any);
  });

  const flag = { userId: 'u1', source: 'WORD_DUEL' as const, matchId: 'm1', severity: 'BLOCKED' as const, body: 'bad' };

  it('assertCanChat blocks only while the pause is still running', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ chatMutedUntil: new Date(Date.now() + 60_000) });
    await expect(service.assertCanChat('u1')).rejects.toThrow(ForbiddenException);
    prisma.user.findUnique.mockResolvedValueOnce({ chatMutedUntil: new Date(Date.now() - 60_000) });
    await expect(service.assertCanChat('u1')).resolves.toBeUndefined();
  });

  it('records a flag without muting below the thresholds', async () => {
    await expect(service.record(flag)).resolves.toBe(false);
    expect(prisma.chatFlag.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', severity: 'BLOCKED', body: 'bad' }),
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('mutes the sender once refused messages pile up', async () => {
    prisma.chatFlag.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.severity === 'BLOCKED' ? 3 : 0),
    );
    await expect(service.record(flag)).resolves.toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { chatMutedUntil: expect.any(Date) },
    });
  });

  it('counts distinct reporters, so one player cannot mute someone alone', async () => {
    prisma.chatFlag.findMany.mockResolvedValueOnce([{ reporterId: 'a' }, { reporterId: 'b' }]);
    await expect(service.record({ ...flag, severity: 'REPORTED', reporterId: 'a' })).resolves.toBe(false);
    prisma.chatFlag.findMany.mockResolvedValueOnce([{ reporterId: 'a' }, { reporterId: 'b' }, { reporterId: 'c' }]);
    await expect(service.record({ ...flag, severity: 'REPORTED', reporterId: 'c' })).resolves.toBe(true);
  });

  it('never throws when the ledger write fails', async () => {
    prisma.chatFlag.create.mockRejectedValueOnce(new Error('db down'));
    await expect(service.record(flag)).resolves.toBe(false);
  });

  it('truncates the stored text', async () => {
    await service.record({ ...flag, body: 'x'.repeat(1000) });
    const data = prisma.chatFlag.create.mock.calls[0][0].data;
    expect(data.body).toHaveLength(300);
  });
});

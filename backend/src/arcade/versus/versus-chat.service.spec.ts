import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ArcadeVersusChatService } from './versus-chat.service';

describe('ArcadeVersusChatService', () => {
  const prismaMock = {
    arcadeVersusMatch: { findUnique: jest.fn() },
    arcadeVersusMessage: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    report: { findMany: jest.fn() },
  };
  const friendsMock = { areBlocked: jest.fn() };
  let service: ArcadeVersusChatService;

  const match = (over: Record<string, unknown> = {}) => ({
    id: 'v1',
    kind: 'FRIEND',
    status: 'ACTIVE',
    settledAt: null,
    hostId: 'me',
    guestId: 'pal',
    ...over,
  });

  const safetyMock = { assertCanChat: jest.fn(), record: jest.fn(), reportedByViewer: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(match());
    prismaMock.arcadeVersusMessage.findMany.mockResolvedValue([]);
    prismaMock.arcadeVersusMessage.count.mockResolvedValue(0);
    prismaMock.arcadeVersusMessage.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'x1', seq: 3, createdAt: new Date(), ...data }),
    );
    friendsMock.areBlocked.mockResolvedValue(false);
    safetyMock.assertCanChat.mockResolvedValue(undefined);
    safetyMock.record.mockResolvedValue(false);
    safetyMock.reportedByViewer.mockResolvedValue(new Set());
    service = new ArcadeVersusChatService(prismaMock as any, friendsMock as any, safetyMock as any);
  });

  it('friends can type and send quick chat', async () => {
    await expect(service.send('me', 'v1', { body: ' good  luck ' })).resolves.toMatchObject({
      kind: 'TEXT',
      body: 'good luck',
      mine: true,
    });
    await expect(service.send('me', 'v1', { quick: 'GOOD_GAME' })).resolves.toMatchObject({
      kind: 'QUICK',
    });
  });

  it('random-queue opponents get quick chat only', async () => {
    prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(match({ kind: 'RANDOM' }));
    await expect(service.send('me', 'v1', { body: 'hello' })).rejects.toThrow(ForbiddenException);
    await expect(service.send('me', 'v1', { quick: 'NICE' })).resolves.toMatchObject({
      kind: 'QUICK',
    });
    const list = await service.listForViewer('me', 'v1', 0);
    expect(list).toMatchObject({ canQuick: true, canType: false });
  });

  it('rejects links and contact details in typed chat', async () => {
    await expect(service.send('me', 'v1', { body: 'add me www.example.com' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('hides the match from non-players', async () => {
    await expect(service.send('stranger', 'v1', { quick: 'NICE' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.listForViewer('stranger', 'v1', 0)).rejects.toThrow(NotFoundException);
  });

  it('is closed before the match starts and long after it settles', async () => {
    prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(match({ status: 'INVITED' }));
    await expect(service.send('me', 'v1', { quick: 'NICE' })).rejects.toThrow(BadRequestException);
    prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(
      match({ status: 'COMPLETED', settledAt: new Date(Date.now() - 3 * 3_600_000) }),
    );
    await expect(service.send('me', 'v1', { quick: 'NICE' })).rejects.toThrow(BadRequestException);
    prismaMock.arcadeVersusMatch.findUnique.mockResolvedValue(
      match({ status: 'COMPLETED', settledAt: new Date(Date.now() - 10 * 60_000) }),
    );
    await expect(service.send('me', 'v1', { quick: 'REMATCH' })).resolves.toBeDefined();
  });

  it('blocked pairs cannot chat and see no messages', async () => {
    friendsMock.areBlocked.mockResolvedValue(true);
    await expect(service.send('me', 'v1', { quick: 'NICE' })).rejects.toThrow(ForbiddenException);
    const list = await service.listForViewer('me', 'v1', 0);
    expect(list).toEqual({ messages: [], canQuick: false, canType: false });
  });

  it('rate-limits a fast sender', async () => {
    prismaMock.arcadeVersusMessage.findMany.mockResolvedValue([
      { body: 'NICE', kind: 'QUICK', createdAt: new Date(Date.now() - 100) },
    ]);
    await expect(service.send('me', 'v1', { quick: 'WOW' })).rejects.toThrow('Slow down');
  });

  it('refuses profanity between friends and records it', async () => {
    await expect(service.send('me', 'v1', { body: 'what the fuck' })).rejects.toThrow();
    expect(prismaMock.arcadeVersusMessage.create).not.toHaveBeenCalled();
    expect(safetyMock.record).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'ARCADE_VERSUS', severity: 'BLOCKED' }),
    );
  });

  it('hides a message the viewer already reported', async () => {
    prismaMock.arcadeVersusMessage.findMany.mockResolvedValueOnce([
      { id: 'bad', seq: 1, senderId: 'pal', kind: 'TEXT', body: 'x', createdAt: new Date() },
      { id: 'ok', seq: 2, senderId: 'pal', kind: 'TEXT', body: 'gg', createdAt: new Date() },
    ]);
    safetyMock.reportedByViewer.mockResolvedValueOnce(new Set(['bad']));
    const list = await service.listForViewer('me', 'v1', 0);
    expect(list.messages.map((m) => m.id)).toEqual(['ok']);
  });
});

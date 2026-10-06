import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ModerationService } from './moderation.service';

describe('ModerationService', () => {
  const prismaMock = {
    user: { findUnique: jest.fn() },
    clan: { findUnique: jest.fn() },
    wordInTheWildSubmission: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    report: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    wordDuelMessage: { findUnique: jest.fn(), updateMany: jest.fn() },
    wordDuelPlayerState: { findFirst: jest.fn() },
  };
  const storageMock = {
    isStorageConfigured: jest.fn().mockReturnValue(true),
    getDownloadUrl: jest.fn(),
    delete: jest.fn(),
  };

  let service: ModerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    storageMock.isStorageConfigured.mockReturnValue(true);
    service = new ModerationService(prismaMock as any, storageMock as any);
  });

  describe('fileReport', () => {
    it('creates a report once the target user exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'target-1' });
      prismaMock.report.create.mockResolvedValue({ id: 'report-1' });

      const result = await service.fileReport('reporter-1', 'USER', 'target-1', '  inappropriate name  ');

      expect(result).toEqual({ id: 'report-1' });
      expect(prismaMock.report.create).toHaveBeenCalledWith({
        data: { reporterId: 'reporter-1', targetType: 'USER', targetId: 'target-1', reason: 'inappropriate name' },
        select: { id: true },
      });
    });

    it('rejects a report against a user that does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.fileReport('reporter-1', 'USER', 'ghost', 'spam')).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.report.create).not.toHaveBeenCalled();
    });

    it('rejects a report against a Word in the Wild submission that does not exist', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValue(null);
      await expect(
        service.fileReport('reporter-1', 'WORD_IN_THE_WILD_SUBMISSION', 'missing', 'bad photo'),
      ).rejects.toThrow(BadRequestException);
    });

    it('checks the clan table for a CLAN report', async () => {
      prismaMock.clan.findUnique.mockResolvedValue({ id: 'clan-1' });
      prismaMock.report.create.mockResolvedValue({ id: 'report-2' });

      await service.fileReport('reporter-1', 'CLAN', 'clan-1', 'offensive name');

      expect(prismaMock.clan.findUnique).toHaveBeenCalledWith({ where: { id: 'clan-1' }, select: { id: true } });
    });
  });

  describe('fileReport for a Word Duel message', () => {
    it("files a report from the other player in that message's match", async () => {
      prismaMock.wordDuelMessage.findUnique.mockResolvedValue({ matchId: 'm1', senderId: 'rival' });
      prismaMock.wordDuelPlayerState.findFirst.mockResolvedValue({ id: 'ps1' });
      prismaMock.report.create.mockResolvedValue({ id: 'report-9' });

      const result = await service.fileReport('me', 'WORD_DUEL_MESSAGE', 'msg-1', 'Harassment');

      expect(result).toEqual({ id: 'report-9' });
      expect(prismaMock.wordDuelPlayerState.findFirst).toHaveBeenCalledWith({
        where: { matchId: 'm1', userId: 'me' },
        select: { id: true },
      });
    });

    it('rejects a message that does not exist', async () => {
      prismaMock.wordDuelMessage.findUnique.mockResolvedValue(null);
      await expect(
        service.fileReport('me', 'WORD_DUEL_MESSAGE', 'ghost', 'Spam'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a reporter who was not in that match, without confirming the message exists', async () => {
      prismaMock.wordDuelMessage.findUnique.mockResolvedValue({ matchId: 'm1', senderId: 'rival' });
      prismaMock.wordDuelPlayerState.findFirst.mockResolvedValue(null);
      await expect(
        service.fileReport('stranger', 'WORD_DUEL_MESSAGE', 'msg-1', 'Spam'),
      ).rejects.toThrow('Reported message not found');
      expect(prismaMock.report.create).not.toHaveBeenCalled();
    });

    it('rejects reporting your own message', async () => {
      prismaMock.wordDuelMessage.findUnique.mockResolvedValue({ matchId: 'm1', senderId: 'me' });
      prismaMock.wordDuelPlayerState.findFirst.mockResolvedValue({ id: 'ps1' });
      await expect(
        service.fileReport('me', 'WORD_DUEL_MESSAGE', 'msg-1', 'Spam'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reviewReport', () => {
    it('hides a Word Duel message when its report is actioned', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-9',
        targetType: 'WORD_DUEL_MESSAGE',
        targetId: 'msg-1',
      });
      await service.reviewReport('admin-1', 'report-9', 'ACTIONED', undefined);
      expect(prismaMock.wordDuelMessage.updateMany).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { hidden: true },
      });
    });

    it('leaves a Word Duel message visible when its report is dismissed', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-9',
        targetType: 'WORD_DUEL_MESSAGE',
        targetId: 'msg-1',
      });
      await service.reviewReport('admin-1', 'report-9', 'DISMISSED', undefined);
      expect(prismaMock.wordDuelMessage.updateMany).not.toHaveBeenCalled();
    });

    it('marks a report reviewed with the reviewer and timestamp', async () => {
      prismaMock.report.findUnique.mockResolvedValue({ id: 'report-1' });

      await service.reviewReport('admin-1', 'report-1', 'ACTIONED', 'removed the photo');

      expect(prismaMock.report.update).toHaveBeenCalledWith({
        where: { id: 'report-1' },
        data: {
          status: 'ACTIONED',
          reviewNotes: 'removed the photo',
          reviewedById: 'admin-1',
          reviewedAt: expect.any(Date),
        },
      });
    });

    it('throws when the report does not exist', async () => {
      prismaMock.report.findUnique.mockResolvedValue(null);
      await expect(service.reviewReport('admin-1', 'ghost', 'DISMISSED', undefined)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listPhotoQueue', () => {
    it('resolves a signed download URL for every pending photo', async () => {
      prismaMock.wordInTheWildSubmission.findMany.mockResolvedValue([
        { id: 's1', userId: 'u1', wordId: 'w1', photoKey: 'key-1', evidenceText: 'ok', createdAt: new Date() },
      ]);
      storageMock.getDownloadUrl.mockResolvedValue('https://signed.example/key-1');

      const result = await service.listPhotoQueue();

      expect(result).toEqual([
        expect.objectContaining({ submissionId: 's1', photoUrl: 'https://signed.example/key-1' }),
      ]);
      expect(prismaMock.wordInTheWildSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { evidenceType: 'PHOTO', moderationStatus: 'PENDING', photoKey: { not: null } },
        }),
      );
    });
  });

  describe('reviewPhoto', () => {
    it('approves a pending photo without touching its content', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValue({
        id: 's1',
        evidenceType: 'PHOTO',
        moderationStatus: 'PENDING',
        photoKey: 'key-1',
      });

      await service.reviewPhoto('s1', 'APPROVED');

      expect(storageMock.delete).not.toHaveBeenCalled();
      expect(prismaMock.wordInTheWildSubmission.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { moderationStatus: 'APPROVED' },
      });
    });

    it('redacts the photo and text when rejected', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValue({
        id: 's1',
        evidenceType: 'PHOTO',
        moderationStatus: 'PENDING',
        photoKey: 'key-1',
      });

      await service.reviewPhoto('s1', 'REJECTED');

      expect(storageMock.delete).toHaveBeenCalledWith('key-1');
      expect(prismaMock.wordInTheWildSubmission.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { photoKey: null, evidenceText: null, moderationStatus: 'REJECTED' },
      });
    });

    it('is idempotent — a second review of an already-decided submission is a no-op', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValue({
        id: 's1',
        evidenceType: 'PHOTO',
        moderationStatus: 'APPROVED',
        photoKey: 'key-1',
      });

      await service.reviewPhoto('s1', 'REJECTED');

      expect(prismaMock.wordInTheWildSubmission.update).not.toHaveBeenCalled();
    });

    it('refuses to review TEXT evidence through the photo queue', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValue({
        id: 's1',
        evidenceType: 'TEXT',
        moderationStatus: null,
        photoKey: null,
      });

      await expect(service.reviewPhoto('s1', 'APPROVED')).rejects.toThrow(ForbiddenException);
    });

    it('throws when the submission does not exist', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValue(null);
      await expect(service.reviewPhoto('ghost', 'APPROVED')).rejects.toThrow(NotFoundException);
    });
  });
});

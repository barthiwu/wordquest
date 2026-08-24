import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WordInTheWildService } from './word-in-the-wild.service';
import { PrismaService } from '../prisma/prisma.service';
import { MasteryService } from '../mastery/mastery.service';
import { ProgressionService } from '../progression/progression.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { EvidenceAssessmentService } from '../assessment/evidence-assessment.service';
import { gameplayRules } from '../config/gameplay-rules';

describe('WordInTheWildService', () => {
  let service: WordInTheWildService;

  const prismaMock = {
    word: { findUnique: jest.fn() },
    wordInTheWildMission: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    wordInTheWildSubmission: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    challengeAttempt: { create: jest.fn() },
    $transaction: jest.fn((callback: (tx: any) => unknown): unknown => callback(prismaMock)),
  };

  const masteryMock = {
    recordAnswer: jest.fn().mockResolvedValue({ level: 'RECOGNIZING', justMastered: false }),
  };
  const progressionMock = {
    awardXp: jest.fn().mockResolvedValue({}),
    awardGlyphs: jest.fn().mockResolvedValue({}),
  };
  const storageMock = {
    isStorageConfigured: jest.fn().mockReturnValue(true),
    createUploadTarget: jest.fn(),
    getObjectBytes: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const assessmentMock = {
    isConfigured: jest.fn().mockReturnValue(true),
    assess: jest.fn(),
  };

  const word = {
    id: 'w1',
    word: 'resilient',
    definition: 'able to recover quickly',
    isActive: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    storageMock.isStorageConfigured.mockReturnValue(true);
    assessmentMock.isConfigured.mockReturnValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        WordInTheWildService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MasteryService, useValue: masteryMock },
        { provide: ProgressionService, useValue: progressionMock },
        { provide: ObjectStorageService, useValue: storageMock },
        { provide: EvidenceAssessmentService, useValue: assessmentMock },
      ],
    }).compile();
    service = moduleRef.get(WordInTheWildService);
  });

  describe('createMission', () => {
    it('throws NotFoundException for a missing or inactive word', async () => {
      prismaMock.word.findUnique.mockResolvedValueOnce(null);
      await expect(service.createMission('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('returns an existing OPEN mission instead of creating a duplicate', async () => {
      prismaMock.word.findUnique.mockResolvedValueOnce(word);
      prismaMock.wordInTheWildMission.findFirst.mockResolvedValueOnce({
        id: 'm1',
        wordId: 'w1',
        status: 'OPEN',
        createdAt: new Date(),
      });

      const result = await service.createMission('u1', 'w1');

      expect(prismaMock.wordInTheWildMission.create).not.toHaveBeenCalled();
      expect(result.id).toBe('m1');
      expect(result.word).toBe('resilient');
    });

    it('creates a new mission when none is open', async () => {
      prismaMock.word.findUnique.mockResolvedValueOnce(word);
      prismaMock.wordInTheWildMission.findFirst.mockResolvedValueOnce(null);
      prismaMock.wordInTheWildMission.create.mockResolvedValueOnce({
        id: 'm2',
        wordId: 'w1',
        status: 'OPEN',
        createdAt: new Date(),
      });

      const result = await service.createMission('u1', 'w1');

      expect(prismaMock.wordInTheWildMission.create).toHaveBeenCalledWith({
        data: { userId: 'u1', wordId: 'w1' },
      });
      expect(result.status).toBe('OPEN');
    });
  });

  describe('createPhotoUploadTarget', () => {
    const openMission = {
      id: 'm1',
      userId: 'u1',
      wordId: 'w1',
      status: 'OPEN',
      createdAt: new Date(),
      word,
    };

    it("throws NotFoundException when the mission doesn't exist", async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(null);
      await expect(service.createPhotoUploadTarget('u1', 'missing', 'image/jpeg')).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws ForbiddenException for another user's mission", async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce({
        ...openMission,
        userId: 'someone-else',
      });
      await expect(service.createPhotoUploadTarget('u1', 'm1', 'image/jpeg')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when the mission already has a submission', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce({
        ...openMission,
        status: 'SUBMITTED',
      });
      await expect(service.createPhotoUploadTarget('u1', 'm1', 'image/jpeg')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ServiceUnavailableException when storage is not configured', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      storageMock.isStorageConfigured.mockReturnValueOnce(false);
      await expect(service.createPhotoUploadTarget('u1', 'm1', 'image/jpeg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('delegates to ObjectStorageService when everything checks out', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      storageMock.createUploadTarget.mockResolvedValueOnce({ key: 'k', uploadUrl: 'https://x' });

      const result = await service.createPhotoUploadTarget('u1', 'm1', 'image/jpeg');

      expect(storageMock.createUploadTarget).toHaveBeenCalledWith('u1', 'image/jpeg');
      expect(result.uploadUrl).toBe('https://x');
    });
  });

  describe('submitTextEvidence', () => {
    const openMission = {
      id: 'm1',
      userId: 'u1',
      wordId: 'w1',
      status: 'OPEN',
      createdAt: new Date(),
      word,
    };

    it('throws BadRequestException once the daily cap (6) is reached, without calling the AI assessor', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      prismaMock.wordInTheWildSubmission.count.mockResolvedValueOnce(6);

      await expect(service.submitTextEvidence('u1', 'm1', 'saw it on a sign')).rejects.toThrow(
        BadRequestException,
      );
      expect(assessmentMock.assess).not.toHaveBeenCalled();
    });

    it('allows a submission when under the daily cap', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      prismaMock.wordInTheWildSubmission.count.mockResolvedValueOnce(5);
      assessmentMock.assess.mockResolvedValueOnce({ approved: false, reasoning: 'no' });
      prismaMock.wordInTheWildSubmission.create.mockResolvedValueOnce({
        id: 's-cap',
        missionId: 'm1',
        wordId: 'w1',
        evidenceType: 'TEXT',
        assessmentStatus: 'REJECTED',
        assessmentReasoning: 'no',
        xpAwarded: 0,
        createdAt: new Date(),
      });

      await expect(
        service.submitTextEvidence('u1', 'm1', 'saw it on a sign'),
      ).resolves.toBeDefined();
    });

    it('counts submissions from today only, scoped to this user', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      prismaMock.wordInTheWildSubmission.count.mockResolvedValueOnce(0);
      assessmentMock.assess.mockResolvedValueOnce({ approved: false, reasoning: 'no' });
      prismaMock.wordInTheWildSubmission.create.mockResolvedValueOnce({
        id: 's-cap2',
        missionId: 'm1',
        wordId: 'w1',
        evidenceType: 'TEXT',
        assessmentStatus: 'REJECTED',
        assessmentReasoning: 'no',
        xpAwarded: 0,
        createdAt: new Date(),
      });

      await service.submitTextEvidence('u1', 'm1', 'saw it on a sign');

      expect(prismaMock.wordInTheWildSubmission.count).toHaveBeenCalledWith({
        where: { userId: 'u1', createdAt: { gte: expect.any(Date) } },
      });
    });

    it('throws ServiceUnavailableException when assessment is not configured', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      assessmentMock.isConfigured.mockReturnValueOnce(false);
      await expect(service.submitTextEvidence('u1', 'm1', 'saw it on a sign')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('passes the mission word and definition to the assessor', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      assessmentMock.assess.mockResolvedValueOnce({ approved: true, reasoning: 'Good context.' });
      prismaMock.challengeAttempt.create.mockResolvedValueOnce({ id: 'ca0' });
      prismaMock.wordInTheWildSubmission.create.mockResolvedValueOnce({
        id: 's1',
        missionId: 'm1',
        wordId: 'w1',
        evidenceType: 'TEXT',
        assessmentStatus: 'APPROVED',
        assessmentReasoning: 'Good context.',
        xpAwarded: gameplayRules.wordInTheWild.xpPerApproval,
        createdAt: new Date(),
      });

      await service.submitTextEvidence('u1', 'm1', 'saw it on a sign');

      expect(assessmentMock.assess).toHaveBeenCalledWith({
        targetWord: 'resilient',
        definition: 'able to recover quickly',
        textEvidence: 'saw it on a sign',
      });
    });

    describe('on approval', () => {
      beforeEach(() => {
        prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
        assessmentMock.assess.mockResolvedValueOnce({ approved: true, reasoning: 'Good context.' });
        prismaMock.challengeAttempt.create.mockResolvedValueOnce({ id: 'ca1' });
        prismaMock.wordInTheWildSubmission.create.mockResolvedValueOnce({
          id: 's1',
          missionId: 'm1',
          wordId: 'w1',
          evidenceType: 'TEXT',
          assessmentStatus: 'APPROVED',
          assessmentReasoning: 'Good context.',
          xpAwarded: gameplayRules.wordInTheWild.xpPerApproval,
          createdAt: new Date(),
        });
      });

      it('runs everything inside a single $transaction', async () => {
        await service.submitTextEvidence('u1', 'm1', 'saw it on a sign');
        expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      });

      it('creates a WORD_IN_THE_WILD ChallengeAttempt with no questAttemptId', async () => {
        await service.submitTextEvidence('u1', 'm1', 'saw it on a sign');

        expect(prismaMock.challengeAttempt.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: 'u1',
            wordId: 'w1',
            challengeType: 'WORD_IN_THE_WILD',
            isCorrect: true,
            xpAwarded: gameplayRules.wordInTheWild.xpPerApproval,
          }),
        });
        const call = prismaMock.challengeAttempt.create.mock.calls[0][0];
        expect(call.data.questAttemptId).toBeUndefined();
      });

      it('calls mastery.recordAnswer as a correct answer', async () => {
        await service.submitTextEvidence('u1', 'm1', 'saw it on a sign');
        expect(masteryMock.recordAnswer).toHaveBeenCalledWith('u1', 'w1', true, prismaMock);
      });

      it('awards the Word-in-the-Wild XP and Glyph amounts, not the ordinary quest amounts', async () => {
        await service.submitTextEvidence('u1', 'm1', 'saw it on a sign');
        expect(progressionMock.awardXp).toHaveBeenCalledWith(
          'u1',
          gameplayRules.wordInTheWild.xpPerApproval,
          'WORD_IN_THE_WILD',
          'word-in-the-wild',
          'm1',
          prismaMock,
        );
        expect(progressionMock.awardGlyphs).toHaveBeenCalledWith(
          'u1',
          gameplayRules.wordInTheWild.glyphsPerApproval,
          'WORD_IN_THE_WILD',
          'word-in-the-wild',
          'm1',
          prismaMock,
        );
      });

      it('marks the mission SUBMITTED', async () => {
        await service.submitTextEvidence('u1', 'm1', 'saw it on a sign');
        expect(prismaMock.wordInTheWildMission.update).toHaveBeenCalledWith({
          where: { id: 'm1' },
          data: { status: 'SUBMITTED' },
        });
      });
    });

    describe('on rejection', () => {
      beforeEach(() => {
        prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
        assessmentMock.assess.mockResolvedValueOnce({
          approved: false,
          reasoning: 'Word not actually used.',
        });
        prismaMock.wordInTheWildSubmission.create.mockResolvedValueOnce({
          id: 's2',
          missionId: 'm1',
          wordId: 'w1',
          evidenceType: 'TEXT',
          assessmentStatus: 'REJECTED',
          assessmentReasoning: 'Word not actually used.',
          xpAwarded: 0,
          createdAt: new Date(),
        });
      });

      it('has no mastery effect at all — recordAnswer is never called', async () => {
        await service.submitTextEvidence('u1', 'm1', 'unrelated text');
        expect(masteryMock.recordAnswer).not.toHaveBeenCalled();
      });

      it('awards no XP or Glyphs', async () => {
        await service.submitTextEvidence('u1', 'm1', 'unrelated text');
        expect(progressionMock.awardXp).not.toHaveBeenCalled();
        expect(progressionMock.awardGlyphs).not.toHaveBeenCalled();
      });

      it('still creates no ChallengeAttempt', async () => {
        await service.submitTextEvidence('u1', 'm1', 'unrelated text');
        expect(prismaMock.challengeAttempt.create).not.toHaveBeenCalled();
      });

      it('still marks the mission SUBMITTED (a rejection still consumes the mission)', async () => {
        await service.submitTextEvidence('u1', 'm1', 'unrelated text');
        expect(prismaMock.wordInTheWildMission.update).toHaveBeenCalledWith({
          where: { id: 'm1' },
          data: { status: 'SUBMITTED' },
        });
      });

      it('reports 0 xpAwarded in the returned view', async () => {
        const result = await service.submitTextEvidence('u1', 'm1', 'unrelated text');
        expect(result.xpAwarded).toBe(0);
        expect(result.assessmentStatus).toBe('REJECTED');
      });
    });
  });

  describe('submitPhotoEvidence', () => {
    const openMission = {
      id: 'm1',
      userId: 'u1',
      wordId: 'w1',
      status: 'OPEN',
      createdAt: new Date(),
      word,
    };

    it('throws BadRequestException once the daily cap (6) is reached, without touching storage or the AI assessor', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      prismaMock.wordInTheWildSubmission.count.mockResolvedValueOnce(6);

      await expect(service.submitPhotoEvidence('u1', 'm1', 'key.jpg')).rejects.toThrow(
        BadRequestException,
      );
      expect(storageMock.getObjectBytes).not.toHaveBeenCalled();
      expect(assessmentMock.assess).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException when storage or assessment is not configured', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      storageMock.isStorageConfigured.mockReturnValueOnce(false);
      await expect(service.submitPhotoEvidence('u1', 'm1', 'key.jpg')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('fetches the object bytes and passes them to the assessor with the right content type', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      storageMock.getObjectBytes.mockResolvedValueOnce(Buffer.from('fake-bytes'));
      assessmentMock.assess.mockResolvedValueOnce({
        approved: true,
        reasoning: 'Clear photo.',
        extractedText: 'seen on a poster',
      });
      prismaMock.challengeAttempt.create.mockResolvedValueOnce({ id: 'ca1' });
      prismaMock.wordInTheWildSubmission.create.mockResolvedValueOnce({
        id: 's3',
        missionId: 'm1',
        wordId: 'w1',
        evidenceType: 'PHOTO',
        assessmentStatus: 'APPROVED',
        assessmentReasoning: 'Clear photo.',
        xpAwarded: gameplayRules.wordInTheWild.xpPerApproval,
        createdAt: new Date(),
      });

      await service.submitPhotoEvidence('u1', 'm1', 'word-in-the-wild/u1/abc.png');

      expect(storageMock.getObjectBytes).toHaveBeenCalledWith('word-in-the-wild/u1/abc.png');
      expect(assessmentMock.assess).toHaveBeenCalledWith({
        targetWord: 'resilient',
        definition: 'able to recover quickly',
        photoBytes: Buffer.from('fake-bytes'),
        photoContentType: 'image/png',
      });
    });

    it('defaults to image/jpeg for a key without a .png extension', async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      storageMock.getObjectBytes.mockResolvedValueOnce(Buffer.from('x'));
      assessmentMock.assess.mockResolvedValueOnce({ approved: false, reasoning: 'no' });
      prismaMock.wordInTheWildSubmission.create.mockResolvedValueOnce({
        id: 's4',
        missionId: 'm1',
        wordId: 'w1',
        evidenceType: 'PHOTO',
        assessmentStatus: 'REJECTED',
        assessmentReasoning: 'no',
        xpAwarded: 0,
        createdAt: new Date(),
      });

      await service.submitPhotoEvidence('u1', 'm1', 'word-in-the-wild/u1/abc.jpg');

      expect(assessmentMock.assess).toHaveBeenCalledWith(
        expect.objectContaining({ photoContentType: 'image/jpeg' }),
      );
    });

    it("stores Claude's extractedText as the submission's evidenceText", async () => {
      prismaMock.wordInTheWildMission.findUnique.mockResolvedValueOnce(openMission);
      storageMock.getObjectBytes.mockResolvedValueOnce(Buffer.from('x'));
      assessmentMock.assess.mockResolvedValueOnce({
        approved: true,
        reasoning: 'ok',
        extractedText: 'read from photo',
      });
      prismaMock.challengeAttempt.create.mockResolvedValueOnce({ id: 'ca2' });
      prismaMock.wordInTheWildSubmission.create.mockResolvedValueOnce({
        id: 's5',
        missionId: 'm1',
        wordId: 'w1',
        evidenceType: 'PHOTO',
        assessmentStatus: 'APPROVED',
        assessmentReasoning: 'ok',
        xpAwarded: gameplayRules.wordInTheWild.xpPerApproval,
        createdAt: new Date(),
      });

      await service.submitPhotoEvidence('u1', 'm1', 'k.jpg');

      expect(prismaMock.wordInTheWildSubmission.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ evidenceText: 'read from photo', photoKey: 'k.jpg' }),
      });
    });
  });

  describe('getSubmission', () => {
    it('throws NotFoundException when missing', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValueOnce(null);
      await expect(service.getSubmission('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException for another user's submission", async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValueOnce({
        id: 's1',
        userId: 'someone-else',
      });
      await expect(service.getSubmission('u1', 's1')).rejects.toThrow(ForbiddenException);
    });

    it('returns the submission view for the owner', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValueOnce({
        id: 's1',
        userId: 'u1',
        missionId: 'm1',
        wordId: 'w1',
        evidenceType: 'TEXT',
        assessmentStatus: 'APPROVED',
        assessmentReasoning: 'good',
        xpAwarded: 30,
        createdAt: new Date(),
      });
      const result = await service.getSubmission('u1', 's1');
      expect(result.id).toBe('s1');
      expect(result.xpAwarded).toBe(30);
    });
  });

  describe('deleteSubmission', () => {
    it('throws NotFoundException when missing', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValueOnce(null);
      await expect(service.deleteSubmission('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException for another user's submission", async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValueOnce({
        id: 's1',
        userId: 'someone-else',
      });
      await expect(service.deleteSubmission('u1', 's1')).rejects.toThrow(ForbiddenException);
    });

    it('is idempotent — a second delete on an already-deleted submission does nothing further', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValueOnce({
        id: 's1',
        userId: 'u1',
        deletedAt: new Date(),
        photoKey: 'k.jpg',
      });
      await service.deleteSubmission('u1', 's1');
      expect(prismaMock.wordInTheWildSubmission.update).not.toHaveBeenCalled();
      expect(storageMock.delete).not.toHaveBeenCalled();
    });

    it('deletes the R2 object when photoKey is set', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValueOnce({
        id: 's1',
        userId: 'u1',
        deletedAt: null,
        photoKey: 'word-in-the-wild/u1/abc.jpg',
      });
      await service.deleteSubmission('u1', 's1');
      expect(storageMock.delete).toHaveBeenCalledWith('word-in-the-wild/u1/abc.jpg');
    });

    it('does not attempt storage deletion for text-only evidence (no photoKey)', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValueOnce({
        id: 's1',
        userId: 'u1',
        deletedAt: null,
        photoKey: null,
      });
      await service.deleteSubmission('u1', 's1');
      expect(storageMock.delete).not.toHaveBeenCalled();
    });

    it('clears evidence content and sets deletedAt, keeping the row (soft delete)', async () => {
      prismaMock.wordInTheWildSubmission.findUnique.mockResolvedValueOnce({
        id: 's1',
        userId: 'u1',
        deletedAt: null,
        photoKey: null,
      });
      await service.deleteSubmission('u1', 's1');
      expect(prismaMock.wordInTheWildSubmission.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { evidenceText: null, photoKey: null, deletedAt: expect.any(Date) },
      });
    });
  });
});

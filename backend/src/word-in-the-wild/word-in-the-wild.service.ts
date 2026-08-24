import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MasteryService } from '../mastery/mastery.service';
import { ProgressionService } from '../progression/progression.service';
import {
  ObjectStorageService,
  type UploadContentType,
  type UploadTarget,
} from '../storage/object-storage.service';
import {
  EvidenceAssessmentService,
  type AssessmentResult,
} from '../assessment/evidence-assessment.service';
import { gameplayRules } from '../config/gameplay-rules';

type EvidenceType = 'TEXT' | 'PHOTO';

export interface MissionView {
  id: string;
  wordId: string;
  word: string;
  definition: string;
  status: string;
  createdAt: Date;
}

export interface SubmissionView {
  id: string;
  missionId: string;
  wordId: string;
  evidenceType: string;
  assessmentStatus: string;
  assessmentReasoning: string | null;
  xpAwarded: number;
  createdAt: Date;
}

interface MissionRow {
  id: string;
  userId: string;
  wordId: string;
  status: string;
  createdAt: Date;
  word: { word: string; definition: string };
}

interface SubmissionRow {
  id: string;
  missionId: string;
  userId: string;
  wordId: string;
  evidenceType: string;
  assessmentStatus: string;
  assessmentReasoning: string | null;
  xpAwarded: number;
  photoKey: string | null;
  deletedAt: Date | null;
  createdAt: Date;
}

/**
 * Word in the Wild (spec v2 WL-07..10): a player finds their target word
 * genuinely used somewhere real, submits evidence, Claude judges it, and
 * an approval feeds the same Mastery/XP pipeline as any other challenge
 * (see finalizeSubmission — everything happens in one transaction, same
 * pattern as QuestsService.submitAnswer). A rejection has NO mastery
 * effect at all, neither up nor down — imperfect evidence for a word the
 * player otherwise knows well shouldn't cost them anything; it just
 * doesn't earn the reward this time.
 */
@Injectable()
export class WordInTheWildService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mastery: MasteryService,
    private readonly progression: ProgressionService,
    private readonly storage: ObjectStorageService,
    private readonly assessment: EvidenceAssessmentService,
  ) {}

  async createMission(userId: string, wordId: string): Promise<MissionView> {
    const word = await this.prisma.word.findUnique({ where: { id: wordId } });
    if (!word || !word.isActive) {
      throw new NotFoundException('Word not found');
    }

    const existing = await this.prisma.wordInTheWildMission.findFirst({
      where: { userId, wordId, status: 'OPEN' },
    });
    if (existing) {
      return this.toMissionView({ ...existing, word });
    }

    const mission = await this.prisma.wordInTheWildMission.create({ data: { userId, wordId } });
    return this.toMissionView({ ...mission, word });
  }

  /** A presigned R2 upload URL for photo evidence — the client PUTs bytes directly to R2, never through this backend. */
  async createPhotoUploadTarget(
    userId: string,
    missionId: string,
    contentType: UploadContentType,
  ): Promise<UploadTarget> {
    await this.loadOpenMission(userId, missionId);
    if (!this.storage.isStorageConfigured()) {
      throw new ServiceUnavailableException(
        'Photo evidence is not available yet — storage is not configured.',
      );
    }
    return this.storage.createUploadTarget(userId, contentType);
  }

  async submitTextEvidence(
    userId: string,
    missionId: string,
    text: string,
  ): Promise<SubmissionView> {
    const mission = await this.loadOpenMission(userId, missionId);
    await this.checkDailyCap(userId);
    if (!this.assessment.isConfigured()) {
      throw new ServiceUnavailableException(
        'Evidence assessment is not available yet — AI is not configured.',
      );
    }

    const result = await this.assessment.assess({
      targetWord: mission.word.word,
      definition: mission.word.definition,
      textEvidence: text,
    });

    return this.finalizeSubmission(
      userId,
      mission,
      { evidenceType: 'TEXT', evidenceText: text, photoKey: null },
      result,
    );
  }

  /** `photoKey` must come from a prior createPhotoUploadTarget() call, and the client must have already PUT the bytes there. */
  async submitPhotoEvidence(
    userId: string,
    missionId: string,
    photoKey: string,
  ): Promise<SubmissionView> {
    const mission = await this.loadOpenMission(userId, missionId);
    await this.checkDailyCap(userId);
    if (!this.storage.isStorageConfigured() || !this.assessment.isConfigured()) {
      throw new ServiceUnavailableException('Photo evidence is not available yet.');
    }

    const contentType = photoKey.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const bytes = await this.storage.getObjectBytes(photoKey);

    const result = await this.assessment.assess({
      targetWord: mission.word.word,
      definition: mission.word.definition,
      photoBytes: bytes,
      photoContentType: contentType,
    });

    return this.finalizeSubmission(
      userId,
      mission,
      { evidenceType: 'PHOTO', evidenceText: result.extractedText ?? null, photoKey },
      result,
    );
  }

  async getSubmission(userId: string, submissionId: string): Promise<SubmissionView> {
    const submission = await this.prisma.wordInTheWildSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.userId !== userId) throw new ForbiddenException('Not your submission');
    return this.toSubmissionView(submission);
  }

  /**
   * Soft delete only: clears the evidence content (and the R2 object, if
   * any) but keeps the row. An already-APPROVED submission's mastery/XP
   * contribution is NOT reversed — the credited progress stands, the
   * same way completing a quest isn't undone by later deleting unrelated
   * data. This is a privacy control, not an undo button.
   */
  async deleteSubmission(userId: string, submissionId: string): Promise<void> {
    const submission = await this.prisma.wordInTheWildSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.userId !== userId) throw new ForbiddenException('Not your submission');
    if (submission.deletedAt) return; // already deleted — idempotent

    if (submission.photoKey && this.storage.isStorageConfigured()) {
      await this.storage.delete(submission.photoKey);
    }

    await this.prisma.wordInTheWildSubmission.update({
      where: { id: submissionId },
      data: { evidenceText: null, photoKey: null, deletedAt: new Date() },
    });
  }

  /**
   * "No unlimited farming: daily caps... are mandatory" (spec §3.7).
   * Checked BEFORE the real, billed AI assessment call — an over-cap
   * submission should never cost an API call just to be rejected.
   *
   * Counted by UTC calendar day, not player-local date — the same
   * deliberate simplification ProgressionService.recordDailyActivity
   * documents. Unlike the Daily Quest Loop, this flow (including its
   * standalone, non-quest-linked use) has no player-local-date context
   * available to it, so introducing that concept here would be new
   * complexity for what's a minor day-boundary edge case.
   */
  private async checkDailyCap(userId: string): Promise<void> {
    const startOfDayUtc = new Date();
    startOfDayUtc.setUTCHours(0, 0, 0, 0);

    const submittedToday = await this.prisma.wordInTheWildSubmission.count({
      where: { userId, createdAt: { gte: startOfDayUtc } },
    });

    if (submittedToday >= gameplayRules.wordInTheWild.dailySubmissionCap) {
      throw new BadRequestException(
        `Daily Word in the Wild limit reached (${gameplayRules.wordInTheWild.dailySubmissionCap}/day). Try again tomorrow.`,
      );
    }
  }

  private async loadOpenMission(userId: string, missionId: string): Promise<MissionRow> {
    const mission = await this.prisma.wordInTheWildMission.findUnique({
      where: { id: missionId },
      include: { word: { select: { word: true, definition: true } } },
    });
    if (!mission) throw new NotFoundException('Mission not found');
    if (mission.userId !== userId) throw new ForbiddenException('Not your mission');
    if (mission.status !== 'OPEN')
      throw new BadRequestException('This mission already has a submission');
    return mission;
  }

  private async finalizeSubmission(
    userId: string,
    mission: MissionRow,
    evidence: { evidenceType: EvidenceType; evidenceText: string | null; photoKey: string | null },
    result: AssessmentResult,
  ): Promise<SubmissionView> {
    const xpAwarded = result.approved ? gameplayRules.wordInTheWild.xpPerApproval : 0;

    const submission = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let challengeAttemptId: string | null = null;

      if (result.approved) {
        const attempt = await tx.challengeAttempt.create({
          data: {
            userId,
            wordId: mission.wordId,
            challengeType: 'WORD_IN_THE_WILD',
            submittedAnswer: evidence.evidenceText ?? '(photo evidence)',
            isCorrect: true,
            xpAwarded,
          },
        });
        challengeAttemptId = attempt.id;

        await this.mastery.recordAnswer(userId, mission.wordId, true, tx);
        await this.progression.awardXp(
          userId,
          xpAwarded,
          'WORD_IN_THE_WILD',
          'word-in-the-wild',
          mission.id,
          tx,
        );
        await this.progression.awardGlyphs(
          userId,
          gameplayRules.wordInTheWild.glyphsPerApproval,
          'WORD_IN_THE_WILD',
          'word-in-the-wild',
          mission.id,
          tx,
        );
      }

      const created = await tx.wordInTheWildSubmission.create({
        data: {
          missionId: mission.id,
          userId,
          wordId: mission.wordId,
          evidenceType: evidence.evidenceType,
          evidenceText: evidence.evidenceText,
          photoKey: evidence.photoKey,
          assessmentStatus: result.approved ? 'APPROVED' : 'REJECTED',
          assessmentReasoning: result.reasoning,
          xpAwarded,
          challengeAttemptId,
        },
      });

      await tx.wordInTheWildMission.update({
        where: { id: mission.id },
        data: { status: 'SUBMITTED' },
      });

      return created;
    });

    return this.toSubmissionView(submission);
  }

  private toMissionView(mission: {
    id: string;
    wordId: string;
    status: string;
    createdAt: Date;
    word: { word: string; definition: string };
  }): MissionView {
    return {
      id: mission.id,
      wordId: mission.wordId,
      word: mission.word.word,
      definition: mission.word.definition,
      status: mission.status,
      createdAt: mission.createdAt,
    };
  }

  private toSubmissionView(submission: SubmissionRow): SubmissionView {
    return {
      id: submission.id,
      missionId: submission.missionId,
      wordId: submission.wordId,
      evidenceType: submission.evidenceType,
      assessmentStatus: submission.assessmentStatus,
      assessmentReasoning: submission.assessmentReasoning,
      xpAwarded: submission.xpAwarded,
      createdAt: submission.createdAt,
    };
  }
}

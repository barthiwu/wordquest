import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ReportStatus, ReportTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';

export interface ReportView {
  id: string;
  reporterId: string;
  reporterDisplayName: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  status: string;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  createdAt: Date;
}

export interface PhotoQueueItemView {
  submissionId: string;
  userId: string;
  wordId: string;
  photoUrl: string;
  evidenceText: string | null;
  createdAt: Date;
}

/**
 * Trust & safety (moderation, Sept 2026 request): two independent
 * review surfaces sharing one module because they share the same
 * "admin/support reviewer" audience and workflow shape (a queue, a
 * decision, a timestamp) —
 *
 * 1. User-filed reports against a profile, clan, or piece of evidence
 *    (polymorphic — see the Report model's own doc comment).
 * 2. The Word in the Wild PHOTO evidence review queue (separate from
 *    Claude's assessmentStatus — see WordInTheWildModerationStatus's
 *    doc comment for why these are two different axes).
 *
 * Deliberately NOT wired together yet: actioning a report against a
 * WORD_IN_THE_WILD_SUBMISSION does not itself redact that submission —
 * a reviewer who decides a reported photo needs to come down still does
 * that through reviewPhoto() (or, today, directly in the photo queue),
 * same as they would for a photo nobody reported. Auto-redacting on
 * report-actioned is a reasonable follow-up once there's real usage
 * data on how these two flows actually get used together.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async fileReport(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
    reason: string,
  ): Promise<{ id: string }> {
    await this.assertTargetExists(targetType, targetId);

    const report = await this.prisma.report.create({
      data: { reporterId, targetType, targetId, reason: reason.trim() },
      select: { id: true },
    });
    return report;
  }

  private async assertTargetExists(targetType: ReportTargetType, targetId: string): Promise<void> {
    switch (targetType) {
      case 'USER': {
        const user = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!user) throw new BadRequestException('Reported user not found');
        return;
      }
      case 'CLAN': {
        const clan = await this.prisma.clan.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!clan) throw new BadRequestException('Reported clan not found');
        return;
      }
      case 'WORD_IN_THE_WILD_SUBMISSION': {
        const submission = await this.prisma.wordInTheWildSubmission.findUnique({
          where: { id: targetId },
          select: { id: true },
        });
        if (!submission) throw new BadRequestException('Reported submission not found');
        return;
      }
    }
  }

  async listReports(status?: ReportStatus): Promise<ReportView[]> {
    const reports = await this.prisma.report.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { reporter: { select: { displayName: true } } },
    });
    return reports.map((r) => ({
      id: r.id,
      reporterId: r.reporterId,
      reporterDisplayName: r.reporter.displayName,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      reviewedById: r.reviewedById,
      reviewedAt: r.reviewedAt,
      reviewNotes: r.reviewNotes ?? null,
      createdAt: r.createdAt,
    }));
  }

  async reviewReport(
    reviewerId: string,
    reportId: string,
    status: 'ACTIONED' | 'DISMISSED',
    reviewNotes: string | undefined,
  ): Promise<void> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    await this.prisma.report.update({
      where: { id: reportId },
      data: { status, reviewNotes: reviewNotes ?? null, reviewedById: reviewerId, reviewedAt: new Date() },
    });
  }

  async listPhotoQueue(): Promise<PhotoQueueItemView[]> {
    const pending = await this.prisma.wordInTheWildSubmission.findMany({
      where: { evidenceType: 'PHOTO', moderationStatus: 'PENDING', photoKey: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return Promise.all(
      pending.map(async (s) => ({
        submissionId: s.id,
        userId: s.userId,
        wordId: s.wordId,
        // photoKey checked not-null in the query above; TS still sees it as nullable.
        photoUrl: await this.storage.getDownloadUrl(s.photoKey as string),
        evidenceText: s.evidenceText,
        createdAt: s.createdAt,
      })),
    );
  }

  async reviewPhoto(submissionId: string, decision: 'APPROVED' | 'REJECTED'): Promise<void> {
    const submission = await this.prisma.wordInTheWildSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.evidenceType !== 'PHOTO') {
      throw new ForbiddenException('Only photo evidence goes through the photo review queue');
    }
    if (submission.moderationStatus !== 'PENDING') {
      return; // already reviewed — idempotent, same pattern as deleteSubmission
    }

    if (decision === 'REJECTED') {
      // Redact the content itself, not just the status flag — same
      // pattern as WordInTheWildService.deleteSubmission. The
      // submission row (and its already-settled XP/mastery effect, if
      // any) stays; only the photo and any transcribed text go.
      if (submission.photoKey && this.storage.isStorageConfigured()) {
        await this.storage.delete(submission.photoKey);
      }
      await this.prisma.wordInTheWildSubmission.update({
        where: { id: submissionId },
        data: { photoKey: null, evidenceText: null, moderationStatus: 'REJECTED' },
      });
      return;
    }

    await this.prisma.wordInTheWildSubmission.update({
      where: { id: submissionId },
      data: { moderationStatus: 'APPROVED' },
    });
  }
}

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import {
  MasterChallengeEvaluationService,
  type MasterChallengeScores,
} from './master-challenge-evaluation.service';

export interface MasterChallengeStatusView {
  status: 'LOCKED' | 'AVAILABLE' | 'COMPLETED';
  eligible: boolean;
  wordsCompletedToday: number;
  wordsRequired: number;
}

export interface MasterChallengeResult {
  scores: MasterChallengeScores;
  xpAwarded: number;
  allWordsUsedCorrectly: boolean;
  whatWentWell: string;
  whatNeedsImprovement: string;
  nextAction: string;
}

/**
 * Three-Word Master Challenge (spec §3.8) — unlike every other quest
 * stage, this isn't scoped to one QuestAttempt: eligibility depends on
 * ALL THREE of a player's daily quest periods (Morning/Afternoon/
 * Evening) being COMPLETED for the same player-local date. One
 * DailyMasterChallenge row per (user, localDate) is the record of it.
 */
@Injectable()
export class MasterChallengeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progression: ProgressionService,
    private readonly evaluation: MasterChallengeEvaluationService,
  ) {}

  async getStatus(userId: string, localDate: string): Promise<MasterChallengeStatusView> {
    const completedAttempts = await this.prisma.questAttempt.findMany({
      where: { userId, localDate, status: 'COMPLETED' },
      select: { questId: true },
    });
    const distinctQuestIds = new Set(completedAttempts.map((a: { questId: string }) => a.questId));

    const activeQuestCount = await this.prisma.quest.count({ where: { isActive: true } });
    const eligible = activeQuestCount > 0 && distinctQuestIds.size >= activeQuestCount;

    let record = await this.prisma.dailyMasterChallenge.findUnique({
      where: { userId_localDate: { userId, localDate } },
    });

    if (!record && eligible) {
      record = await this.prisma.dailyMasterChallenge.create({
        data: { userId, localDate, status: 'AVAILABLE' },
      });
    } else if (record && record.status === 'LOCKED' && eligible) {
      record = await this.prisma.dailyMasterChallenge.update({
        where: { id: record.id },
        data: { status: 'AVAILABLE' },
      });
    }

    return {
      status: record?.status ?? 'LOCKED',
      eligible,
      wordsCompletedToday: distinctQuestIds.size,
      wordsRequired: activeQuestCount,
    };
  }

  async submit(
    userId: string,
    localDate: string,
    paragraph: string,
  ): Promise<MasterChallengeResult> {
    const status = await this.getStatus(userId, localDate);
    if (!status.eligible) {
      throw new BadRequestException(
        'Complete all three daily words before attempting the Master Challenge.',
      );
    }

    const record = await this.prisma.dailyMasterChallenge.findUniqueOrThrow({
      where: { userId_localDate: { userId, localDate } },
    });
    if (record.status === 'COMPLETED') {
      throw new BadRequestException("Today's Master Challenge has already been completed.");
    }

    const completedAttempts = await this.prisma.questAttempt.findMany({
      where: { userId, localDate, status: 'COMPLETED' },
      select: { wordIds: true },
    });
    const wordIds = completedAttempts.flatMap((a: { wordIds: string[] }) => a.wordIds);
    const words = await this.prisma.word.findMany({
      where: { id: { in: wordIds } },
      select: { word: true, definition: true },
    });

    const evaluation = await this.evaluation.evaluate(words, paragraph);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Claim first — the `record.status === 'COMPLETED'` check above ran
      // outside this transaction, so two concurrent submit() calls for
      // the same (userId, localDate) could both pass it before either
      // writes. This conditional update, gated on status still being
      // non-COMPLETED, is the real guard (V19 Stabilization Spec §9:
      // "Race condition protection. Duplicate reward prevention.") — only
      // the caller whose claim matches a row goes on to award XP.
      const claimed = await tx.dailyMasterChallenge.updateMany({
        where: { id: record.id, status: { not: 'COMPLETED' } },
        data: {
          status: 'COMPLETED',
          paragraphText: paragraph,
          scores: evaluation.scores as unknown as Prisma.InputJsonValue,
          xpAwarded: evaluation.xpAwarded,
          completedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException("Today's Master Challenge has already been completed.");
      }

      // Master Challenge XP is its own, separate reward (spec §3.8:
      // "must not duplicate the per-word learning reward") — it doesn't
      // touch any QuestAttempt's xpAwarded, only this record's own.
      await this.progression.awardXp(
        userId,
        evaluation.xpAwarded,
        'MASTER_CHALLENGE',
        'master-challenge',
        record.id,
        tx,
      );
    });

    return {
      scores: evaluation.scores,
      xpAwarded: evaluation.xpAwarded,
      allWordsUsedCorrectly: evaluation.allWordsUsedCorrectly,
      whatWentWell: evaluation.whatWentWell,
      whatNeedsImprovement: evaluation.whatNeedsImprovement,
      nextAction: evaluation.nextAction,
    };
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { ProgressionService } from './progression.service';

/**
 * GET /api/v1/progression/me — read-only snapshot for Home / Quest
 * Complete / Profile screens. Nothing here is writable through this
 * controller; every mutation goes through ProgressionService from
 * inside another module (Quests today, Battles/Shop later).
 */
@Controller('progression')
@UseGuards(JwtAuthGuard)
export class ProgressionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progression: ProgressionService,
  ) {}

  @Get('me')
  async me(@CurrentUserId() userId: string) {
    const progression = await this.prisma.userProgression.findUniqueOrThrow({ where: { userId } });
    const playedToday = await this.progression.hasRecordedActivityToday(userId);
    return {
      level: progression.level,
      totalXp: progression.totalXp,
      glyphBalance: progression.glyphBalance,
      journeyStage: progression.journeyStage,
      currentStreak: progression.currentStreak,
      longestStreak: progression.longestStreak,
      // Whether recordDailyActivity has already fired for today's local
      // date -- Daily Quest completion OR any completed Arcade session
      // both call it (see ProgressionService.recordDailyActivity's
      // callers). Home's streak ring reads this instead of Daily Quest's
      // own completedCount, which used to make Arcade-only play look
      // like the streak wasn't kept (Barth, Sept 2026).
      playedToday,
      masteredWordsCount: progression.masteredWordsCount,
      bossBattlesCompleted: progression.bossBattlesCompleted,
      cefrUnlocked: progression.cefrUnlocked,
      // A rolling estimate from recent Paragraph submissions — genuinely
      // just evidence, independent of cefrUnlocked's gated official
      // status. See ProgressionService.updateEstimatedCefrLevel.
      estimatedCefrLevel: progression.estimatedCefrLevel,
      // How much evidence backs estimatedCefrLevel (ProgressionService's
      // computeCefrConfidence) — V22 §8 finding: this was computed and
      // persisted but never returned to any client. Null until at least
      // one Paragraph submission has fed the estimate.
      estimatedCefrConfidence: progression.estimatedCefrConfidence,
    };
  }

  /**
   * GET /api/v1/progression/me/cefr-history — the full CEFR evidence
   * trail (V1 Remaining Systems Spec §16): every CefrAssessment ever
   * recorded for this player, most recent first. `me`'s
   * `estimatedCefrLevel` is just the current mode over the last 5 —
   * this is the complete history behind it.
   */
  @Get('me/cefr-history')
  async cefrHistory(@CurrentUserId() userId: string) {
    return this.prisma.cefrAssessment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

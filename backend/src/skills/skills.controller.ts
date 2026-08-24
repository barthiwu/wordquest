import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

const VOCABULARY_TARGET_WORDS = 50; // words mastered to reach 100 on the Vocabulary dimension

/**
 * GET /api/v1/skills/me — Screen Bible screen 27 (Skill Radar), §27.
 *
 * Vocabulary and Recall are computed from the mastery ladder itself
 * (word count / masteryScore), same as before. Context, Sentence
 * Construction, and Writing read the Mastery Engine's per-word skill-
 * area scores (guessScore/sentenceScore/paragraphScore). Each dimension
 * is averaged only across words that actually have a nonzero score for
 * it — a player who's never reached a given stage on any word gets an
 * honest `measured: false` rather than a misleading 0.
 *
 * Five dimensions, not six — Speaking/Pronunciation were removed from
 * the radar entirely (Correction & Completion Spec §1: "must not appear
 * in ... Skill Radar scoring"). The mobile client renders whatever
 * dimensions array this endpoint returns, so removing the sixth entry
 * here is the only change needed to drop it from the UI too.
 */
@Controller('skills')
@UseGuards(JwtAuthGuard)
export class SkillsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUserId() userId: string) {
    const masteries: {
      currentLevel: string;
      masteryScore: number;
      guessScore: number;
      sentenceScore: number;
      paragraphScore: number;
    }[] = await this.prisma.mastery.findMany({ where: { userId } });

    const masteredCount = masteries.filter((m) => m.currentLevel === 'MASTERED').length;
    const vocabularyScore = Math.min(
      100,
      Math.round((masteredCount / VOCABULARY_TARGET_WORDS) * 100),
    );

    const recallScore =
      masteries.length === 0
        ? 0
        : Math.round(
            masteries.reduce((sum: number, m) => sum + m.masteryScore, 0) / masteries.length,
          );

    const context = this.averageOverMeasured(masteries, (m) => m.guessScore);
    const sentenceConstruction = this.averageOverMeasured(masteries, (m) => m.sentenceScore);
    const writing = this.averageOverMeasured(masteries, (m) => m.paragraphScore);

    return {
      dimensions: [
        { key: 'vocabulary', label: 'Vocabulary', score: vocabularyScore, measured: true },
        { key: 'recall', label: 'Recall', score: recallScore, measured: true },
        { key: 'context', label: 'Context', score: context.score, measured: context.measured },
        {
          key: 'sentenceConstruction',
          label: 'Sentence construction',
          score: sentenceConstruction.score,
          measured: sentenceConstruction.measured,
        },
        { key: 'writing', label: 'Writing', score: writing.score, measured: writing.measured },
      ],
    };
  }

  private averageOverMeasured<T>(
    rows: T[],
    getScore: (row: T) => number,
  ): { score: number; measured: boolean } {
    const measuredScores = rows.map(getScore).filter((score) => score > 0);
    if (measuredScores.length === 0) return { score: 0, measured: false };
    const avg = measuredScores.reduce((sum, s) => sum + s, 0) / measuredScores.length;
    return { score: Math.round(avg), measured: true };
  }
}

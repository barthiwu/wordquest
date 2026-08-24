import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { JOURNEY_STAGES } from '../config/journey-stages';

/**
 * GET /api/v1/journey/me — Screen Bible screens 20/21 (Journey map,
 * Journey stage). Every stage is returned with its lock state and
 * requirement pre-computed server-side, following the §42 pattern
 * ("the user should always know what remains") — the client renders
 * what it's given rather than re-deriving lock logic itself.
 */
@Controller('journey')
@UseGuards(JwtAuthGuard)
export class JourneyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUserId() userId: string) {
    const progression = await this.prisma.userProgression.findUniqueOrThrow({ where: { userId } });

    const stages = JOURNEY_STAGES.map((def) => ({
      stage: def.stage,
      key: def.key,
      name: def.name,
      primaryTitle: def.primaryTitle,
      minLevel: def.minLevel,
      requiredMasteredWords: def.requiredMasteredWords,
      colorIdentity: def.colorIdentity,
      majorUnlock: def.majorUnlock,
      unlocked:
        progression.level >= def.minLevel &&
        progression.masteredWordsCount >= def.requiredMasteredWords,
      current: def.stage === progression.journeyStage,
    }));

    const currentStage = stages.find((s) => s.current) ?? stages[0];
    const nextStage = stages.find((s) => s.stage === currentStage.stage + 1) ?? null;

    return {
      currentStage,
      nextStage,
      stages,
    };
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ArcadeGame } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

/**
 * GET /api/v1/arcade/last-played — read-only "what did this player most
 * recently finish in Arcade" lookup, across all three games. They live
 * in two different tables (ScrambleQuest/Complete It share
 * ArcadeGameSession; Word Duel has its own WordDuelMatch/
 * WordDuelPlayerState, since it's two-player), so this reads both and
 * takes whichever finished more recently.
 *
 * Home's "Play <Game> again" card is the only consumer (Barth, Sept
 * 2026: prompt the player back into whatever they last played) — never
 * a step in scoring, rewards, or the daily streak, so this stays a
 * plain read next to ProgressionController rather than living inside
 * any one game's own service.
 */
@Controller('arcade')
@UseGuards(JwtAuthGuard)
export class ArcadeStatusController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('last-played')
  async lastPlayed(
    @CurrentUserId() userId: string,
  ): Promise<{ game: ArcadeGame; playedAt: string } | null> {
    const [session, duelMatch] = await Promise.all([
      this.prisma.arcadeGameSession.findFirst({
        where: { userId, status: 'COMPLETED', endedAt: { not: null } },
        orderBy: { endedAt: 'desc' },
        select: { game: true, endedAt: true },
      }),
      this.prisma.wordDuelMatch.findFirst({
        where: { status: 'COMPLETED', players: { some: { userId } } },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      }),
    ]);

    const candidates: { game: ArcadeGame; playedAt: Date }[] = [];
    if (session?.endedAt) candidates.push({ game: session.game, playedAt: session.endedAt });
    if (duelMatch?.completedAt) {
      candidates.push({ game: 'WORD_DUEL', playedAt: duelMatch.completedAt });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
    const winner = candidates[0];
    return { game: winner.game, playedAt: winner.playedAt.toISOString() };
  }
}

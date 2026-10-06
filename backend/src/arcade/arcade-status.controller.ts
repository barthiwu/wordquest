import { Controller, Get, UseGuards } from '@nestjs/common';
import { ArcadeGame } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { ArcadePlayLimitService, type ArcadeAllowanceView } from './limits/play-limit.service';

/**
 * GET /api/v1/arcade/last-played — read-only "what did this player most
 * recently PLAY in Arcade" lookup, across all three games. They live in
 * two different tables (ScrambleQuest/Complete It share
 * ArcadeGameSession; Word Duel has its own WordDuelMatch/
 * WordDuelPlayerState, since it's two-player), so this reads both and
 * takes whichever started more recently.
 *
 * Deliberately keyed on STARTED, not completed (Barth, Sept 2026: "the
 * game remembers to update that home screen arcade container to the
 * game the player last clicked/started") — an earlier version of this
 * endpoint only counted finished sessions, which silently ignored any
 * game the player started but didn't finish (most visibly Word Duel: a
 * match only reaches COMPLETED once BOTH players finish, so a match
 * that's still in progress, or where the opponent never finishes,
 * would never show up here at all even though the player very much
 * did play it). Reading startedAt/createdAt instead means clicking
 * into a game is what updates the Home card, regardless of how far the
 * player got.
 *
 * Home's "Play <Game> again" card is the only consumer — never a step
 * in scoring, rewards, or the daily streak, so this stays a plain read
 * next to ProgressionController rather than living inside any one
 * game's own service.
 */
@Controller('arcade')
@UseGuards(JwtAuthGuard)
export class ArcadeStatusController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly playLimit: ArcadePlayLimitService,
  ) {}

  /** GET /arcade/plays: today's plays used / left per game, and when they reset. */
  @Get('plays')
  plays(@CurrentUserId() userId: string): Promise<ArcadeAllowanceView> {
    return this.playLimit.getAllowance(userId);
  }

  @Get('last-played')
  async lastPlayed(
    @CurrentUserId() userId: string,
  ): Promise<{ game: ArcadeGame; playedAt: string } | null> {
    const [session, duelMatch] = await Promise.all([
      this.prisma.arcadeGameSession.findFirst({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        select: { game: true, startedAt: true },
      }),
      this.prisma.wordDuelMatch.findFirst({
        where: { players: { some: { userId } } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const candidates: { game: ArcadeGame; playedAt: Date }[] = [];
    if (session) candidates.push({ game: session.game, playedAt: session.startedAt });
    if (duelMatch) candidates.push({ game: 'WORD_DUEL', playedAt: duelMatch.createdAt });

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
    const winner = candidates[0];
    return { game: winner.game, playedAt: winner.playedAt.toISOString() };
  }
}

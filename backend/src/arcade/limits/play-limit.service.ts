import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArcadeGame } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notifications/notification.service';
import { playerLocalDate, resolveTimezone } from '../../common/timezone';
import { isUniqueConstraintError } from '../../common/prisma-errors';
import {
  ARCADE_DAILY_PLAY_LIMIT,
  playLimitNoticeCounts,
  type ArcadePlayLimitNoticePercent,
} from '../config/arcade.config';

const GAMES: ArcadeGame[] = ['SCRAMBLE_QUEST', 'WORD_DUEL', 'COMPLETE_IT', 'HANGMAN'];

const GAME_LABEL: Record<ArcadeGame, string> = {
  SCRAMBLE_QUEST: 'ScrambleQuest',
  WORD_DUEL: 'Word Duel',
  COMPLETE_IT: 'Complete It',
  HANGMAN: 'Hangman',
};

/** Where a player stands for one game today. */
export interface ArcadeGameAllowance {
  game: ArcadeGame;
  used: number;
  /** null on WordQuest+ (no limit). */
  limit: number | null;
  /** null on WordQuest+. */
  remaining: number | null;
  locked: boolean;
}

export interface ArcadeAllowanceView {
  unlimited: boolean;
  limit: number | null;
  /** When the counters reset: the start of the player's next local day. */
  resetsAt: string;
  games: ArcadeGameAllowance[];
}

/** Returned when a play is taken: what the client shows as a "little notice". */
export interface ArcadePlayNotice {
  game: ArcadeGame;
  used: number;
  limit: number | null;
  remaining: number | null;
  /** 50 / 70 / 90 / 100 when this very play crossed one, otherwise null. */
  percent: ArcadePlayLimitNoticePercent | null;
}

/**
 * The free plan's daily cap on Arcade plays (max ARCADE_DAILY_PLAY_LIMIT per
 * game per player-local day; WordQuest+ is unlimited). Every game calls
 * `assertCanPlay` before it lets someone start (queue, invite, accept) and
 * `consumePlay` once the play is finished (solo, head-to-head and Word Duel
 * alike -- an abandoned run never costs a play; Group Play is not counted).
 */
@Injectable()
export class ArcadePlayLimitService {
  private readonly logger = new Logger(ArcadePlayLimitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  private async playerContext(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, plusUntil: true },
    });
    const now = new Date();
    return {
      timezone: user?.timezone ?? null,
      unlimited: !!user?.plusUntil && user.plusUntil > now,
      localDate: playerLocalDate(user?.timezone ?? null, now),
      now,
    };
  }

  /** Per-game standing for today -- feeds the Arcade tiles and the lock UI. */
  async getAllowance(userId: string): Promise<ArcadeAllowanceView> {
    const ctx = await this.playerContext(userId);
    const rows = await this.prisma.arcadePlayCount.findMany({
      where: { userId, localDate: ctx.localDate },
      select: { game: true, count: true },
    });
    const usedBy = new Map(rows.map((r) => [r.game, r.count]));
    return {
      unlimited: ctx.unlimited,
      limit: ctx.unlimited ? null : ARCADE_DAILY_PLAY_LIMIT,
      resetsAt: nextLocalMidnight(ctx.timezone, ctx.now).toISOString(),
      games: GAMES.map((game) => {
        const used = usedBy.get(game) ?? 0;
        return ctx.unlimited
          ? { game, used, limit: null, remaining: null, locked: false }
          : {
              game,
              used,
              limit: ARCADE_DAILY_PLAY_LIMIT,
              remaining: Math.max(0, ARCADE_DAILY_PLAY_LIMIT - used),
              locked: used >= ARCADE_DAILY_PLAY_LIMIT,
            };
      }),
    };
  }

  /** True when the player has no plays left today for `game`. */
  async isLocked(userId: string, game: ArcadeGame): Promise<boolean> {
    const ctx = await this.playerContext(userId);
    if (ctx.unlimited) return false;
    const row = await this.prisma.arcadePlayCount.findUnique({
      where: { userId_game_localDate: { userId, game, localDate: ctx.localDate } },
      select: { count: true },
    });
    return (row?.count ?? 0) >= ARCADE_DAILY_PLAY_LIMIT;
  }

  /** Throws 403 ARCADE_PLAY_LIMIT when the player has no plays left today. */
  async assertCanPlay(userId: string, game: ArcadeGame): Promise<void> {
    if (await this.isLocked(userId, game)) throw this.limitError(game);
  }

  /**
   * Takes one play. `force` records it without enforcing the limit -- for a
   * player who was already waiting in a Word Duel queue when the opponent
   * showed up (refusing then would wreck the other player's match).
   */
  async consumePlay(
    userId: string,
    game: ArcadeGame,
    opts: { force?: boolean } = {},
  ): Promise<ArcadePlayNotice> {
    const ctx = await this.playerContext(userId);
    const where = { userId, game, localDate: ctx.localDate };

    let used: number | null = null;
    for (let attempt = 0; attempt < 3 && used === null; attempt++) {
      const bumped = await this.prisma.arcadePlayCount.updateMany({
        where:
          opts.force || ctx.unlimited
            ? where
            : { ...where, count: { lt: ARCADE_DAILY_PLAY_LIMIT } },
        data: { count: { increment: 1 } },
      });
      if (bumped.count === 1) {
        const row = await this.prisma.arcadePlayCount.findUnique({
          where: { userId_game_localDate: where },
          select: { count: true },
        });
        used = row?.count ?? 1;
        break;
      }
      try {
        await this.prisma.arcadePlayCount.create({ data: { ...where, count: 1 } });
        used = 1;
      } catch (err) {
        if (!isUniqueConstraintError(err)) throw err;
        // Someone created today's row between our update and create: retry
        // the update. If the row exists and is at the limit the next update
        // matches nothing and the create collides again, so bail out below.
        const row = await this.prisma.arcadePlayCount.findUnique({
          where: { userId_game_localDate: where },
          select: { count: true },
        });
        if (row && row.count >= ARCADE_DAILY_PLAY_LIMIT && !opts.force && !ctx.unlimited) {
          throw this.limitError(game);
        }
      }
    }
    if (used === null) throw this.limitError(game);

    if (ctx.unlimited) {
      return { game, used, limit: null, remaining: null, percent: null };
    }
    const percent =
      playLimitNoticeCounts(ARCADE_DAILY_PLAY_LIMIT).find((n) => n.count === used)?.percent ?? null;
    if (percent) this.sendNotice(userId, game, used, percent);
    return {
      game,
      used,
      limit: ARCADE_DAILY_PLAY_LIMIT,
      remaining: Math.max(0, ARCADE_DAILY_PLAY_LIMIT - used),
      percent,
    };
  }

  private sendNotice(
    userId: string,
    game: ArcadeGame,
    used: number,
    percent: ArcadePlayLimitNoticePercent,
  ): void {
    const name = GAME_LABEL[game];
    const left = ARCADE_DAILY_PLAY_LIMIT - used;
    const body =
      percent === 100
        ? `That was your last ${name} play today. It unlocks again tomorrow, so try another Arcade game, or get WordQuest+ for unlimited play.`
        : percent === 50
          ? `You're halfway through today's ${name} plays (${used} of ${ARCADE_DAILY_PLAY_LIMIT}).`
          : `${percent}% of today's ${name} plays used. ${left} left.`;
    this.notifications.notifyFireAndForget(
      userId,
      'ARCADE_PLAY_LIMIT',
      percent === 100 ? `${name} is locked for today` : `${name}: ${percent}% of today's plays`,
      body,
      { deepLink: 'wordquest://play', data: { game, used, percent } },
    );
  }

  private limitError(game: ArcadeGame): ForbiddenException {
    const name = GAME_LABEL[game];
    return new ForbiddenException({
      statusCode: 403,
      error: 'ARCADE_PLAY_LIMIT',
      message: `You've used all ${ARCADE_DAILY_PLAY_LIMIT} ${name} plays for today. It unlocks again tomorrow, or get WordQuest+ for unlimited play.`,
      game,
      limit: ARCADE_DAILY_PLAY_LIMIT,
    });
  }

  /** Old counters are never read again; keep two weeks for support lookups. */
  @Cron('30 3 * * *')
  async purgeOldCounts(): Promise<void> {
    try {
      const cutoff = playerLocalDate('UTC', new Date(Date.now() - 14 * 86_400_000));
      const { count } = await this.prisma.arcadePlayCount.deleteMany({
        where: { localDate: { lt: cutoff } },
      });
      if (count > 0) this.logger.log(`Deleted ${count} old Arcade play counters`);
    } catch (err) {
      this.logger.warn(`Arcade play counter cleanup failed: ${err}`);
    }
  }
}

/** The instant the player's next local day starts. */
export function nextLocalMidnight(timezone: string | null, now: Date = new Date()): Date {
  const zone = resolveTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = num('hour') % 24;
  const secondsIntoDay = hour * 3600 + num('minute') * 60 + num('second');
  return new Date(now.getTime() + (86_400 - secondsIntoDay) * 1000);
}
